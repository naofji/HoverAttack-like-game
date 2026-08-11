# artillery の煙幕（スモークスクリーン）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** artillery 型の敵が自機に発見された瞬間に煙幕を張り、煙の中の敵は目視できず Auto Aim のロック対象からも外れるようにする。

**Architecture:** 煙は `SmokeScreen`（雲）が持つ14個のパフで表す。パフは自分の経過時間ひとつから半径・alpha・色が出る。見た目は起動時に一度だけ焼いた12枚のスプライト（形4種 × 色3段）を `drawImage` するだけ。隠蔽判定は描画と同じ `puffAlphaAt()` を読む純粋関数で、`source-over` の合成式（透過率の積）と同一なので見た目と判定が定義上一致する。

**Tech Stack:** バニラ ES modules ＋ canvas 2D。ビルド工程なし、依存パッケージなし。テストは `node --test`。

設計: `docs/superpowers/specs/2026-08-11-artillery-smoke-screen-design.md`

## Global Constraints

- **`git add -A` / `git add .` は使わない。** `src/js/main.js` にはユーザーがデバッグ用に置いた `debugStartMission: 6` が意図的に未コミットで存在する（本番値は 0）。`main.js` を触るタスクでは `git add -p` か、自分のハンクだけのパッチを `git apply --cached` する
- 調整用の数値はすべて `src/js/utils/Constants.js` に置く。実装側にマジックナンバーを直書きしない
- コメントは日本語で「なぜそうしたか」を書く。数値を決めたら根拠（実測値・経た値）を残す
- **ソース文字列を grep するテストは書かない**（到達不能でも通ってしまう）
- テスト環境に DOM も AudioContext も無い。canvas を使うコードは**遅延実行**にして、テストが `globalThis.document` をスタブしてから初めて走るようにする
- `game.rng` を消費しない（週次のマップ決定性が壊れる）。煙の乱数は `Math.random` を使う
- 各タスクの最後に `npm test` を通してからコミットする

---

## File Structure

| ファイル | 責任 |
|---|---|
| `src/js/utils/Constants.js`（変更） | 煙の調整用の数値すべて。`ENEMY_ATTACKER_TYPES.artillery` に `usesSmoke` を1行 |
| `src/js/utils/concealment.js`（新規） | `falloff` / `envelope` / `puffAlphaAt` / `coverageAt` / `isConcealed`。canvas も game も知らない純粋関数だけ |
| `src/js/entities/smokeSprites.js`（新規） | 12枚のスプライトを遅延して一度だけ焼く。形の表と色の表を持つ |
| `src/js/entities/SmokeScreen.js`（新規） | 雲1つ。パフの生成・更新・描画 |
| `src/js/main.js`（変更） | `smokeScreens` 配列、更新、描画、Auto Aim の隠蔽 |
| `src/js/systems/GameStateManager.js`（変更） | ステージ切り替え時に `smokeScreens` をクリア |
| `src/js/entities/EnemyAttacker.js`（変更） | 発煙の引き金とクールダウン |
| `src/js/audio/weaponSounds.js`（変更） | `WEAPON_SOUNDS` に `smoke` を1行 |

---

### Task 1: 定数と隠蔽判定の純粋関数

煙の数式をすべてここに置く。canvas も game も要らないので、いちばん先に固めてテストで縛る。

**Files:**
- Modify: `src/js/utils/Constants.js`（末尾付近に新しい節を追加）
- Create: `src/js/utils/concealment.js`
- Test: `tests/smoke-concealment.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `falloff(d, r) -> number` 空間の減衰（0〜1）
  - `envelope(u) -> number` 時間の包絡（0〜1）。`u` は正規化年齢 `age / SMOKE_PUFF_LIFETIME`
  - `puffAlphaAt(d, r, u) -> number` パフ1枚の実効 alpha
  - `coverageAt(x, y, screens) -> number` 0〜1。`screens` は `{ puffs: [{x, y, radius, age}] }` の配列
  - `isConcealed(x, y, screens) -> boolean`

- [ ] **Step 1: 定数を足す**

`src/js/utils/Constants.js` の `// --- Artillery cover-seeking ---` の節（65行目付近）の直後に足す。

```js
// --- Artillery smoke screen ---
// 発見された artillery が張る煙幕。設計は
// docs/superpowers/specs/2026-08-11-artillery-smoke-screen-design.md
export const SMOKE_COOLDOWN = 480;            // tick: 発煙の間隔（8秒）。煙の寿命4秒の倍で「半分は見えている」
export const SMOKE_PUFF_COUNT = 14;           // 半径34px × 14枚で画面幅の1/4ほど。枚数で濃さを作るので1枚は薄い
export const SMOKE_EMIT_SPAN = 12;            // tick: 撒き終わるまで。一斉に生むと全パフの年齢が揃って湧き上がって見えない
export const SMOKE_PUFF_LIFETIME = 240;       // tick: パフ1個の寿命（4秒）。雲はパフが全部消えたら死ぬ
export const SMOKE_PUFF_RISE_RATIO = 0.05;    // 寿命のこの割合で 0→1 に立ち上がる（最初の12 tick）
export const SMOKE_PUFF_DECAY_EXPONENT = 1.3; // (1-u)^この指数 で薄れる。1.0 だと後半までしぶとく、2.0 だと隠れる時間が足りない
export const SMOKE_PUFF_RADIUS_START = 16;    // px: 出たてで機体（16x24）を覆う大きさ
export const SMOKE_PUFF_RADIUS_END = 34;      // px: 拡散後は1枚で機体の倍
export const SMOKE_PUFF_ALPHA_MAX = 0.38;     // 上限なしで素直に重ねるので1枚は薄く。重なり3枚で 0.63 = しきい値超え
export const SMOKE_FALLOFF_EXPONENT = 2.5;    // 中心を濃く保ち端で急に落とす形
export const SMOKE_CONCEAL_THRESHOLD = 0.6;   // この濃さを超えるとロック不能（重なり3枚ぶんで越える）
export const SMOKE_ROTATION_SPEED = 0.6;      // 度/frame: 4秒で約1/4回転。速いと渦に見えて煙から離れる
export const SMOKE_SPREAD_RADIUS = 8;         // px: 撒く位置のばらつき。広げると発煙直後に濃くならない（下の注を読むこと）
export const SMOKE_DRIFT_SPEED = 0.10;        // px/frame: 外向きの初速。半径の伸び（0.075/frame）と釣り合わせてある
export const SMOKE_RISE_SPEED = 0.08;         // px/frame: ゆっくり上昇
export const SMOKE_SPRITE_SIZE = 64;          // px: 焼き付けるスプライトの一辺
```

**撒くばらつきを小さく取っている理由（触る前に読むこと）。** フォールオフの指数が
2.5 と急なので、パフの中心から半径の4割を超えて離れた点にはほとんど濃度が乗らない。
撒く位置を広げると、発煙直後の「機体の居る一点」で重なりが足りず、いちばん隠れて
ほしい瞬間にしきい値を越えない。だから**噴出口の近くに固めて撒き、広がりは漂いで
稼ぐ**。物理的にもそちらが正しい（煙は機体から噴き出して広がる）。

濃度の見積り: 重なり n 枚の濃さは `1 - (1 - a)^n`。発煙直後（envelope ≈ 0.8、
中心付近の falloff ≈ 0.9）なら a ≈ 0.38 × 0.8 × 0.9 = 0.27 で、3枚重なれば 0.61 と
しきい値 0.6 を越える。14枚を半径8pxに撒けば中心付近は常に3枚以上が重なる。

- [ ] **Step 2: 失敗するテストを書く**

