# 雑多な修正5点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドッキング時の武器強制変更を止め、carrierLiftオプションを廃止して常時有効化し、爆発系ダメージにノックバックを追加し、タイトル画面の操作体系(Enter開始/A・Dモード切替/矢印キーでのデモ巡回)を変更し、全デモ画面に共通の巡回位置ドットを表示する。

**Architecture:** 既存のゲームループ(`src/js/main.js` の `Game` オブジェクト、`_updateGameState` ステートマシン)とエンティティ(`Player.js`, `Landmine.js`, `Grenade.js`, `CollisionManager.js`)、描画(`ScreenRenderer.js`)に対する5件の独立したピンポイント修正。新規モジュールは `src/js/utils/Knockback.js` のみ。

**Tech Stack:** Vanilla JS (ES modules)、Canvas 2D、`node --test`(Node組み込みテストランナー、`npm test` で実行)。

## Global Constraints

- テストは `node --test` 規約に従う。ファイル名は `tests/<kebab-case>.test.js`。
- `Player.js` 系のユニットテストは `Object.create(Player.prototype)` + 最小限の `game` モックパターンを使う(`tests/dock-resupply.test.js` を参考)。
- `ScreenRenderer.js` 系のユニットテストは `stubCtx()` パターンを使う(`tests/mode-selector.test.js` を参考)。
- `src/js/main.js` の `Game` オブジェクトは import時に `Game.init()` を自動実行する副作用があり、export もされていないため **直接 import してユニットテストすることはできない**。Task 4 のメイン状態機械の変更は自動テスト対象外とし、手動確認(ユーザーがブラウザで実施)のみとする。
- 各タスック完了後、`npm test` を実行し全テストがPASSすることを確認してからコミットする。
- 日本語コメントは既存コードのスタイルに合わせて必要最小限のみ。

---

## Task 1: ドッキング時の武器強制ミサイル化を停止

**Files:**
- Modify: `src/js/entities/Player.js:508-513` (`resupply()`)
- Test: `tests/dock-resupply.test.js`(既存ファイルに追記)

**Interfaces:**
- Consumes: なし(既存の `Player` クラスのみ)
- Produces: `Player.prototype.resupply()` はもう `currentWeapon` を変更しない、という契約。後続タスクはこれに依存しない。

- [ ] **Step 1: Write the failing test**

`tests/dock-resupply.test.js` の末尾に追記:

```js
test('resupply() no longer forces the weapon to missile (item 1 fix)', () => {
  const p = Object.create(Player.prototype);
  p.game = { gameSpeed: 1.0 };
  p.currentWeapon = 'mg';
  p.mgBurstLeft = 0;
  p.mgFireTimer = 5;
  p.mgReloadTimer = 5;
  p.resupply();
  assert.equal(p.currentWeapon, 'mg', 'weapon selection must survive docking');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dock-resupply.test.js`
Expected: FAIL — `p.currentWeapon` は `'missile'` になっているため `assert.equal(p.currentWeapon, 'mg', ...)` が落ちる。

- [ ] **Step 3: Write minimal implementation**

`src/js/entities/Player.js:508-513` を編集:

```js
    /** Resupply all resources (when docking). */
    resupply() {
        // Weapon state is reset immediately on dock; actual HP/ammo/fuel
        // are restored gradually each frame via _updateDockedResupply().
        this._resetMGState();
    }
```

(`this.currentWeapon = 'missile';` の行を削除するのみ。`respawn()` 側の同名代入は変更しない。)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dock-resupply.test.js`
Expected: PASS(既存テストも全てPASSのまま)

- [ ] **Step 5: Commit**

```bash
git add src/js/entities/Player.js tests/dock-resupply.test.js
git commit -m "fix: ドッキング時に武器選択がミサイルへ強制変更されるのを停止"
```

---

## Task 2: carrierLiftオプションを廃止し常時「持ち上げ可能」に統一

**Files:**
- Modify: `src/js/main.js:94-96`(`options` フィールド定義), `src/js/main.js:215-225`(`_updateTitle` の Tab トグル部分)
- Modify: `src/js/entities/Player.js:250-251`, `src/js/entities/Player.js:353-364`
- Modify: `src/js/ui/ScreenRenderer.js:61-68`
- Create: `tests/carrier-lift.test.js`

**Interfaces:**
- Consumes: `CARRIER_WIDTH`, `CARRIER_HEIGHT` from `src/js/utils/Constants.js`(既存定数)
- Produces: `game.options` プロパティ自体が消滅する。Task 4 で `_updateTitle` を書き換える際、この段階で Tab トグル行は既に存在しない前提で進める。

- [ ] **Step 1: Write the failing tests**

新規ファイル `tests/carrier-lift.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

function makeOpenMap() {
  return { isSolidAtPixel: () => false };
}

