# 7面の要塞化 段A（地形の形） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7面の地形に「洞窟を改造した要塞」の区画を4つ埋め込む。区画は直線の廊下の格子で、正面は掘れない装甲、背面は掘れる硬い岩。

**Architecture:** 洞窟生成と硬い岩のばら撒きが終わったあとに、`world/fortress.js` の純関数が矩形の区画を選んで中を書き潰す。`waterPools.js` / `snowStairs.js` とまったく同じ形（派生 RNG ストリーム・`excludeRects`・`grid` を直接加工）。新しいブロック種別は足さず、どこが人工物かは `Uint8Array` の印で持つ。

**Tech Stack:** バニラ ES modules、ビルド無し。テストは `node --test`（DOM も AudioContext も無い）。

**Spec:** `docs/superpowers/specs/2026-09-06-stage7-fortress-design.md`

## Global Constraints

- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する。`src/js/main.js` にはユーザーの `debugStartMission` が意図的に未コミットで置かれている（この計画では `main.js` を触らない）。
- **コメントは日本語で「なぜそうしたか」を書く。** 何をしているかはコードが語る。数値を決めたら根拠を残す。
- **マジックナンバーを実装側に直書きしない。** 調整用の数値は `src/js/utils/Constants.js` に置く。
- **`game.rng` を消費しない。** 生成中に乱数が要るものは派生ストリームを作る。消費すると週の決定性（同じ週なら同じ敵配置）が壊れる。
- **ソース文字列を grep するテストは書かない。** 呼び出しが存在しても到達不能なら通ってしまう。
- **各テストは、わざと壊して赤くなることを確認してから確定させる。** 期待値を実装から導くと恒真になる。
- 全体テストは `npm test`。1ファイルだけなら `npm test -- tests/xxx.test.js`。
- 実機での見た目の確認はユーザーが行う。ローカルサーバーは立てない。

---

## File Structure

| ファイル | 責任 |
|---|---|
| `src/js/world/fortress.js`（新規） | 区画の選定と、区画の中の書き換え。純関数だけ。`grid` / `blockHP` を受け取って書き換え、区画のリストと印を返す |
| `src/js/utils/Constants.js`（変更） | `STAGE_ENVIRONMENTS` の7行目を `terrain: 'fortress'` に。`FORTRESS_*` の数値を追加 |
| `src/js/world/Map.js`（変更） | `this.envTerrain` を持ち、`_generate()` に1行足す。`_generateFortress()` は派生 RNG を作って純関数を呼ぶだけ |
| `tests/helpers/map-reach.js`（新規） | 到達可能性の塗りつぶし。装甲は通れない扱い |
| `tests/map-reachability.test.js`（新規） | 全7面で開始→基地が到達可能。要塞と関係ない回帰の土台 |
| `tests/fortress.test.js`（新規） | 区画の選定・外壁・格子・開口・印 |
| `tests/environment-table.test.js`（変更） | 7行目の `terrain` の期待値を `'fortress'` に |

---

## Task 1: 到達可能性テスト（土台）

要塞は装甲で経路を塞ぎうる。**要塞を入れる前に**「開始から基地まで行ける」を測る道具とテストを作り、緑であることを確かめておく。これが以降の全タスクの安全網になる。

**Files:**
- Create: `tests/helpers/map-reach.js`
- Create: `tests/map-reachability.test.js`

**Interfaces:**
- Produces: `reachable(map, start, goal)` → `boolean`。`map` は `{rows, cols, grid}`。`start` / `goal` は `{r, c}`。`BLOCK_INDESTRUCTIBLE` のマスは通れない、それ以外（空洞・通常岩・硬い岩）は通れる（掘れるので）。

- [ ] **Step 1: ヘルパを書く**

`tests/helpers/map-reach.js`:

```js
// ============================================
// 到達可能性（テスト用）
// ============================================
//
// 「開始地点から基地まで行けるか」を測る。掘れるブロックは通れる扱いにして、
// 装甲（BLOCK_INDESTRUCTIBLE）だけを壁とみなす。自機は地形を掘って進めるので、
// 通れないのは壊せないものだけ。

import { BLOCK_INDESTRUCTIBLE } from '../../src/js/utils/Constants.js';

/**
 * start から goal へ、装甲を避けて到達できるか。
 * @param {{rows:number, cols:number, grid:number[][]}} map
 * @param {{r:number, c:number}} start
 * @param {{r:number, c:number}} goal
 */
export function reachable(map, start, goal) {
  const { rows, cols, grid } = map;
  if (grid[start.r][start.c] === BLOCK_INDESTRUCTIBLE) return false;
  const seen = new Uint8Array(rows * cols);
  const goalIdx = goal.r * cols + goal.c;
  const stack = [start.r * cols + start.c];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    if (i === goalIdx) return true;
    const r = (i / cols) | 0;
    const c = i % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (seen[ni]) continue;
      if (grid[nr][nc] === BLOCK_INDESTRUCTIBLE) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return false;
}
```

- [ ] **Step 2: テストを書く**

`tests/map-reachability.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { reachable } from './helpers/map-reach.js';
import { BLOCK_INDESTRUCTIBLE, BLOCK_EMPTY, STAGE_ENVIRONMENTS } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が canvas を触るので最小限の DOM スタブ。
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

// 開始の部屋は _generate() が (3,3) から 20x16 で掘り、中心を rooms に積む。
// その中心（centerR 11 / centerC 13）を自機の出発点とみなす
const START = { r: 11, c: 13 };

test('全7面で、開始の部屋から基地まで掘って辿り着ける', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (let lv = 0; lv < STAGE_ENVIRONMENTS.length; lv++) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = new Map({ rng: new SeededRNG(seed) }, lv);
      assert.ok(reachable(map, START, map.enemyBaseCenter),
        `面${lv + 1} seed ${seed}: 基地へ到達できない`);
    }
  }
});

test('装甲で囲まれた基地には到達できない（ヘルパが偽を返せることの確認）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(1) }, 0);
  const b = map.enemyBaseCenter;
  // 基地の周りを装甲のリングで塞ぐ。ヘルパが常に true を返すだけの
  // 恒真テストになっていないことを、この1本で担保する
  for (let r = b.r - 6; r <= b.r + 6; r++) {
    for (let c = b.c - 6; c <= b.c + 6; c++) {
      const onRing = r === b.r - 6 || r === b.r + 6 || c === b.c - 6 || c === b.c + 6;
      if (onRing && map.grid[r] && map.grid[r][c] !== undefined) {
        map.grid[r][c] = BLOCK_INDESTRUCTIBLE;
      }
    }
  }
  map.grid[b.r][b.c] = BLOCK_EMPTY;
  assert.equal(reachable(map, START, b), false, '装甲のリングを抜けてしまった');
});
```

- [ ] **Step 3: テストを走らせる**

Run: `npm test -- tests/map-reachability.test.js`
Expected: **2本とも PASS**（今のマップは 7面 × 5 seed = 35通りすべて到達可能であることを確認済み）。1本目が落ちた場合は要塞と無関係な既存の不具合なので、実装を進める前に報告すること。

- [ ] **Step 4: コミット**

