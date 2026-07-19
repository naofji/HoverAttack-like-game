# heavy/artillery 間合い・遮蔽スタイル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** heavy を140±30pxの間合い維持+整列回避に、artillery を200±40pxの間合い維持+遮蔽(視線切り)射撃に変更し、直線接近をなくす。

**Architecture:** movementType を既存未使用の `chase_and_jump`/`skirmish` に切替(Constants 2行)。rival の整列回避を `_updateAlignmentAvoidance()` に抽出して config フラグで heavy にも適用。artillery には skirmish 分岐の末尾で動く遮蔽探索 `_updateCoverSeek()` を新設(既存 `hasLineOfSight` 流用)。

**Tech Stack:** Vanilla JS (ES Modules), `node --test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-07-19-heavy-artillery-standoff-design.md`

## Global Constraints

- movementType: heavy=`'chase_and_jump'`(140±30px)、artillery=`'skirmish'`(200±40px)。`climbStyle: 'jump'` は不変
- config追加: heavy `avoidsAlignment: true, evadeDuration: 90`、rival `avoidsAlignment: true, evadeDuration: 40`、artillery `seeksCover: true`。`evadeDuration` 未設定は `RIVAL_EVADE_DURATION`(40)フォールバック
- 遮蔽定数: `ATTACKER_COVER_CHECK_INTERVAL=30`, `ATTACKER_COVER_SCAN_TILES=6`, `ATTACKER_COVER_MIN_DIST=160`
- 遮蔽候補条件: ①足場あり ②プレイヤー距離≥160px ③候補中心からプレイヤー中心への `hasLineOfSight` が false。候補なし/接近時(距離<160)は skirmish の挙動を上書きしない(後退優先)
- rival の挙動は等価リファクタのみ(既存整列回避テスト2本が回帰ガード)。standard・帰還・patrol は変更しない
- テスト実行: `node --test tests/attacker-return.test.js` / `npm test`(現在122/122)
- 既存テストの扱い: heavy の movementType 変更で「cliff系2本」「vertical pursuit 1本」が heavy=stop_and_shoot 前提。**実際に落ちたテストのみ**、生成直後に `e.config.movementType = 'stop_and_shoot';`(コメント付き)を挿入してメカニクステストとして固定する(アサート変更は禁止)

---

### Task 1: 設定変更(movementType/フラグ/定数)と既存テストの固定

**Files:**
- Modify: `src/js/utils/Constants.js`(`ATTACKER_CLIMB_MAX_RISE` 付近と `ENEMY_ATTACKER_TYPES`)
- Test: `tests/attacker-return.test.js`(設定テスト追記+必要なら既存テスト固定)