function makeCarrier(x, y) {
  return {
    x, y, width: CARRIER_WIDTH, height: CARRIER_HEIGHT,
    vx: 0, vy: 0, alive: true, platformLeft: 16, platformRight: 48,
  };
}

test('player lifts the carrier from below even without a game.options object', () => {
  const carrier = makeCarrier(100, 200);
  const p = Object.create(Player.prototype);
  p.game = { map: makeOpenMap(), carrier, enemies: [] }; // note: no `.options` at all
  p.width = 16;
  p.height = 20;
  p.x = carrier.x + 10;               // 110 — horizontally overlapping the carrier
  p.y = carrier.y + carrier.height - 5; // 227 — head just under the carrier's bottom edge
  p.vx = 0;
  p.vy = -3; // moving upward into the carrier
  p.docked = false;
  p.onGround = false;

  p._moveAndCollide();

  assert.equal(p.y, carrier.y + carrier.height, 'player head snaps to the carrier bottom');
  assert.equal(carrier.vy, -1.5, 'carrier is lifted at half the player speed');
  assert.equal(carrier.vx, 0, 'carrier follows the player horizontal speed while lifted');
});

test('player is pushed out of the carrier side even without a game.options object', () => {
  const carrier = makeCarrier(100, 200);
  const p = Object.create(Player.prototype);
  p.game = { map: makeOpenMap(), carrier, enemies: [] };
  p.width = 16;
  p.height = 20;
  p.x = 88;
  p.y = 210; // vertically overlapping the carrier body
  p.vx = 2;
  p.vy = 0;
  p.docked = false;
  p.onGround = false;

  p._moveAndCollide();

  assert.equal(p.x, carrier.x - p.width, 'player pushed back out of the carrier side');
  assert.equal(p.vx, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/carrier-lift.test.js`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'carrierLift')`(`this.game.options` が存在しないため)。

- [ ] **Step 3: Write minimal implementation**

`src/js/entities/Player.js:250-251` を編集(条件から `&& this.game.options.carrierLift` を削除):

```js
        // Horizontal Carrier Collision
        if (!hitHMap) {
```

`src/js/entities/Player.js:353-354` を編集:

```js
        // 2b. Lift carrier from below
        if (!this.docked && this.vy < 0) {
```

`src/js/main.js` の `options` フィールド(94-96行目付近)を削除:

```js
    // (options フィールドごと削除)
```

`src/js/main.js` の `_updateTitle` から Tab トグル分岐を削除(215-225行目付近、削除後は以下の形):

```js
    _updateTitle(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.input.isKeyPressed('ArrowLeft')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.input.isKeyPressed('ArrowRight')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`src/js/ui/ScreenRenderer.js:61-68` の CARRIER LIFT UI表示ブロックを削除。編集前:

```js
        this._drawModeSelector(ctx, canvas);

        // Option toggle display
        const liftOn = this.game.options.carrierLift;
        ctx.font = '13px "Space Mono", monospace';
        ctx.fillStyle = '#555555';
        ctx.fillText('[TAB] CARRIER LIFT:', canvas.width / 2 - 30, canvas.height - 18);
        ctx.fillStyle = liftOn ? '#00FF88' : '#FF4444';
        ctx.textAlign = 'left';
        ctx.fillText(liftOn ? 'ON' : 'OFF', canvas.width / 2 + 78, canvas.height - 18);
        ctx.textAlign = 'center';
    }
```

編集後:

```js
        this._drawModeSelector(ctx, canvas);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/carrier-lift.test.js`
Expected: PASS

Run: `npm test`
Expected: 全テストPASS(既存テストが `game.options` に依存していないことを確認済み)

- [ ] **Step 5: Commit**

```bash
git add src/js/entities/Player.js src/js/main.js src/js/ui/ScreenRenderer.js tests/carrier-lift.test.js
git commit -m "feat: carrierLiftオプションを廃止しキャリアを常時持ち上げ可能に統一"
```

---

## Task 3: 爆発系ダメージに規模に応じたノックバックを追加

**Files:**
- Create: `src/js/utils/Knockback.js`
- Modify: `src/js/utils/Constants.js`(地雷セクション末尾、グレネードセクション末尾、および末尾に敵ミサイル被弾用定数を追加)
- Modify: `src/js/entities/Landmine.js:63-90`
- Modify: `src/js/entities/Grenade.js`(enemy-grenade-vs-player ブロック)
- Modify: `src/js/systems/CollisionManager.js:195-217`
- Test: `tests/knockback.test.js`, `tests/explosion-knockback.test.js`

**Interfaces:**
- Produces: `applyKnockback(entity, dx, knockbackVy, knockbackVx)` — `src/js/utils/Knockback.js` からexport。`entity.vy` が `undefined` でなければ `knockbackVy` を代入し、`entity.vx` が `undefined` でなければ `dx` の符号に応じて `±knockbackVx` を代入する(`dx <= 0` は左向き)。

- [ ] **Step 1: Write the failing tests (utility)**

新規ファイル `tests/knockback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKnockback } from '../src/js/utils/Knockback.js';

test('pushes entity upward and to the right when the blast is on the left', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, 5, -6, 3);
  assert.equal(e.vy, -6);
  assert.equal(e.vx, 3);
});