```bash
git add tests/helpers/map-reach.js tests/map-reachability.test.js
git commit -m "test: 開始から基地まで到達できることを全7面で縛る

7面の要塞化は装甲で経路を塞ぎうる。要塞を入れる前に、掘れるブロックを
通れる扱いにして装甲だけを壁とみなす塗りつぶしを用意し、今のマップが
7面 x 5 seed のすべてで到達可能であることを確かめておく。

ヘルパが常に true を返す恒真テストになっていないことは、基地を装甲の
リングで囲んで false になることを確かめる2本目で担保する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `terrain: 'fortress'` の配線

**Files:**
- Modify: `src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS` の7行目）
- Modify: `src/js/world/Map.js`（`this.envTerrain`）
- Modify: `tests/environment-table.test.js:16`

**Interfaces:**
- Produces: `map.envTerrain` — `'cave'` または `'fortress'`。`missionLevel` は剰余で丸める（`envKind` と同じ）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-table.test.js` の16行目を差し替える。今はこうなっている:

```js
    assert.equal(row.terrain, 'cave'); // 7面の要塞化は別設計。今は予約だけ
```

これを、ループの外に出した次の形に変える（該当行を削除し、その `test(...)` ブロックの直後に足す）:

```js
test('terrain は7面だけ fortress、他は cave', () => {
  STAGE_ENVIRONMENTS.forEach((row, i) => {
    const want = i === 6 ? 'fortress' : 'cave';
    assert.equal(row.terrain, want, `面${i + 1} の terrain`);
  });
});
```

さらに `tests/fortress.test.js` を新規に作り、まず1本だけ:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('Map は面ごとの terrain を持つ', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const cave = new Map({ rng: new SeededRNG(1) }, 0);
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  assert.equal(cave.envTerrain, 'cave');
  assert.equal(fort.envTerrain, 'fortress');
  // debugStartMission で面数を超えた値が来るので剰余で丸める（envKind と同じ）
  const wrapped = new Map({ rng: new SeededRNG(1) }, 13);
  assert.equal(wrapped.envTerrain, 'fortress');
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js tests/environment-table.test.js`
Expected: FAIL。`envTerrain` が `undefined`、`terrain` が `'cave'`。

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js` の `STAGE_ENVIRONMENTS` の7行目:

```js
    { kind: 'none',  backdrop: 'machine', terrain: 'fortress' }, // 7: 洞窟を改造した要塞
```

同じ表のすぐ上のコメントで `terrain` を説明している箇所（「7面の要塞化のために予約。今は全行 'cave' で、読む側もまだ無い」）を、事実に合わせて書き換える:

```js
// kind = 動きと画面に重ねる描画、backdrop = 遠景の装飾（kind から導けない行がある:
// 7面は動きは今のままで遠景だけ機械）、terrain = 地形の生成規則
// （'fortress' は Map._generateFortress() が読む。設計:
//  docs/superpowers/specs/2026-09-06-stage7-fortress-design.md）
```

`src/js/world/Map.js`、`this.envKind = ...` の直後:

```js
        // 地形の生成規則。'fortress' なら洞窟を掘ったあとに要塞区画を埋め込む
        this.envTerrain = STAGE_ENVIRONMENTS[(missionLevel || 0) % STAGE_ENVIRONMENTS.length].terrain;
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/Constants.js src/js/world/Map.js tests/fortress.test.js tests/environment-table.test.js
git commit -m "feat: 7面の terrain を fortress にし、Map が読めるようにする

STAGE_ENVIRONMENTS の terrain 列は 2026-09-04 の環境設計で予約されたまま
誰も読んでいなかった。7行目を 'fortress' にし、Map が envKind と同じ形で
envTerrain を持つ。生成側はまだ何もしない（次のタスク）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 区画の選定

矩形をどこに取るかだけ。まだ `grid` は書かない。

**Files:**
- Create: `src/js/world/fortress.js`
- Modify: `src/js/utils/Constants.js`（`FORTRESS_ZONE_*`）
- Modify: `tests/fortress.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `pickFortressZones({ rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin })` → `[{ r0, r1, c0, c1 }]`（行・列とも両端を含む閉区間）
  - `rectsOverlap(a, b)` → `boolean`（`{r0,r1,c0,c1}` 同士。`fortress.js` から export する。後のタスクとテストが使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/fortress.test.js` に足す:

```js
import { pickFortressZones, rectsOverlap } from '../src/js/world/fortress.js';
import {
  FORTRESS_ZONE_COUNT, FORTRESS_ZONE_W_MIN, FORTRESS_ZONE_W_RANGE,
  FORTRESS_ZONE_H_MIN, FORTRESS_ZONE_H_RANGE, FORTRESS_ZONE_MARGIN,
} from '../src/js/utils/Constants.js';

/** 実寸に近い盤面の引数一式。rooms は格子状に散らす。 */
function zoneArgs(overrides = {}) {
  const rooms = [];
  for (let r = 20; r < 140; r += 15) {
    for (let c = 20; c < 290; c += 20) rooms.push({ centerR: r, centerC: c });
  }
  return {
    rows: 150, cols: 300, rooms, excludeRects: [], rng: new SeededRNG(9),
    count: FORTRESS_ZONE_COUNT,
    wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
    hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
    margin: FORTRESS_ZONE_MARGIN,
    ...overrides,
  };
}

test('区画は指定した数だけ取れ、互いに重ならず、盤面に収まる', () => {
  const zones = pickFortressZones(zoneArgs());
  assert.equal(zones.length, FORTRESS_ZONE_COUNT);
  for (const z of zones) {
    assert.ok(z.r0 >= FORTRESS_ZONE_MARGIN && z.c0 >= FORTRESS_ZONE_MARGIN, `はみ出し ${JSON.stringify(z)}`);
    assert.ok(z.r1 < 150 - FORTRESS_ZONE_MARGIN && z.c1 < 300 - FORTRESS_ZONE_MARGIN, `はみ出し ${JSON.stringify(z)}`);
    const w = z.c1 - z.c0 + 1;
    const h = z.r1 - z.r0 + 1;
    assert.ok(w >= FORTRESS_ZONE_W_MIN && w <= FORTRESS_ZONE_W_MIN + FORTRESS_ZONE_W_RANGE, `幅 ${w}`);
    assert.ok(h >= FORTRESS_ZONE_H_MIN && h <= FORTRESS_ZONE_H_MIN + FORTRESS_ZONE_H_RANGE, `高さ ${h}`);
  }
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      assert.equal(rectsOverlap(zones[i], zones[j]), false, `区画 ${i} と ${j} が重なっている`);
    }
  }
});

test('excludeRects と重なる区画は取らない', () => {
  // 盤面の左半分を丸ごと除外する。取れた区画は全部右半分にあるはず
  const exclude = [{ r0: 0, r1: 149, c0: 0, c1: 149 }];
  const zones = pickFortressZones(zoneArgs({ excludeRects: exclude }));
  assert.ok(zones.length > 0, '右半分に1つも置けていない');
  for (const z of zones) {
    assert.equal(rectsOverlap(z, exclude[0]), false, `除外矩形と重なっている ${JSON.stringify(z)}`);
  }
});

