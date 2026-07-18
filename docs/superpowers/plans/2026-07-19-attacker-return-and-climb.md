# アタッカー帰還AI + ホバー登坂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アタッカーがマップ下部に溜まるラチェット構造を解消する — 非戦闘時はスポーン地点へホバー登坂で帰還し、戦闘時は崖降下を抑制しつつ垂直追従できるようにする。

**Architecture:** `EnemyAttacker` にスポーン座標の記憶(`homeX/homeY`)と第3のAIステート `'return'` を追加。登坂は既存のホバー燃料機構を使う共通ヘルパー `_climbToward()` で行い、return と chase中の垂直追従の両方から呼ぶ。ワープなし・既存物理準拠。

**Tech Stack:** Vanilla JS (ES Modules), `node --test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-07-19-attacker-return-and-climb-design.md`

## Global Constraints

- ワープ・瞬間移動は禁止。既存物理(GRAVITY=0.30, ホバー燃料)の範囲で移動する
- 帰還開始: 持ち場より 6タイル(96px)下 or 水平20タイル(320px)。完了: 両軸2タイル(32px)以内
- climbThrust: standard 0.55 / heavy 0.45 / rival 0.65 / artillery 0.5
- 他の敵種(タンク・ドローン・タレット)、スポーン位置、BFS経路探索は変更しない
- テストは既存スタイル(`tests/*.test.js`, `import { test } from 'node:test'`)。実行: `npm test` または `node --test tests/<file>`

---

### Task 1: 定数追加(climbThrust + 帰還閾値)

**Files:**
- Modify: `src/js/utils/Constants.js` (ホバー定数群の直後 ~44行付近、および `ENEMY_ATTACKER_TYPES` 各タイプ)
- Test: `tests/attacker-return.test.js` (新規)

**Interfaces:**
- Produces: `ATTACKER_RETURN_TRIGGER_Y`, `ATTACKER_RETURN_TRIGGER_X`, `ATTACKER_RETURN_DONE`, `ATTACKER_CLIMB_MIN_FUEL`, `ATTACKER_CLIMB_MAX_RISE` (number, export const), 各 `ENEMY_ATTACKER_TYPES[*].climbThrust` (number)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE, ENEMY_ATTACKER_TYPES,
  ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
  ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE
} from '../src/js/utils/Constants.js';

test('return thresholds match the spec', () => {
  assert.equal(ATTACKER_RETURN_TRIGGER_Y, 6 * TILE_SIZE);
  assert.equal(ATTACKER_RETURN_TRIGGER_X, 20 * TILE_SIZE);
  assert.equal(ATTACKER_RETURN_DONE, 2 * TILE_SIZE);
  assert.ok(ATTACKER_CLIMB_MIN_FUEL > 0);
  assert.ok(ATTACKER_CLIMB_MAX_RISE < 0);
});

