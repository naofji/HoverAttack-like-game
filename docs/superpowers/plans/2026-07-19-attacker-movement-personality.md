# アタッカー移動個性の差別化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アタッカー4タイプに空中移動の個性を与える — heavy/artilleryは歩行主体で浮かない、standardはジャンプ+短時間ブースト、rivalのみホバー多用+プレイヤーと軸が揃わない回避機動。1段の段差は全タイプ歩いて登る。

**Architecture:** 各タイプのconfigに `climbStyle`('jump'/'boost'/'hover')を追加し、5箇所に重複しているホバー推力処理を単一ヘルパー `_applyAerialThrust(riseCap)` に統合してスタイルを一元解釈する。ステップアップは `Player.js` の既存ロジックを `EnemyAttacker._moveAndCollide()` に移植。rival回避は `zigzag_chase` 分岐に整列カウンタ+回避タイマーの層を追加。

**Tech Stack:** Vanilla JS (ES Modules), `node --test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-07-19-attacker-movement-personality-design.md`

## Global Constraints

- ワープ・瞬間移動は禁止(ステップアップの1タイル=16pxスナップは例外として許容。既存の no-warp テストは `< TILE_SIZE` 判定でありステップアップが発生しない地形なので影響なし)
- climbStyle: heavy/artillery=`'jump'`(vy<0時のみ推力、上昇上限 `ATTACKER_SLOW_RISE_CAP`=-1.5 — 絶対に浮かない・落下を反転しない)、standard=`'boost'`(vy<0時のみ、1空中レグ `ATTACKER_BOOST_MAX_FRAMES`=20フレームまで)、rival=`'hover'`(従来どおり)
- 帰還・垂直追従・既存3分岐すべてで `_applyAerialThrust` を使用。ジャンプ初速維持ガード(`vy <= cap` なら推力なし)はヘルパー内に一元化
- rival回避定数: `RIVAL_ALIGN_THRESHOLD`=24, `RIVAL_ALIGN_TRIGGER_FRAMES`=45, `RIVAL_EVADE_OFFSET_MIN`=60, `RIVAL_EVADE_OFFSET_MAX`=120, `RIVAL_EVADE_DURATION`=40
- 各呼び出し箇所の上昇速度上限は現行値を維持(skirmish -3.0、その他 -4.0/`ATTACKER_CLIMB_MAX_RISE`)
- プレイヤー・他敵種・BFS・スポーン位置は変更しない
- テスト実行: `node --test tests/attacker-return.test.js`(集中)、`npm test`(全体)。現在100/100

---

### Task 1: 定数と climbStyle の追加

**Files:**
- Modify: `src/js/utils/Constants.js`(`ATTACKER_CLIMB_MAX_RISE` の直後、および `ENEMY_ATTACKER_TYPES` 各タイプ)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Produces: `ATTACKER_SLOW_RISE_CAP`, `ATTACKER_BOOST_MAX_FRAMES`, `RIVAL_ALIGN_THRESHOLD`, `RIVAL_ALIGN_TRIGGER_FRAMES`, `RIVAL_EVADE_OFFSET_MIN`, `RIVAL_EVADE_OFFSET_MAX`, `RIVAL_EVADE_DURATION`(number, export const)、各 `ENEMY_ATTACKER_TYPES[*].climbStyle`(string)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` の既存import(Constants から)に `ATTACKER_SLOW_RISE_CAP, ATTACKER_BOOST_MAX_FRAMES, RIVAL_ALIGN_THRESHOLD, RIVAL_ALIGN_TRIGGER_FRAMES, RIVAL_EVADE_OFFSET_MIN, RIVAL_EVADE_OFFSET_MAX, RIVAL_EVADE_DURATION` を追加し、ファイル末尾にテストを追記:

```js
test('movement personality constants match the spec', () => {
  assert.equal(ATTACKER_SLOW_RISE_CAP, -1.5);
  assert.equal(ATTACKER_BOOST_MAX_FRAMES, 20);
  assert.equal(RIVAL_ALIGN_THRESHOLD, 24);
  assert.equal(RIVAL_ALIGN_TRIGGER_FRAMES, 45);
  assert.equal(RIVAL_EVADE_OFFSET_MIN, 60);
  assert.equal(RIVAL_EVADE_OFFSET_MAX, 120);
  assert.equal(RIVAL_EVADE_DURATION, 40);
});