test('盤面全部を除外すると1つも取れない', () => {
  const zones = pickFortressZones(zoneArgs({ excludeRects: [{ r0: 0, r1: 149, c0: 0, c1: 299 }] }));
  assert.deepEqual(zones, []);
});

test('同じ rng なら同じ区画', () => {
  const a = pickFortressZones(zoneArgs({ rng: new SeededRNG(4) }));
  const b = pickFortressZones(zoneArgs({ rng: new SeededRNG(4) }));
  assert.deepEqual(a, b);
  const c = pickFortressZones(zoneArgs({ rng: new SeededRNG(5) }));
  assert.notDeepEqual(a, c);
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: FAIL（`fortress.js` が無い / 定数が無い）。

- [ ] **Step 3: 定数を足す**

`src/js/utils/Constants.js`、`STAGE_ENVIRONMENTS` の直後に:

```js
// --- 7面の要塞区画（terrain: 'fortress'）---
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md
// 洞窟を掘り終えたあとに矩形の区画を選び、中を「直線の廊下の格子」で書き潰す。
// 7面は 150x300 タイル、画面は 86x48 タイル。区画を 26〜35 x 18〜25 にすると
// 画面の 1/3 ほどになり、「入った」と分かる大きさになる。
export const FORTRESS_ZONE_COUNT = 4;      // 上限。置けなければ少なくてよい
export const FORTRESS_ZONE_W_MIN = 26;
export const FORTRESS_ZONE_W_RANGE = 9;    // 26〜35
export const FORTRESS_ZONE_H_MIN = 18;
export const FORTRESS_ZONE_H_RANGE = 7;    // 18〜25
export const FORTRESS_ZONE_MARGIN = 3;     // 盤面の縁からこれだけ離す（BORDER_THICKNESS=2 の外側）
```

- [ ] **Step 4: 実装する**

`src/js/world/fortress.js`（新規）:

```js
// ============================================
// 7面の要塞区画（純関数。grid を書き換える）
// ============================================
//
// 洞窟を掘り終えたあとに矩形の区画を選び、その中を人工物の規則で書き潰す。
// 「洞窟を改造して作った要塞」なので、区画の外は洞窟のまま残す。
// 乱数は派生ストリーム（game.rng を消費しない＝週の決定性を壊さない）。
//
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md

/** 閉区間の矩形 { r0, r1, c0, c1 } 同士が重なるか。水・雪の除外矩形と同じ形。 */
export function rectsOverlap(a, b) {
    return !(a.r1 < b.r0 || a.r0 > b.r1 || a.c1 < b.c0 || a.c0 > b.c1);
}

function insideRect(rect, r, c) {
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
}

/**
 * 区画の矩形を選ぶ。部屋の中心を中心に取り、盤面からはみ出すもの・除外矩形と
 * 重なるもの・既に置いた区画と重なるものを弾く。
 *
 * count は**上限**であって下限ではない。候補が尽きたら置けた数で終わる
 * （水のプールと同じ扱い。無理に詰めると重なりを許すことになる）。
 */
export function pickFortressZones({
    rows, cols, rooms, excludeRects = [], rng,
    count, wMin, wRange, hMin, hRange, margin,
}) {
    const candidates = rooms.filter(
        (room) => !excludeRects.some((rect) => insideRect(rect, room.centerR, room.centerC)),
    );
    const zones = [];
    let tries = 0;
    while (zones.length < count && tries < count * 20) {
        tries++;
        if (candidates.length === 0) break;
        const room = candidates[Math.floor(rng.next() * candidates.length)];
        const w = wMin + Math.floor(rng.next() * (wRange + 1));
        const h = hMin + Math.floor(rng.next() * (hRange + 1));
        const c0 = room.centerC - Math.floor(w / 2);
        const r0 = room.centerR - Math.floor(h / 2);
        const zone = { r0, r1: r0 + h - 1, c0, c1: c0 + w - 1 };
        if (zone.r0 < margin || zone.c0 < margin) continue;
        if (zone.r1 >= rows - margin || zone.c1 >= cols - margin) continue;
        if (excludeRects.some((rect) => rectsOverlap(zone, rect))) continue;
        if (zones.some((z) => rectsOverlap(zone, z))) continue;
        zones.push(zone);
    }
    return zones;
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: PASS。

- [ ] **Step 6: テストが落ちうることを確かめる**

`pickFortressZones` の重なり判定 `if (zones.some((z) => rectsOverlap(zone, z))) continue;` を一時的に消し、`npm test -- tests/fortress.test.js` が赤くなることを確認してから戻す。赤くならなければ、テストの盤面が広すぎて偶然重ならないだけなので `count` を上げて調整する。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/fortress.js src/js/utils/Constants.js tests/fortress.test.js
git commit -m "feat: 要塞区画の矩形を選ぶ（まだ地形は書かない）

部屋の中心を中心に 26〜35 x 18〜25 タイルの矩形を取り、盤面からはみ出す
もの・除外矩形（開始の部屋と基地の部屋）と重なるもの・既に置いた区画と
重なるものを弾く。count は上限で、候補が尽きたら置けた数で終わる（水の
プールと同じ扱い。無理に詰めると重なりを許すことになる）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 外壁（正面は装甲、背面は硬い岩）

**Files:**
- Modify: `src/js/world/fortress.js`
- Modify: `src/js/utils/Constants.js`（`FORTRESS_WALL_THICKNESS`）
- Modify: `tests/fortress.test.js`

**Interfaces:**
- Consumes: `pickFortressZones`（Task 3）
- Produces: `buildZoneWalls(grid, blockHP, zone, thickness)` → `undefined`（`grid` / `blockHP` を書き換える）
- Produces: `zoneBands(zone, thickness)` → `{ top, left, bottom, right }`。各要素は `{ r0, r1, c0, c1 }`。**帯は重ならないように排他的に定義する**（後のテストと段Cが同じ定義を使う）

**帯の定義（重要。角の扱いをここで固定する）**

`T = thickness` として、

| 帯 | 範囲 | ブロック |
|---|---|---|
| 上 | 行 `r0 .. r0+T-1`、列 `c0 .. c1` | 装甲 |
| 左 | 列 `c0 .. c0+T-1`、行 `r0+T .. r1` | 装甲 |
| 下 | 行 `r1-T+1 .. r1`、列 `c0+T .. c1` | 硬い岩 |
| 右 | 列 `c1-T+1 .. c1`、行 `r0+T .. r1-T` | 硬い岩 |

4つは重ならず、外周を隙間なく覆う。角は次のようになる: 左上と右上は上帯（装甲）、左下は左帯（装甲）、右下は下帯（硬い岩）。**「下帯と右帯に装甲が1つも無い」がテストできる形**になっている。

- [ ] **Step 1: 失敗するテストを書く**

`tests/fortress.test.js` に足す:

```js
import { buildZoneWalls, zoneBands } from '../src/js/world/fortress.js';
import {
  BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE,
  FORTRESS_WALL_THICKNESS, HARD_BLOCK_HP,
} from '../src/js/utils/Constants.js';

/** 全部空洞の盤面。区画だけを見たいので周りは何も無い。 */
function blankBoard(rows = 60, cols = 80) {
  const grid = [], blockHP = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(BLOCK_EMPTY));
    blockHP.push(new Array(cols).fill(0));
  }
  return { grid, blockHP, rows, cols };
}