`tests/smoke-concealment.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falloff, envelope, puffAlphaAt, coverageAt, isConcealed } from '../src/js/utils/concealment.js';
import {
  SMOKE_PUFF_ALPHA_MAX, SMOKE_PUFF_LIFETIME, SMOKE_CONCEAL_THRESHOLD,
} from '../src/js/utils/Constants.js';

// --- 空間の減衰 ---------------------------------------------------------------

test('falloff は中心で1、半径で0', () => {
  assert.equal(falloff(0, 30), 1);
  assert.equal(falloff(30, 30), 0);
  assert.equal(falloff(45, 30), 0, '半径の外は0');
});

test('falloff は半ばまで濃さを保ち、端で急に落ちる', () => {
  // 指数2.5: 距離半分でまだ0.17、8割で0.009。中心が濃く縁が急、が数値で担保される
  assert.ok(falloff(15, 30) > 0.15, `半径の半分で薄すぎる: ${falloff(15, 30)}`);
  assert.ok(falloff(24, 30) < 0.02, `半径の8割で濃すぎる: ${falloff(24, 30)}`);
  // 単調減少
  let prev = Infinity;
  for (let d = 0; d <= 30; d += 3) {
    assert.ok(falloff(d, 30) <= prev, `d=${d} で増えている`);
    prev = falloff(d, 30);
  }
});

// --- 時間の包絡 ---------------------------------------------------------------

test('envelope は寿命の終わりで厳密に0（煙が残留しない）', () => {
  assert.equal(envelope(1), 0);
  assert.equal(envelope(1.5), 0, '寿命を過ぎても0');
});

test('envelope は生まれた瞬間ではなく立ち上がってから濃くなる', () => {
  assert.equal(envelope(0), 0, '生まれた瞬間は透明');
  assert.ok(envelope(0.05) > 0.9, `立ち上がり切っていない: ${envelope(0.05)}`);
});

test('envelope は立ち上がり後は単調に薄れる', () => {
  let prev = Infinity;
  for (let u = 0.05; u <= 1.0001; u += 0.05) {
    const e = envelope(u);
    assert.ok(e <= prev + 1e-9, `u=${u.toFixed(2)} で濃くなっている`);
    prev = e;
  }
});

test('envelope は消える直前でも十分薄い（ぷつりと切れない）', () => {
  assert.ok(envelope(0.95) < 0.1, `消える寸前が濃い: ${envelope(0.95)}`);
});

// --- パフ1枚の alpha ----------------------------------------------------------

test('puffAlphaAt は空間と時間の積で、最大でも SMOKE_PUFF_ALPHA_MAX', () => {
  const peak = puffAlphaAt(0, 30, 0.05);
  assert.ok(peak <= SMOKE_PUFF_ALPHA_MAX + 1e-9);
  assert.ok(peak > SMOKE_PUFF_ALPHA_MAX * 0.9, `頂点が出ていない: ${peak}`);
  assert.equal(puffAlphaAt(0, 30, 1), 0, '寿命の終わりは0');
});

// --- 重なりの濃度 -------------------------------------------------------------

function puff(x, y, radius = 30, age = SMOKE_PUFF_LIFETIME * 0.2) {
  return { x, y, radius, age };
}

test('coverageAt は重なった枚数だけ濃くなる', () => {
  const one = coverageAt(100, 100, [{ puffs: [puff(100, 100)] }]);
  const three = coverageAt(100, 100, [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100)] }]);
  assert.ok(three > one, '重なっても濃くならない');
  // 透過率の積: 1-(1-a)^3
  const a = puffAlphaAt(0, 30, SMOKE_PUFF_LIFETIME * 0.2 / SMOKE_PUFF_LIFETIME);
  assert.ok(Math.abs(three - (1 - Math.pow(1 - a, 3))) < 1e-9, '合成式が透過率の積になっていない');
});

test('coverageAt は煙の外では0', () => {
  assert.equal(coverageAt(500, 500, [{ puffs: [puff(100, 100)] }]), 0);
});

test('煙が無ければ何も隠れない', () => {
  assert.equal(coverageAt(100, 100, []), 0);
  assert.equal(isConcealed(100, 100, []), false);
});

test('重なり3枚で隠れ、薄れると隠れなくなる', () => {
  const dense = [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100), puff(100, 100)] }];
  assert.equal(isConcealed(100, 100, dense), true);

  // 同じ枚数でも寿命の終わり際なら隠れない（見た目が薄いなら狙える）
  const old = [{ puffs: [
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
  ] }];
  assert.equal(isConcealed(100, 100, old), false);
});

test('しきい値は 0 と 1 の間にある（無効化・常時発動を防ぐ）', () => {
  assert.ok(SMOKE_CONCEAL_THRESHOLD > 0 && SMOKE_CONCEAL_THRESHOLD < 1);
});
```

- [ ] **Step 3: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-concealment.test.js
```

期待: `Cannot find module '.../src/js/utils/concealment.js'` で失敗する。

- [ ] **Step 4: `src/js/utils/concealment.js` を書く**

```js
// ============================================
// concealment - 煙幕の濃度と隠蔽判定
// ============================================
//
// 煙の見た目と「隠れているか」の判定を、同じ数式から出すための置き場。
//
// coverageAt() の合成は 1 - Π(1 - aᵢ) で、これは canvas の source-over が
// アルファを重ねるときの式（透過率の積、Beer-Lambert）そのもの。だから
// パフを素直に重ね描きすれば、画面に出る濃さとこの関数の返り値が一致する。
// canvas のピクセルを読む必要がなく、node でそのままテストできる。
//
// 注意: falloff（形）はスプライトに焼き込み、envelope（時間）は drawImage の
// globalAlpha として渡す。どちらか片方だけ式を書き直すと「濃く見えるのに
// 隠れない」「消えたのに判定が残る」がすぐ起きる。weaponSounds の
// renderWeaponSound / renderWeaponProfile と同じく、対で直すこと。

import {
    SMOKE_FALLOFF_EXPONENT, SMOKE_PUFF_ALPHA_MAX, SMOKE_PUFF_LIFETIME,
    SMOKE_PUFF_RISE_RATIO, SMOKE_PUFF_DECAY_EXPONENT, SMOKE_CONCEAL_THRESHOLD,
} from './Constants.js';

/**
 * 空間の減衰。中心で1、半径で0。
 * 指数 2.5 は「半径の半ばまではほぼ濃度を保ち、そこから外で一気に落ちる」形。
 * 境界がはっきりするので、自機側が「どこから先が見えないか」を読める。
 * @param {number} d 中心からの距離
 * @param {number} r パフの現在半径
 * @returns {number} 0〜1
 */
export function falloff(d, r) {
    if (r <= 0) return 0;
    const t = 1 - d / r;
    if (t <= 0) return 0;
    return Math.pow(t, SMOKE_FALLOFF_EXPONENT);
}

/**
 * 時間の包絡。u = 0 と u = 1 で厳密に 0 になる。
 *
 * 立ち上がり（最初の5%）を入れているのは、生まれた瞬間に濃いパフが出現するのを
 * 避けるため。撒きの分散と合わせて「湧き上がる」動きになる。
 * 減衰の指数 1.3 は 1.0（直線）だと後半までしぶとく見え、2.0 だと発煙直後に
 * 急に薄くなって隠れる時間が足りなかったので、その間を取った値。
 * @param {number} u 正規化年齢（age / SMOKE_PUFF_LIFETIME）
 * @returns {number} 0〜1
 */
export function envelope(u) {
    if (u <= 0 || u >= 1) return 0;
    const rise = Math.min(1, u / SMOKE_PUFF_RISE_RATIO);
    return rise * Math.pow(1 - u, SMOKE_PUFF_DECAY_EXPONENT);
}

/**
 * パフ1枚が、その点に置く不透明度。
 * @param {number} d 中心からの距離
 * @param {number} r 現在半径
 * @param {number} u 正規化年齢
 */
export function puffAlphaAt(d, r, u) {
    return SMOKE_PUFF_ALPHA_MAX * envelope(u) * falloff(d, r);
}

/**
 * その点の煙の濃さ。
 * @param {number} x ワールド座標
 * @param {number} y
 * @param {Array<{puffs: Array<{x:number,y:number,radius:number,age:number}>}>} screens
 * @returns {number} 0〜1
 */
export function coverageAt(x, y, screens) {
    let transmission = 1; // 透過率。遮るほど 0 に近づく
    for (const screen of screens) {
        for (const p of screen.puffs) {
            const d = Math.hypot(x - p.x, y - p.y);
            const a = puffAlphaAt(d, p.radius, p.age / SMOKE_PUFF_LIFETIME);
            if (a > 0) transmission *= (1 - a);
        }
    }
    return 1 - transmission;
}

/** その点が煙で隠れているか。 */
export function isConcealed(x, y, screens) {
    return coverageAt(x, y, screens) > SMOKE_CONCEAL_THRESHOLD;
}
```

- [ ] **Step 5: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-concealment.test.js
```

期待: 全 PASS。