test('every attacker type has the spec climbStyle', () => {
  const expected = { standard: 'boost', heavy: 'jump', rival: 'hover', artillery: 'jump' };
  for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.equal(type.climbStyle, expected[key], `climbStyle of ${key}`);
  }
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: FAIL(`ATTACKER_SLOW_RISE_CAP` が export されていない SyntaxError)

- [ ] **Step 3: 定数を実装**

`src/js/utils/Constants.js` — `ATTACKER_CLIMB_MAX_RISE` の行の直後に追加:

```js
export const ATTACKER_SLOW_RISE_CAP = -1.5;  // 'jump' climbStyle ascent cap (slow rise)
export const ATTACKER_BOOST_MAX_FRAMES = 20; // 'boost' climbStyle thrust frames per airborne leg

// --- Rival alignment avoidance ---
export const RIVAL_ALIGN_THRESHOLD = 24;      // px: closer than this on an axis = aligned
export const RIVAL_ALIGN_TRIGGER_FRAMES = 45; // aligned this long -> evade
export const RIVAL_EVADE_OFFSET_MIN = 60;     // px: evade goal offset from target (min)
export const RIVAL_EVADE_OFFSET_MAX = 120;    // px: evade goal offset from target (max)
export const RIVAL_EVADE_DURATION = 40;       // frames an evade maneuver lasts
```

`ENEMY_ATTACKER_TYPES` の各タイプ、`climbThrust` の行の直後に追加:

- `standard`: `climbStyle: 'boost',`
- `heavy`: `climbStyle: 'jump',`
- `rival`: `climbStyle: 'hover',`
- `artillery`: `climbStyle: 'jump',`

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/Constants.js tests/attacker-return.test.js
git commit -m "feat: climbStyleとrival回避・ブースト定数を追加"
```

---

### Task 2: `_applyAerialThrust` ヘルパーと5箇所の統合

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`(import、constructor、`update()` の燃料回復部、`_climbToward`、`_chaseTarget` 内の4箇所)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Consumes: Task 1 の `ATTACKER_SLOW_RISE_CAP`, `ATTACKER_BOOST_MAX_FRAMES`, config の `climbStyle`
- Produces: `_applyAerialThrust(riseCap: number): boolean` — climbStyle を解釈し hovering/vy/hoverFuel/boostFrames を更新。推力を適用したら true。空中でのみ呼ぶこと。フィールド `this.boostFrames`(number)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
test("'jump' style never thrusts while falling (heavy cannot float)", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy'); // in the air, well above floor
  e.vy = 2.0; // falling
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, false);
  assert.equal(e.hovering, false);
  assert.equal(e.vy, 2.0);
});

test("'jump' style thrusts during ascent but stays above the slow-rise cap", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy');
  e.onGround = false;
  e.vy = -1.0; // ascending slower than the cap
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, true);
  // heavy climbThrust 0.45: -1.0 - 0.45 = -1.45, still above the -1.5 cap
  assert.ok(e.vy >= ATTACKER_SLOW_RISE_CAP && e.vy < -1.0, `vy=${e.vy}`);
});

test("'jump' style clamps to the slow-rise cap exactly", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy');
  e.onGround = false;
  e.vy = -1.4; // -1.4 - 0.45 = -1.85 -> clamped to -1.5
  e._applyAerialThrust(-4.0);
  assert.equal(e.vy, ATTACKER_SLOW_RISE_CAP);
});

test("'boost' style stops after ATTACKER_BOOST_MAX_FRAMES per airborne leg", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'standard');
  e.onGround = false;
  let appliedCount = 0;
  for (let i = 0; i < 60; i++) {
    e.vy = -0.5; // keep it ascending so only the frame budget limits thrust
    if (e._applyAerialThrust(-4.0)) appliedCount++;
  }
  assert.equal(appliedCount, ATTACKER_BOOST_MAX_FRAMES);
});

test("'hover' style thrusts even while falling (rival floats)", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'rival');
  e.onGround = false;
  e.vy = 2.0; // falling
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, true);
  assert.equal(e.hovering, true);
  assert.ok(e.vy < 2.0);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 新テストが FAIL(`_applyAerialThrust is not a function`)。テスト数は5本追加(no-float / ascent-thrust / clamp / boost上限 / hover-float)

