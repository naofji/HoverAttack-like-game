# 反射ビームキャノン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7面でタレットの半分を反射ビームキャノンに差し替え、地形で跳ね返る紫のビームを撃たせる。

**Architecture:** ビームの中身は2つの純関数（経路を帯に切り出す `beamSegments()` と、1フレーム進めて跳ね返す `stepBeam()`）に閉じ込め、エンティティ `ReflectBeam` はそれを呼ぶだけにする。描画と当たり判定は `beamSegments()` の**同じ戻り値**を使う。砲台は新クラスを作らず `EnemyTurret` に型の表を足す。

**Tech Stack:** バニラ ES modules ＋ canvas 2D。ビルド工程なし。テストは `node --test`（DOM も AudioContext も無い）。

**Spec:** `docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md`

## Global Constraints

- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する。`src/js/main.js` にはユーザーがデバッグ用に置いている `debugStartMission: 6` が意図的に未コミットで残っている（本番値は 0）。この計画では `main.js` を触らない。
- **調整用の数値は `src/js/utils/Constants.js` に置く。** 実装側にマジックナンバーを直書きしない。
- **色は必ず hex 形式**（`'#RRGGBB'`）。`lerpColor()` が `parseInt` するので `rgba()` を渡すと `'#NaNNaNNaN'` になり、実 canvas では無言で劣化する。全色の hex 形式を縛るテストが既にある。
- **コメントは日本語で「なぜそうしたか」を書く。** 何をしているかはコードが語る。数値を決めたら根拠（実測値や、どの値を経て確定したか）を残す。
- **`game.rng` を追加で消費しない。** 週次の決定性（同じ ISO 週なら全員同じステージ）がこれに依存している。回帰テストは `tests/MapDeterminism.test.js`。
- **ソース文字列を grep するテストは書かない。** 呼び出しが存在しても到達不能なら通ってしまう。
- 物理はフレーム単位（`x += vx`）で deltaTime に依存しない。実時間との橋渡しは `utils/timestep.js` が独占している。
- テストの実行: `npm test`（全部）/ `npm test -- tests/xxx.test.js`（1ファイル）。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/js/utils/beamPath.js`（新規） | ビームの純ロジック2つ。`beamSegments()` と `stepBeam()`。canvas もマップ実体も要らない |
| `src/js/utils/Physics.js`（変更） | `segmentIntersectsRect()` を追加 |
| `src/js/utils/Constants.js`（変更） | 定数と色を追加 |
| `src/js/entities/ReflectBeam.js`（新規） | ビームの実体。経路を持ち、純関数を呼び、描く |
| `src/js/systems/CollisionManager.js`（変更） | 線分の当たり判定とダメージ |
| `src/js/entities/EnemyTurret.js`（変更） | 型の表 `TURRET_TYPES`、beam 型の色と撃ち方、砲口の放射光 |
| `src/js/systems/SpawnManager.js`（変更） | 7面で偶数番目を beam 型にする |
| `src/js/audio/weaponSounds.js`（変更） | `WEAPON_SOUNDS` に `reflectBeam` を1行 |
| `tests/helpers/weapon-render.js`（変更） | 上と対のオフライン再現（**片方だけ変えない**） |

---

### Task 1: `beamSegments()` — 経路を帯に切り出す

ビームの「見えている形」と「当たる形」を1つに決める関数。ここが両者の唯一の出どころになる。

**Files:**
- Create: `src/js/utils/beamPath.js`
- Test: `tests/beam-path.test.js`

**Interfaces:**
- Consumes: なし（純関数）
- Produces: `beamSegments(path, tailLength, count) -> Array<{x1:number,y1:number,x2:number,y2:number}>`
  - `path` は通った経路の点列で **`[0]` が先端（新しい順）**
  - 返る線分は先端から後ろへ向かう順。長さは `min(tailLength, 経路長)` を `count` 等分したもの

- [ ] **Step 1: 失敗するテストを書く**

`tests/beam-path.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamSegments } from '../src/js/utils/beamPath.js';

/** 線分の長さ。 */
const len = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
/** 線分列の合計長。 */
const total = (segs) => segs.reduce((a, s) => a + len(s), 0);

// 帯は「先端から一定の長さ」。経路が十分に長ければ、常に同じ長さで同じ本数
test('まっすぐな経路を等分した帯になる', () => {
  // 先端 (100,0) から後ろへ 10px 刻みで伸びる経路
  const path = [];
  for (let i = 0; i <= 30; i++) path.push({ x: 100 - i * 10, y: 0 });

  const segs = beamSegments(path, 160, 8);
  assert.equal(segs.length, 8, '8等分になっていない');
  assert.ok(Math.abs(total(segs) - 160) < 1e-6, `合計長が 160 でない: ${total(segs)}`);
  for (const s of segs) {
    assert.ok(Math.abs(len(s) - 20) < 1e-6, `1節が 20px でない: ${len(s)}`);
  }
});

// 先端から後ろへ向かう順で、隣り合う線分がつながっていること
test('線分は先端から後ろへ連なる', () => {
  const path = [];
  for (let i = 0; i <= 30; i++) path.push({ x: 100 - i * 10, y: 0 });

  const segs = beamSegments(path, 160, 8);
  assert.deepEqual({ x: segs[0].x1, y: segs[0].y1 }, { x: 100, y: 0 }, '先端から始まっていない');
  for (let i = 1; i < segs.length; i++) {
    assert.ok(Math.abs(segs[i].x1 - segs[i - 1].x2) < 1e-6, `${i} 本目がつながっていない`);
    assert.ok(Math.abs(segs[i].y1 - segs[i - 1].y2) < 1e-6, `${i} 本目がつながっていない`);
  }
});

// 撃った直後。全長で現れると砲口より後ろにビームが生えて見えるので、
// 帯は短いまま返す（等分する数は変えない）
test('経路が短いうちは帯も短い', () => {
  const path = [{ x: 40, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }];
  const segs = beamSegments(path, 160, 8);
  assert.equal(segs.length, 8, '本数は変えない');
  assert.ok(Math.abs(total(segs) - 40) < 1e-6, `経路長 40 に収まっていない: ${total(segs)}`);
});

// 反射した直後。折れ点をまたぐ帯になる（ここが折れないと、当たり判定が
// 見た目と食い違って理不尽になる）
test('折れた経路では帯も折れる', () => {
  // (100,0) が先端。(40,0) で折れて、そこから下へ伸びている
  const path = [{ x: 100, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }];
  const segs = beamSegments(path, 120, 6);

  assert.equal(segs.length, 6);
  assert.ok(Math.abs(total(segs) - 120) < 1e-6);
  // 帯の終端は折れた先（下向き）に来ている
  const last = segs[segs.length - 1];
  assert.ok(Math.abs(last.x2 - 40) < 1e-6, `終端が折れた先に無い: x=${last.x2}`);
  assert.ok(Math.abs(last.y2 - 60) < 1e-6, `終端が折れた先に無い: y=${last.y2}`);
  // 横向きの線分と縦向きの線分が両方ある
  assert.ok(segs.some((s) => Math.abs(s.y2 - s.y1) < 1e-6), '横向きの節が無い');
  assert.ok(segs.some((s) => Math.abs(s.x2 - s.x1) < 1e-6), '縦向きの節が無い');
});