- [ ] **Step 6: 全テストを走らせる**

```bash
npm test
```

期待: 既存テストも含めて全 PASS。

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/Constants.js src/js/utils/concealment.js tests/smoke-concealment.test.js
git commit -m "feat: 煙幕の濃度と隠蔽判定の純粋関数を追加"
```

---

### Task 2: スプライトの焼き付け

形4種 × 色3段 = 12枚を起動時に一度だけ焼く。形の複雑さの代金を一度しか払わないための仕掛けで、実行時は `drawImage` 1回になる。

**Files:**
- Create: `src/js/entities/smokeSprites.js`
- Test: `tests/smoke-sprite.test.js`

**Interfaces:**
- Consumes: `falloff()`（Task 1）、`SMOKE_SPRITE_SIZE`
- Produces:
  - `getSmokeSprites() -> HTMLCanvasElement[][]` `[shapeIndex][tintIndex]`。初回呼び出しで焼き、以降は同じ配列を返す
  - `SMOKE_SHAPES` 形の表（テストが枚数を数えるのに使う）
  - `SMOKE_TINTS` 色の表
  - `gradientStops(coreColor, midColor, edgeColor) -> Array<[number, string]>` 焼き付けに使う停止点。`falloff` から作る
  - `_resetSmokeSprites()` テスト専用。焼いたものを捨てる

- [ ] **Step 1: 失敗するテストを書く**

`tests/smoke-sprite.test.js` を新規作成する。`document` のスタブは `tests/map-render-cache.test.js` と同じ手口。

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { falloff } from '../src/js/utils/concealment.js';
import { SMOKE_SPRITE_SIZE } from '../src/js/utils/Constants.js';

// 焼いたスプライトの中身は見られないので、canvas に来た呼び出しを記録する。
const created = [];

before(() => {
  globalThis.document = {
    createElement: () => {
      const calls = [];
      const canvas = {
        width: 0,
        height: 0,
        calls,
        getContext: () => new Proxy({}, {
          get: (_t, prop) => {
            if (prop === 'createRadialGradient') {
              return (...args) => {
                const grad = { type: 'radialGradient', args, stops: [] };
                grad.addColorStop = (offset, color) => grad.stops.push([offset, color]);
                calls.push({ name: 'createRadialGradient', grad });
                return grad;
              };
            }
            return (...args) => calls.push({ name: String(prop), args });
          },
        }),
      };
      created.push(canvas);
      return canvas;
    },
  };
});

test('形4種 × 色3段 = 12枚が焼かれる', async () => {
  const { getSmokeSprites, _resetSmokeSprites, SMOKE_SHAPES, SMOKE_TINTS } =
    await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;

  const sprites = getSmokeSprites();
  assert.equal(SMOKE_SHAPES.length, 4);
  assert.equal(SMOKE_TINTS.length, 3);
  assert.equal(sprites.length, 4);
  for (const row of sprites) assert.equal(row.length, 3);
  assert.equal(created.length, 12, `焼いた枚数が違う: ${created.length}`);
});

test('二度目の呼び出しでは焼き直さない（代金は起動時に一度だけ）', async () => {
  const { getSmokeSprites, _resetSmokeSprites } = await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;

  const first = getSmokeSprites();
  const countAfterFirst = created.length;
  const second = getSmokeSprites();

  assert.equal(created.length, countAfterFirst, '2回目で焼き直している');
  assert.strictEqual(first, second, '同じ配列を返していない');
});

test('スプライトは SMOKE_SPRITE_SIZE の正方形', async () => {
  const { getSmokeSprites, _resetSmokeSprites } = await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;
  getSmokeSprites();

  for (const c of created) {
    assert.equal(c.width, SMOKE_SPRITE_SIZE);
    assert.equal(c.height, SMOKE_SPRITE_SIZE);
  }
});

test('グラデーションの停止点が falloff と一致する（見た目と判定の対を守る）', async () => {
  const { gradientStops } = await import('../src/js/entities/smokeSprites.js');
  const stops = gradientStops('#FFFFFF', '#B4A9C4', '#7A7089');

  assert.ok(stops.length >= 4, '段が少なすぎて形が出ない');
  assert.equal(stops[0][0], 0, '中心から始まっていない');
  assert.equal(stops[stops.length - 1][0], 1, '縁で終わっていない');

  for (const [offset, color] of stops) {
    // rgba(r, g, b, a) の a が falloff(offset, 1) と一致すること
    const m = /rgba\([^)]*,\s*([0-9.]+)\)$/.exec(color);
    assert.ok(m, `rgba になっていない: ${color}`);
    const alpha = Number(m[1]);
    assert.ok(Math.abs(alpha - falloff(offset, 1)) < 0.005,
      `offset ${offset}: alpha ${alpha} が falloff ${falloff(offset, 1)} と違う`);
  }
});

test('中心は白っぽく、縁は紫がかった灰（色も距離で振る）', async () => {
  const { gradientStops } = await import('../src/js/entities/smokeSprites.js');
  const stops = gradientStops('#FFFFFF', '#B4A9C4', '#7A7089');
  const rgb = (s) => /rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(s).slice(1).map(Number);

  const core = rgb(stops[0][1]);
  const edge = rgb(stops[stops.length - 1][1]);
  assert.ok(core[0] > edge[0], '中心が縁より暗い');
  // 紫がかる = 赤と青が緑より高い
  assert.ok(edge[2] > edge[1], `縁が紫寄りでない: ${edge}`);
});

test('色段は白 → 淡い紫 → 紫灰 の順に暗くなる（年齢で冷えていく）', async () => {
  const { SMOKE_TINTS } = await import('../src/js/entities/smokeSprites.js');
  const lum = (hex) => {
    const s = hex.replace('#', '');
    return parseInt(s.slice(0, 2), 16) + parseInt(s.slice(2, 4), 16) + parseInt(s.slice(4, 6), 16);
  };
  for (let i = 1; i < SMOKE_TINTS.length; i++) {
    assert.ok(lum(SMOKE_TINTS[i].core) < lum(SMOKE_TINTS[i - 1].core),
      `色段 ${i} が前より明るい`);
  }
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-sprite.test.js
```

期待: `Cannot find module '.../src/js/entities/smokeSprites.js'` で失敗する。

- [ ] **Step 3: `src/js/entities/smokeSprites.js` を書く**

```js
// ============================================
// smokeSprites - 煙のパフを起動時に焼いておく
// ============================================
//
// 形の複雑さの代金を、起動時に一度だけ払うための仕掛け。焼いてしまえば
// 実行時は drawImage 1回で済むので、瘤をいくつ重ねてもパフ1個のコストは
// 変わらない。毎フレームの createRadialGradient も消える
// （Map の tileCacheCanvas と同じ手口）。
//
// 形を4種にしているのは、1種を回転させただけだと重なったときに反復が
// 目に付くため。色を3段にしているのは、出たては白っぽく、古くなるにつれ
// 紫がかった灰へ冷えていくのを、実行時の色計算なしで出すため。
//
// なめらかなグラデーションを選んだので回転は原理的に見えない。瘤を
// 非対称に置くことで回っていると分かるようにしてある。

import { SMOKE_SPRITE_SIZE } from '../utils/Constants.js';
import { falloff } from '../utils/concealment.js';
import { lerpColor } from '../utils/color.js';

/**
 * 瘤の並び。座標と半径はスプライトの半径に対する比。
 * 中心に大きいのを1つ置き、そこから外れた位置に小さいのを2つ足す。
 * 完全に対称にすると回転が見えなくなるので、必ずどちらかに寄せている。
 */
export const SMOKE_SHAPES = [
    [{ dx: 0.00, dy: 0.00, r: 1.00 }, { dx: 0.26, dy: -0.20, r: 0.60 }, { dx: -0.22, dy: 0.22, r: 0.52 }],
    [{ dx: -0.06, dy: 0.04, r: 0.94 }, { dx: 0.30, dy: 0.16, r: 0.56 }, { dx: -0.18, dy: -0.26, r: 0.62 }],
    [{ dx: 0.04, dy: -0.06, r: 0.98 }, { dx: -0.30, dy: 0.08, r: 0.58 }, { dx: 0.20, dy: 0.28, r: 0.50 }],
    [{ dx: 0.00, dy: 0.08, r: 0.90 }, { dx: 0.16, dy: -0.30, r: 0.64 }, { dx: -0.28, dy: -0.04, r: 0.54 }],
];

/**
 * 色段。パフの年齢が進むにつれて 0 → 2 へ移る。
 * core はほぼ白（わずかに青紫寄り）、edge は紫がかった灰。
 */
export const SMOKE_TINTS = [
    { core: '#F7F5FA', mid: '#D6CFE2', edge: '#A99FBB' }, // 出たて
    { core: '#EFEDF5', mid: '#B4A9C4', edge: '#8B819C' },
    { core: '#D8D3E2', mid: '#9C93AE', edge: '#7A7089' }, // 冷えた
];

/** 停止点の数。少ないと段差が見え、多いと焼き付けが遅くなる。6段で段差は見えない */
const STOP_COUNT = 6;

/**
 * グラデーションの停止点を falloff から作る。
 *
 * **ここが隠蔽判定との接点。** alpha は falloff(offset, 1) そのもので、
 * concealment.js の判定も同じ関数を読む。片方だけ変えると
 * 「濃く見えるのに隠れない」が起きるので、対で直すこと。
 * @returns {Array<[number, string]>} [offset, rgba文字列]
 */
export function gradientStops(coreColor, midColor, edgeColor) {
    const stops = [];
    for (let i = 0; i < STOP_COUNT; i++) {
        const offset = i / (STOP_COUNT - 1);
        const alpha = falloff(offset, 1);
        // 色は中心→中間→縁の2区間で補間する
        const color = offset < 0.5
            ? lerpColor(coreColor, midColor, offset * 2)
            : lerpColor(midColor, edgeColor, (offset - 0.5) * 2);
        const s = color.replace('#', '');
        const r = parseInt(s.slice(0, 2), 16);
        const g = parseInt(s.slice(2, 4), 16);
        const b = parseInt(s.slice(4, 6), 16);
        stops.push([offset, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`]);
    }
    return stops;
}