- [ ] **Step 3: ヘルパーを実装し、5箇所を置換**

`src/js/entities/EnemyAttacker.js` の import に `ATTACKER_SLOW_RISE_CAP, ATTACKER_BOOST_MAX_FRAMES` を追加(Constants.js から。`ATTACKER_CLIMB_MAX_RISE` と同じimport文)。

constructor の `this.currentTarget = null;` の直後に追加:

```js
this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;
```

`update()` の燃料回復ブロックを変更(接地でブースト予算もリセット):

```js
// --- Hover Fuel Recovery ---
if (this.onGround) {
    this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
    this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;
}
```

`_climbToward` の直前(または直後)にヘルパーを追加:

```js
/**
 * Apply one frame of aerial thrust according to this type's climbStyle.
 * 'jump'  — only extends an ascent (vy < 0), capped at ATTACKER_SLOW_RISE_CAP: never floats.
 * 'boost' — only during ascent, at most ATTACKER_BOOST_MAX_FRAMES per airborne leg.
 * 'hover' — free thrust (may reverse a fall). Call only while airborne.
 * @returns {boolean} true if thrust was applied this frame
 */
_applyAerialThrust(riseCap) {
    if (this.hoverFuel <= 0) return false;

    const style = this.config.climbStyle || 'hover';
    let cap = riseCap;
    if (style === 'jump') {
        if (this.vy >= 0) return false;
        cap = Math.max(cap, ATTACKER_SLOW_RISE_CAP);
    } else if (style === 'boost') {
        if (this.vy >= 0 || this.boostFrames <= 0) return false;
    }
    if (this.vy <= cap) return false; // preserve jump impulse / already at cap

    if (style === 'boost') this.boostFrames--;
    this.hovering = true;
    this.vy -= this.config.climbThrust;
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < cap) this.vy = cap;
    return true;
}
```

5箇所の置換(現行コード→置換後):

(1) `_climbToward` の空中分岐:

```js
} else if (below && this.hoverFuel > 0 && this.vy > ATTACKER_CLIMB_MAX_RISE) {
    this.hovering = true;
    this.vy -= this.config.climbThrust;
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
}
```

→

```js
} else if (below) {
    this._applyAerialThrust(ATTACKER_CLIMB_MAX_RISE);
}
```

(2) `_chaseTarget` の `chase_and_jump` 空中分岐:

```js
// Airborne: hover if player is above or to stay in the air while skirmishing
if (this.hoverFuel > 0 && (dy < -8 || (this.vy > 0 && Math.random() * 1.5 < 0.1))) {
    this.hovering = true;
    this.vy -= this.config.climbThrust; // Hover upward thrust
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < -4.0) this.vy = -4.0;
}
```

→

```js
// Airborne: hover if player is above or to stay in the air while skirmishing
if (dy < -8 || (this.vy > 0 && Math.random() * 1.5 < 0.1)) {
    this._applyAerialThrust(-4.0);
}
```

(3) `skirmish` 空中分岐:

```js
// Use hover to stay at a certain height or prolong jumps
if (this.hoverFuel > 0 && (dy < -16 || (this.vy > 0 && Math.random() < 0.05))) {
    this.hovering = true;
    this.vy -= this.config.climbThrust;
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < -3.0) this.vy = -3.0;
}
```

→

```js
// Use hover to stay at a certain height or prolong jumps
if (dy < -16 || (this.vy > 0 && Math.random() < 0.05)) {
    this._applyAerialThrust(-3.0);
}
```

(4) `zigzag_chase` 空中分岐:

```js
if (this.hoverFuel > 0 && (dy < -8 || Math.random() < 0.1)) {
    this.hovering = true;
    this.vy -= this.config.climbThrust;
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < -4.0) this.vy = -4.0;
}
```

→

```js
if (dy < -8 || Math.random() < 0.1) {
    this._applyAerialThrust(-4.0);
}
```

(5) 垂直追従ブロックの空中分岐:

```js
} else if (this.hoverFuel > 0 && this.vy > ATTACKER_CLIMB_MAX_RISE) {
    this.hovering = true;
    this.vy -= this.config.climbThrust;
    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
    if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
}
```