test('経路が1点以下なら空', () => {
  assert.deepEqual(beamSegments([], 160, 8), []);
  assert.deepEqual(beamSegments([{ x: 0, y: 0 }], 160, 8), []);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: FAIL（`Cannot find module '../src/js/utils/beamPath.js'`）

- [ ] **Step 3: `beamSegments()` を実装する**

`src/js/utils/beamPath.js` を新規作成:

```js
// ============================================
// beamPath - 反射ビームの純ロジック
// ============================================
//
// ビームの「見えている帯」と「当たる帯」は同じでなければならない。当たり判定が
// ビーム全体である以上、両者が1pxでも食い違えばそのまま理不尽さになる。
// そこで帯の切り出しをこの1つの関数に閉じ込め、描画も当たり判定もこれを呼ぶ。
//
// canvas もマップの実体も要らないので、node のテストで直接試せる。

/**
 * 通った経路から、先端側の一定の長さぶんを切り出して等分した線分の列を返す。
 *
 * @param {Array<{x:number,y:number}>} path 経路。**[0] が先端（新しい順）**
 * @param {number} tailLength 切り出す長さ(px)
 * @param {number} count 等分する数
 * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>} 先端から後ろへ並ぶ線分
 */
export function beamSegments(path, tailLength, count) {
    if (!path || path.length < 2 || count < 1 || tailLength <= 0) return [];

    // 先端から遡って tailLength ぶんの折れ線を作る。経路が足りなければ
    // そこで打ち切る（撃った直後は帯が短い。伸びていく様子が見えるのが正しい）
    const poly = [path[0]];
    let remain = tailLength;
    for (let i = 1; i < path.length && remain > 0; i++) {
        const a = poly[poly.length - 1];
        const b = path[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= 0) continue;
        if (d >= remain) {
            const t = remain / d;
            poly.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            remain = 0;
        } else {
            poly.push(b);
            remain -= d;
        }
    }

    const usable = tailLength - remain;
    if (usable <= 0) return [];

    // 折れ線を弧長で等分する。折れ点をまたぐ節は、そこで曲がったまま出る
    const step = usable / count;
    const out = [];
    let segIdx = 0;   // poly の何本目の区間にいるか
    let segPos = 0;   // その区間の中で進んだ距離
    let cur = poly[0];

    for (let i = 0; i < count; i++) {
        const x1 = cur.x;
        const y1 = cur.y;
        let need = step;

        while (need > 0 && segIdx < poly.length - 1) {
            const a = poly[segIdx];
            const b = poly[segIdx + 1];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen <= 0) { segIdx++; segPos = 0; continue; }

            const rest = segLen - segPos;
            if (rest > need) {
                segPos += need;
                const t = segPos / segLen;
                cur = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                need = 0;
            } else {
                need -= rest;
                segIdx++;
                segPos = 0;
                cur = poly[segIdx];
            }
        }
        out.push({ x1, y1, x2: cur.x, y2: cur.y });
    }
    return out;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: PASS（5件）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/beamPath.js tests/beam-path.test.js
git commit -m "feat: ビームの経路を帯に切り出す純関数を追加"
```

---

### Task 2: `stepBeam()` — 1フレーム進めて跳ね返す

**Files:**
- Modify: `src/js/utils/beamPath.js`
- Test: `tests/beam-path.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `stepBeam({x, y, vx, vy}, map) -> {x:number, y:number, vx:number, vy:number, bounced:boolean}`
  - `map` は `isSolidAtPixel(x, y)` を持つもの（`tests/helpers/enemy-world.js` の `makeMap()` がそのまま使える）
  - 引数のオブジェクトは書き換えず、新しい値を返す

- [ ] **Step 1: 失敗するテストを書く**

`tests/beam-path.test.js` の末尾に追記（import 行も `stepBeam` を足す）:

```js
import { beamSegments, stepBeam } from '../src/js/utils/beamPath.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

// 地形はタイル。TILE_SIZE=16 なので、'#' 1つが 16px 四方
//   0123456789
// 0 ##########
// 1 #........#
// 2 #........#
// 3 ##########
const ROOM = [
  '##########',
  '#........#',
  '#........#',
  '##########',
];

test('何も無ければまっすぐ進む', () => {
  const map = makeMap(ROOM);
  const r = stepBeam({ x: 40, y: 24, vx: 4, vy: 0 }, map);
  assert.deepEqual(
    { x: r.x, y: r.y, vx: r.vx, vy: r.vy, bounced: r.bounced },
    { x: 44, y: 24, vx: 4, vy: 0, bounced: false },
  );
});

test('縦の壁で vx が反転する', () => {
  const map = makeMap(ROOM);
  // 右端の壁は c=9（x=144〜159）。x=142 から右へ 4 進むと壁の中
  const r = stepBeam({ x: 142, y: 24, vx: 4, vy: 0 }, map);
  assert.equal(r.bounced, true, '跳ね返っていない');
  assert.equal(r.vx, -4, 'vx が反転していない');
  assert.equal(r.vy, 0, 'vy まで反転している');
  assert.equal(map.isSolidAtPixel(r.x, r.y), false, '壁の中に居る');
});

test('床で vy が反転する', () => {
  const map = makeMap(ROOM);
  // 床は r=3（y=48〜63）。y=46 から下へ 4 進むと床の中
  const r = stepBeam({ x: 40, y: 46, vx: 0, vy: 4 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.vy, -4, 'vy が反転していない');
  assert.equal(r.vx, 0);
  assert.equal(map.isSolidAtPixel(r.x, r.y), false, '床の中に居る');
});

test('角に斜めから入ると両方反転する', () => {
  const map = makeMap(ROOM);
  // 右下の内側の角へ斜めに向かう
  const r = stepBeam({ x: 142, y: 46, vx: 4, vy: 4 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.vx, -4);
  assert.equal(r.vy, -4);
  assert.equal(map.isSolidAtPixel(r.x, r.y), false);
});

// 渡したものを書き換えると、呼び出し側が「反射前の位置」を経路に積めなくなる
test('引数のオブジェクトを書き換えない', () => {
  const map = makeMap(ROOM);
  const beam = { x: 142, y: 24, vx: 4, vy: 0 };
  stepBeam(beam, map);
  assert.deepEqual(beam, { x: 142, y: 24, vx: 4, vy: 0 });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: FAIL（`stepBeam is not a function`）

- [ ] **Step 3: `stepBeam()` を実装する**

`src/js/utils/beamPath.js` の末尾に追記:

```js
/**
 * ビームを1フレーム進める。地形にめり込むなら跳ね返す。
 *
 * 反射面の法線は「縦か横か」の2通りしかない（地形が軸並行のタイルだけなので）。
 * そこで x だけ動かした場合と y だけ動かした場合をそれぞれ試し、どちらが
 * めり込むかで面を判別する。レイキャストでタイル境界の正確な交点を出す案も
 * あったが、速度 4px/frame ではズレが目に見えず、コード量が3倍違う。
 *
 * 跳ね返るときは**元の位置から新しい速度で**動かす。こうすると壁の中に
 * 入り込まないうえ、折れ点が「元の位置」になる（呼び出し側はそこを経路に
 * 積めばよい）。
 *
 * @param {{x:number,y:number,vx:number,vy:number}} beam 書き換えない
 * @param {{isSolidAtPixel:function}} map
 * @returns {{x:number,y:number,vx:number,vy:number,bounced:boolean}}
 */
export function stepBeam(beam, map) {
    const { x, y, vx, vy } = beam;
    const nx = x + vx;
    const ny = y + vy;

    if (!map.isSolidAtPixel(nx, ny)) {
        return { x: nx, y: ny, vx, vy, bounced: false };
    }

    const hitX = map.isSolidAtPixel(nx, y);
    const hitY = map.isSolidAtPixel(x, ny);

    let rvx = hitX ? -vx : vx;
    let rvy = hitY ? -vy : vy;
    // どちらの軸も単独ではめり込まない＝角へ斜めから入った。両方を反転する
    if (!hitX && !hitY) { rvx = -vx; rvy = -vy; }

    const bx = x + rvx;
    const by = y + rvy;
    // 反転しても抜けられない（隙間に挟まった）ときは動かさない。速度は反転
    // したままなので次のフレームで反対側へ抜ける。抜けられないまま回っても、
    // 反射回数と距離の上限がいずれ尽きて消える
    if (map.isSolidAtPixel(bx, by)) {
        return { x, y, vx: rvx, vy: rvy, bounced: true };
    }
    return { x: bx, y: by, vx: rvx, vy: rvy, bounced: true };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: PASS（10件）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/beamPath.js tests/beam-path.test.js
git commit -m "feat: ビームを1フレーム進めて地形で跳ね返す純関数を追加"
```

---

### Task 3: `segmentIntersectsRect()` — 線分の当たり判定

既存の当たり判定は先端の1点しか見ていない（`CollisionManager` の `pointInRect`）。ビームは帯全体が当たるので線分の判定が要る。

**Files:**
- Modify: `src/js/utils/Physics.js`
- Test: `tests/segment-rect.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `segmentIntersectsRect(x1, y1, x2, y2, rect) -> boolean`
  - `rect` は `{x, y, width, height}`（自機・母艦・敵がそのまま渡せる形）

- [ ] **Step 1: 失敗するテストを書く**

`tests/segment-rect.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentIntersectsRect } from '../src/js/utils/Physics.js';

const RECT = { x: 100, y: 100, width: 20, height: 40 };

// 点の判定との差が出るのがここ。細長い自機を横切るビームは、両端が
// 矩形の外にあるのに途中で貫いている、という形になる
test('両端が外でも横切っていれば当たる', () => {
  assert.equal(segmentIntersectsRect(80, 120, 140, 120, RECT), true);
});

test('斜めに貫いても当たる', () => {
  assert.equal(segmentIntersectsRect(80, 90, 140, 150, RECT), true);
});

test('端点が中にあれば当たる', () => {
  assert.equal(segmentIntersectsRect(110, 120, 200, 300, RECT), true);
});

test('線分が矩形の中に完全に入っていれば当たる', () => {
  assert.equal(segmentIntersectsRect(105, 110, 115, 130, RECT), true);
});

test('手前で止まっていれば当たらない', () => {
  assert.equal(segmentIntersectsRect(80, 120, 99, 120, RECT), false);
});

test('矩形の外を素通りすれば当たらない', () => {
  assert.equal(segmentIntersectsRect(80, 200, 140, 200, RECT), false);
});

// 帯の1節が潰れている（長さ0）ことは実際に起きる。撃った直後など
test('長さ0の線分は点として判定する', () => {
  assert.equal(segmentIntersectsRect(110, 120, 110, 120, RECT), true);
  assert.equal(segmentIntersectsRect(10, 10, 10, 10, RECT), false);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/segment-rect.test.js`
Expected: FAIL（`segmentIntersectsRect is not a function`）

- [ ] **Step 3: `segmentIntersectsRect()` を実装する**

`src/js/utils/Physics.js` の末尾に追記:

```js
/**
 * 線分と矩形が交わるか。反射ビームは帯全体が当たるので、点ではなく線分で見る。
 *
 * Liang–Barsky のクリッピング。線分を媒介変数 t（0〜1）で表し、矩形の4辺で
 * t の範囲を削っていく。範囲が残れば交わっている。ループも平方根も無いので、
 * 帯の節8本 × 対象2つを毎フレーム見ても軽い。
 *
 * @param {number} x1 線分の端
 * @param {number} y1
 * @param {number} x2 もう一方の端
 * @param {number} y2
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @returns {boolean}
 */
export function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    let t0 = 0;
    let t1 = 1;

    // 4辺ぶん、(p, q) の組で範囲を削る
    const clip = (p, q) => {
        if (p === 0) return q >= 0;      // 辺と平行。外側なら即座に不成立
        const r = q / p;
        if (p < 0) {
            if (r > t1) return false;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
        }
        return true;
    };

    return clip(-dx, x1 - left)
        && clip(dx, right - x1)
        && clip(-dy, y1 - top)
        && clip(dy, bottom - y1);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/segment-rect.test.js`
Expected: PASS（7件）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Physics.js tests/segment-rect.test.js
git commit -m "feat: 線分と矩形の当たり判定を追加"
```

---

### Task 4: 定数と `ReflectBeam` エンティティ

**Files:**
- Modify: `src/js/utils/Constants.js`
- Create: `src/js/entities/ReflectBeam.js`
- Test: `tests/reflect-beam.test.js`

**Interfaces:**
- Consumes: `beamSegments()`, `stepBeam()`（Task 1・2）
- Produces:
  - `new ReflectBeam(game, x, y, angle)` — `game.enemyBullets` に積む
  - `beam.update()` / `beam.draw(ctx)` / `beam.segments() -> Array<{x1,y1,x2,y2}>`
  - `beam.alive`（boolean）、`beam.isReflectBeam === true`、`beam.x` / `beam.y`（先端）
  - 定数: `REFLECT_BEAM_SPEED`, `REFLECT_BEAM_TAIL_SEGMENTS`, `REFLECT_BEAM_TAIL_LENGTH`, `REFLECT_BEAM_WIDTH`, `REFLECT_BEAM_MAX_BOUNCES`, `REFLECT_BEAM_MAX_DISTANCE`, `REFLECT_BEAM_DAMAGE`, `COLOR_REFLECT_BEAM_CORE`, `COLOR_REFLECT_BEAM_MID`, `COLOR_REFLECT_BEAM_EDGE`

- [ ] **Step 1: 定数を足す**

`src/js/utils/Constants.js` の `BASE_LASER_*` の並びの直後に追記:

```js
// --- 反射ビームキャノン（7面。タレットの半分を差し替える） ---
// 母艦レーザー（BASE_LASER_*）とは別物。あちらは速度12の直線で地形を貫通する。
// こちらは遅く跳ね返るのが主眼で、見てから避けられる速さにしてある。
export const REFLECT_BEAM_SPEED = 4;            // ホーミングミサイル(3)より少し速い
export const REFLECT_BEAM_TAIL_SEGMENTS = 8;    // 帯を何節に等分するか
// 帯の長さ。当たり判定が帯全体なので、これが通路を塞ぐ時間を決める。
// **難しすぎたときに最初に下げる値**
export const REFLECT_BEAM_TAIL_LENGTH = 160;    // 8節 × 20px
export const REFLECT_BEAM_WIDTH = 5;            // 母艦レーザーは6
export const REFLECT_BEAM_MAX_BOUNCES = 4;
export const REFLECT_BEAM_MAX_DISTANCE = 1200;  // 速度4で300フレーム=5秒
export const REFLECT_BEAM_DAMAGE = 20;          // 敵弾10・ホーミング20。自機HP100で5発
export const REFLECT_BEAM_MUZZLE_FLASH_FRAMES = 12; // 0.2秒

// 芯が白っぽい紫、外へ向かって暗紫。母艦レーザー（エメラルド #00FFAA）と
// 一目で区別できるようにする。**hex で書くこと**（lerpColor が parseInt する）
export const COLOR_REFLECT_BEAM_CORE = '#F2E6FF';
export const COLOR_REFLECT_BEAM_MID = '#B266FF';
export const COLOR_REFLECT_BEAM_EDGE = '#3B0F6B';
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/reflect-beam.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  REFLECT_BEAM_SPEED, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
  REFLECT_BEAM_TAIL_SEGMENTS, COLOR_REFLECT_BEAM_CORE,
} from '../src/js/utils/Constants.js';

// 横に長い部屋。左右の壁で跳ね返る
const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

function makeBeam(opts = {}) {
  const map = makeMap(ROOM);
  const game = { map, particles: [] };
  const beam = new ReflectBeam(game, opts.x ?? 40, opts.y ?? 40, opts.angle ?? 0);
  return { beam, game, map };
}

test('まっすぐ飛ぶ', () => {
  const { beam } = makeBeam();
  beam.update();
  assert.equal(beam.x, 40 + REFLECT_BEAM_SPEED);
  assert.equal(beam.y, 40);
  assert.equal(beam.alive, true);
});

test('壁で跳ね返り、反射回数が増える', () => {
  const { beam } = makeBeam({ x: 40, y: 40, angle: 0 });
  for (let i = 0; i < 100; i++) beam.update();
  assert.ok(beam.bounces > 0, '一度も跳ね返っていない');
});

test('反射回数を使い切ると消える', () => {
  const { beam } = makeBeam({ x: 40, y: 40, angle: 0 });
  for (let i = 0; i < 2000; i++) beam.update();
  assert.equal(beam.alive, false, '消えていない');
  assert.ok(beam.bounces <= REFLECT_BEAM_MAX_BOUNCES + 1,
    `反射回数の上限を超えている: ${beam.bounces}`);
});

test('距離は速度ぶんずつ増える', () => {
  const { beam } = makeBeam();
  beam.update();
  beam.update();
  assert.equal(beam.distance, REFLECT_BEAM_SPEED * 2);
});

// 「反射回数と距離の、先に尽きた方」で消える。この部屋では反射のほうが先に
// 尽きるので、距離の上限だけを試すには反射の予算を外して確かめる
test('反射しなくても距離を使い切れば消える', () => {
  const { beam } = makeBeam();
  let steps = 0;
  while (beam.alive && steps < 5000) {
    beam.bounces = 0;   // 反射の予算を使い切らせない
    beam.update();
    steps++;
  }
  assert.equal(beam.alive, false, '距離を使い切っても消えていない');
  assert.ok(beam.distance >= REFLECT_BEAM_MAX_DISTANCE,
    `距離の上限より手前で消えた: ${beam.distance}`);
});

test('帯は設定した節の数になる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < 60; i++) beam.update();
  assert.equal(beam.segments().length, REFLECT_BEAM_TAIL_SEGMENTS);
});

// 地形を壊すと跳ね返り方がその場の破壊状況しだいになって読めなくなる
test('地形にダメージを与えない', () => {
  const { beam, map } = makeBeam({ x: 40, y: 40, angle: 0 });
  let damaged = 0;
  map.damageBlock = () => { damaged++; };
  for (let i = 0; i < 200; i++) beam.update();
  assert.equal(damaged, 0, '地形を壊している');
});

test('芯の色で描かれる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < 60; i++) beam.update();
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  const colors = ctx.calls.filter((c) => c.name === 'set:strokeStyle').map((c) => c.args[0]);
  assert.ok(colors.includes(COLOR_REFLECT_BEAM_CORE), '芯の色が使われていない');
});

test('死んだら描かない', () => {
  const { beam } = makeBeam();
  beam.alive = false;
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/reflect-beam.test.js`
Expected: FAIL（`Cannot find module '../src/js/entities/ReflectBeam.js'`）

- [ ] **Step 4: `ReflectBeam` を実装する**

`src/js/entities/ReflectBeam.js` を新規作成:

```js
// ============================================
// ReflectBeam - 地形で跳ね返るビーム
// ============================================
//
// 7面の反射ビームキャノンが撃つ。母艦レーザー（BaseLaser）とは別物で、
// あちらは速度12の直線が地形を貫通する。こちらは遅く、地形で跳ねる。
//
// 当たり判定は**帯全体**（ユーザーの決定）。見えている帯と当たる帯が食い違うと
// そのまま理不尽さになるので、描画も CollisionManager も segments() の
// 同じ戻り値を使う。判定そのものは CollisionManager が持つ（他の弾と同じ分担）。

import {
    REFLECT_BEAM_SPEED, REFLECT_BEAM_TAIL_SEGMENTS, REFLECT_BEAM_TAIL_LENGTH,
    REFLECT_BEAM_WIDTH, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
    COLOR_REFLECT_BEAM_CORE, COLOR_REFLECT_BEAM_MID, COLOR_REFLECT_BEAM_EDGE,
} from '../utils/Constants.js';
import { beamSegments, stepBeam } from '../utils/beamPath.js';

export class ReflectBeam {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * REFLECT_BEAM_SPEED;
        this.vy = Math.sin(angle) * REFLECT_BEAM_SPEED;
        this.alive = true;
        this.bounces = 0;
        this.distance = 0;
        // 通った経路。**[0] が先端**。反射の折れ点は「反射前の位置」なので、
        // 毎フレーム先端を積むだけで折れ線として正しくなる
        this.path = [{ x, y }];
        // 帯に必要なぶんだけ残す。速度4・帯160px なら 40節ぶん + 余裕
        this.maxNodes = Math.ceil(REFLECT_BEAM_TAIL_LENGTH / REFLECT_BEAM_SPEED) + 2;
        // CollisionManager が「点ではなく帯で見る」相手だと見分けるための印
        this.isReflectBeam = true;
    }

    update() {
        if (!this.alive) return;

        const next = stepBeam(this, this.game.map);
        this.x = next.x;
        this.y = next.y;
        this.vx = next.vx;
        this.vy = next.vy;
        if (next.bounced) this.bounces++;

        this.distance += REFLECT_BEAM_SPEED;
        this.path.unshift({ x: this.x, y: this.y });
        if (this.path.length > this.maxNodes) this.path.length = this.maxNodes;

        if (this.bounces > REFLECT_BEAM_MAX_BOUNCES) this.alive = false;
        if (this.distance >= REFLECT_BEAM_MAX_DISTANCE) this.alive = false;

        // マップ外（BaseLaser と同じ扱い）
        const map = this.game.map;
        if (map && map.width !== undefined) {
            if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
                this.alive = false;
            }
        }
    }

    /** 今この瞬間の帯。描画と当たり判定が**同じものを**使う。 */
    segments() {
        return beamSegments(this.path, REFLECT_BEAM_TAIL_LENGTH, REFLECT_BEAM_TAIL_SEGMENTS);
    }

    draw(ctx) {
        if (!this.alive) return;
        const segs = this.segments();
        if (segs.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 外周（暗紫）→ 中間 → 芯（白っぽい紫）の順に重ねる。3回なぞるだけで
        // 断面のグラデーションに見える。節ごとに描くので折れ点でも途切れない
        const passes = [
            { color: COLOR_REFLECT_BEAM_EDGE, width: REFLECT_BEAM_WIDTH + 4 },
            { color: COLOR_REFLECT_BEAM_MID, width: REFLECT_BEAM_WIDTH },
            { color: COLOR_REFLECT_BEAM_CORE, width: Math.max(1, REFLECT_BEAM_WIDTH * 0.4) },
        ];
        for (const pass of passes) {
            ctx.strokeStyle = pass.color;
            ctx.lineWidth = pass.width;
            ctx.beginPath();
            for (const s of segs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/reflect-beam.test.js`
Expected: PASS（8件）

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/Constants.js src/js/entities/ReflectBeam.js tests/reflect-beam.test.js
git commit -m "feat: 地形で跳ね返るビームのエンティティを追加"
```

---

### Task 5: 当たり判定の接続（帯全体で当たる）

**Files:**
- Modify: `src/js/systems/CollisionManager.js`
- Test: `tests/reflect-beam-collision.test.js`

**Interfaces:**
- Consumes: `segmentIntersectsRect()`（Task 3）、`ReflectBeam`（Task 4）、`REFLECT_BEAM_DAMAGE`
- Produces: なし（既存の `_updateEnemyBullets()` の振る舞いを拡張するだけ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/reflect-beam-collision.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { REFLECT_BEAM_DAMAGE } from '../src/js/utils/Constants.js';

const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

/** 自機の代わり。takeDamage を記録するだけ。 */
function makeTarget(x, y) {
  return {
    x, y, width: 16, height: 16, alive: true, docked: false, invincibleTimer: 0,
    damage: 0,
    takeDamage(d) { this.damage += d; },
  };
}

function makeGame(beamStart, target) {
  const map = makeMap(ROOM);
  const game = {
    map, particles: [], enemies: [], projectiles: [], enemyBullets: [],
    player: target, carrier: null,
    addScore() {}, spawnSparks() {}, spawnExplosion() {},
  };
  game.enemyBullets.push(new ReflectBeam(game, beamStart.x, beamStart.y, beamStart.angle));
  return game;
}

// 帯の途中が当たる形。先端の点だけを見ていたら当たらない位置に置く
test('帯の途中に触れただけで当たる', () => {
  const target = makeTarget(64, 34);
  const game = makeGame({ x: 32, y: 40, angle: 0 }, target);
  const cm = new CollisionManager(game);

  // 自機を追い越すまで進める。追い越した後は先端が自機より右にあり、
  // 当たっているのは帯の途中だけになる
  for (let i = 0; i < 20 && target.damage === 0; i++) cm._updateEnemyBullets();

  assert.ok(target.damage > 0, '帯が触れているのに当たっていない');
  assert.equal(target.damage, REFLECT_BEAM_DAMAGE, 'ダメージ量が違う');
});

test('離れていれば当たらない', () => {
  const target = makeTarget(64, 20);
  const game = makeGame({ x: 32, y: 40, angle: 0 }, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 20; i++) cm._updateEnemyBullets();
  assert.equal(target.damage, 0, '離れているのに当たっている');
});

test('当たったビームは消える', () => {
  const target = makeTarget(64, 34);
  const game = makeGame({ x: 32, y: 40, angle: 0 }, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 20 && target.damage === 0; i++) cm._updateEnemyBullets();
  assert.equal(game.enemyBullets.length, 0, 'ビームが残っている');
});

test('ドッキング中の自機には当たらない', () => {
  const target = makeTarget(64, 34);
  target.docked = true;
  const game = makeGame({ x: 32, y: 40, angle: 0 }, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 20; i++) cm._updateEnemyBullets();
  assert.equal(target.damage, 0);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/reflect-beam-collision.test.js`
Expected: FAIL（`帯が触れているのに当たっていない`。今は先端の1点しか見ていない）

- [ ] **Step 3: `CollisionManager` を直す**

`src/js/systems/CollisionManager.js` の import に足す:

```js
import { segmentIntersectsRect } from '../utils/Physics.js';
import { REFLECT_BEAM_DAMAGE } from '../utils/Constants.js';
```

`_updateEnemyBullets()` の当たり判定を、点と帯で切り替える形に直す:

```js
            if (bullet.alive) {
                const playerVulnerable = game.player && game.player.alive
                    && !game.player.docked && game.player.invincibleTimer <= 0;

                if (playerVulnerable && this._bulletTouches(bullet, game.player)) {
                    this._applyBulletHit(bullet, game.player);
                }

                if (game.carrier && game.carrier.alive && bullet.alive
                    && this._bulletTouches(bullet, game.carrier)) {
                    this._applyBulletHit(bullet, game.carrier);
                }
            }
```

同じクラスにメソッドを足す:

```js
    /**
     * 弾が対象に触れているか。
     *
     * 反射ビームだけは**帯全体**が当たるので、先端の1点ではなく節ごとの線分で見る。
     * 判定に使う帯は描画と同じ segments() の戻り値で、ここが食い違うと
     * 「見えているのに当たらない／見えていないのに当たる」になる。
     */
    _bulletTouches(bullet, target) {
        if (typeof bullet.segments === 'function') {
            return bullet.segments().some(
                (s) => segmentIntersectsRect(s.x1, s.y1, s.x2, s.y2, target),
            );
        }
        return pointInRect(bullet.x, bullet.y, target);
    }
```

`_applyBulletHit()` のダメージの分岐に1行足す（`isBaseLaser` の分岐の直後）:

```js
        } else if (bullet.isReflectBeam) {
            damage = REFLECT_BEAM_DAMAGE;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/reflect-beam-collision.test.js`
Expected: PASS（4件）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ（既存の弾は `segments` を持たないので今までどおり点で判定される）

- [ ] **Step 6: コミット**

```bash
git add src/js/systems/CollisionManager.js tests/reflect-beam-collision.test.js
git commit -m "feat: 反射ビームは帯全体で当たり判定する"
```

---

### Task 6: 砲台に型の表を足す

**Files:**
- Modify: `src/js/entities/EnemyTurret.js`
- Modify: `src/js/utils/Constants.js`
- Test: `tests/beam-cannon.test.js`

**Interfaces:**
- Consumes: `ReflectBeam`（Task 4）、`REFLECT_BEAM_MUZZLE_FLASH_FRAMES`
- Produces:
  - `new EnemyTurret(game, x, y, isCeilingMounted, type)` — `type` は `'gun'`（既定）か `'beam'`
  - `turret.type`、`turret.muzzleFlash`（残りフレーム数）
  - 定数: `REFLECT_BEAM_CANNON_HP`, `REFLECT_BEAM_CANNON_COOLDOWN`, `REFLECT_BEAM_CANNON_SCORE`, `COLOR_BEAM_CANNON_BASE`, `COLOR_BEAM_CANNON_BARREL`, `COLOR_BEAM_CANNON_PIVOT`

- [ ] **Step 1: 定数を足す**

`src/js/utils/Constants.js` の Task 4 で足した並びの直後に追記:

```js
export const REFLECT_BEAM_CANNON_HP = 40;        // タレット30より硬い（自機ミサイル3発）
export const REFLECT_BEAM_CANNON_COOLDOWN = 180; // タレットは120で5連射。単発なので長め
export const REFLECT_BEAM_CANNON_SCORE = 350;    // タレット200より高い

// 既存のタレット（#555555 / #888888 / #667788）より明るい灰色。並んだときに
// 新型だと分かるようにする
export const COLOR_BEAM_CANNON_BASE = '#AAB2BA';
export const COLOR_BEAM_CANNON_BARREL = '#D8DEE4';
export const COLOR_BEAM_CANNON_PIVOT = '#C0C8D0';
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/beam-cannon.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_SCORE, ENEMY_TURRET_HP,
  REFLECT_BEAM_MUZZLE_FLASH_FRAMES, COLOR_BEAM_CANNON_BARREL,
} from '../src/js/utils/Constants.js';

const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

function makeGame() {
  const map = makeMap(ROOM);
  return {
    map, enemies: [], enemyBullets: [], particles: [], projectiles: [],
    missionsCompleted: 6,
    player: { x: 100, y: 40, width: 16, height: 16, alive: true, docked: false },
    carrier: null,
    score: 0,
    addScore(n) { this.score += n; },
    spawnSparks() {}, spawnExplosion() {},
  };
}

/** 撃つまで update を回す。 */
function fireOnce(turret, game) {
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) turret.update();
}

test('既定は従来のタレット', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false);
  assert.equal(t.type, 'gun');
  assert.equal(t.maxHp, ENEMY_TURRET_HP);
});

test('beam 型は反射ビームを撃つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  assert.equal(game.enemyBullets.length, 1, 'ビームが出ていない');
  assert.ok(game.enemyBullets[0] instanceof ReflectBeam, '出たのがビームではない');
});

test('beam 型は1回の攻撃で1発だけ撃つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  // 撃った直後にさらに回しても、クールダウン中は増えない
  for (let i = 0; i < 60; i++) t.update();
  assert.equal(game.enemyBullets.length, 1, '連射している');
});

test('beam 型は HP とスコアが専用の値になる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  assert.equal(t.maxHp, REFLECT_BEAM_CANNON_HP);
  t.die();
  assert.equal(game.score, REFLECT_BEAM_CANNON_SCORE);
});

// 撃ったことを伝えるための演出。**予告ではない**ので、撃つ前には光らない
test('撃った瞬間に砲口の放射光が出て、やがて消える', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  assert.equal(t.muzzleFlash, 0, '撃つ前から光っている');
  fireOnce(t, game);
  assert.equal(t.muzzleFlash, REFLECT_BEAM_MUZZLE_FLASH_FRAMES);
  for (let i = 0; i < REFLECT_BEAM_MUZZLE_FLASH_FRAMES + 1; i++) t.update();
  assert.equal(t.muzzleFlash, 0, '光が消えていない');
});

test('放射光は円形のグラデーションで描かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);

  const lit = makeFakeCtx();
  t.draw(lit);
  assert.ok(lit.calls.some((c) => c.name === 'arc'), '放射光の円が描かれていない');

  t.muzzleFlash = 0;
  const dark = makeFakeCtx();
  t.draw(dark);
  const arcs = (ctx) => ctx.calls.filter((c) => c.name === 'arc').length;
  assert.ok(arcs(lit) > arcs(dark), '光っていないときと同じ描画になっている');
});

test('beam 型は明るい灰色で描かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);
  const colors = ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(colors.includes(COLOR_BEAM_CANNON_BARREL), '専用の色で描かれていない');
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/beam-cannon.test.js`
Expected: FAIL（`t.type` が undefined）

- [ ] **Step 4: `EnemyTurret` に型の表を足す**

`src/js/entities/EnemyTurret.js` の import に足す:

```js
import {
    REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_COOLDOWN, REFLECT_BEAM_CANNON_SCORE,
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES,
    COLOR_BEAM_CANNON_BASE, COLOR_BEAM_CANNON_BARREL, COLOR_BEAM_CANNON_PIVOT,
    COLOR_REFLECT_BEAM_CORE,
} from '../utils/Constants.js';
import { ReflectBeam } from './ReflectBeam.js';
```

クラスの手前（モジュールスコープ）に型の表を置く:

```js
// 型ごとの違いは**この表の1行**に出る。新しいクラスを作ると、照準・視線判定・
// 被弾・破片・スコアの5つを写すことになる。EnemyAttacker が4型を1クラス＋
// 型別 config で持っているのと同じ形にした。
//
// 色は描画専用のパラメータなので、Constants ではなくここから引く（EnemyAttacker の
// LEG_STYLES と同じ扱い）。値そのものは Constants にある。
const TURRET_TYPES = {
    gun: {
        hp: ENEMY_TURRET_HP,
        score: ENEMY_TURRET_SCORE,
        cooldown: ENEMY_TURRET_COOLDOWN,
        burst: ENEMY_TURRET_BURST_COUNT,
        colors: { base: '#555555', barrel: '#888888', pivot: '#667788' },
    },
    beam: {
        hp: REFLECT_BEAM_CANNON_HP,
        score: REFLECT_BEAM_CANNON_SCORE,
        cooldown: REFLECT_BEAM_CANNON_COOLDOWN,
        burst: 1,  // 単発。連射すると帯が重なって逃げ場が無くなる
        colors: {
            base: COLOR_BEAM_CANNON_BASE,
            barrel: COLOR_BEAM_CANNON_BARREL,
            pivot: COLOR_BEAM_CANNON_PIVOT,
        },
    },
};
```

コンストラクタを直す:

```js
    constructor(game, x, y, isCeilingMounted = false, type = 'gun') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_TURRET_WIDTH;
        this.height = ENEMY_TURRET_HEIGHT;
        this.type = TURRET_TYPES[type] ? type : 'gun';
        this.spec = TURRET_TYPES[this.type];
        this.hp = this.spec.hp;
        this.maxHp = this.hp;
        this.alive = true;
        this.isCeilingMounted = isCeilingMounted;
        // 発射時の砲口の放射光。残りフレーム数。**予告ではない**（撃つ前は 0）
        this.muzzleFlash = 0;
```

（以降の `targetAngle` 以下は既存のまま。`this.cooldownTimer` の初期化は
`Math.floor(Math.random() * this.spec.cooldown)` に、`this.maxBurstCount` は
下の Step の形に直す）

連射数の決定を型から引くように直す:

```js
        // Mission 5 以降は連射数が増える（従来のタレットだけ。ビームは常に単発）
        this.maxBurstCount = (this.type === 'gun' && this.game.missionsCompleted >= 4)
            ? 8
            : this.spec.burst;
```

`update()` の先頭に放射光の減衰を足す:

```js
        if (this.muzzleFlash > 0) this.muzzleFlash--;
```

`_updateStateMachine()` のクールダウン設定2箇所を `this.spec.cooldown` に置き換える。

`_executeAttack()` を型で分岐させる:

```js
    _executeAttack() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        const barrelLength = 12 - this.recoil;
        const muzzleX = cx + Math.cos(this.currentAngle) * barrelLength;
        const muzzleY = cy + Math.sin(this.currentAngle) * barrelLength;

        if (this.type === 'beam') {
            // ビームはばらつかせない。反射先が読めることが遊びの中身なので、
            // 撃つたびに散らすとその読みが成立しない
            this.game.enemyBullets.push(
                new ReflectBeam(this.game, muzzleX, muzzleY, this.currentAngle),
            );
            this.muzzleFlash = REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
        } else {
            const inaccuracy = (Math.random() - 0.5) * 0.1;
            const bullet = new EnemyBullet(this.game, muzzleX, muzzleY, this.currentAngle + inaccuracy);
            this.game.enemyBullets.push(bullet);
        }

        this.recoil = 4;
    }
```

`die()` のスコアを型から引く:

```js
        this.game.addScore(this.spec.score);
```

`draw()` の色を表から引き、砲口の放射光を足す（`ctx.rotate(this.currentAngle)` の後、
砲身を描いた直後に置く）:

```js
        const colors = this.spec.colors;
        // ...（base / barrel / pivot の fillStyle をすべて colors から引く）

        // 発射直後の砲口の放射光。撃ったことを伝えるための演出で、遅いビームの
        // 出どころを見失わないようにする役目。**予告ではない**
        if (this.muzzleFlash > 0) {
            const t = this.muzzleFlash / REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
            const r = 14 * t;
            const gx = 4 + barrelLength;
            const grad = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(0.1, r));
            grad.addColorStop(0, COLOR_REFLECT_BEAM_CORE);
            grad.addColorStop(1, COLOR_REFLECT_BEAM_EDGE);
            ctx.globalAlpha = t;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, 0, Math.max(0.1, r), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
```

（`COLOR_REFLECT_BEAM_EDGE` も import に足すこと）

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/beam-cannon.test.js`
Expected: PASS（7件）

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ。既存のタレットのテスト（破片・スコア・連射）が通ったままであること

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/Constants.js src/js/entities/EnemyTurret.js tests/beam-cannon.test.js
git commit -m "feat: タレットに型の表を足し、反射ビームを撃つ型を追加"
```

---

### Task 7: 7面での差し替え

**Files:**
- Modify: `src/js/systems/SpawnManager.js:136-139`
- Test: `tests/beam-cannon-spawn.test.js`

**Interfaces:**
- Consumes: `EnemyTurret`（Task 6 の `type` 引数）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/beam-cannon-spawn.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';

/** タレットの湧き場所だけを持つ最小のマップ。他の敵は湧かせない。 */
function makeGame(missionsCompleted, turretCount) {
  const enemyTurretSpawns = [];
  for (let i = 0; i < turretCount; i++) {
    enemyTurretSpawns.push({ x: i * 32, y: 40, isCeiling: i % 3 === 0 });
  }
  let rngCalls = 0;
  return {
    missionsCompleted,
    enemies: [],
    enemyBullets: [],
    particles: [],
    baseEmergencyAlert: false,
    map: {
      enemyTankSpawns: [], landmineSpawns: [], enemyAttackerSpawns: [],
      enemyDroneSpawns: [], enemyTurretSpawns, enemyBaseSpawn: null,
      width: 2048, height: 512,
      isSolidAtPixel: () => false,
    },
    rng: { next: () => { rngCalls++; return 0.5; } },
    get rngCalls() { return rngCalls; },
  };
}

const turretTypes = (game) => game.enemies.map((e) => e.type);
const spawn = (game) => new SpawnManager(game).spawnEnemies();

test('6面までは従来のタレットだけ', () => {
  const game = makeGame(5, 8);
  spawn(game);
  assert.ok(turretTypes(game).every((t) => t === 'gun'), '6面に反射ビームが出ている');
});

test('7面ではタレットの半分が反射ビームになる', () => {
  const game = makeGame(6, 8);
  spawn(game);
  const types = turretTypes(game);
  assert.equal(types.filter((t) => t === 'beam').length, 4, '半分になっていない');
  assert.equal(types.filter((t) => t === 'gun').length, 4);
});

// 週次の決定性（同じ ISO 週なら全員同じステージ）が壊れる。
// 並び順の偶数番目を取るだけなら乱数は要らない
test('差し替えで乱数を消費しない', () => {
  const game = makeGame(6, 8);
  spawn(game);
  assert.equal(game.rngCalls, 0, 'game.rng を消費している');
});

test('奇数個でも偶数番目が反射ビームになる', () => {
  const game = makeGame(6, 5);
  spawn(game);
  assert.deepEqual(turretTypes(game), ['beam', 'gun', 'beam', 'gun', 'beam']);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/beam-cannon-spawn.test.js`
Expected: FAIL（`半分になっていない`。今は全部 `gun`）

- [ ] **Step 3: `SpawnManager` を直す**

`src/js/systems/SpawnManager.js` のタレットを湧かせる箇所（`136-139`）を置き換える:

```js
        // Spawn stationary turrets
        // 7面（missionsCompleted >= 6）では**並び順の偶数番目**を反射ビームに
        // 差し替える。この配列は Map._findEnemyTurretPositions() が既に game.rng で
        // シャッフルして作っているので、偶数番目を取るだけなら**追加の乱数消費が
        // ゼロ**になる。ここで rng.next() を1回でも呼ぶと、以降の敵の構成が全部
        // ずれて週次の決定性が壊れる（tests/MapDeterminism.test.js）
        const beamMission = game.missionsCompleted >= 6;
        game.map.enemyTurretSpawns.forEach((pos, i) => {
            const type = (beamMission && i % 2 === 0) ? 'beam' : 'gun';
            game.enemies.push(new EnemyTurret(game, pos.x, pos.y, pos.isCeiling, type));
        });
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/beam-cannon-spawn.test.js`
Expected: PASS（4件）

- [ ] **Step 5: 決定性の回帰テストを走らせる**

Run: `npm test -- tests/MapDeterminism.test.js`
Expected: PASS（同じ週シードで同じステージになること）

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ

- [ ] **Step 7: コミット**

```bash
git add src/js/systems/SpawnManager.js tests/beam-cannon-spawn.test.js
git commit -m "feat: 7面でタレットの半分を反射ビームキャノンにする"
```

---

### Task 8: 発射音

**Files:**
- Modify: `src/js/audio/weaponSounds.js`
- Modify: `tests/helpers/weapon-render.js`（必要な場合のみ。既存の部品だけで作れるなら不要）
- Modify: `src/js/entities/ReflectBeam.js`
- Test: `tests/reflect-beam-sound.test.js`

**Interfaces:**
- Consumes: `WEAPON_SOUNDS`、`audioManager.playWeapon(kind, x, y)`
- Produces: `WEAPON_SOUNDS.reflectBeam`

- [ ] **Step 1: 失敗するテストを書く**

`tests/reflect-beam-sound.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile } from './helpers/weapon-render.js';
import { aWeightedRms, db } from './helpers/dsp.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap } from './helpers/enemy-world.js';

test('表に reflectBeam がある', () => {
  assert.ok(WEAPON_SOUNDS.reflectBeam, '表に無い');
});

// 敵のマシンガンと同じくらいの存在感にする。小さすぎると撃たれたことに
// 気づけず、大きすぎると連続して撃たれたときに耳につく
test('敵マシンガンとの相対音量が範囲に収まる', () => {
  const beam = aWeightedRms(() => renderWeaponProfile(WEAPON_SOUNDS.reflectBeam));
  const mg = aWeightedRms(() => renderWeaponProfile(WEAPON_SOUNDS.enemyMg));
  const rel = db(beam / mg);
  assert.ok(rel > -6 && rel < 6, `敵マシンガンとの差が大きすぎる: ${rel.toFixed(1)}dB`);
});

// 無音バグを実際に出したことがあるためのテスト
test('鳴っている（無音ではない）', () => {
  const level = aWeightedRms(() => renderWeaponProfile(WEAPON_SOUNDS.reflectBeam));
  assert.ok(level > 0.001, `ほぼ無音: ${level}`);
});

test('撃つと発射音を鳴らす', () => {
  const played = [];
  const original = audioManager.playWeapon;
  audioManager.playWeapon = (kind) => { played.push(kind); };
  try {
    const map = makeMap(['####', '#..#', '####']);
    new ReflectBeam({ map, particles: [] }, 20, 20, 0);
  } finally {
    audioManager.playWeapon = original;
  }
  assert.deepEqual(played, ['reflectBeam']);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/reflect-beam-sound.test.js`
Expected: FAIL（`表に無い`）

- [ ] **Step 3: 音を作る**

`src/js/audio/weaponSounds.js` の `WEAPON_SOUNDS` に1行足す。部品は
`hiss` / `tone` / `puffs` / `clicks` / `voice` の5つ。反射ビームは
「低く唸る発射」にしたいので `tone` を主にし、`hiss` を薄く重ねる:

```js
    // --- 反射ビームキャノン（7面） ---
    // 母艦レーザー（playLaserFire）とは別の音。跳ね回るぶん耳につきやすいので、
    // 高い成分を抑えて低く唸らせる。周波数を下げ切る形にして「撃った」ことだけを
    // 伝え、飛んでいる間は鳴らさない
    reflectBeam: {
        tone: { type: 'sawtooth', from: 520, to: 120, dur: 0.22, gain: 0.10 },
        hiss: { from: 2600, to: 700, dur: 0.10, gain: 0.05 },
    },
```

**`renderWeaponSound()`（WebAudio）と `tests/helpers/weapon-render.js` の
`renderWeaponProfile()`（node での再現）は同じ音を出す対である。片方だけ変えない。**
上の行が既存の部品（`tone` の `type: 'sawtooth'` と `hiss`）だけで作れているなら、
どちらのコードにも手を入れずに済む。**まず既存の部品で作れないか確かめること。**
新しい部品が要るなら、両方に同じロジックを足し、時間設計など共通のものは
純粋関数に切り出して共有する（`voiceBreakpoints()` が前例）。

`src/js/entities/ReflectBeam.js` のコンストラクタの末尾に足す:

```js
        audioManager.playWeapon('reflectBeam', x, y);
```

import も足す:

```js
import { audioManager } from '../audio/AudioManager.js';
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/reflect-beam-sound.test.js`
Expected: PASS（4件）

相対音量のテストが落ちたら、**テストの範囲ではなく `gain` を調整する**。
このテストは「既存の音との釣り合い」を縛るためにある。

- [ ] **Step 5: 試聴用に書き出す**

Run: `node tools/render-weapon-sounds.mjs`
出力は `audio-preview/`（git 管理外）。`reflectBeam.wav` ができていることを確認する。

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ。`tests/audio-manager.test.js` が全メソッドを引数なしで
総当たりで呼ぶので、そこで例外が出ないこと

- [ ] **Step 7: コミット**

```bash
git add src/js/audio/weaponSounds.js src/js/entities/ReflectBeam.js tests/reflect-beam-sound.test.js
git commit -m "feat: 反射ビームの発射音を追加"
```

---

### Task 9: 引き渡し

**Files:**
- Modify: `docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md`（実装で判明したことがあれば）

- [ ] **Step 1: 設計書を実装に合わせる**

実装中に設計と違う判断をした箇所があれば、設計書を直す。特に:
- `stepBeam()` で「隙間に挟まったときは動かさない」ようにした件は、設計書の
  「反射」の節に書かれていない。**実装して分かったこと**として節を足す
- 数値を変えた場合は、変えた理由と実測値をコメントと設計書の両方に残す

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md
git commit -m "docs: 反射ビームキャノンの設計書を実装に合わせる"
```

- [ ] **Step 3: ユーザーに引き渡す**

**実機での見た目・音の確認は必ずユーザーが行う。** ローカルサーバーはユーザーが
IDE 側で常時立てているので、こちらでは起動しない。

引き渡すときは以下を伝える:

- **ハードリロード（Cmd+Shift+R）が要る**こと。`index.html` が `main.js?v=1.0` と
  クエリでキャッシュを効かせているので、忘れると「効いていない」と誤解される
- **7面（Mission 7）でしか出ない**こと。`src/js/main.js` の `debugStartMission` を
  6 にすると7面から始められる（ユーザーが既にそうしている）
- 確認ポイントと調整用の定数の対応表:

| 見てほしいこと | 調整する定数 |
|---|---|
| ビームが速すぎて避けられない | `REFLECT_BEAM_SPEED`（4） |
| 帯が通路を塞ぐ時間が長い | `REFLECT_BEAM_TAIL_LENGTH`（160）**最初に下げる値** |
| 跳ね回りすぎる／すぐ消える | `REFLECT_BEAM_MAX_BOUNCES`（4）/ `REFLECT_BEAM_MAX_DISTANCE`（1200） |
| 紫が洞窟の背景に埋もれる | `COLOR_REFLECT_BEAM_CORE` / `_MID` / `_EDGE` |
| 砲台が既存のタレットと見分けにくい | `COLOR_BEAM_CANNON_BASE` / `_BARREL` / `_PIVOT` |
| 砲口の光が見えない／長すぎる | `REFLECT_BEAM_MUZZLE_FLASH_FRAMES`（12） |
| 撃つ間隔 | `REFLECT_BEAM_CANNON_COOLDOWN`（180） |
| 硬すぎる／柔らかすぎる | `REFLECT_BEAM_CANNON_HP`（40） |
| 一撃が重い | `REFLECT_BEAM_DAMAGE`（20。自機HP100で5発） |
| 7面の難度が上がりすぎ | 差し替えの割合（`SpawnManager` の `i % 2 === 0`） |