let _sprites = null;

/** 1枚焼く。 */
function _bake(shape, tint) {
    const canvas = document.createElement('canvas');
    canvas.width = SMOKE_SPRITE_SIZE;
    canvas.height = SMOKE_SPRITE_SIZE;
    const ctx = canvas.getContext('2d');

    const half = SMOKE_SPRITE_SIZE / 2;
    const stops = gradientStops(tint.core, tint.mid, tint.edge);

    for (const lobe of shape) {
        const cx = half + lobe.dx * half;
        const cy = half + lobe.dy * half;
        const r = lobe.r * half;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        for (const [offset, color] of stops) grad.addColorStop(offset, color);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SMOKE_SPRITE_SIZE, SMOKE_SPRITE_SIZE);
    }
    return canvas;
}

/**
 * 12枚のスプライト。初回だけ焼き、以降は同じ配列を返す。
 * モジュール読み込み時ではなく最初の描画で焼くのは、DOM の無い
 * テスト環境で import しただけでは落ちないようにするため。
 * @returns {Array<Array<HTMLCanvasElement>>} [形][色段]
 */
export function getSmokeSprites() {
    if (_sprites) return _sprites;
    _sprites = SMOKE_SHAPES.map((shape) => SMOKE_TINTS.map((tint) => _bake(shape, tint)));
    return _sprites;
}

/** テスト専用。焼いたものを捨てて、次の呼び出しで焼き直させる。 */
export function _resetSmokeSprites() {
    _sprites = null;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-sprite.test.js
```

期待: 全 PASS。落ちる場合、`gradientStops` の alpha が `toFixed(3)` で丸まっているので、テストの許容差 0.005 に収まるか確認する。

- [ ] **Step 5: 全テストを走らせる**

```bash
npm test
```

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/smokeSprites.js tests/smoke-sprite.test.js
git commit -m "feat: 煙のパフのスプライトを起動時に焼く（形4種 x 色3段）"
```

---

### Task 3: SmokeScreen エンティティ

雲1つ。パフを12 tick に分散して撒き、各パフは自分の年齢から半径・alpha・色段を出す。

**Files:**
- Create: `src/js/entities/SmokeScreen.js`
- Test: `tests/smoke-screen.test.js`

**Interfaces:**
- Consumes: `getSmokeSprites()`（Task 2）、`envelope()` / `puffAlphaAt()`（Task 1）、Task 1 の定数
- Produces:
  - `new SmokeScreen(x, y)` 発煙位置（機体の中心）
  - `screen.puffs` `Array<{x, y, radius, age, rotation, spin, shape, vx, vy}>` — `coverageAt` が読む
  - `screen.alive` boolean
  - `screen.update()` / `screen.draw(ctx)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/smoke-screen.test.js` を新規作成する。

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { isConcealed } from '../src/js/utils/concealment.js';
import {
  SMOKE_PUFF_COUNT, SMOKE_EMIT_SPAN, SMOKE_PUFF_LIFETIME,
  SMOKE_PUFF_RADIUS_START, SMOKE_PUFF_RADIUS_END,
} from '../src/js/utils/Constants.js';

before(() => {
  // スプライトを焼くのに canvas が要る。中身は使わないので呼び出しを飲むだけ
  const noopCtx = new Proxy({}, {
    get: () => () => ({ addColorStop: () => {} }),
  });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

async function makeScreen(x = 100, y = 100) {
  const { SmokeScreen } = await import('../src/js/entities/SmokeScreen.js');
  return new SmokeScreen(x, y);
}

/** n tick 進める */
function run(screen, n) {
  for (let i = 0; i < n; i++) screen.update();
}

// --- 撒き方 -------------------------------------------------------------------

test('発煙直後は全パフが出そろっていない（一斉に生むと湧き上がって見えない）', async () => {
  const s = await makeScreen();
  s.update();
  assert.ok(s.puffs.length < SMOKE_PUFF_COUNT,
    `1 tick で全部生まれている: ${s.puffs.length}`);
  assert.ok(s.puffs.length >= 1, '1つも生まれていない');
});

test('SMOKE_EMIT_SPAN のあいだに全パフが撒かれる', async () => {
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  assert.equal(s.puffs.length, SMOKE_PUFF_COUNT);
});

test('パフの年齢がばらける（同じ時計で動いていない）', async () => {
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  const ages = new Set(s.puffs.map((p) => p.age));
  assert.ok(ages.size > 1, 'すべてのパフの年齢が同じ');
});

test('撒く位置がばらける', async () => {
  const s = await makeScreen(100, 100);
  run(s, SMOKE_EMIT_SPAN + 1);
  const xs = new Set(s.puffs.map((p) => Math.round(p.x)));
  assert.ok(xs.size > 1, '全部同じ場所に湧いている');
});

// --- 時間変化 -----------------------------------------------------------------

test('パフは時間とともに拡大する', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const early = p.radius;
  run(s, 100);
  assert.ok(p.radius > early, '拡散していない');
  assert.ok(p.radius <= SMOKE_PUFF_RADIUS_END + 1e-9, '終端半径を超えた');
  assert.ok(early >= SMOKE_PUFF_RADIUS_START - 1e-9, '開始半径より小さい');
});

test('パフは漂う（位置が動く）', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const x0 = p.x, y0 = p.y;
  run(s, 60);
  assert.ok(p.x !== x0 || p.y !== y0, '漂っていない');
});

test('パフは回転する', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const r0 = p.rotation;
  run(s, 30);
  assert.notEqual(p.rotation, r0, '回っていない');
});

// --- 寿命 ---------------------------------------------------------------------

test('パフは寿命で消え、雲はパフが全部消えたら死ぬ', async () => {
  const s = await makeScreen();
  run(s, SMOKE_PUFF_LIFETIME - 10);
  assert.ok(s.alive, 'まだパフが残っているのに死んでいる');
  run(s, SMOKE_EMIT_SPAN + 20);
  assert.equal(s.puffs.length, 0, 'パフが残っている');
  assert.equal(s.alive, false, '雲が死んでいない');
});

test('雲は必ず死ぬ（撒き終わる前に殺されない・永遠に残らない）', async () => {
  const s = await makeScreen();
  // 撒いている途中に死なないこと（emitted < COUNT でパフが0の瞬間があっても）
  run(s, 2);
  assert.ok(s.alive, '撒いている途中で死んだ');
  run(s, SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME + 10);
  assert.equal(s.alive, false, '寿命を過ぎても生きている');
});