→

```js
} else {
    this._applyAerialThrust(ATTACKER_CLIMB_MAX_RISE);
}
```

- [ ] **Step 4: テストが通ることを確認(既存シムテスト含む)**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(17 tests)。特に既存の「heavy attacker climbs an 8-tile step」は heavy が 'jump' スタイルになっても通ること(ジャンプ初速-5.0の後、vy<0 の間 -1.5 のゆっくり上昇を燃料が続く限り継続するため、登坂能力自体は残る)。通らない場合はフレーム数上限 3600 → 5400 への緩和のみ許可(それ以外のアサート変更は禁止。登れない場合は実装のバグ)。

同様に「gains altitude when its target is 4+ tiles above」(heavy) も slow-rise で3タイルは登れるため通るはず。

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: climbStyle対応の_applyAerialThrustを導入しホバー処理5箇所を統合"
```

---

### Task 3: ステップアップ(1段は歩いて登る)

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`(`_moveAndCollide()` の水平衝突ブロック)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Consumes: なし(独立)
- Produces: なし(挙動変更のみ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
/** Flat floor at row 20 with a single 1-tile step up at col 12 (top at row 19). */
function oneStepWorldRows() {
  const rows = [];
  for (let r = 0; r < 19; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 19: raised floor right half
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('walks up a 1-tile step without jumping', () => {
  const game = makeGame(makeMap(oneStepWorldRows()));
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.homeX = 18 * TILE_SIZE;            // walk right, over the step
  e.homeY = 19 * TILE_SIZE - 24;       // standing on the raised floor
  e.returning = true;

  let minVy = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    minVy = Math.min(minVy, e.vy);
    if (e.x > 14 * TILE_SIZE) break;   // crossed the step
  }

  assert.ok(e.x > 13 * TILE_SIZE, `should cross the step, x=${e.x}`);
  assert.equal(e.y, 19 * TILE_SIZE - 24, 'standing on the raised floor');
  assert.ok(minVy > -3.0, `must not jump (jumpForce is -5.0), minVy=${minVy}`);
});

test('still jumps at a 2-tile wall', () => {
  const rows = [];
  for (let r = 0; r < 18; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 18
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 19 (2-tile wall)
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  const game = makeGame(makeMap(rows));
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.homeX = 18 * TILE_SIZE;
  e.homeY = 18 * TILE_SIZE - 24;
  e.returning = true;

  let minVy = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    minVy = Math.min(minVy, e.vy);
  }
  assert.ok(minVy <= -4.0, `should have jumped at the wall, minVy=${minVy}`);
});
```

注意: `e.returning = true` を直接セットしても `update()` 冒頭の `_updateReturnState()` が完了条件(両軸2タイル以内)で解除しうる。homeX を遠く(18タイル先)に置いているので水平距離>32pxの間は解除されない。ただし帰還発動条件も満たさないため、`_updateReturnState` はヒステリシス(`returning` 維持)により `true` のまま — 発動条件(6タイル下 or 水平20タイル)を満たしていなくても、一度 `returning=true` なら完了条件まで維持される実装であることに依存している。これは既存テスト「4 tiles below home: ... returning attacker keeps returning (hysteresis)」で保証済み。

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 「walks up a 1-tile step without jumping」が FAIL(現状は壁衝突→`_jump()` で `minVy = -5.0` になる)

- [ ] **Step 3: ステップアップを実装**

`_moveAndCollide()` の水平衝突ブロックを変更。現行:

```js
let hitHMap = false;
if (this._collidesWithMap()) {
    hitHMap = true;
    this.x -= this.vx;
```

→ 衝突判定の直後、`hitHMap = true` の前にステップアップ試行を挿入(`Player.js:209-220` と同じ方式):

```js
let hitHMap = false;
if (this._collidesWithMap()) {
    // STEP-UP: walk up a single tile instead of jumping (matches Player)
    let steppedUp = false;
    if (this.onGround && Math.abs(this.vx) > 0) {
        const originalY = this.y;
        this.y -= TILE_SIZE;
        if (!this._collidesWithMap()) {
            steppedUp = true;
        } else {
            this.y = originalY;
        }
    }

    if (!steppedUp) {
        hitHMap = true;
        this.x -= this.vx;
```

(以降の既存コード — 位置スナップ、`vx = 0`、壁ジャンプ/反転 — は `if (!steppedUp) { ... }` で包む。ブロックの閉じ括弧を1つ追加することを忘れない)

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(19 tests)。既存の8タイル登坂シムは壁上部が塞がっているためステップアップは発動せず、従来どおり通ること。

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: アタッカーが1段の段差を歩いて登れるように(ステップアップ移植)"
```

---

### Task 4: rival の整列回避(軸ずらし)

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`(import、constructor、`_chaseTarget` の `zigzag_chase` 分岐)
- Test: `tests/attacker-return.test.js`(追記)

**Interfaces:**
- Consumes: Task 1 の `RIVAL_*` 定数、Task 2 の `_applyAerialThrust`
- Produces: フィールド `alignXFrames`, `alignYFrames`, `evadeTimer`, `evadeGoalX`, `evadeVertical`(number)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
test('rival breaks X-axis alignment within the evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(64, 60); // directly ABOVE the rival (same X, far in Y)
  const e = makeAttacker(game, 64, FLOOR_Y, 'rival');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    const dx = (game.player.x + 8) - (e.x + e.width / 2);
    if (Math.abs(dx) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + RIVAL_EVADE_DURATION + 20,
    `X alignment persisted ${maxAlignedRun} frames`);
});

test('rival breaks Y-axis alignment within the evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(280, FLOOR_Y); // same height, to the right
  const e = makeAttacker(game, 64, FLOOR_Y, 'rival');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    const dy = (game.player.y + 12) - (e.y + e.height / 2);
    if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + RIVAL_EVADE_DURATION + 20,
    `Y alignment persisted ${maxAlignedRun} frames`);
});
```

注意: zigzag_chase は `Math.random()` を使うが、このテストは「整列の連続フレーム数が 発動閾値45+回避40+マージン20 を超えない」というランダム性に強い性質のみを検証する。X整列テストのプレイヤーは真上(远いY)なので Y整列は起きず、X回避のストレイフだけが検証される。

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 少なくともY整列テストが FAIL(現状は同高度で足踏み・接近を続け整列が続く)。X整列テストが偶然通る場合もある(zigzagの揺れ)が、Y側で必ず現状の欠落が露呈する。両方通ってしまった場合は実装なしで通る=テスト不良なので、閾値マージン(+20)を減らして再確認する。

- [ ] **Step 3: 回避レイヤーを実装**

import に `RIVAL_ALIGN_THRESHOLD, RIVAL_ALIGN_TRIGGER_FRAMES, RIVAL_EVADE_OFFSET_MIN, RIVAL_EVADE_OFFSET_MAX, RIVAL_EVADE_DURATION` を追加。

constructor の `this.boostFrames = ...` の直後に追加:

```js
// Rival alignment-avoidance state
this.alignXFrames = 0;
this.alignYFrames = 0;
this.evadeTimer = 0;
this.evadeGoalX = 0;
this.evadeVertical = 0; // -1 = go up, +1 = drop, 0 = horizontal only
```

`_chaseTarget` の `zigzag_chase` 分岐の先頭(`const absDx = ...` の前)に挿入:

```js
// --- Alignment avoidance: never share the target's X or Y axis for long ---
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
    this.evadeTimer = RIVAL_EVADE_DURATION;
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
    return; // skip normal zigzag movement while evading
}
```

(この `return` は `_chaseTarget` を抜けるが、垂直追従ブロックは `stop_and_shoot`/`pace_and_jump` 専用なので rival には影響しない)

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS(21 tests)

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: rivalに整列回避(軸ずらし)機動を追加"
```

---

### Task 5: 実機確認(ユーザー実施)

**Files:** なし

- [ ] ユーザーにチェックポイントを提示して引き渡す:
  - heavy/artillery が空中で浮かない(ジャンプ+ゆっくり上昇のみ)
  - standard のジャンプ+短時間ブースト感
  - rival だけがホバーで飛び回り、プレイヤーと同X/同Yに留まらない
  - 1段の段差を全タイプ歩いて登る(ジャンプしない)
  - 帰還がタイプごとのスタイルで行われる(heavyは時間がかかってよい)