test('every attacker type has a climbThrust that beats gravity', () => {
  const expected = { standard: 0.55, heavy: 0.45, rival: 0.65, artillery: 0.5 };
  for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.equal(type.climbThrust, expected[key], `climbThrust of ${key}`);
    assert.ok(type.climbThrust > 0.30, `${key} must out-thrust GRAVITY`);
  }
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: FAIL (`ATTACKER_RETURN_TRIGGER_Y` が export されていない SyntaxError)

- [ ] **Step 3: 定数を実装**

`src/js/utils/Constants.js` — `HOVER_FUEL_RECOVERY_BOOST` の行の直後に追加:

```js
// --- Attacker return-home & climbing ---
export const ATTACKER_RETURN_TRIGGER_Y = 6 * TILE_SIZE;  // start returning when this far BELOW home
export const ATTACKER_RETURN_TRIGGER_X = 20 * TILE_SIZE; // or this far horizontally from home
export const ATTACKER_RETURN_DONE = 2 * TILE_SIZE;       // back home when within this distance (both axes)
export const ATTACKER_CLIMB_MIN_FUEL = 40;               // fuel needed before a climb take-off
export const ATTACKER_CLIMB_MAX_RISE = -4.0;             // upward speed cap while climbing
```

`ENEMY_ATTACKER_TYPES` の各タイプに `climbThrust` を追加(`movementType` の行の直後):

- `standard`: `climbThrust: 0.55,`
- `heavy`: `climbThrust: 0.45,`
- `rival`: `climbThrust: 0.65,`
- `artillery`: `climbThrust: 0.5,`

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/Constants.js tests/attacker-return.test.js
git commit -m "feat: アタッカーの帰還閾値とclimbThrust定数を追加"
```

---

### Task 2: テストヘルパー + 持ち場記憶と'return'ステート判定

**Files:**
- Create: `tests/helpers/enemy-world.js`
- Modify: `src/js/entities/EnemyAttacker.js` (constructor ~59行, update() のAI判定 ~70行, AIR_FRICTION条件 ~84行)
- Test: `tests/attacker-return.test.js` (追記)

**Interfaces:**
- Consumes: Task 1 の `ATTACKER_RETURN_*` 定数
- Produces:
  - `tests/helpers/enemy-world.js`: `makeMap(rows: string[]) => map`(`isSolid(r,c)`, `isSolidAtPixel(x,y)`, `pixelToTile(x,y)`, `rows`, `cols` を持つ。`'#'`=solid、範囲外はsolid)、`makeGame(map) => game`(EnemyAttacker が触る全プロパティのモック)、`makeAttacker(game, x, y, typeKey) => EnemyAttacker`(fireInterval を 1e9 に上書きして射撃を無効化)
  - `EnemyAttacker`: `homeX`, `homeY`, `returning` (boolean), `currentTarget`, `aiState` が `'return'` を取り得る

- [ ] **Step 1: ヘルパーを作成**

`tests/helpers/enemy-world.js`:

```js
// Minimal world mocks for EnemyAttacker simulation tests
import { TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../../src/js/utils/Constants.js';
import { EnemyAttacker } from '../../src/js/entities/EnemyAttacker.js';

/** Build a map mock from ASCII rows ('#' = solid). Out of bounds is solid. */
export function makeMap(rows) {
  const grid = rows.map((s) => s.split(''));
  return {
    rows: grid.length,
    cols: grid[0].length,
    isSolid(r, c) {
      if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return true;
      return grid[r][c] === '#';
    },
    isSolidAtPixel(x, y) {
      return this.isSolid(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    },
    pixelToTile(x, y) {
      return { r: Math.floor(y / TILE_SIZE), c: Math.floor(x / TILE_SIZE) };
    },
  };
}

/** Game mock with every property EnemyAttacker touches. */
export function makeGame(map) {
  return {
    map,
    player: null,
    carrier: null,
    enemies: [],
    projectiles: [],
    enemyBullets: [],
    missileKits: [],
    repairKits: [],
    autoAimUnits: [],
    rng: { next: () => Math.random() },
    spawnSparks() {},
    spawnExplosion() {},
    addScore() {},
  };
}

/** Attacker with shooting disabled (huge fireInterval) for deterministic sims. */
export function makeAttacker(game, x, y, typeKey = 'heavy') {
  const config = { ...ENEMY_ATTACKER_TYPES[typeKey], fireInterval: 1e9 };
  const e = new EnemyAttacker(game, x, y, config);
  game.enemies.push(e);
  return e;
}

/** A 24x24 world: open air above a flat floor at row 20. */
export function flatFloorRows() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';

const FLOOR_Y = 20 * TILE_SIZE - 24; // standing y on the row-20 floor = 296

test('attacker remembers its spawn point as home', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  assert.equal(e.homeX, 64);
  assert.equal(e.homeY, FLOOR_Y);
  assert.equal(e.returning, false);
});

test('drops 8 tiles below home -> enters return state', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  e.homeY = e.y - 8 * TILE_SIZE; // home is 8 tiles above (beyond the 6-tile trigger)
  e.update();
  assert.equal(e.aiState, 'return');
  assert.equal(e.returning, true);
});

test('4 tiles below home: fresh attacker stays patrol, returning attacker keeps returning (hysteresis)', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const fresh = makeAttacker(game, 64, FLOOR_Y);
  fresh.homeY = fresh.y - 4 * TILE_SIZE; // inside trigger(6) but outside done(2)
  fresh.update();
  assert.equal(fresh.aiState, 'patrol');

  const returning = makeAttacker(game, 200, FLOOR_Y);
  returning.homeY = returning.y - 8 * TILE_SIZE;
  returning.update();                      // enters return
  returning.homeY = returning.y - 4 * TILE_SIZE; // now only 4 tiles off
  returning.update();
  assert.equal(returning.aiState, 'return'); // sticky until within 2 tiles
});