**Interfaces:**
- Produces: `ATTACKER_COVER_CHECK_INTERVAL`(30), `ATTACKER_COVER_SCAN_TILES`(6), `ATTACKER_COVER_MIN_DIST`(160)、config: `avoidsAlignment`(bool), `evadeDuration`(number), `seeksCover`(bool)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` の Constants import に `ATTACKER_COVER_CHECK_INTERVAL, ATTACKER_COVER_SCAN_TILES, ATTACKER_COVER_MIN_DIST` を追加し、末尾に追記:

```js
test('heavy/artillery standoff config matches the spec', () => {
  const t = ENEMY_ATTACKER_TYPES;
  assert.equal(t.heavy.movementType, 'chase_and_jump');
  assert.equal(t.heavy.avoidsAlignment, true);
  assert.equal(t.heavy.evadeDuration, 90);
  assert.equal(t.rival.avoidsAlignment, true);
  assert.equal(t.rival.evadeDuration, 40);
  assert.equal(t.artillery.movementType, 'skirmish');
  assert.equal(t.artillery.seeksCover, true);
  assert.equal(ATTACKER_COVER_CHECK_INTERVAL, 30);
  assert.equal(ATTACKER_COVER_SCAN_TILES, 6);
  assert.equal(ATTACKER_COVER_MIN_DIST, 160);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: FAIL(import エラー)

- [ ] **Step 3: 定数・configを実装**

`Constants.js` — `ATTACKER_BOOST_MAX_FRAMES` の行の直後に追加:

```js
// --- Artillery cover-seeking ---
export const ATTACKER_COVER_CHECK_INTERVAL = 30; // frames between line-of-sight checks
export const ATTACKER_COVER_SCAN_TILES = 6;      // cover candidate scan range (+/- tiles)
export const ATTACKER_COVER_MIN_DIST = 160;      // px: cover must keep at least this range
```

`ENEMY_ATTACKER_TYPES` を変更:

- `heavy`: `movementType: 'stop_and_shoot',` → `movementType: 'chase_and_jump',` とし、`climbStyle` の行の直後に `avoidsAlignment: true,` と `evadeDuration: 90,` を追加
- `rival`: `climbStyle` の行の直後に `avoidsAlignment: true,` と `evadeDuration: 40,` を追加
- `artillery`: `movementType: 'stop_and_shoot',` → `movementType: 'skirmish',` とし、`climbStyle` の行の直後に `seeksCover: true,` を追加

- [ ] **Step 4: 全テストを実行し、落ちた既存テストのみ固定**

Run: `npm test`

movementType 変更の影響で落ち得る既存テスト(`tests/attacker-return.test.js` 内):
1. `'chasing attacker does NOT walk off a ledge when the target is level with it'`
2. `'chasing attacker DOES drop down when the target is below'`
3. `'heavy attacker gains altitude when its target is 4+ tiles above'`

これらは heavy=stop_and_shoot を前提とした**メカニクス(崖抑制・垂直追従)のテスト**なので、実際に落ちたものだけ `makeAttacker(...)` の直後に以下を挿入して固定する(アサートは変更しない):

```js
  e.config.movementType = 'stop_and_shoot'; // pin: this test verifies mechanics, not heavy's persona
```

Expected: 全て PASS(123/123)

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/Constants.js tests/attacker-return.test.js
git commit -m "feat: heavy/artilleryのmovementType変更と間合い・遮蔽の設定を追加"
```

---

### Task 2: 整列回避の共通化と heavy への適用

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`(`_chaseTarget` の zigzag_chase 分岐冒頭 ~382-413行を抽出)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Consumes: Task 1 の `avoidsAlignment`/`evadeDuration` config
- Produces: `_updateAlignmentAvoidance(dx: number, dy: number, targetX: number): boolean` — 回避中は vx 等を設定して true を返す

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
test('heavy keeps its standoff distance instead of walking straight in', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(24, FLOOR_Y); // far left on the same floor
  const e = makeAttacker(game, 350, FLOOR_Y, 'heavy');

  let minAbsDx = Infinity;
  for (let i = 0; i < 900; i++) {
    e.update();
    const dx = Math.abs((game.player.x + 8) - (e.x + e.width / 2));
    minAbsDx = Math.min(minAbsDx, dx);
  }
  assert.ok(minAbsDx >= 60, `closed to ${minAbsDx}px — straight-line approach`);
  assert.ok(minAbsDx <= 200, `never engaged, minAbsDx=${minAbsDx}`);
});

test('heavy breaks Y-axis alignment within its evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(400, FLOOR_Y); // same height
  const e = makeAttacker(game, 100, FLOOR_Y, 'heavy');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 900; i++) {
    e.update();
    const dy = (game.player.y + 12) - (e.y + e.height / 2);
    if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + 90 + 20,
    `Y alignment persisted ${maxAlignedRun} frames`);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 整列回避テストが FAIL(heavy は chase_and_jump になったが回避レイヤー未適用で同高度が続く)。間合いテストは chase_and_jump だけで通る場合がある(それ自体は Task 1 の成果の回帰ガードとして有効)。

- [ ] **Step 3: ヘルパー抽出と共通適用**

`EnemyAttacker.js` — `_chaseTarget` の直前にメソッド追加(zigzag_chase 冒頭のブロックを移動し、`RIVAL_EVADE_DURATION` を config フォールバックに変更):

```js
/**
 * Alignment avoidance: never share the target's X or Y axis for long.
 * Returns true while an evade maneuver is driving the movement.
 */
_updateAlignmentAvoidance(dx, dy, targetX) {
    if (Math.abs(dx) < RIVAL_ALIGN_THRESHOLD) this.alignXFrames++; else this.alignXFrames = 0;
    if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) this.alignYFrames++; else this.alignYFrames = 0;

    if (this.evadeTimer <= 0 &&
        (this.alignXFrames > RIVAL_ALIGN_TRIGGER_FRAMES || this.alignYFrames > RIVAL_ALIGN_TRIGGER_FRAMES)) {
        const range = RIVAL_EVADE_OFFSET_MAX - RIVAL_EVADE_OFFSET_MIN;
        const offset = RIVAL_EVADE_OFFSET_MIN + Math.random() * range;
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.evadeGoalX = targetX + dir * offset;
        if (this.alignYFrames > RIVAL_ALIGN_TRIGGER_FRAMES) {
            // Break Y alignment: climb, or drop if airborne and the coin says so
            this.evadeVertical = (!this.onGround && Math.random() < 0.5) ? 1 : -1;
        } else {
            this.evadeVertical = 0;
        }
        this.evadeTimer = this.config.evadeDuration || RIVAL_EVADE_DURATION;
        this.alignXFrames = 0;
        this.alignYFrames = 0;
    }

    if (this.evadeTimer > 0) {
        this.evadeTimer--;
        const cx = this.x + this.width / 2;
        this.vx = this.evadeGoalX > cx ? this.maxSpeed : -this.maxSpeed;
        if (this.evadeVertical === -1) {
            if (this.onGround && this.jumpCooldown <= 0) this._jump();
            else if (!this.onGround) this._applyAerialThrust(-4.0);
        }
        // evadeVertical === +1: no thrust — gravity drops us out of alignment
        return true;
    }
    return false;
}
```

`_chaseTarget` の `const mType = ...` の直後に共通適用を追加:

```js
// Alignment avoidance (rival, heavy): overrides normal movement while evading
if (this.config.avoidsAlignment && this._updateAlignmentAvoidance(dx, dy, targetX)) {
    return;
}
```

`zigzag_chase` 分岐の冒頭にあった整列回避ブロック(`// --- Alignment avoidance ...` から `return; // skip normal zigzag movement while evading` を含む `if (this.evadeTimer > 0) {...}` まで)を**削除**(共通適用に移ったため)。

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(125 tests)。特に rival の既存整列回避テスト2本(`rival breaks X/Y-axis alignment ...`)が等価リファクタの回帰ガードとして通ること。

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: 整列回避を共通ヘルパー化しheavyにも適用"
```

---

### Task 3: artillery の遮蔽探索

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`(import、constructor、skirmish 分岐末尾、メソッド2つ追加)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Consumes: Task 1 の `seeksCover`/`ATTACKER_COVER_*` 定数、既存 `hasLineOfSight(x1,y1,x2,y2,map)`(`../utils/Physics.js`)
- Produces: `_updateCoverSeek(targetX: number, targetY: number): void`、`_findCoverX(targetX: number, targetY: number): number|null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` の import に追加: `import { hasLineOfSight } from '../src/js/utils/Physics.js';` と Constants からの `ATTACKER_COVER_MIN_DIST`(Task 1 で追加済みならそのまま)。末尾に追記:

```js
/**
 * 24x24: player platform (row 14, cols 0-4), a 2-tile pillar at col 12
 * (rows 18-19), full floor rows 20-23. From the right side the artillery
 * has clear LOS to the elevated player; spots just right of the pillar
 * break it.
 */
function coverWorldRows() {
  const rows = [];
  for (let r = 0; r < 14; r++) rows.push('.'.repeat(24));
  rows.push('#####' + '.'.repeat(19));                 // row 14 platform
  for (let r = 15; r < 18; r++) rows.push('.'.repeat(24));
  for (let r = 18; r < 20; r++) rows.push('.'.repeat(12) + '#' + '.'.repeat(11)); // pillar col 12
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('artillery moves to a spot where terrain blocks line of sight and holds it', () => {
  const game = makeGame(makeMap(coverWorldRows()));
  game.player = makePlayer(40, 14 * TILE_SIZE - 24); // on the platform
  const e = makeAttacker(game, 304, FLOOR_Y, 'artillery');

  for (let i = 0; i < 900; i++) e.update();

  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const px = game.player.x + 8;
  const py = game.player.y + 12;
  assert.equal(hasLineOfSight(cx, cy, px, py, game.map), false,
    `still exposed at x=${e.x}`);
  assert.ok(Math.abs(px - cx) >= ATTACKER_COVER_MIN_DIST - 8,
    `gave up its range, dx=${Math.abs(px - cx)}`);
});

test('artillery falls back to skirmish standoff on open ground', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(40, FLOOR_Y);
  const e = makeAttacker(game, 340, FLOOR_Y, 'artillery');

  for (let i = 0; i < 900; i++) e.update();

  const dx = Math.abs((game.player.x + 8) - (e.x + e.width / 2));
  assert.ok(dx >= 120 && dx <= 300, `standoff broken, dx=${dx}`);
});

test('artillery retreats when the player gets too close, even from cover', () => {
  const game = makeGame(makeMap(coverWorldRows()));
  game.player = makePlayer(40, 14 * TILE_SIZE - 24);
  const e = makeAttacker(game, 304, FLOOR_Y, 'artillery');
  for (let i = 0; i < 900; i++) e.update(); // settle into cover

  // Player hops down right next to the artillery
  game.player.x = e.x - 100;
  game.player.y = FLOOR_Y;
  const before = Math.abs((game.player.x + 8) - (e.x + e.width / 2));
  for (let i = 0; i < 300; i++) e.update();
  const after = Math.abs((game.player.x + 8) - (e.x + e.width / 2));
  assert.ok(after > before, `did not retreat: before=${before}, after=${after}`);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 遮蔽テスト(1本目)が FAIL(現状の skirmish は距離だけ取り、視線が通る位置に留まる)。2・3本目は skirmish だけでも通り得る(回帰ガード)。

- [ ] **Step 3: 遮蔽探索を実装**

import(`Physics.js` からの既存importに `hasLineOfSight` を追加、Constants importに `ATTACKER_COVER_CHECK_INTERVAL, ATTACKER_COVER_SCAN_TILES, ATTACKER_COVER_MIN_DIST` を追加)。

constructor の `this.evadeVertical = 0;` の直後に追加:

```js
// Artillery cover-seeking state
this.coverCheckTimer = 0;
this.coverGoalX = null;
this.inCover = false;
```

`_chaseTarget` の `skirmish` 分岐の末尾(垂直サポートの `if (this.onGround) {...} else {...}` の直後、分岐の閉じ括弧の直前)に追加:

```js
if (this.config.seeksCover) {
    this._updateCoverSeek(targetX, targetY);
}
```

`_updateAlignmentAvoidance` の直後にメソッド2つを追加:

```js
/** Artillery: hold a position where terrain blocks the target's line of sight. */
_updateCoverSeek(targetX, targetY) {
    const map = this.game.map;
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    if (Math.abs(targetX - cx) < ATTACKER_COVER_MIN_DIST) {
        // Too close: let skirmish's retreat drive the movement
        this.coverGoalX = null;
        this.inCover = false;
        return;
    }

    this.coverCheckTimer--;
    if (this.coverCheckTimer <= 0) {
        this.coverCheckTimer = ATTACKER_COVER_CHECK_INTERVAL;
        if (!hasLineOfSight(cx, cy, targetX, targetY, map)) {
            this.inCover = true;
            this.coverGoalX = null;
        } else {
            this.inCover = false;
            this.coverGoalX = this._findCoverX(targetX, targetY);
        }
    }

    if (this.inCover) {
        this.vx = 0; // hold the sniping spot
    } else if (this.coverGoalX !== null) {
        if (Math.abs(this.coverGoalX - cx) <= 4) {
            this.coverGoalX = null; // arrived — next check confirms cover
        } else {
            this.vx = this.coverGoalX > cx ? this.maxSpeed : -this.maxSpeed;
        }
    }
    // No cover found: leave skirmish pacing untouched
}

/** Scan +/-ATTACKER_COVER_SCAN_TILES for the nearest LOS-breaking spot with ground and range. */
_findCoverX(targetX, targetY) {
    const map = this.game.map;
    const cy = this.y + this.height / 2;
    const feetY = this.y + this.height + 4;
    const cx = this.x + this.width / 2;

    for (let t = 1; t <= ATTACKER_COVER_SCAN_TILES; t++) {
        for (const dir of [-1, 1]) {
            const candX = cx + dir * t * TILE_SIZE;
            if (!map.isSolidAtPixel(candX, feetY)) continue;                    // needs ground
            if (Math.abs(targetX - candX) < ATTACKER_COVER_MIN_DIST) continue;  // keep range
            if (hasLineOfSight(candX, cy, targetX, targetY, map)) continue;     // must break LOS
            return candX;
        }
    }
    return null;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(128 tests)。幾何の目安: artillery(中心x≈312)からプレイヤー(中心 48,212)への視線は柱(col12, rows18-19)の上を通って露出。走査候補 232px 付近(柱の右5タイル)で視線が row18 の柱にかかり遮蔽成立、そこへ歩いて `inCover` で停止する。

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS(128/128)

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: artilleryに遮蔽探索(視線切り射撃)を追加"
```

---

### Task 4: 実機確認(ユーザー実施)

**Files:** なし

- [ ] ユーザーにチェックポイントを提示して引き渡す:
  - heavy が140px前後の間合いをキープし、同じ高さが続くとジャンプ等で軸を外す(直進してこない)
  - artillery が距離を取りつつ、地形の陰(視線が切れる位置)に隠れて誘導ミサイルを撃ってくる
  - artillery に近づくと後退する
  - 平地では artillery は200px前後の距離維持にフォールバック
  - rival の動きが以前と変わっていない