test('発煙してしばらくは隠れ、やがて必ず隠れなくなる', async () => {
  // この機能の本体。「発煙直後にいちばん濃い」「必ず終わる」の両方を測る。
  // 個々の tick を決め打ちすると乱数で揺れるので、隠れている長さで縛る。
  const s = await makeScreen(100, 100);
  let concealedTicks = 0;
  let firstConcealed = -1;
  for (let t = 0; t < SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME + 20; t++) {
    s.update();
    if (isConcealed(100, 100, [s])) {
      concealedTicks++;
      if (firstConcealed < 0) firstConcealed = t;
    }
  }
  assert.ok(firstConcealed >= 0, '一度も隠れなかった（発煙の意味がない）');
  assert.ok(firstConcealed < SMOKE_EMIT_SPAN + 20,
    `隠れるまでが遅い: ${firstConcealed} tick（逃げる前に撃たれる）`);
  assert.ok(concealedTicks > 60,
    `隠れている時間が短い: ${concealedTicks} tick（1秒未満では逃げられない）`);
  assert.ok(concealedTicks < SMOKE_PUFF_LIFETIME,
    `隠れている時間が長い: ${concealedTicks} tick（薄れても隠れたままになっている）`);
  assert.equal(isConcealed(100, 100, [s]), false, '最後まで隠れたまま');
});

// --- 描画 ---------------------------------------------------------------------

test('パフ1枚につき drawImage は多くても2回（焼き付けの利得）', async () => {
  // 色段をまたぐ間だけ2枚をクロスフェードする。形をいくら複雑にしても
  // 実行時のコストがこの回数から増えない、というのが焼き付けの利点
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  const ctx = makeFakeCtx();
  s.draw(ctx);
  const draws = ctx.calls.filter((c) => c.name === 'drawImage').length;
  assert.ok(draws >= s.puffs.length, `描かれていないパフがある: ${draws}`);
  assert.ok(draws <= s.puffs.length * 2, `1パフに3回以上描いている: ${draws}`);
  // 実行時にグラデーションを作らない（焼いてある）
  assert.equal(ctx.calls.filter((c) => c.name === 'createRadialGradient').length, 0);
});

test('描画は回転と alpha を使い、後始末をする', async () => {
  const s = await makeScreen();
  run(s, 30);
  const ctx = makeFakeCtx();
  s.draw(ctx);

  assert.ok(ctx.calls.some((c) => c.name === 'rotate'), '回転していない');
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => a > 0 && a < 1), `半透明で描いていない: ${alphas}`);
  assert.equal(
    ctx.calls.filter((c) => c.name === 'save').length,
    ctx.calls.filter((c) => c.name === 'restore').length,
    'save と restore の数が合わない',
  );
});