test('pushes entity to the left when the blast is on the right', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, -5, -6, 3);
  assert.equal(e.vx, -3);
});

test('dx=0 defaults to pushing left (matches prior landmine behaviour)', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, 0, -6, 3);
  assert.equal(e.vx, -3);
});

test('entities without vx/vy (e.g. static targets) are left untouched', () => {
  const e = {};
  applyKnockback(e, 5, -6, 3);
  assert.equal(e.vx, undefined);
  assert.equal(e.vy, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/knockback.test.js`
Expected: FAIL — `Cannot find module '../src/js/utils/Knockback.js'`

- [ ] **Step 3: Write minimal implementation (utility)**

新規ファイル `src/js/utils/Knockback.js`:

```js
// ============================================
// Explosion knockback helper (shared by Landmine, Grenade, enemy missile hits)
// ============================================

/**
 * Overwrite an entity's velocity so it gets shoved away from a blast center.
 * @param {object} entity - Must have .vx/.vy to be affected (no-op otherwise).
 * @param {number} dx - entityCenter.x - blastCenter.x (sign decides push direction).
 * @param {number} knockbackVy - New vy (typically negative = upward launch).
 * @param {number} knockbackVx - Magnitude of the horizontal push.
 */
export function applyKnockback(entity, dx, knockbackVy, knockbackVx) {
    if (entity.vy !== undefined) entity.vy = knockbackVy;
    if (entity.vx !== undefined) {
        const pushDir = dx > 0 ? 1 : -1;
        entity.vx = pushDir * knockbackVx;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/knockback.test.js`
Expected: PASS

- [ ] **Step 5: Add knockback constants**

`src/js/utils/Constants.js` の Landmine セクション(140行目付近)を編集。編集前:

```js
export const LANDMINE_KNOCKBACK_VY = -6;  // Upward launch on detonation
```

編集後:

```js
export const LANDMINE_KNOCKBACK_VY = -6;  // Upward launch on detonation
export const LANDMINE_KNOCKBACK_VX = 3;   // Sideways push on detonation
```

同ファイルのグレネードセクション末尾(91行目付近、`GRENADE_EXPLOSION_COUNT` の後)に追加:

```js
export const GRENADE_KNOCKBACK_VY = -3.5; // Smaller launch than a landmine
export const GRENADE_KNOCKBACK_VX = 2;    // Smaller sideways push than a landmine
```

同ファイルの末尾付近(敵ミサイル関連の定数がまとまっている場所がないため、ファイル末尾に新規セクションとして追加):

```js
// --- Enemy missile hit knockback (smaller than a grenade) ---
export const MISSILE_HIT_KNOCKBACK_VY = -2;
export const MISSILE_HIT_KNOCKBACK_VX = 1.5;
```

- [ ] **Step 6: Write the failing tests (integration)**

新規ファイル `tests/explosion-knockback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Landmine } from '../src/js/entities/Landmine.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import {
  LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX,
  GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX,
  MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX,
} from '../src/js/utils/Constants.js';

function makeGame(overrides = {}) {
  return {
    spawnExplosion() {},
    addScore() {},
    player: null,
    carrier: null,
    enemies: [],
    landmines: [],
    map: { pixelToTile: () => ({ r: 0, c: 0 }), destroyArea: () => [] },
    ...overrides,
  };
}

function makePlayer(x, y) {
  return {
    x, y, width: 16, height: 20, alive: true,
    docked: false, invincibleTimer: 0,
    vx: 0, vy: 0,
    takeDamage() {},
  };
}

test('landmine knocks the player up and away from the blast', () => {
  const game = makeGame();
  const player = makePlayer(20, 0);
  game.player = player;
  const mine = new Landmine(game, 0, 0);
  mine.detonate();
  assert.equal(player.vy, LANDMINE_KNOCKBACK_VY);
  assert.equal(player.vx, LANDMINE_KNOCKBACK_VX);
});

test('enemy grenade knocks the player back, less than a landmine', () => {
  const game = makeGame();
  const player = makePlayer(20, 0);
  game.player = player;
  const grenade = new Grenade(game, 0, 0, 0);
  grenade.isPlayerOwned = false;
  grenade._explode();
  assert.equal(player.vy, GRENADE_KNOCKBACK_VY);
  assert.equal(player.vx, GRENADE_KNOCKBACK_VX);
  assert.ok(Math.abs(GRENADE_KNOCKBACK_VY) < Math.abs(LANDMINE_KNOCKBACK_VY));
  assert.ok(Math.abs(GRENADE_KNOCKBACK_VX) < Math.abs(LANDMINE_KNOCKBACK_VX));
});

test('enemy missile hit knocks the player back, less than a grenade', () => {
  const game = makeGame();
  const player = makePlayer(20, 20);
  game.player = player;
  const cm = new CollisionManager(game);
  const proj = { x: 25, y: 25, isRival: false, alive: true };
  cm._enemyMissileVsTargets(proj);
  assert.equal(player.vy, MISSILE_HIT_KNOCKBACK_VY);
  assert.equal(player.vx, MISSILE_HIT_KNOCKBACK_VX);
  assert.ok(Math.abs(MISSILE_HIT_KNOCKBACK_VY) < Math.abs(GRENADE_KNOCKBACK_VY));
  assert.ok(Math.abs(MISSILE_HIT_KNOCKBACK_VX) < Math.abs(GRENADE_KNOCKBACK_VX));
});

test('player machine-gun bullets never apply knockback to enemies', () => {
  const game = makeGame();
  const enemy = { x: 20, y: 20, width: 16, height: 20, alive: true, isBase: false, vx: 0, vy: 0, takeDamage() {} };
  game.enemies = [enemy];
  const cm = new CollisionManager(game);
  const proj = { x: 25, y: 25, alive: true };
  cm._playerBulletVsEnemies(proj);
  assert.equal(enemy.vx, 0);
  assert.equal(enemy.vy, 0);
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `node --test tests/explosion-knockback.test.js`
Expected: FAIL — `player.vy`/`player.vx` は grenade/missile ケースで `0` のまま(まだノックバックが実装されていないため)。landmine のケースは既存実装がハードコード値 `-6`/`3` を使っているため、定数を参照するテストとして先に通ることを確認しつつ進めて構わない(既存コードが定数と一致していれば PASS でもよい)。

- [ ] **Step 8: Implement Landmine.js refactor**

`src/js/entities/Landmine.js` の import 部分を編集:

```js
import {
    LANDMINE_WIDTH, LANDMINE_HEIGHT,
    LANDMINE_DAMAGE, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX,
    LANDMINE_BLINK_INTERVAL,
    EXPLOSION_PARTICLE_COUNT,
    LANDMINE_BLAST_RADIUS
} from '../utils/Constants.js';
import { applyKnockback } from '../utils/Knockback.js';
```

`detonate()` 内の `applyAoE` を編集。編集前:

```js
            if (dist <= LANDMINE_BLAST_RADIUS) {
                if (typeof entity.takeDamage === 'function') {
                    entity.takeDamage(LANDMINE_DAMAGE);
                    if (entity.vy !== undefined) entity.vy = LANDMINE_KNOCKBACK_VY;
                    if (entity.vx !== undefined) {
                        const pushDir = dx > 0 ? 1 : -1;
                        entity.vx = pushDir * 3;
                    }
                } else if (typeof entity.detonate === 'function') {
                    entity.detonate(); // Chain reaction
                }
            }
```

編集後:

```js
            if (dist <= LANDMINE_BLAST_RADIUS) {
                if (typeof entity.takeDamage === 'function') {
                    entity.takeDamage(LANDMINE_DAMAGE);
                    applyKnockback(entity, dx, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX);
                } else if (typeof entity.detonate === 'function') {
                    entity.detonate(); // Chain reaction
                }
            }
```

- [ ] **Step 9: Implement Grenade.js knockback**

`src/js/entities/Grenade.js` の import 部分を編集:

```js
import {
    GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_MAX_FALLING_SPEED, GRENADE_BOUNCE, GRENADE_FRICTION,
    GRENADE_BLAST_RADIUS, GRENADE_DAMAGE_RADIUS, GRENADE_DAMAGE,
    GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX,
    GRENADE_LIFETIME, GRENADE_EXPLOSION_COUNT,
    TILE_SIZE
} from '../utils/Constants.js';
import { applyKnockback } from '../utils/Knockback.js';
```

`_explode()` 内の敵グレネード→プレイヤー判定ブロックを編集。編集前:

```js
            const player = this.game.player;
            if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
                const dx = (player.x + player.width / 2) - this.x;
                const dy = (player.y + player.height / 2) - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < GRENADE_DAMAGE_RADIUS) {
                    player.takeDamage(GRENADE_DAMAGE / 2); // Less damage to player
                }
            }
```

編集後:

```js
            const player = this.game.player;
            if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
                const dx = (player.x + player.width / 2) - this.x;
                const dy = (player.y + player.height / 2) - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < GRENADE_DAMAGE_RADIUS) {
                    player.takeDamage(GRENADE_DAMAGE / 2); // Less damage to player
                    applyKnockback(player, dx, GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX);
                }
            }
```

- [ ] **Step 10: Implement CollisionManager.js knockback**

`src/js/systems/CollisionManager.js` の import 部分を編集:

```js
import { Missile } from '../entities/Missile.js';
import { PlayerBullet } from '../entities/PlayerBullet.js';
import { pointInRect } from '../utils/Physics.js';
import { applyKnockback } from '../utils/Knockback.js';
import { MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX } from '../utils/Constants.js';
```

`_enemyMissileVsTargets(proj)` を編集。編集前:

```js
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0
            && pointInRect(proj.x, proj.y, player)) {
            player.takeDamage(DAMAGE_ENEMY_MISSILE * damageMultiplier);
            game.spawnExplosion(proj.x, proj.y, EXPLOSION_ENEMY_MISSILE);
            proj.alive = false;
            proj.exploded = true;
            return;
        }
```

編集後:

```js
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0
            && pointInRect(proj.x, proj.y, player)) {
            player.takeDamage(DAMAGE_ENEMY_MISSILE * damageMultiplier);
            const dx = (player.x + player.width / 2) - proj.x;
            applyKnockback(player, dx, MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX);
            game.spawnExplosion(proj.x, proj.y, EXPLOSION_ENEMY_MISSILE);
            proj.alive = false;
            proj.exploded = true;
            return;
        }
```

(マシンガン弾・タレット弾を扱う `_playerBulletVsEnemies` / 敵側のMG・タレット弾処理には一切手を入れない = ノックバックなしのまま。)

- [ ] **Step 11: Run tests to verify they pass**

Run: `node --test tests/knockback.test.js tests/explosion-knockback.test.js`
Expected: PASS(全8テスト)

Run: `npm test`
Expected: 全テストPASS

- [ ] **Step 12: Commit**

```bash
git add src/js/utils/Knockback.js src/js/utils/Constants.js src/js/entities/Landmine.js src/js/entities/Grenade.js src/js/systems/CollisionManager.js tests/knockback.test.js tests/explosion-knockback.test.js
git commit -m "feat: グレネード・敵ミサイル被弾に地雷より小さいノックバックを追加"
```

---

## Task 4: タイトル/デモ画面の操作体系を変更(Enter開始 / A・D モード切替 / 矢印キーで巡回)

**Files:**
- Modify: `src/js/main.js`(モジュール先頭に定数追加、`_updateGameState` 直後にヘルパーメソッド追加、6つの `_update*` メソッド書き換え、`_anyKeyOrClick` 書き換え)
- Modify: `src/js/ui/ScreenRenderer.js`(文言変更のみ)

**Interfaces:**
- Consumes: `MODES`, `cycleMode` from `src/js/utils/modes.js`(既存import、変更なし)
- Produces:
  - モジュール定数 `DEMO_CYCLE_STATES: string[]`(6要素、巡回順)
  - `Game._availableDemoStates(): string[]` — 今アクセス可能なデモ画面のみを巡回順で返す
  - `Game._demoCycleIndex(): number` — 現在の `gameState` が `_availableDemoStates()` の何番目かを返す(Task 5 が消費する)
  - `Game._handleDemoJump(): boolean` — ArrowLeft/ArrowRight を検知して処理した場合 `true`
- 前提: このタスクを開始する時点で Task 2 が完了しており、`_updateTitle` に Tab トグル分岐は存在しない。

このタスクは `main.js` の `Game` オブジェクトを直接 importすると `Game.init()` の副作用が走ってしまうため、**自動テスト対象外**とする。実装後は `npm test` で既存テストの非破壊を確認し、実機確認はユーザーが手動で行う。

- [ ] **Step 1: Add the shared demo-cycle state list**

`src/js/main.js` の import 群の直後(58行目付近、`const Game = {` の直前)に追加:

```js
/** Screens that make up the title/attract-mode loop, in cycle order. */
const DEMO_CYCLE_STATES = [
    'title', 'how_to_play', 'local_ranking_display',
    'global_ranking_display', 'stage_ranking_display', 'wall_of_fame_display'
];
```

- [ ] **Step 2: Add demo-cycle helper methods**

`_updateGameState(deltaTime) { ... },` の直後、`_updateTitle` の直前に挿入:

```js
    /** States reachable in the title/demo loop right now — skips global/stage
     *  ranking screens until that data actually exists, matching the existing
     *  forward auto-advance logic below. */
    _availableDemoStates() {
        return DEMO_CYCLE_STATES.filter((state) => {
            if (state === 'global_ranking_display') return this.onlineStatus === 'ok' && !!this.onlineData;
            if (state === 'stage_ranking_display') return this.maxStageReached() >= 1;
            return true;
        });
    },

    /** Index of the current gameState within _availableDemoStates(), for the shared dots UI. */
    _demoCycleIndex() {
        const states = this._availableDemoStates();
        const i = states.indexOf(this.gameState);
        return i === -1 ? 0 : i;
    },

    /** ArrowLeft/ArrowRight navigation shared by every state in the title/demo loop. */
    _handleDemoJump() {
        if (this.input.isKeyPressed('ArrowLeft')) {
            this._jumpDemo(-1);
            return true;
        }
        if (this.input.isKeyPressed('ArrowRight')) {
            this._jumpDemo(1);
            return true;
        }
        return false;
    },

    _jumpDemo(dir) {
        const states = this._availableDemoStates();
        const current = states.indexOf(this.gameState);
        const from = current === -1 ? 0 : current;
        const next = (from + dir + states.length) % states.length;
        this._enterDemoState(states[next]);
    },

    _enterDemoState(state) {
        this.gameState = state;
        this.stateTimer = 0;
        if (state === 'local_ranking_display') {
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (state === 'stage_ranking_display') {
            this.stageDisplayIndex = 0;
            this.stageDisplayTimer = 0;
        } else if (state === 'title') {
            audioManager.playTitleBGM();
        }
    },

```

- [ ] **Step 3: Rewrite `_updateTitle`**

編集前(Task 2 完了後の状態):

```js
    _updateTitle(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.input.isKeyPressed('ArrowLeft')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.input.isKeyPressed('ArrowRight')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateTitle(deltaTime) {
        if (this.input.isKeyPressed('KeyA')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
            return;
        }
        if (this.input.isKeyPressed('KeyD')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
            return;
        }
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

- [ ] **Step 4: Rewrite the other 5 demo-loop handlers**

`_updateHowToPlay` 編集前:

```js
    _updateHowToPlay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this.gameState = 'local_ranking_display';
            this.stateTimer = 0;
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateHowToPlay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this.gameState = 'local_ranking_display';
            this.stateTimer = 0;
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`_updateLocalRanking` 編集前:

```js
    _updateLocalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            if (this.onlineStatus === 'ok' && this.onlineData) {
                this.gameState = 'global_ranking_display';
            } else {
                this.gameState = 'title';
                audioManager.playTitleBGM();
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateLocalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            if (this.onlineStatus === 'ok' && this.onlineData) {
                this.gameState = 'global_ranking_display';
            } else {
                this.gameState = 'title';
                audioManager.playTitleBGM();
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`_updateGlobalRanking` 編集前:

```js
    _updateGlobalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            // Only show stage rankings for stages the player has actually reached
            // locally (keep unseen stages — and their enemies — a surprise).
            if (this.maxStageReached() >= 1) {
                this.gameState = 'stage_ranking_display';
                this.stageDisplayIndex = 0;
                this.stageDisplayTimer = 0;
            } else {
                this.gameState = 'wall_of_fame_display';
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateGlobalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            // Only show stage rankings for stages the player has actually reached
            // locally (keep unseen stages — and their enemies — a surprise).
            if (this.maxStageReached() >= 1) {
                this.gameState = 'stage_ranking_display';
                this.stageDisplayIndex = 0;
                this.stageDisplayTimer = 0;
            } else {
                this.gameState = 'wall_of_fame_display';
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`_updateStageRankingDisplay` 編集前:

```js
    _updateStageRankingDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        this.stageDisplayTimer += deltaTime;
        if (this.stageDisplayTimer > 3000) {
            this.stageDisplayTimer = 0;
            this.stageDisplayIndex++;
            if (this.stageDisplayIndex >= this.maxStageReached()) {
                this.gameState = 'wall_of_fame_display';
                this.stateTimer = 0;
                return;
            }
        }
        if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateStageRankingDisplay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        this.stageDisplayTimer += deltaTime;
        if (this.stageDisplayTimer > 3000) {
            this.stageDisplayTimer = 0;
            this.stageDisplayIndex++;
            if (this.stageDisplayIndex >= this.maxStageReached()) {
                this.gameState = 'wall_of_fame_display';
                this.stateTimer = 0;
                return;
            }
        }
        if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`_updateWallOfFameDisplay` 編集前:

```js
    _updateWallOfFameDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

編集後:

```js
    _updateWallOfFameDisplay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

- [ ] **Step 5: Restrict "any key" start to Enter**

`src/js/main.js` の `_anyKeyOrClick()`(1075行目付近)を編集。編集前:

```js
    /** Returns true if any key/click input was pressed this frame */
    _anyKeyOrClick() {
        return this.input.getTypedChars().length > 0
            || this.input.isLeftClickPressed()
            || this.input.isRightClickPressed();
    },
```

編集後:

```js
    /** Returns true if Enter or a mouse click was pressed this frame (game-start input) */
    _anyKeyOrClick() {
        return this.input.isKeyPressed('Enter')
            || this.input.isLeftClickPressed()
            || this.input.isRightClickPressed();
    },
```

(このメソッドは `_updateTitle` / `_updateHowToPlay` / `_updateLocalRanking` / `_updateGlobalRanking` / `_updateStageRankingDisplay` / `_updateWallOfFameDisplay` の6箇所でのみ使われており、`ranking_entry` 等の名前入力状態では使われていないため、この変更は名前入力に影響しない。)

- [ ] **Step 6: Update on-screen copy**

`src/js/ui/ScreenRenderer.js` 内の `'PRESS ANY KEY TO START'` を全て(5箇所: `drawTitleScreen`, `drawHowToPlay`, `_drawRankingList`, `drawWallOfFame`, `drawStageRankings`)`'PRESS ENTER TO START'` に置換する。`'PRESS ANY KEY TO CONTINUE'`(ゲームオーバー画面)はそのまま変更しない。

`_drawModeSelector` 内のヒント文言(89行目付近)を編集。編集前:

```js
        ctx.fillText('[ ← / → ]  SELECT MODE', canvas.width / 2, rowY - 34);
```

編集後:

```js
        ctx.fillText('[ A / D ]  SELECT MODE', canvas.width / 2, rowY - 34);
```

- [ ] **Step 7: Run the automated regression suite**

Run: `npm test`
Expected: 全テストPASS(このタスクは `main.js` 自体の自動テストを追加しない — 上記 Global Constraints 参照)

- [ ] **Step 8: Manual verification (ユーザーが実施)**

以下をブラウザで確認してもらう:
- タイトル画面で `A`/`D` キーを押すと NORMAL/NEWTYPE が切り替わる
- タイトル画面で矢印キーを押すと HOW TO PLAY → 各ランキング → 殿堂入り → タイトル、の順に自由に前後移動できる
- 各デモ画面で `Enter` を押すとゲームが開始する。それ以外のキー(英数字等)を押しても開始しない。マウスクリックでは開始する
- 画面下部の文言が `PRESS ENTER TO START` になっている

- [ ] **Step 9: Commit**

```bash
git add src/js/main.js src/js/ui/ScreenRenderer.js
git commit -m "feat: タイトル画面をEnter開始/A・Dモード切替/矢印キー巡回に変更"
```

---

## Task 5: 巡回位置ドット表示を全デモ画面で共通化

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`(`drawHowToPlay` から個別ドットを削除、共通メソッド `drawDemoCycleDots` を追加)
- Modify: `src/js/main.js`(`draw()` 内の6分岐に共通ドット呼び出しを追加)
- Test: `tests/demo-cycle-dots.test.js`

**Interfaces:**
- Consumes: `Game._availableDemoStates()`, `Game._demoCycleIndex()`(Task 4 で追加済み)
- Produces: `ScreenRenderer.prototype.drawDemoCycleDots(ctx, currentIndex, total)` — `total` 個の `●` を画面下部中央に並べ、`currentIndex` 番目だけ `#00FFFF`、他は `#444444` で描画。`total <= 1` のときは何も描画しない。

- [ ] **Step 1: Write the failing test**

新規ファイル `tests/demo-cycle-dots.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

function stubCtx() {
  const texts = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: '',
    save() {}, restore() {},
    fillText(text, x, y) { texts.push({ text, x, y, fill: ctx.fillStyle }); },
  };
  return { ctx, texts };
}

function render(currentIndex, total) {
  const canvas = { width: 1024, height: 768 };
  const renderer = new ScreenRenderer({ canvas });
  const { ctx, texts } = stubCtx();
  renderer.drawDemoCycleDots(ctx, currentIndex, total);
  return texts;
}

test('draws one dot per screen in the demo cycle', () => {
  const texts = render(2, 6);
  assert.equal(texts.length, 6);
  assert.ok(texts.every((t) => t.text === '●'));
});

test('only the current screen dot is highlighted', () => {
  const texts = render(2, 6);
  texts.forEach((t, i) => {
    assert.equal(t.fill, i === 2 ? '#00FFFF' : '#444444');
  });
});

test('dots are centred on the canvas', () => {
  const texts = render(0, 3);
  const xs = texts.map((t) => t.x);
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  assert.ok(Math.abs(mid - 512) < 1);
});

test('nothing is drawn for a single-screen cycle', () => {
  const texts = render(0, 1);
  assert.equal(texts.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/demo-cycle-dots.test.js`
Expected: FAIL — `renderer.drawDemoCycleDots is not a function`

- [ ] **Step 3: Implement `drawDemoCycleDots`**

`src/js/ui/ScreenRenderer.js` の `_drawPanel` メソッドの直前(325行目付近)に追加:

```js
    /** Shared position indicator for the title/demo attract-mode loop — every
     *  screen in the cycle shows the same dots, so "which screen is this" is
     *  always answerable (item 5: consistency across all demo screens). */
    drawDemoCycleDots(ctx, currentIndex, total) {
        if (total <= 1) return;
        const canvas = this.game.canvas;
        const cy = canvas.height - 40;
        const spacing = 22;
        const startX = canvas.width / 2 - ((total - 1) * spacing) / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '14px sans-serif';
        for (let i = 0; i < total; i++) {
            ctx.fillStyle = i === currentIndex ? '#00FFFF' : '#444444';
            ctx.fillText('●', startX + i * spacing, cy);
        }
        ctx.restore();
    }

```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/demo-cycle-dots.test.js`
Expected: PASS

- [ ] **Step 5: Remove the old per-page dots from `drawHowToPlay`**

`src/js/ui/ScreenRenderer.js` の `drawHowToPlay` 内(304-311行目付近)を編集。編集前:

```js
        // ページドット
        ctx.textAlign = 'center';
        ctx.font = '18px sans-serif';
        ctx.fillStyle = page === 0 ? '#00FFFF' : '#444444';
        ctx.fillText('●', cx - 15, H - 35);
        ctx.fillStyle = page === 1 ? '#00FFFF' : '#444444';
        ctx.fillText('●', cx + 15, H - 35);

        // Press Any Key ヒント（点滅）
```

編集後(ページドットのブロックを削除):

```js
        // Press Any Key ヒント（点滅）
```

- [ ] **Step 6: Wire the shared dots into `main.js draw()`**

`src/js/main.js` の `draw()` 内、6つの `if (this.gameState === '...') { ... return; }` ブロック each に `drawDemoCycleDots` 呼び出しを追加する。編集前:

```js
        // Full-screen states — skip world rendering
        if (this.gameState === 'title') {
            this.screenRenderer.drawTitleScreen(ctx);
            return;
        }
        if (this.gameState === 'how_to_play') {
            this.screenRenderer.drawHowToPlay(ctx, this.stateTimer < 10000 ? 0 : 1);
            return;
        }
        if (this.gameState === 'local_ranking_display') {
            this.screenRenderer.drawLocalRanking(ctx, this.highScoreManager.getTop10(), this.localRankIndex, this.week.weekId);
            return;
        }
        if (this.gameState === 'global_ranking_display') {
            const data = this.onlineData || { ranking: [], weekId: this.week.weekId };
            this.screenRenderer.drawGlobalRanking(ctx, data.ranking, this.globalRankIndex, data.weekId);
            return;
        }
        if (this.gameState === 'stage_ranking_display') {
            const idx = this.stageDisplayIndex;
            const online = this.onlineData ? this.onlineData.stageRankings : null;
            const data = pickStageRanking(online, idx + 1, this.stageRankingManager.getStage(idx + 1));
            this.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            const fame = (this.onlineData && this.onlineData.fame) || [];
            this.screenRenderer.drawWallOfFame(ctx, fame);
            return;
        }
```

編集後:

```js
        // Full-screen states — skip world rendering
        if (this.gameState === 'title') {
            this.screenRenderer.drawTitleScreen(ctx);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
        if (this.gameState === 'how_to_play') {
            this.screenRenderer.drawHowToPlay(ctx, this.stateTimer < 10000 ? 0 : 1);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
        if (this.gameState === 'local_ranking_display') {
            this.screenRenderer.drawLocalRanking(ctx, this.highScoreManager.getTop10(), this.localRankIndex, this.week.weekId);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
        if (this.gameState === 'global_ranking_display') {
            const data = this.onlineData || { ranking: [], weekId: this.week.weekId };
            this.screenRenderer.drawGlobalRanking(ctx, data.ranking, this.globalRankIndex, data.weekId);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
        if (this.gameState === 'stage_ranking_display') {
            const idx = this.stageDisplayIndex;
            const online = this.onlineData ? this.onlineData.stageRankings : null;
            const data = pickStageRanking(online, idx + 1, this.stageRankingManager.getStage(idx + 1));
            this.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            const fame = (this.onlineData && this.onlineData.fame) || [];
            this.screenRenderer.drawWallOfFame(ctx, fame);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }
```

- [ ] **Step 7: Run the automated regression suite**

Run: `npm test`
Expected: 全テストPASS

- [ ] **Step 8: Manual verification (ユーザーが実施)**

以下をブラウザで確認してもらう:
- title / how_to_play / local ranking / global ranking(オンライン取得後) / stage ranking(ステージ到達後) / wall of fame の全画面で、画面下部に同じ位置・同じ見た目のドットが表示され、現在の画面に対応するドットだけシアン色でハイライトされている
- Task 4 の矢印キー移動と組み合わせて、ドットの位置が移動と連動している

- [ ] **Step 9: Commit**

```bash
git add src/js/ui/ScreenRenderer.js src/js/main.js tests/demo-cycle-dots.test.js
git commit -m "feat: 全デモ画面共通の巡回位置ドット表示を追加"
```