function forEachInRect(rect, fn) {
  for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) fn(r, c);
}

test('外壁は上と左が装甲、下と右が硬い岩', () => {
  const b = blankBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  buildZoneWalls(b.grid, b.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(zone, FORTRESS_WALL_THICKNESS);

  forEachInRect(bands.top, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_INDESTRUCTIBLE, `上帯 (${r},${c})`);
    assert.equal(b.blockHP[r][c], -1, `上帯の HP (${r},${c})`);
  });
  forEachInRect(bands.left, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_INDESTRUCTIBLE, `左帯 (${r},${c})`);
  });
  forEachInRect(bands.bottom, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_HARD, `下帯 (${r},${c})`);
    assert.equal(b.blockHP[r][c], HARD_BLOCK_HP, `下帯の HP (${r},${c})`);
  });
  forEachInRect(bands.right, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_HARD, `右帯 (${r},${c})`);
  });
});

test('背面（下帯と右帯）に装甲は1つも無い＝掘って回り込める', () => {
  const b = blankBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  buildZoneWalls(b.grid, b.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(zone, FORTRESS_WALL_THICKNESS);
  for (const band of [bands.bottom, bands.right]) {
    forEachInRect(band, (r, c) => {
      assert.notEqual(b.grid[r][c], BLOCK_INDESTRUCTIBLE,
        `背面に装甲がある (${r},${c})。掘って入れなくなる`);
    });
  }
});

test('4つの帯は互いに重ならず、外周を隙間なく覆う', () => {
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const T = FORTRESS_WALL_THICKNESS;
  const bands = zoneBands(zone, T);
  const seen = new Map();
  for (const [name, band] of Object.entries(bands)) {
    forEachInRect(band, (r, c) => {
      const key = `${r},${c}`;
      assert.equal(seen.has(key), false, `${key} が ${seen.get(key)} と ${name} で重複`);
      seen.set(key, name);
    });
  }
  // 外周（矩形のうち、内側の矩形に含まれないマス）が全部覆われている
  let expected = 0;
  for (let r = zone.r0; r <= zone.r1; r++) {
    for (let c = zone.c0; c <= zone.c1; c++) {
      const inner = r >= zone.r0 + T && r <= zone.r1 - T && c >= zone.c0 + T && c <= zone.c1 - T;
      if (!inner) expected++;
    }
  }
  assert.equal(seen.size, expected, '外周に覆われていないマスがある');
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: FAIL（`buildZoneWalls` / `zoneBands` / `FORTRESS_WALL_THICKNESS` が無い）。

- [ ] **Step 3: 定数を足す**

`src/js/utils/Constants.js` の `FORTRESS_ZONE_MARGIN` の下:

```js
// 外壁の厚さ。上帯と左帯（自機が来る正面）は装甲＝掘れない、下帯と右帯（背面）は
// 硬い岩＝時間をかければ抄える。「回り込めば抄えるが、正面は口を通るしかない」に
// なる。背面が必ず掘れるので詰みは起きない
export const FORTRESS_WALL_THICKNESS = 2;
```

- [ ] **Step 4: 実装する**

`src/js/world/fortress.js` に足す（先頭の import に定数を追加すること）:

```js
import {
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, HARD_BLOCK_HP,
} from '../utils/Constants.js';
```

```js
/**
 * 外壁の4つの帯。**互いに重ならないように排他的に定義する。**
 * 角の扱いをここ1箇所で決めておかないと、「背面に装甲が無い」が言えなくなる。
 * 角は 左上・右上＝上帯（装甲）、左下＝左帯（装甲）、右下＝下帯（硬い岩）。
 */
export function zoneBands(zone, thickness) {
    const T = thickness;
    return {
        top:    { r0: zone.r0,         r1: zone.r0 + T - 1, c0: zone.c0,         c1: zone.c1 },
        left:   { r0: zone.r0 + T,     r1: zone.r1,         c0: zone.c0,         c1: zone.c0 + T - 1 },
        bottom: { r0: zone.r1 - T + 1, r1: zone.r1,         c0: zone.c0 + T,     c1: zone.c1 },
        right:  { r0: zone.r0 + T,     r1: zone.r1 - T,     c0: zone.c1 - T + 1, c1: zone.c1 },
    };
}

function fillRect(grid, blockHP, rect, block, hp) {
    for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
            grid[r][c] = block;
            blockHP[r][c] = hp;
        }
    }
}

/** 外壁を書く。正面（上・左）は装甲、背面（下・右）は硬い岩。 */
export function buildZoneWalls(grid, blockHP, zone, thickness) {
    const bands = zoneBands(zone, thickness);
    fillRect(grid, blockHP, bands.top, BLOCK_INDESTRUCTIBLE, -1);
    fillRect(grid, blockHP, bands.left, BLOCK_INDESTRUCTIBLE, -1);
    fillRect(grid, blockHP, bands.bottom, BLOCK_HARD, HARD_BLOCK_HP);
    fillRect(grid, blockHP, bands.right, BLOCK_HARD, HARD_BLOCK_HP);
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: PASS。

- [ ] **Step 6: テストが落ちうることを確かめる**

`bands.bottom` の塗りを `BLOCK_INDESTRUCTIBLE, -1` に変え、「背面に装甲は1つも無い」が赤くなることを確認してから戻す。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/fortress.js src/js/utils/Constants.js tests/fortress.test.js
git commit -m "feat: 要塞区画の外壁（正面は装甲、背面は硬い岩）

自機は左上から来て右下の基地へ向かうので、上帯と左帯を BLOCK_INDESTRUCTIBLE、
下帯と右帯を BLOCK_HARD にする。正面から入るには開口を通るしかないが、
背面は3発かければ抄えるので回り込める＝詰まない。

4つの帯は zoneBands() で排他的に定義した。角の扱いを1箇所に決めておかないと
「背面に装甲が無い」が言えなくなる（左上と右上は上帯、左下は左帯、
右下は下帯に属する）。段Cの隔壁扉もこの定義を使う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 区画の中（廊下の格子・室・柱）

**Files:**
- Modify: `src/js/world/fortress.js`
- Modify: `src/js/utils/Constants.js`（`FORTRESS_CORRIDOR_*` / `FORTRESS_ROOM_SIZE`）
- Modify: `tests/fortress.test.js`

**Interfaces:**
- Consumes: `zoneBands`（Task 4）
- Produces: `buildZoneInterior(grid, blockHP, zone, opts)` → `{ corridorRows, corridorCols }`
  - `opts` は `{ thickness, corridorW, pitch, roomSize }`
  - `corridorRows` / `corridorCols` は各廊下の**先頭の行／列**の配列（`[rr, rr+corridorW-1]` が廊下）。Task 6 が開口の位置を選ぶのに使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/fortress.test.js` に足す:

```js
import { buildZoneInterior } from '../src/js/world/fortress.js';
import {
  FORTRESS_CORRIDOR_W, FORTRESS_CORRIDOR_PITCH, FORTRESS_ROOM_SIZE,
} from '../src/js/utils/Constants.js';

const INTERIOR_OPTS = {
  thickness: FORTRESS_WALL_THICKNESS,
  corridorW: FORTRESS_CORRIDOR_W,
  pitch: FORTRESS_CORRIDOR_PITCH,
  roomSize: FORTRESS_ROOM_SIZE,
};

/** 区画の内側（外壁の内）を塗りつぶして、空洞の連結成分の数を数える。 */
function openComponents(grid, zone, T) {
  const r0 = zone.r0 + T, r1 = zone.r1 - T, c0 = zone.c0 + T, c1 = zone.c1 - T;
  const seen = new Set();
  let components = 0;
  for (let sr = r0; sr <= r1; sr++) {
    for (let sc = c0; sc <= c1; sc++) {
      if (grid[sr][sc] !== BLOCK_EMPTY) continue;
      if (seen.has(`${sr},${sc}`)) continue;
      components++;
      const stack = [[sr, sc]];
      seen.add(`${sr},${sc}`);
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < r0 || nr > r1 || nc < c0 || nc > c1) continue;
          if (grid[nr][nc] !== BLOCK_EMPTY) continue;
          const key = `${nr},${nc}`;
          if (seen.has(key)) continue;
          seen.add(key);
          stack.push([nr, nc]);
        }
      }
    }
  }
  return components;
}

test('区画の中は廊下が縦横に走り、空洞がひとつながりになる', () => {
  const b = blankBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  buildZoneWalls(b.grid, b.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const { corridorRows, corridorCols } = buildZoneInterior(b.grid, b.blockHP, zone, INTERIOR_OPTS);
  assert.ok(corridorRows.length >= 2, `横の廊下が ${corridorRows.length} 本しかない`);
  assert.ok(corridorCols.length >= 2, `縦の廊下が ${corridorCols.length} 本しかない`);
  assert.equal(openComponents(b.grid, zone, FORTRESS_WALL_THICKNESS), 1,
    '区画の中の空洞がひとつながりになっていない');
});

test('廊下でない内側は掘れる通常岩（迷路にしない）', () => {
  const b = blankBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  buildZoneWalls(b.grid, b.blockHP, zone, FORTRESS_WALL_THICKNESS);
  buildZoneInterior(b.grid, b.blockHP, zone, INTERIOR_OPTS);
  const T = FORTRESS_WALL_THICKNESS;
  let normal = 0, pillars = 0;
  for (let r = zone.r0 + T; r <= zone.r1 - T; r++) {
    for (let c = zone.c0 + T; c <= zone.c1 - T; c++) {
      const v = b.grid[r][c];
      assert.ok(v === BLOCK_EMPTY || v === BLOCK_NORMAL || v === BLOCK_INDESTRUCTIBLE,
        `内側に硬い岩が残っている (${r},${c})`);
      if (v === BLOCK_NORMAL) {
        normal++;
        assert.equal(b.blockHP[r][c], 1, `通常岩の HP が 1 でない (${r},${c})`);
      }
      if (v === BLOCK_INDESTRUCTIBLE) pillars++;
    }
  }
  assert.ok(normal > 0, '内側の壁が1つも無い');
  assert.ok(pillars > 0, '柱が1つも無い');
});

test('柱は室の四隅にだけ立ち、廊下を塞がない', () => {
  const b = blankBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  buildZoneWalls(b.grid, b.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const { corridorRows, corridorCols } = buildZoneInterior(b.grid, b.blockHP, zone, INTERIOR_OPTS);
  // 廊下の中心線（縦横とも）は必ず空いている＝柱で塞がれていない
  const T = FORTRESS_WALL_THICKNESS;
  const mid = Math.floor(FORTRESS_CORRIDOR_W / 2);
  for (const rr of corridorRows) {
    for (let c = zone.c0 + T; c <= zone.c1 - T; c++) {
      assert.equal(b.grid[rr + mid][c], BLOCK_EMPTY, `横の廊下の中心線が塞がれている (${rr + mid},${c})`);
    }
  }
  for (const cc of corridorCols) {
    for (let r = zone.r0 + T; r <= zone.r1 - T; r++) {
      assert.equal(b.grid[r][cc + mid], BLOCK_EMPTY, `縦の廊下の中心線が塞がれている (${r},${cc + mid})`);
    }
  }
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: FAIL。

- [ ] **Step 3: 定数を足す**

`src/js/utils/Constants.js` の `FORTRESS_WALL_THICKNESS` の下:

```js
// 区画の中の格子。自機は 16x24px = 1x1.5 タイルなので、幅3タイル（48px）の廊下は
// 余裕がある（ドローンの 24px 幅も通る）。実機で窮屈なら 4 に上げる
export const FORTRESS_CORRIDOR_W = 3;
export const FORTRESS_CORRIDOR_PITCH = 8;  // 廊下3 ＋ 壁5。区画幅 26〜35 で3〜4本になる
export const FORTRESS_ROOM_SIZE = 5;       // 廊下の交点をこの大きさに広げる（廊下より1タイル外へ）
```

- [ ] **Step 4: 実装する**

`src/js/world/fortress.js` に足す:

```js
/**
 * 区画の中を格子にする。
 *
 * 手順: 内側を全部「掘れる通常岩」で埋める → 縦横の廊下を空洞で刻む →
 * 交点を室に広げる → 室の四隅に装甲の柱を立てる。
 *
 * 中の壁を掘れる BLOCK_NORMAL にしているのは、外壁で経路を規定しておいて
 * 中まで掘れないと格子がただの迷路になって窮屈だから。掘れば近道はできるが
 * 外壁は抜けられない、という二段構えにする。
 *
 * @returns {{corridorRows:number[], corridorCols:number[]}} 各廊下の先頭の行／列
 */
export function buildZoneInterior(grid, blockHP, zone, { thickness, corridorW, pitch, roomSize }) {
    const T = thickness;
    const r0 = zone.r0 + T, r1 = zone.r1 - T;
    const c0 = zone.c0 + T, c1 = zone.c1 - T;

    fillRect(grid, blockHP, { r0, r1, c0, c1 }, BLOCK_NORMAL, 1);

    const corridorRows = [];
    for (let rr = r0; rr + corridorW - 1 <= r1; rr += pitch) corridorRows.push(rr);
    const corridorCols = [];
    for (let cc = c0; cc + corridorW - 1 <= c1; cc += pitch) corridorCols.push(cc);

    for (const rr of corridorRows) {
        fillRect(grid, blockHP, { r0: rr, r1: rr + corridorW - 1, c0, c1 }, BLOCK_EMPTY, 0);
    }
    for (const cc of corridorCols) {
        fillRect(grid, blockHP, { r0, r1, c0: cc, c1: cc + corridorW - 1 }, BLOCK_EMPTY, 0);
    }

    // 交点の室。廊下の中心から roomSize/2 だけ広げる（区画の内側からはみ出さない）
    const half = Math.floor(roomSize / 2);
    const mid = Math.floor(corridorW / 2);
    for (const rr of corridorRows) {
        for (const cc of corridorCols) {
            const room = {
                r0: Math.max(r0, rr + mid - half), r1: Math.min(r1, rr + mid + half),
                c0: Math.max(c0, cc + mid - half), c1: Math.min(c1, cc + mid + half),
            };
            fillRect(grid, blockHP, room, BLOCK_EMPTY, 0);
            // 柱: 室の四隅。廊下の中心線からは外れるので通行を塞がない
            for (const [pr, pc] of [[room.r0, room.c0], [room.r0, room.c1], [room.r1, room.c0], [room.r1, room.c1]]) {
                if (pr === rr + mid || pc === cc + mid) continue; // 念のため中心線は避ける
                grid[pr][pc] = BLOCK_INDESTRUCTIBLE;
                blockHP[pr][pc] = -1;
            }
        }
    }
    return { corridorRows, corridorCols };
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: PASS。落ちる場合は `openComponents` が 1 でない＝縦横の廊下が交差していない可能性がある。`corridorRows` / `corridorCols` が2本以上あるかを先に確かめること。

- [ ] **Step 6: テストが落ちうることを確かめる**

縦の廊下を刻むループ（`for (const cc of corridorCols)`）を一時的に消し、「空洞がひとつながり」が赤くなることを確認してから戻す。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/fortress.js src/js/utils/Constants.js tests/fortress.test.js
git commit -m "feat: 要塞区画の中を廊下の格子にする

内側を掘れる通常岩で埋めてから、幅3・ピッチ8で縦横の廊下を刻み、交点を
5x5 の室に広げ、室の四隅に装甲の柱を立てる。

中の壁を掘れる BLOCK_NORMAL にしたのは、外壁で経路を規定しておいて中まで
掘れないと格子がただの迷路になって窮屈だから。掘れば近道はできるが外壁は
抜けられない、という二段構えにする。

柱は室の四隅だけに立て、廊下の中心線は必ず空けておく（塞ぐと格子が
分断される）。段Bの絵が入るまでは、この柱だけが人工物として見える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 開口と、外への接続

**Files:**
- Modify: `src/js/world/fortress.js`
- Modify: `src/js/utils/Constants.js`（`FORTRESS_OPENING_TUNNEL_MAX`）
- Modify: `tests/fortress.test.js`

**Interfaces:**
- Consumes: `buildZoneInterior` の戻り値（Task 5）、`zoneBands`（Task 4）
- Produces: `openZoneGates(grid, blockHP, zone, { thickness, corridorW, corridorRows, corridorCols, rng, tunnelMax, rows, cols })` → `[{ r, c, side, w }]`
  - `side` は `'left'` か `'top'`。`r` / `c` は開口の左上のマス。`w` は開口の幅（= `corridorW`）
  - 装甲の2辺に1つずつ、計2つ返す

- [ ] **Step 1: 失敗するテストを書く**

`tests/fortress.test.js` に足す:

```js
import { openZoneGates } from '../src/js/world/fortress.js';
import { FORTRESS_OPENING_TUNNEL_MAX } from '../src/js/utils/Constants.js';

/** 全部岩の盤面。開口の外にトンネルが掘られることを見たいので空洞を作らない。 */
function solidBoard(rows = 60, cols = 80) {
  const grid = [], blockHP = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(BLOCK_NORMAL));
    blockHP.push(new Array(cols).fill(1));
  }
  return { grid, blockHP, rows, cols };
}

function buildZone(board, zone, rng) {
  buildZoneWalls(board.grid, board.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const { corridorRows, corridorCols } = buildZoneInterior(board.grid, board.blockHP, zone, INTERIOR_OPTS);
  const gates = openZoneGates(board.grid, board.blockHP, zone, {
    thickness: FORTRESS_WALL_THICKNESS, corridorW: FORTRESS_CORRIDOR_W,
    corridorRows, corridorCols, rng, tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
    rows: board.rows, cols: board.cols,
  });
  return { corridorRows, corridorCols, gates };
}

test('開口は装甲の2辺に1つずつ、幅は廊下と同じ', () => {
  const b = solidBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const { gates } = buildZone(b, zone, new SeededRNG(3));
  assert.equal(gates.length, 2);
  assert.deepEqual(gates.map((g) => g.side).sort(), ['left', 'top']);
  for (const g of gates) assert.equal(g.w, FORTRESS_CORRIDOR_W);
});

test('開口のマスは空洞になっている', () => {
  const b = solidBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const { gates } = buildZone(b, zone, new SeededRNG(3));
  const T = FORTRESS_WALL_THICKNESS;
  for (const g of gates) {
    if (g.side === 'left') {
      for (let r = g.r; r < g.r + g.w; r++) {
        for (let c = zone.c0; c < zone.c0 + T; c++) {
          assert.equal(b.grid[r][c], BLOCK_EMPTY, `左の開口が空洞でない (${r},${c})`);
        }
      }
    } else {
      for (let c = g.c; c < g.c + g.w; c++) {
        for (let r = zone.r0; r < zone.r0 + T; r++) {
          assert.equal(b.grid[r][c], BLOCK_EMPTY, `上の開口が空洞でない (${r},${c})`);
        }
      }
    }
  }
});

test('開口は廊下の延長線上にある（入った先が壁にならない）', () => {
  const b = solidBoard();
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const { corridorRows, corridorCols, gates } = buildZone(b, zone, new SeededRNG(3));
  const left = gates.find((g) => g.side === 'left');
  const top = gates.find((g) => g.side === 'top');
  assert.ok(corridorRows.includes(left.r), `左の開口 ${left.r} が横の廊下 ${corridorRows} に無い`);
  assert.ok(corridorCols.includes(top.c), `上の開口 ${top.c} が縦の廊下 ${corridorCols} に無い`);
});

test('開口の外へトンネルが掘られ、区画の外の空洞につながる', () => {
  const b = solidBoard();
  // 左に空洞の縦帯を置いておく。トンネルはここに当たって止まるはず
  for (let r = 0; r < b.rows; r++) for (let c = 3; c <= 5; c++) { b.grid[r][c] = BLOCK_EMPTY; b.blockHP[r][c] = 0; }
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const { gates } = buildZone(b, zone, new SeededRNG(3));
  const left = gates.find((g) => g.side === 'left');
  // 開口の行から左へ辿ると、c=5 の空洞まで全部空洞になっている
  for (let c = 5; c < zone.c0; c++) {
    assert.equal(b.grid[left.r][c], BLOCK_EMPTY, `トンネルが途切れている (${left.r},${c})`);
  }
});

test('同じ rng なら同じ開口', () => {
  const zone = { r0: 10, r1: 34, c0: 10, c1: 44 };
  const a = buildZone(solidBoard(), zone, new SeededRNG(8)).gates;
  const c = buildZone(solidBoard(), zone, new SeededRNG(8)).gates;
  assert.deepEqual(a, c);
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: FAIL。

- [ ] **Step 3: 定数を足す**

```js
// 開口から区画の外の空洞まで掘るトンネルの最大長。7面は空洞が 42% あるので
// 数タイルで当たる。当たらないまま尽きたらそこで止める（掘った穴は残る）
export const FORTRESS_OPENING_TUNNEL_MAX = 24;
```

- [ ] **Step 4: 実装する**

`src/js/world/fortress.js` に足す:

```js
/**
 * 装甲の2辺（上・左）に開口を開け、区画の外の空洞へつなぐ。
 *
 * 開口は必ず**廊下の延長線上**に取る。適当な位置に開けると入った先が壁になり、
 * 「入り口に見えるのに入れない」ことが起きる。
 */
export function openZoneGates(grid, blockHP, zone, {
    thickness, corridorW, corridorRows, corridorCols, rng, tunnelMax, rows, cols,
}) {
    const T = thickness;
    const gates = [];

    // 左辺: 横の廊下から1本選び、その行の帯を空ける
    if (corridorRows.length > 0) {
        const rr = corridorRows[Math.floor(rng.next() * corridorRows.length)];
        fillRect(grid, blockHP, { r0: rr, r1: rr + corridorW - 1, c0: zone.c0, c1: zone.c0 + T - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: rr, c: zone.c0, side: 'left', w: corridorW });
    }
    // 上辺: 縦の廊下から1本選ぶ
    if (corridorCols.length > 0) {
        const cc = corridorCols[Math.floor(rng.next() * corridorCols.length)];
        fillRect(grid, blockHP, { r0: zone.r0, r1: zone.r0 + T - 1, c0: cc, c1: cc + corridorW - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: zone.r0, c: cc, side: 'top', w: corridorW });
    }

    for (const gate of gates) digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols);
    return gates;
}

/** 開口から外向きに、最初の空洞に当たるまで幅 gate.w のトンネルを掘る。 */
function digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols) {
    const horizontal = gate.side === 'left';
    for (let i = 1; i <= tunnelMax; i++) {
        const r = horizontal ? gate.r : zone.r0 - i;
        const c = horizontal ? zone.c0 - i : gate.c;
        if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) return;
        let hitEmpty = false;
        for (let k = 0; k < gate.w; k++) {
            const rr = horizontal ? r + k : r;
            const cc = horizontal ? c : c + k;
            if (rr < 1 || cc < 1 || rr >= rows - 1 || cc >= cols - 1) continue;
            if (grid[rr][cc] === BLOCK_EMPTY) hitEmpty = true;
            grid[rr][cc] = BLOCK_EMPTY;
            blockHP[rr][cc] = 0;
        }
        if (hitEmpty) return;
    }
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: PASS。

- [ ] **Step 6: テストが落ちうることを確かめる**

開口の位置を廊下ではなく固定値（例: `zone.r0 + T`）にして、「開口は廊下の延長線上にある」が赤くなることを確認してから戻す。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/fortress.js src/js/utils/Constants.js tests/fortress.test.js
git commit -m "feat: 要塞区画の開口と、外の空洞への接続

装甲の2辺（上・左）に幅3の開口を1つずつ開ける。位置は内部の廊下から
派生 RNG で1本選び、その延長線上に取る。適当な位置に開けると入った先が
壁になり「入り口に見えるのに入れない」ことが起きる。

開口の外は最初の空洞に当たるまでトンネルを掘って連結性を保証する。
7面は空洞が 42% あるので数タイルで当たる。

段Cの隔壁扉はこの開口に立つ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Map への組み込み

**Files:**
- Modify: `src/js/world/fortress.js`（`carveFortressZones` を追加）
- Modify: `src/js/world/Map.js`
- Modify: `tests/fortress.test.js`

**Interfaces:**
- Consumes: Task 3〜6 の全部
- Produces:
  - `carveFortressZones({ grid, blockHP, rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin, thickness, corridorW, pitch, roomSize, tunnelMax })` → `{ zones, marks }`
    - `zones`: `[{ r0, r1, c0, c1, openings }]`。`openings` は Task 6 の `gates`
    - `marks`: `Uint8Array(rows*cols)`。区画内の空でないタイルに 1
  - `map.fortress`: `Uint8Array`
  - `map.fortressZones`: 上の `zones`

- [ ] **Step 1: 失敗するテストを書く**

`tests/fortress.test.js` に足す:

```js
import { carveFortressZones } from '../src/js/world/fortress.js';
import { reachable } from './helpers/map-reach.js';

const START = { r: 11, c: 13 };

test('7面には要塞区画があり、他の面には無い', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  assert.ok(fort.fortressZones.length > 0, '7面に区画が1つも無い');
  assert.ok(fort.fortress.some((v) => v === 1), '7面に印が1つも立っていない');
  for (let lv = 0; lv < 6; lv++) {
    const m = new Map({ rng: new SeededRNG(1) }, lv);
    assert.deepEqual(m.fortressZones, [], `面${lv + 1} に区画がある`);
    assert.equal(m.fortress.some((v) => v === 1), false, `面${lv + 1} に印が立っている`);
  }
});

test('同じ seed なら同じ要塞・同じ敵配置（生成は決定的）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = new Map({ rng: new SeededRNG(11) }, 6);
  const b = new Map({ rng: new SeededRNG(11) }, 6);
  assert.deepEqual(a.fortressZones, b.fortressZones);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
  assert.deepEqual(a.enemyAttackerSpawns, b.enemyAttackerSpawns);
  const c = new Map({ rng: new SeededRNG(12) }, 6);
  assert.notDeepEqual(a.fortressZones, c.fortressZones, 'seed を変えても同じ区画になっている');
});

test('carveFortressZones は渡された rng だけを使う', () => {
  // Map が派生ストリームを渡している以上、純関数側が外の乱数に触れていない
  // ことを直接見ておく。引数の rng を数えて、実際に使われていることを確かめ、
  // 同じ rng なら完全に同じ結果になることで「他の乱数源が混ざっていない」と言える。
  //
  // 補足: 「7面と6面で game.rng の消費回数が一致する」という形のテストは書けない。
  // 要塞は grid を書き換えるので、あとで走るスポーン探索の候補数が変わり、
  // シャッフルで引く回数が変わる。雪の階段（5面）も同じ理由で6面と 223 回ずれている。
  // 派生ストリームが守っているのは「要塞の乱数が洞窟生成の乱数列を割り込まない」
  // ことであって、総消費回数が面によらず一定になることではない。
  const board = solidBoard(60, 200);
  const rooms = [];
  for (let c = 30; c < 180; c += 25) rooms.push({ centerR: 30, centerC: c });
  let draws = 0;
  const inner = new SeededRNG(21);
  const counting = { next: () => { draws++; return inner.next(); } };
  const args = {
    grid: board.grid, blockHP: board.blockHP, rows: board.rows, cols: board.cols,
    rooms, excludeRects: [],
    count: FORTRESS_ZONE_COUNT,
    wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
    hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
    margin: FORTRESS_ZONE_MARGIN,
    thickness: FORTRESS_WALL_THICKNESS, corridorW: FORTRESS_CORRIDOR_W,
    pitch: FORTRESS_CORRIDOR_PITCH, roomSize: FORTRESS_ROOM_SIZE,
    tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
  };
  const first = carveFortressZones({ ...args, rng: counting });
  assert.ok(draws > 0, '渡した rng が使われていない');
  const board2 = solidBoard(60, 200);
  const second = carveFortressZones({
    ...args, grid: board2.grid, blockHP: board2.blockHP, rng: new SeededRNG(21),
  });
  assert.deepEqual(second.zones, first.zones, '同じ seed で結果が変わる＝別の乱数源が混ざっている');
});

test('印は区画の矩形の中にしか立たない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(2) }, 6);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (m.fortress[r * m.cols + c] !== 1) continue;
      const inside = m.fortressZones.some((z) => r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1);
      assert.ok(inside, `区画の外に印が立っている (${r},${c})`);
    }
  }
});

test('区画は開始の部屋・基地の部屋と重ならない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    for (const z of m.fortressZones) {
      for (const rect of m._reservedRects()) {
        assert.equal(rectsOverlap(z, rect), false,
          `seed ${seed}: 区画 ${JSON.stringify(z)} が予約矩形と重なっている`);
      }
    }
  }
});

test('要塞を入れても基地へ到達できる', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    assert.ok(reachable(m, START, m.enemyBaseCenter), `seed ${seed}: 基地へ到達できない`);
  }
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npm test -- tests/fortress.test.js`
Expected: FAIL（`fortress` / `fortressZones` が `undefined`）。

- [ ] **Step 3: `carveFortressZones` を実装する**

`src/js/world/fortress.js` に足す:

```js
/**
 * 区画を選び、外壁・格子・開口を書き、印を返す。Map から呼ばれる唯一の入口。
 */
export function carveFortressZones({
    grid, blockHP, rows, cols, rooms, excludeRects, rng,
    count, wMin, wRange, hMin, hRange, margin,
    thickness, corridorW, pitch, roomSize, tunnelMax,
}) {
    const picked = pickFortressZones({
        rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin,
    });
    const marks = new Uint8Array(rows * cols);
    const zones = [];
    for (const zone of picked) {
        buildZoneWalls(grid, blockHP, zone, thickness);
        const { corridorRows, corridorCols } = buildZoneInterior(
            grid, blockHP, zone, { thickness, corridorW, pitch, roomSize },
        );
        const openings = openZoneGates(grid, blockHP, zone, {
            thickness, corridorW, corridorRows, corridorCols, rng, tunnelMax, rows, cols,
        });
        // 印は区画の中の「空でない」タイルだけ。空洞には描くものが無い
        for (let r = zone.r0; r <= zone.r1; r++) {
            for (let c = zone.c0; c <= zone.c1; c++) {
                if (grid[r][c] !== BLOCK_EMPTY) marks[r * cols + c] = 1;
            }
        }
        zones.push({ ...zone, openings });
    }
    return { zones, marks };
}
```

- [ ] **Step 4: Map に配線する**

`src/js/world/Map.js` の import に足す:

```js
import { carveFortressZones } from './fortress.js';
```

`Constants.js` からの import に `FORTRESS_*` を全部足す。

`_generate()` の Step 9（`this._placeHardBlocks();`）の直後、Step 9b（地底湖）の直前に:

```js
        // Step 9a: 7面の要塞区画（派生ストリーム）。**硬い岩のあとに置く** —
        // 7面は硬い岩が4割あり、区画の中に混ざると洞窟に戻ってしまうので、
        // 要塞は自分の矩形を後から書き潰す
        this.fortress = new Uint8Array(this.rows * this.cols);
        this.fortressZones = [];
        if (this.envTerrain === 'fortress') this._generateFortress();
```

メソッドは `_generateWater()` の隣に置く:

```js
    _generateFortress() {
        const result = carveFortressZones({
            grid: this.grid, blockHP: this.blockHP, rows: this.rows, cols: this.cols,
            rooms: this.rooms, excludeRects: this._reservedRects(),
            // 派生ストリーム。game.rng を消費すると敵の構成が変わり、週の決定性が壊れる
            rng: new SeededRNG((this.game.rng.state ^ 0xF0A7E5) >>> 0),
            count: FORTRESS_ZONE_COUNT,
            wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
            hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
            margin: FORTRESS_ZONE_MARGIN,
            thickness: FORTRESS_WALL_THICKNESS, corridorW: FORTRESS_CORRIDOR_W,
            pitch: FORTRESS_CORRIDOR_PITCH, roomSize: FORTRESS_ROOM_SIZE,
            tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
        });
        this.fortressZones = result.zones;
        this.fortress = result.marks;
    }
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test`
Expected: **全部 PASS**。特に `tests/map-reachability.test.js`（Task 1）が7面で緑のままであること。ここが赤くなったら、要塞の装甲が経路を塞いでいる。`FORTRESS_ZONE_COUNT` を下げてごまかさず、開口とトンネルの実装を疑うこと。

- [ ] **Step 6: テストが落ちうることを確かめる**

`_generateFortress()` の中で `thickness: FORTRESS_WALL_THICKNESS` を渡している箇所を一時的に大きな値（例: 8）にして、到達可能性か区画のテストが赤くなることを確認してから戻す。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/fortress.js src/js/world/Map.js src/js/utils/Constants.js tests/fortress.test.js
git commit -m "feat: 7面に要塞区画を埋め込む（段A完了）

_generate() の Step 9a として、硬い岩のあとに要塞区画を書く。7面は硬い岩が
4割あり、区画の中に混ざると洞窟に戻ってしまうので、要塞は自分の矩形を
後から書き潰す。

乱数は派生ストリーム（game.rng ^ 0xF0A7E5）で、game.rng は1回も消費しない
＝週の決定性を壊さない。水と雪が同じ理由で同じことをしている。

新しいブロック種別は足さず、どこが人工物かは Uint8Array の印 map.fortress
で持つ（段Bの描画はこれだけを見る）。map.fortressZones の openings に
段Cの隔壁扉が立つ。

Task 1 の到達可能性テストが7面で緑のままであることを確認済み。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 実機への引き渡し

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-stage7-fortress-design.md`（確認の表を「実装後」の形に更新）

- [ ] **Step 1: 全体テストを走らせ、数を記録する**

Run: `npm test`
Expected: 0 fail。テスト総数を控える。

- [ ] **Step 2: 実測値を採る**

7面を5 seed 生成し、次を数えて設計書の節6の表に実測列として書き足す:
- 置けた区画の数（`FORTRESS_ZONE_COUNT` は上限なので、4に届かないことがある）
- 区画の平均の大きさ
- 印が立ったタイル数と、それがマップ全体に占める割合

計測は使い捨てのスクリプトでよい。**リポジトリにはコミットしない。**

- [ ] **Step 3: コミット**

```bash
git add docs/superpowers/specs/2026-09-06-stage7-fortress-design.md
git commit -m "docs: 要塞化 段A の実測値を設計書に残す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: ユーザーへ引き渡す**

次を伝える:
- **ハードリロード（Cmd+Shift+R）が要る**（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため）
- **段Aだけではタイルの絵は岩のまま。** 人工物として見えるのは装甲（青）と硬い岩の帯、室の四隅の柱だけ
- 見てほしいところと調整用の定数の対応表（設計書の節6）
- 7面をすぐ見るには `main.js` の `debugStartMission` を 6 にする（**この値はユーザーのもの。こちらでコミットしない**）