test('within 2 tiles of home -> return completes, back to patrol', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  e.homeY = e.y - 8 * TILE_SIZE;
  e.update();                 // enters return
  e.homeX = e.x;
  e.homeY = e.y;              // teleport home for the state test only
  e.update();
  assert.equal(e.returning, false);
  assert.equal(e.aiState, 'patrol');
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 新規4テストが FAIL(`homeX` undefined / `aiState` が `'return'` にならない)

- [ ] **Step 4: EnemyAttacker に実装**

`src/js/entities/EnemyAttacker.js` の import に追加:

```js
import {
    TILE_SIZE, GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT,
    PLAYER_MAX_FALLING_SPEED,
    HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION, HOVER_FUEL_RECOVERY,
    MISSILE_SPEED, EXPLOSION_PARTICLE_COUNT,
    ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
    ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE
} from '../utils/Constants.js';
```

constructor の `this.jumpCooldown = 0;` の直後に追加:

```js
// Home position (spawn point) — the attacker returns here when displaced
this.homeX = x;
this.homeY = y;
this.returning = false;
this.currentTarget = null;
```

`update()` の AI state decision を置き換え:

```js
// --- AI state decision ---
this.currentTarget = target;
if (target && targetDist <= this.config.sightRange) {
    this.aiState = 'chase';
    this.returning = false;
} else {
    this._updateReturnState();
    this.aiState = this.returning ? 'return' : 'patrol';
}
```

`update()` 内の空中摩擦の条件を変更(return中の空中水平移動を殺さないため):

```js
if (!this.onGround && this.aiState === 'patrol') {
    this.vx *= AIR_FRICTION;
    if (Math.abs(this.vx) < 0.1) this.vx = 0;
}
```

`_patrol()` の直前にメソッド追加:

```js
/** Hysteresis: start returning when far below/away from home, stop when back. */
_updateReturnState() {
    const dxHome = this.homeX - this.x;
    const dyHome = this.homeY - this.y;
    if (!this.returning) {
        if (dyHome < -ATTACKER_RETURN_TRIGGER_Y || Math.abs(dxHome) > ATTACKER_RETURN_TRIGGER_X) {
            this.returning = true;
        }
    } else if (Math.abs(dxHome) <= ATTACKER_RETURN_DONE && Math.abs(dyHome) <= ATTACKER_RETURN_DONE) {
        this.returning = false;
    }
}
```

`_updateMovement()` に return 分岐を追加(この時点では `_patrol()` で代用、次タスクで `_climbToward` に差し替え):

```js
_updateMovement(target) {
    if (this.crouching || this.burstCount > 0) {
        this.vx = 0;
    } else if (this.aiState === 'chase') {
        this._chaseTarget(target);
    } else if (this.aiState === 'return') {
        this._patrol(); // placeholder — replaced by _climbToward in the next task
    } else {
        this._patrol();
    }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS (6 tests)。続けて `npm test` で既存テストにリグレッションがないことも確認。

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js tests/helpers/enemy-world.js
git commit -m "feat: アタッカーに持ち場記憶と'return'ステートを追加"
```

---

### Task 3: ホバー登坂 `_climbToward` と帰還移動

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js` (`_updateMovement` の return 分岐、`_patrol` 付近にメソッド追加)
- Test: `tests/attacker-return.test.js` (追記)

**Interfaces:**
- Consumes: Task 2 の `returning`/`homeX`/`homeY`、Task 1 の `ATTACKER_CLIMB_MIN_FUEL`/`ATTACKER_CLIMB_MAX_RISE`、config の `climbThrust`
- Produces: `_climbToward(targetX: number, targetY: number): void` — vx/vy/hovering/hoverFuel を更新する(Task 5 でも使用)

- [ ] **Step 1: 失敗するシミュレーションテストを書く**

`tests/attacker-return.test.js` に追記:

```js
/** 24x24 world: low floor (row 20) on the left, an 8-tile step (top row 12) on the right half. */
function stepWorldRows() {
  const rows = [];
  for (let r = 0; r < 12; r++) rows.push('.'.repeat(24));
  for (let r = 12; r < 20; r++) rows.push('.'.repeat(12) + '#'.repeat(12));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('heavy attacker climbs an 8-tile step back to its home (no warp)', () => {
  const game = makeGame(makeMap(stepWorldRows()));
  const e = makeAttacker(game, 48, FLOOR_Y, 'heavy');
  // Pretend it originally spawned on top of the step at col 16
  e.homeX = 16 * TILE_SIZE;              // 256
  e.homeY = 12 * TILE_SIZE - 24;         // 168 (standing on the step top)

  let prevY = e.y;
  let maxStepPerFrame = 0;
  for (let i = 0; i < 3600; i++) {
    e.update();
    maxStepPerFrame = Math.max(maxStepPerFrame, Math.abs(e.y - prevY));
    prevY = e.y;
    if (!e.returning && Math.abs(e.y - e.homeY) <= 2 * TILE_SIZE) break;
  }

  assert.ok(Math.abs(e.y - e.homeY) <= 2 * TILE_SIZE,
    `should be back near home height, got y=${e.y} home=${e.homeY}`);
  assert.ok(Math.abs(e.x - e.homeX) <= 3 * TILE_SIZE,
    `should be near homeX, got x=${e.x}`);
  assert.equal(e.returning, false);
  assert.ok(maxStepPerFrame < TILE_SIZE, 'no warp: per-frame movement stays under one tile');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 新テストが FAIL(パトロール代用のままでは登れずタイムアウト側の assert で失敗)

- [ ] **Step 3: `_climbToward` を実装**

`src/js/entities/EnemyAttacker.js` — `_updateReturnState()` の直後にメソッド追加:

```js
/**
 * Move toward (targetX, targetY) using walk + jump + hover thrust.
 * Climbs in legs: waits on the ground for fuel, ascends, falls to recover, repeats.
 */
_climbToward(targetX, targetY) {
    const dx = targetX - this.x;
    // Overshoot 8px so ledge lips can be cleared before thrust cuts out
    const below = this.y > targetY - 8;

    if (Math.abs(dx) > 8) {
        this.vx = dx > 0 ? this.maxSpeed : -this.maxSpeed;
    } else {
        this.vx = 0;
    }

    if (this.onGround) {
        // Wait on the ground until there is enough fuel for a climb leg
        if (below && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL && this.jumpCooldown <= 0) {
            this._jump();
        }
    } else if (below && this.hoverFuel > 0) {
        this.hovering = true;
        this.vy -= this.config.climbThrust;
        this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
        if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
    }
}
```

`_updateMovement()` の return 分岐を差し替え:

```js
} else if (this.aiState === 'return') {
    this._climbToward(this.homeX, this.homeY);
}
```

さらに `_moveAndCollide()` の Cliff check で、return 中は崖で反転しない(落下は許可 — 落ちても登坂で自己回復する)。既存の

```js
const isPatrolling = (this.aiState === 'patrol');
```

はそのまま利用でき、`isPatrolling` が false の return 中は既存コードの else 側(`pace_and_jump` 以外は素通り=落下)に入るため、このタスクでの追加変更は不要。

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS (7 tests)。`npm test` も全て PASS。

- [ ] **Step 5: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: ホバー登坂ヘルパーを実装し帰還ステートで段階登坂するように"
```

---

### Task 4: chase中の崖降下抑制

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js` (`_moveAndCollide()` の Cliff check ~492-514行)
- Test: `tests/attacker-return.test.js` (追記)

**Interfaces:**
- Consumes: Task 2 の `this.currentTarget`
- Produces: なし(挙動変更のみ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
/** Floor row 20 with a pit (cols 10-13, floor at row 22) between two ledges. */
function pitWorldRows() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 22; r++) rows.push('#'.repeat(10) + '....' + '#'.repeat(10));
  for (let r = 22; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

function makePlayer(x, y) {
  return { x, y, width: 16, height: 24, alive: true, docked: false };
}

test('chasing attacker does NOT walk off a ledge when the target is level with it', () => {
  const game = makeGame(makeMap(pitWorldRows()));
  game.player = makePlayer(16 * TILE_SIZE, FLOOR_Y); // same height, across the pit
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');

  for (let i = 0; i < 600; i++) e.update();

  assert.equal(e.aiState, 'chase');
  assert.equal(e.y, FLOOR_Y, 'stays on the upper floor');
  assert.ok(e.x + e.width <= 10 * TILE_SIZE + 1, 'stops at the ledge');
});

test('chasing attacker DOES drop down when the target is below', () => {
  const game = makeGame(makeMap(pitWorldRows()));
  game.player = makePlayer(11 * TILE_SIZE, 22 * TILE_SIZE - 24); // inside the pit
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');

  for (let i = 0; i < 600; i++) e.update();

  assert.ok(e.y > FLOOR_Y, 'followed the target down into the pit');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: 「level with it」のテストが FAIL(現状は崖から落ちて y > FLOOR_Y になる)

- [ ] **Step 3: Cliff check を書き換え**

`_moveAndCollide()` の Cliff check ブロック全体を以下に置き換え(probe方向も実移動方向 `vx` 基準に修正):

```js
// --- Cliff check ---
if (this.onGround && !hitHMap) {
    const mType = this.config.movementType;
    const moveDir = this.vx !== 0 ? Math.sign(this.vx) : this.patrolDir;

    const frontX = moveDir > 0
        ? this.x + this.width + 2
        : this.x - 2;
    const feetY = this.y + this.height + 4;

    if (!map.isSolidAtPixel(frontX, feetY)) {
        if (this.aiState === 'patrol') {
            this.patrolDir *= -1; // Reverse at edge when patrolling naturally
        } else if (this.aiState === 'chase') {
            const t = this.currentTarget;
            const targetBelow = t && (t.y > this.y + TILE_SIZE);
            if (!targetBelow) {
                // Don't ratchet downhill: hold the ledge unless the target is below
                this.x -= this.vx;
                this.vx = 0;
                this.patrolDir *= -1;
            } else if (mType === 'pace_and_jump') {
                if (this.jumpCooldown <= 0) this._jump(); // Jump over gap!
                else this.patrolDir *= -1;
            }
            // Other movement types: drop down toward the target below
        }
        // 'return': allow the drop — _climbToward recovers altitude afterwards
    }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS (9 tests)。`npm test` も全て PASS。

- [ ] **Step 5: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: 追跡中はターゲットが下にいる時だけ崖を降りるように"
```

---

### Task 5: chase中の垂直追従 + ホバー推力の一元化

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js` (`_chaseTarget()` ~184-324行)
- Test: `tests/attacker-return.test.js` (追記)

**Interfaces:**
- Consumes: Task 1 の `climbThrust`/`ATTACKER_CLIMB_MIN_FUEL`/`ATTACKER_CLIMB_MAX_RISE`
- Produces: なし(挙動変更のみ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-return.test.js` に追記:

```js
/** Flat floor at row 20 plus a thin platform at row 14 (cols 10-14). */
function platformWorldRows() {
  const rows = [];
  for (let r = 0; r < 14; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(10) + '#####' + '.'.repeat(9)); // row 14
  for (let r = 15; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('heavy attacker gains altitude when its target is 4+ tiles above', () => {
  const game = makeGame(makeMap(platformWorldRows()));
  game.player = makePlayer(12 * TILE_SIZE, 14 * TILE_SIZE - 24); // on the platform
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');

  let minY = e.y;
  for (let i = 0; i < 1200; i++) {
    e.update();
    minY = Math.min(minY, e.y);
  }

  assert.ok(minY < FLOOR_Y - 2 * TILE_SIZE,
    `should climb at least 2 tiles toward the target, minY=${minY}`);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: FAIL(heavy=`stop_and_shoot` はジャンプ1〜2タイル分しか上がれず minY が閾値に届かない…ジャンプで僅かに届く場合は閾値を `FLOOR_Y - 3 * TILE_SIZE` に上げて再確認)

- [ ] **Step 3: 垂直追従を実装し、既存ホバー推力を `climbThrust` に置換**

`_chaseTarget()` の末尾(全 mType 分岐の後)に追加:

```js
// --- Vertical pursuit for types without their own hover logic ---
if ((mType === 'stop_and_shoot' || mType === 'pace_and_jump') && dy < -32) {
    if (this.onGround) {
        if (this.jumpCooldown <= 0 && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL) {
            this._jump();
        }
    } else if (this.hoverFuel > 0) {
        this.hovering = true;
        this.vy -= this.config.climbThrust;
        this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
        if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
    }
}
```

既存分岐のハードコード推力を `this.config.climbThrust` に置換(3箇所):

- `chase_and_jump`: `this.vy -= 0.6;` → `this.vy -= this.config.climbThrust;`
- `skirmish`: `this.vy -= 0.5;` → `this.vy -= this.config.climbThrust;`
- `zigzag_chase`: `this.vy -= 0.6;` → `this.vy -= this.config.climbThrust;`

(各分岐の上昇速度上限 `-4.0` / `-3.0` は既存のまま変更しない)

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/attacker-return.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全ファイル PASS(既存テストへのリグレッションなし)

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-return.test.js
git commit -m "feat: 追跡中の垂直追従を全タイプに追加しホバー推力をclimbThrustに一元化"
```

---

### Task 6: 実機確認

**Files:** なし(検証のみ)

- [ ] **Step 1: ゲームを起動して目視確認**

プロジェクトの起動方法(例: `python3 -m http.server` などで `index.html` を開く)でゲームを実行し、以下を確認:

- ヘビーアタッカーが段差の下に落ちた後、ホバーで段階的に登って持ち場方向へ戻る
- 追跡中、プレイヤーが同じ高さにいるときアタッカーが崖から落ちない
- プレイヤーが上にいるときヘビーがホバーで登ってくる
- ワープ・瞬間移動に見える挙動がない

- [ ] **Step 2: 問題があれば閾値を調整**

体感が悪い場合の調整ノブ: `ATTACKER_RETURN_TRIGGER_Y`(帰還の敏感さ)、`ATTACKER_CLIMB_MIN_FUEL`(離陸前の待ち時間)、各 `climbThrust`(登坂速度)。調整したら `npm test` 再実行後にコミット。