test('消えかけのパフは薄く描かれる', async () => {
  const early = await makeScreen();
  run(early, 30);
  const late = await makeScreen();
  run(late, SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME - 20);

  const alphaMax = (screen) => {
    const ctx = makeFakeCtx();
    screen.draw(ctx);
    return Math.max(...ctx.calls
      .filter((c) => c.name === 'set:globalAlpha')
      .map((c) => c.args[0]));
  };
  assert.ok(alphaMax(late) < alphaMax(early), '古い煙が薄くなっていない');
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-screen.test.js
```

期待: `Cannot find module '.../src/js/entities/SmokeScreen.js'` で失敗する。

- [ ] **Step 3: `src/js/entities/SmokeScreen.js` を書く**

```js
// ============================================
// SmokeScreen - artillery が張る煙幕
// ============================================
//
// 雲1つ。パフは自分の経過時間ひとつから半径・alpha・色段が出るので、
// 拡散・希薄化・冷却の位相がずれない。
//
// 雲に独自の寿命を持たせていないのは、撒きを SMOKE_EMIT_SPAN ぶんずらす
// せいで、雲とパフで別の時計を持つと必ずどちらかが先に切れるため
// （「まだ濃いのに消える」か「消えたのに判定が残る」のどちらかが起きる）。
// パフだけが寿命を持ち、雲はパフが全滅したら死ぬ。
//
// 隠蔽判定は utils/concealment.js が puffs をそのまま読む。描画の alpha も
// 同じ puffAlphaAt から出るので、見えなくなる時刻と隠れなくなる時刻が一致する。

import {
    SMOKE_PUFF_COUNT, SMOKE_EMIT_SPAN, SMOKE_PUFF_LIFETIME,
    SMOKE_PUFF_RADIUS_START, SMOKE_PUFF_RADIUS_END, SMOKE_PUFF_ALPHA_MAX,
    SMOKE_ROTATION_SPEED, SMOKE_SPREAD_RADIUS, SMOKE_DRIFT_SPEED,
    SMOKE_RISE_SPEED, SMOKE_SPRITE_SIZE,
} from '../utils/Constants.js';
import { envelope } from '../utils/concealment.js';
import { getSmokeSprites, SMOKE_SHAPES, SMOKE_TINTS } from './smokeSprites.js';

export class SmokeScreen {
    /**
     * @param {number} x 発煙位置（機体の中心）
     * @param {number} y
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.puffs = [];
        this.alive = true;
        this.emitted = 0;
        this.timer = 0;
    }

    update() {
        this.timer++;
        this._emitDue();

        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age++;
            if (p.age >= SMOKE_PUFF_LIFETIME) {
                this.puffs.splice(i, 1);
                continue;
            }
            const u = p.age / SMOKE_PUFF_LIFETIME;
            p.radius = SMOKE_PUFF_RADIUS_START + (SMOKE_PUFF_RADIUS_END - SMOKE_PUFF_RADIUS_START) * u;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.spin;
        }

        // 撒き終わっていて、かつパフが尽きたら雲も死ぬ
        if (this.emitted >= SMOKE_PUFF_COUNT && this.puffs.length === 0) {
            this.alive = false;
        }
    }

    /** この tick までに生まれているべき数まで撒く。 */
    _emitDue() {
        const due = Math.min(
            SMOKE_PUFF_COUNT,
            Math.ceil((this.timer / SMOKE_EMIT_SPAN) * SMOKE_PUFF_COUNT),
        );
        while (this.emitted < due) {
            this.puffs.push(this._makePuff());
            this.emitted++;
        }
    }

    _makePuff() {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * SMOKE_SPREAD_RADIUS;
        return {
            x: this.x + Math.cos(angle) * dist,
            y: this.y + Math.sin(angle) * dist,
            radius: SMOKE_PUFF_RADIUS_START,
            age: 0,
            // 外へ広がりながら、ゆっくり浮き上がる
            vx: Math.cos(angle) * SMOKE_DRIFT_SPEED * (0.5 + Math.random()),
            vy: Math.sin(angle) * SMOKE_DRIFT_SPEED * (0.5 + Math.random()) - SMOKE_RISE_SPEED,
            rotation: Math.random() * Math.PI * 2,
            // 回る向きを揃えると渦に見えてしまうので符号をばらす
            spin: (Math.random() < 0.5 ? -1 : 1) * SMOKE_ROTATION_SPEED * Math.PI / 180,
            shape: Math.floor(Math.random() * SMOKE_SHAPES.length),
        };
    }

    /**
     * 焼いたスプライトを回転・拡大して重ねる。
     * 色段は年齢で選び、隣り合う段をまたぐときはクロスフェードする
     * （段が切り替わる瞬間に色が飛ぶのを防ぐ）。
     */
    draw(ctx) {
        const sprites = getSmokeSprites();
        const lastTint = SMOKE_TINTS.length - 1;

        for (const p of this.puffs) {
            const u = p.age / SMOKE_PUFF_LIFETIME;
            const alpha = SMOKE_PUFF_ALPHA_MAX * envelope(u);
            if (alpha <= 0) continue;

            const scale = (p.radius * 2) / SMOKE_SPRITE_SIZE;
            // 年齢を色段の連続値に写す。整数部が段、小数部がクロスフェードの比
            const tintPos = u * lastTint;
            const lo = Math.min(lastTint, Math.floor(tintPos));
            const hi = Math.min(lastTint, lo + 1);
            const mix = tintPos - lo;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(scale, scale);
            const half = SMOKE_SPRITE_SIZE / 2;

            ctx.globalAlpha = alpha * (1 - mix);
            ctx.drawImage(sprites[p.shape][lo], -half, -half);
            if (hi !== lo && mix > 0) {
                ctx.globalAlpha = alpha * mix;
                ctx.drawImage(sprites[p.shape][hi], -half, -half);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-screen.test.js
```

期待: 全 PASS。「パフ1枚につき drawImage 1回」が落ちる場合、クロスフェード中のパフが2回描いている。テストは撒き終わり直後（`u` が小さくクロスフェードが起きない時点）で測っているので、`mix > 0` の条件が効いているか確認する。

- [ ] **Step 5: 全テストを走らせる**

```bash
npm test
```

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/SmokeScreen.js tests/smoke-screen.test.js
git commit -m "feat: SmokeScreen エンティティ（撒き・拡散・回転・冷却）"
```

---

### Task 4: ゲームループへの配線

雲を更新・描画し、ステージが切り替わったら捨てる。

**Files:**
- Modify: `src/js/main.js`（`particles: []` の隣、`_updateParticles()` の隣、`_drawWorld()` の末尾）
- Modify: `src/js/systems/GameStateManager.js:37-47`（`resetLevel` の配列クリア）
- Test: `tests/smoke-wiring.test.js`

**Interfaces:**
- Consumes: `SmokeScreen`（Task 3）
- Produces:
  - `game.smokeScreens` `SmokeScreen[]`
  - `Game.spawnSmokeScreen(x, y)` — Task 7 の artillery が呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`tests/smoke-wiring.test.js` を新規作成する。`main.js` は import すると副作用が大きいので、`GameStateManager` 側と `Game` オブジェクトの持ち物だけを確かめる。

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('resetLevel は smokeScreens を空にする（前ステージの煙が残らない）', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
  const { SmokeScreen } = await import('../src/js/entities/SmokeScreen.js');

  // resetLevel はマップ再生成まで行くので、そこまで進まないよう
  // 配列クリアの直後で止める番兵を仕込む
  const game = {
    smokeScreens: [new SmokeScreen(0, 0)],
    deathHold: { clear() {} },
    get rng() { throw new Error('STOP'); },
    set rng(_v) { throw new Error('STOP'); },
  };
  const mgr = new GameStateManager(game);
  assert.throws(() => mgr.resetLevel(false), /STOP/);
  assert.deepEqual(game.smokeScreens, [], 'smokeScreens がクリアされていない');
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-wiring.test.js
```

期待: `smokeScreens がクリアされていない` で失敗する。

- [ ] **Step 3: `GameStateManager.resetLevel` に1行足す**

`src/js/systems/GameStateManager.js` の `game.particles = [];` の直後に足す。

```js
        game.particles = [];
        game.smokeScreens = [];   // 前ステージの煙が残ると開幕から視界が塞がる
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-wiring.test.js
```

期待: PASS。

- [ ] **Step 5: `main.js` に配列・更新・描画・生成口を足す**

**注意: `main.js` は `git add -p` で自分のハンクだけを stage する（`debugStartMission` を巻き込まない）。**

1. import を足す（`import { ... } from './entities/Particle.js';` の並びの近く）:

```js
import { SmokeScreen } from './entities/SmokeScreen.js';
```

2. `particles: [],`（105行目付近）の直後:

```js
    particles: [],
    smokeScreens: [],          // artillery が張った煙幕。視界と Auto Aim を遮る
```

3. `_updateParticles()`（767行目付近）の直後にメソッドを足す:

```js
    _updateSmokeScreens() {
        for (let i = this.smokeScreens.length - 1; i >= 0; i--) {
            this.smokeScreens[i].update();
            if (!this.smokeScreens[i].alive) this.smokeScreens.splice(i, 1);
        }
    },
```

4. `_simulationTick()`（593行目付近）で `_updateParticles()` を呼んでいる行の直後に `this._updateSmokeScreens();` を足す。

5. `_drawWorld()` の末尾、`if (this.flag) this.flag.draw(ctx);` の直後（`ctx.restore()` の前）:

```js
        // 煙は敵とHPバーの上に重ねる（隠すのが仕事なので最後に描く）
        for (const screen of this.smokeScreens) screen.draw(ctx);
```

6. `spawnSparks(x, y)`（1387行目付近）の隣に生成口を足す:

```js
    /**
     * 煙幕を張る。artillery が自機に発見されたときに呼ぶ。
     * 当たり判定は持たず、視界と Auto Aim だけを遮る。
     */
    spawnSmokeScreen(x, y) {
        this.smokeScreens.push(new SmokeScreen(x, y));
        audioManager.playWeapon('smoke', x, y);
    },
```

（`playWeapon('smoke', ...)` は Task 6 で表に `smoke` を足すまで無音で返る。`playWeapon` は未知の kind を `if (!profile) return;` で弾くので、この順序でも落ちない。）

- [ ] **Step 6: 全テストを走らせる**

```bash
npm test
```

期待: 全 PASS。

- [ ] **Step 7: コミット**

`main.js` は自分のハンクだけを stage する。

```bash
git add src/js/systems/GameStateManager.js tests/smoke-wiring.test.js
git add -p src/js/main.js
git commit -m "feat: 煙幕をゲームループに配線（更新・描画・ステージ切り替えで破棄）"
```

`git add -p` では、上の Step 5 で足した5箇所だけを `y` で選び、`debugStartMission` を含むハンクは `n` で飛ばす。stage した内容を `git diff --cached src/js/main.js` で確認してからコミットすること。

---

### Task 5: Auto Aim が煙の中の敵をロックしない

**Files:**
- Modify: `src/js/main.js:821-875`（`_updateAutoAim`）
- Test: `tests/smoke-autoaim.test.js`

**Interfaces:**
- Consumes: `isConcealed()`（Task 1）、`game.smokeScreens`（Task 4）
- Produces: なし（既存の `autoAimLockedEnemy` / `autoAimTarget` の挙動が変わるだけ）

`_updateAutoAim` は `Game` オブジェクトのメソッドで、`main.js` を import すると DOM を触る。テストはメソッドを取り出して差し替えた `this` で呼ぶのではなく、**判定の条件そのものを純粋関数に切り出して**縛る。切り出す先は `utils/concealment.js`（既にあるので新規ファイルは要らない）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/smoke-autoaim.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnemyConcealed } from '../src/js/utils/concealment.js';
import { SMOKE_PUFF_LIFETIME } from '../src/js/utils/Constants.js';

function puff(x, y, radius = 30, age = SMOKE_PUFF_LIFETIME * 0.2) {
  return { x, y, radius, age };
}

function enemy(x, y) {
  return { x, y, width: 16, height: 24, alive: true };
}

test('敵の中心が煙に入っていれば隠れている', () => {
  const e = enemy(100, 100);
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const screens = [{ puffs: [puff(cx, cy), puff(cx, cy), puff(cx, cy), puff(cx, cy)] }];
  assert.equal(isEnemyConcealed(e, screens), true);
});

test('煙の外の敵は隠れていない', () => {
  const e = enemy(500, 500);
  const screens = [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100), puff(100, 100)] }];
  assert.equal(isEnemyConcealed(e, screens), false);
});

test('煙が無ければ誰も隠れない', () => {
  assert.equal(isEnemyConcealed(enemy(100, 100), []), false);
});

test('幅の無い相手でも落ちない（基地など width を持たない敵がいる）', () => {
  assert.equal(isEnemyConcealed({ x: 100, y: 100, alive: true }, []), false);
});

test('煙の中なら artillery 本人でなくても隠れる（護衛効果）', () => {
  const guarded = enemy(104, 104);   // 発煙した機体の隣にいる別の敵
  const cx = guarded.x + guarded.width / 2;
  const cy = guarded.y + guarded.height / 2;
  const screens = [{ puffs: [puff(cx, cy), puff(cx, cy), puff(cx, cy), puff(cx, cy)] }];
  assert.equal(isEnemyConcealed(guarded, screens), true);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-autoaim.test.js
```

期待: `isEnemyConcealed is not a function` で失敗する。

- [ ] **Step 3: `concealment.js` に敵用の入口を足す**

`src/js/utils/concealment.js` の末尾に足す。

```js
/**
 * 敵が煙で隠れているか。判定点は中心。
 * 中心だけを見るのは、端が少し出ているだけでロックできてしまうと
 * 「隠れている」という見た目と食い違うため。
 * @param {{x:number,y:number,width?:number,height?:number}} enemy
 * @param {Array} screens
 */
export function isEnemyConcealed(enemy, screens) {
    const cx = enemy.x + (enemy.width || 0) / 2;
    const cy = enemy.y + (enemy.height || 0) / 2;
    return isConcealed(cx, cy, screens);
}
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-autoaim.test.js
```

期待: 全 PASS。

- [ ] **Step 5: `_updateAutoAim` から呼ぶ**

`src/js/main.js` の import に足す:

```js
import { isEnemyConcealed } from './utils/concealment.js';
```

`_updateAutoAim()`（821行目付近）を2箇所変える。

1. ロック継続の判定（850行目付近）:

```js
        // ロック中の敵が生存していればそのまま追跡
        if (this.autoAimLockedEnemy && this.autoAimLockedEnemy.alive) {
            // 煙に隠れたらロックを落とす。見えていないのに追尾し続けると、
            // 煙を張られた意味が無くなる
            if (isEnemyConcealed(this.autoAimLockedEnemy, this.smokeScreens)) {
                this.autoAimLockedEnemy = null;
                this.aimLead.reset();
                return;
            }
            this._lockOnEnemy(this.autoAimLockedEnemy);
            return;
        }
```

2. 新規ロックの候補走査（859行目付近）:

```js
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            if (isEnemyConcealed(enemy, this.smokeScreens)) continue;  // 煙の中は見えない
            const ex = enemy.x + (enemy.width || 0) / 2;
```

- [ ] **Step 6: 全テストを走らせる**

```bash
npm test
```

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/concealment.js tests/smoke-autoaim.test.js
git add -p src/js/main.js
git commit -m "feat: 煙に隠れた敵は Auto Aim でロックできない"
```

---

### Task 6: 発煙音

**Files:**
- Modify: `src/js/audio/weaponSounds.js`（`WEAPON_SOUNDS` に1行）
- Test: `tests/weapon-sounds.test.js`（既存に追加）

**Interfaces:**
- Consumes: なし
- Produces: `WEAPON_SOUNDS.smoke`。`audioManager.playWeapon('smoke', x, y)` で鳴る

**注意:** `smoke` は既存の部品（`hiss` と `puffs`）だけで組むので、`tests/helpers/weapon-render.js` に手を入れる必要は無い。設計文書には「`renderWeaponProfile()` 側も同時に足す」とあるが、新しい部品を足さない限り不要（新しい部品を足すなら対で直すこと）。

既存の `tests/weapon-sounds.test.js` は `WEAPON_SOUNDS` を総当たりして音量（基準比 -14dB 〜 +3dB）と振幅（0.02 〜 0.6）を縛っている。**`smoke` を足した時点でこの2つのテストが自動的に効く**ので、gain はそこを通る値にする。

- [ ] **Step 1: 失敗するテストを書く**

`tests/weapon-sounds.test.js` の「--- 表の作り ---」節の末尾（`test('自機と敵で音が違う…')` の後あたり）に足す。

```js
test('煙幕の発煙音がある', () => {
  assert.ok(WEAPON_SOUNDS.smoke, 'smoke が無い');
});

test('発煙音は「プシュー」と尾を引く（一瞬で切れない）', () => {
  const p = WEAPON_SOUNDS.smoke;
  assert.ok(p.hiss, 'ノイズ成分が無いと噴出に聞こえない');
  assert.ok(p.hiss.hold > 0, 'hold が無いと頭で減衰して「シュッ」と切れる');
  assert.ok(profileDuration(p) > 0.3, `短すぎる: ${profileDuration(p)}秒`);
});

test('発煙音は発射音より暗い（撃たれたのではないと分かる）', () => {
  // マシンガンやミサイルと同じ帯域だと「撃たれた」と誤解する
  assert.ok(WEAPON_SOUNDS.smoke.hiss.from < WEAPON_SOUNDS.homing.hiss.from,
    '噴射音より明るいと発射音に聞こえる');
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/weapon-sounds.test.js
```

期待: `smoke が無い` で失敗する。

- [ ] **Step 3: `WEAPON_SOUNDS` に足す**

`src/js/audio/weaponSounds.js` の `grenade` の定義の後に足す。

```js
    // --- 煙幕「プシューッ」---
    // ホーミングの噴射と同じ組み立てだが、帯域を一段下げて hold を長く取る。
    // 明るいまま長く伸ばすと発射音に聞こえて「撃たれた」と誤解するので、
    // 上を 2600Hz に抑えてある（homing は 5200Hz）。
    // 頭の puffs は発射弁が開く一撃。これが無いと、どこから煙が出たのか
    // 分からないまま画面が白くなる。
    smoke: {
        hiss: { from: 2600, to: 700, dur: 0.55, hold: 0.26, gain: 0.042 },
        puffs: { count: 1, gap: 0.04, freq: 300, dur: 0.05, gain: 0.070, bright: 5 },
    },
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
npm test -- tests/weapon-sounds.test.js
```

期待: 全 PASS。総当たりの音量テスト（`どの武器も他の効果音と同じ土俵の音量で鳴る`）と歪みテストも通ること。

落ちた場合の直し方:

- `小さすぎて聞こえない`（基準比 -14dB 未満）→ `hiss.gain` と `puffs.gain` を同じ比率で上げる
- `大きすぎて他を覆う`（+3dB 超）→ 同じく下げる
- `振幅が小さすぎる`（ピーク 0.02 未満）→ `puffs.gain` を上げる（頭の一撃がピークを作る）

**値を動かしたら、なぜその値になったかをコメントに残すこと**（実測の dB を書く）。

- [ ] **Step 5: 実際の音を書き出して聴けるようにする**

```bash
node tools/render-weapon-sounds.mjs
```

`audio-preview/` に `smoke.wav` が出る（git 管理外）。これはユーザーが聴いて判断するもので、ここでは書き出せることの確認だけ。

- [ ] **Step 6: 全テストを走らせる**

```bash
npm test
```

- [ ] **Step 7: コミット**

```bash
git add src/js/audio/weaponSounds.js tests/weapon-sounds.test.js
git commit -m "feat: 煙幕の発煙音を WEAPON_SOUNDS に追加"
```

---

### Task 7: artillery の発煙の引き金

`_updateCoverSeek` が「自機から LoS が通った」を検出した回に発煙する。ここが「ばれた瞬間」そのもの。

**Files:**
- Modify: `src/js/utils/Constants.js`（`ENEMY_ATTACKER_TYPES.artillery` に `usesSmoke: true`）
- Modify: `src/js/entities/EnemyAttacker.js`（コンストラクタに1行、`_updateCoverSeek` に数行）
- Test: `tests/smoke-trigger.test.js`

**Interfaces:**
- Consumes: `game.spawnSmokeScreen(x, y)`（Task 4）、`SMOKE_COOLDOWN`（Task 1）
- Produces: `attacker.smokeCooldown` number

- [ ] **Step 1: 失敗するテストを書く**

`tests/smoke-trigger.test.js` を新規作成する。`tests/helpers/enemy-world.js` の世界を使う。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  ENEMY_ATTACKER_TYPES, TILE_SIZE, SMOKE_COOLDOWN, ATTACKER_COVER_CHECK_INTERVAL,
} from '../src/js/utils/Constants.js';

/** 24x24。床は row 20。遮蔽物なしなので LOS は常に通る（＝ばれている） */
function openWorld() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

function setup(typeKey = 'artillery') {
  const game = makeGame(makeMap(openWorld()));
  game.smokeScreens = [];
  game.smokeCalls = [];
  game.spawnSmokeScreen = (x, y) => game.smokeCalls.push({ x, y });

  // 自機は artillery の射程内・遮蔽を挟まない位置（ATTACKER_COVER_MIN_DIST=160 より遠く）
  game.player = { x: 4 * TILE_SIZE, y: 19 * TILE_SIZE, width: 16, height: 24, alive: true, docked: false };

  const config = { ...ENEMY_ATTACKER_TYPES[typeKey], fireInterval: 1e9 };
  const e = new EnemyAttacker(game, 20 * TILE_SIZE, 19 * TILE_SIZE, config);
  game.enemies.push(e);
  return { game, e };
}

/** cover チェックが必ず1回起きるぶんだけ回す */
function runChecks(e, count = 1) {
  const cx = () => e.x + e.width / 2;
  const cy = () => e.y + e.height / 2;
  for (let i = 0; i < ATTACKER_COVER_CHECK_INTERVAL * count + count; i++) {
    e._updateCoverSeek(e.game.player.x + 8, e.game.player.y + 12);
    if (e.smokeCooldown > 0) e.smokeCooldown--;
    void cx(); void cy();
  }
}

test('artillery は自機から見えている（＝ばれた）と判定した回に発煙する', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  assert.equal(game.smokeCalls.length, 1, `発煙していない: ${game.smokeCalls.length}`);
});

test('発煙位置は機体の中心', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  assert.ok(Math.abs(game.smokeCalls[0].x - (e.x + e.width / 2)) < 1);
  assert.ok(Math.abs(game.smokeCalls[0].y - (e.y + e.height / 2)) < 1);
});

test('クールダウン中は続けて発煙しない', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 3);   // チェック3回ぶん回してもクールダウン480 tick には届かない
  assert.equal(game.smokeCalls.length, 1, `連発している: ${game.smokeCalls.length}`);
});

test('クールダウンが明ければまた発煙する', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  e.smokeCooldown = 0;   // 時間が経ったことにする
  runChecks(e, 1);
  assert.equal(game.smokeCalls.length, 2);
});

test('発煙するとクールダウンが入る', () => {
  const { e } = setup('artillery');
  runChecks(e, 1);
  assert.ok(e.smokeCooldown > 0, 'クールダウンが入っていない');
  assert.ok(e.smokeCooldown <= SMOKE_COOLDOWN);
});

test('遮蔽に隠れている間は発煙しない（ばれていない）', () => {
  const { game, e } = setup('artillery');
  // 自機との間を塞ぐ: LOS が通らない世界に差し替える
  game.map.isSolidAtPixel = () => true;
  runChecks(e, 2);
  assert.equal(game.smokeCalls.length, 0, '隠れているのに発煙した');
});

test('usesSmoke を持たない型は発煙しない', () => {
  for (const typeKey of ['standard', 'heavy', 'rival']) {
    const { game, e } = setup(typeKey);
    runChecks(e, 2);
    assert.equal(game.smokeCalls.length, 0, `${typeKey} が発煙した`);
  }
});

test('artillery だけが usesSmoke を持つ', () => {
  assert.equal(ENEMY_ATTACKER_TYPES.artillery.usesSmoke, true);
  for (const key of ['standard', 'heavy', 'rival']) {
    assert.ok(!ENEMY_ATTACKER_TYPES[key].usesSmoke, `${key} に usesSmoke がある`);
  }
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

```bash
npm test -- tests/smoke-trigger.test.js
```

期待: `発煙していない: 0` で失敗する。

- [ ] **Step 3: 型の表に1行足す**

`src/js/utils/Constants.js` の `ENEMY_ATTACKER_TYPES.artillery`（267行目付近）、`seeksCover: true,` の直後:

```js
        seeksCover: true,
        usesSmoke: true,      // 見つかったら煙幕を張って居場所を隠す
```

- [ ] **Step 4: `EnemyAttacker` に発煙を足す**

1. import に足す（`ATTACKER_COVER_CHECK_INTERVAL` などを読んでいる15行目付近の並びへ）:

```js
    SMOKE_COOLDOWN,
```

2. コンストラクタの「Artillery cover-seeking state」（173行目付近）に足す:

```js
        // Artillery cover-seeking state
        this.coverCheckTimer = 0;
        this.coverGoalX = null;
        this.inCover = false;
        this.smokeCooldown = 0;   // 発煙のクールダウン（SMOKE_COOLDOWN から減っていく）
```

3. `_updateCoverSeek()`（502行目付近）の LOS 判定を変える:

```js
        this.coverCheckTimer--;
        if (this.coverCheckTimer <= 0) {
            this.coverCheckTimer = ATTACKER_COVER_CHECK_INTERVAL;
            if (!hasLineOfSight(cx, cy, targetX, targetY, map)) {
                this.inCover = true;
                this.coverGoalX = null;
            } else {
                // ここが「自機に見つかった瞬間」。遮蔽を探し直す前に煙を張り、
                // 移動そのものを隠す。新しい状態を足さずに済むのは、この後の
                // coverGoalX へ歩く経路がそのまま「煙に隠れての移動」になるため
                if (!this.inCover) this._popSmoke();
                this.inCover = false;
                this.coverGoalX = this._findCoverX(targetX, targetY);
            }
        }
```

**注意:** `if (!this.inCover)` の条件を入れているのは、`inCover` が false のまま何度もチェックが回っても、クールダウンが尽きるまで撒き続けないため……ではない（クールダウンが押さえる）。**露出し続けている間は既に煙の中にいるので、状態が変わった回だけ撒く**という意図。ただし初期値の `inCover` は false なので、最初のチェックでも発煙する（テストが担保している）。

4. クールダウンを毎 tick 減らす。`update()` 内で `_handleShooting()` を呼んでいる行（295行目付近）の直前に足す:

```js
        if (this.smokeCooldown > 0) this.smokeCooldown--;
```

5. 発煙メソッドを `_findCoverX()` の後（556行目付近）に足す:

```js
    /** 煙幕を張る。usesSmoke を持つ型（artillery）だけ。 */
    _popSmoke() {
        if (!this.config.usesSmoke) return;
        if (this.smokeCooldown > 0) return;
        if (!this.game.spawnSmokeScreen) return;   // テスト用の簡易 game でも落ちないように

        this.game.spawnSmokeScreen(this.x + this.width / 2, this.y + this.height / 2);
        this.smokeCooldown = SMOKE_COOLDOWN;
    }
```

- [ ] **Step 5: テストが通ることを確かめる**

```bash
npm test -- tests/smoke-trigger.test.js
```

期待: 全 PASS。

「クールダウン中は続けて発煙しない」が落ちる場合、テストの `runChecks` が `smokeCooldown` を手で減らしているぶんが足りているか確認する（`ATTACKER_COVER_CHECK_INTERVAL * 3 + 3 = 93 tick` なので `SMOKE_COOLDOWN = 480` には届かない）。

- [ ] **Step 6: 全テストを走らせる**

```bash
npm test
```

期待: 全 PASS。特に既存の `tests/attacker-return.test.js` / `tests/enemy-attacker-emergency-defense.test.js` が通ること（`_updateCoverSeek` を触ったため）。

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/Constants.js src/js/entities/EnemyAttacker.js tests/smoke-trigger.test.js
git commit -m "feat: artillery が自機に発見されると煙幕を張る"
```

---

## 完了後: ユーザーへの引き渡し

実装が済んだら、ユーザーに実機確認を依頼する。**ハードリロード（Cmd+Shift+R）が要ることを必ず伝える**（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため）。

artillery はミッション6以降にしか湧かない（`SpawnManager.js` の `if (key === 'artillery' && game.missionsCompleted < 5) continue;`）ので、確認には `debugStartMission: 6` が要る。ユーザーの手元には既にその値が入っている。

確認ポイントと調整用の定数の対応:

| 見るところ | 調整する定数 |
|---|---|
| 煙が濃すぎる / 薄すぎる | `SMOKE_PUFF_ALPHA_MAX`、`SMOKE_PUFF_COUNT` |
| 境界がぼやける / 硬すぎる | `SMOKE_FALLOFF_EXPONENT` |
| 隠れる範囲が広すぎる / 狭すぎる | `SMOKE_PUFF_RADIUS_END`、`SMOKE_CONCEAL_THRESHOLD` |
| 煙が長く残りすぎる | `SMOKE_PUFF_LIFETIME`、`SMOKE_PUFF_DECAY_EXPONENT`（上げると早く薄れる） |
| 発煙が頻繁すぎる | `SMOKE_COOLDOWN` |
| 湧き上がって見えない | `SMOKE_EMIT_SPAN` |
| 紫が強すぎる / 弱すぎる | `smokeSprites.js` の `SMOKE_TINTS` |
| 発煙音が大きい / 小さい | `WEAPON_SOUNDS.smoke` の `gain`（変えたら `npm test` で音量テストを通すこと） |

`SMOKE_FALLOFF_EXPONENT` を変えたときは、スプライトを焼き直すために**ページの再読み込みが要る**（焼き付けは起動時に一度だけ）。
