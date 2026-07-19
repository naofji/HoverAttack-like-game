# マシンガン・リロード設計見直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MGのリロードを「完了時に補充・開始判断は残弾50%以下+射撃キー解放(or 残弾0)・判断は1箇所」に作り直し、満タン時の無駄なリロードを無くす。

**Architecture:** 判断は純関数 `shouldStartMGReload`(新規 `src/js/utils/mgReload.js`)に集約し、`Player.update()` の毎フレームチェックから呼ぶ。補充は `_updateTimers` のタイマー完了時のみ。散在していた4箇所のリロードトリガーコードは削除。

**Tech Stack:** Vanilla JS (ES Modules), `node --test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-07-19-mg-reload-redesign-design.md`

## Global Constraints

- `PLAYER_MG_RELOAD_THRESHOLD = 0.5`(残弾が `PLAYER_MG_BURST_SIZE`(16)の50%=8発**以下**で開始対象。9発以上は温存)
- 開始はさらに「残弾0 **or** 射撃キー(`input.mouse.left || input.isKeyDown('Space')`)を離している」時のみ
- 補充(`mgBurstLeft = PLAYER_MG_BURST_SIZE`)は `mgReloadTimer` が 1→0 になった瞬間のみ
- リロード中は射撃不可(`_fireMachineGun` 冒頭の `mgReloadTimer > 0` ガードは維持)
- HUD・`_resetMGState`・ドック補給・敵側武器は変更しない
- テスト実行: `node --test tests/mg-reload.test.js` / `npm test`(現在111/111)

---

### Task 1: 純関数 `shouldStartMGReload` と定数

**Files:**
- Create: `src/js/utils/mgReload.js`
- Modify: `src/js/utils/Constants.js`(`PLAYER_MG_RELOAD_TIME` の行の直後)
- Test: `tests/mg-reload.test.js`(新規)

**Interfaces:**
- Produces: `shouldStartMGReload(burstLeft: number, burstSize: number, fireHeld: boolean): boolean`、`PLAYER_MG_RELOAD_THRESHOLD`(0.5, export const)

- [ ] **Step 1: 失敗するテストを書く**

`tests/mg-reload.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_RELOAD_THRESHOLD, PLAYER_MG_BURST_SIZE } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE; // 16

test('threshold constant is 50%', () => {
  assert.equal(PLAYER_MG_RELOAD_THRESHOLD, 0.5);
});

test('more than 50% remaining: never reload (even with fire released)', () => {
  assert.equal(shouldStartMGReload(9, SIZE, false), false);
  assert.equal(shouldStartMGReload(SIZE, SIZE, false), false); // full mag
});

test('at or below 50% with fire held: keep shooting, no reload', () => {
  assert.equal(shouldStartMGReload(8, SIZE, true), false);
  assert.equal(shouldStartMGReload(1, SIZE, true), false);
});

test('at or below 50% with fire released: reload', () => {
  assert.equal(shouldStartMGReload(8, SIZE, false), true);  // boundary: exactly 50%
  assert.equal(shouldStartMGReload(3, SIZE, false), true);
});

test('empty magazine: reload regardless of fire key', () => {
  assert.equal(shouldStartMGReload(0, SIZE, true), true);
  assert.equal(shouldStartMGReload(0, SIZE, false), true);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/mg-reload.test.js`
Expected: FAIL(`mgReload.js` が存在しない ERR_MODULE_NOT_FOUND)

- [ ] **Step 3: 実装**

`src/js/utils/Constants.js` — `PLAYER_MG_RELOAD_TIME` の行の直後に追加:

```js
export const PLAYER_MG_RELOAD_THRESHOLD = 0.5; // Reload only when ammo <= 50% of the magazine
```

`src/js/utils/mgReload.js` を新規作成:

```js
// ============================================
// Machine-gun reload decision (single source)
// ============================================

import { PLAYER_MG_RELOAD_THRESHOLD } from './Constants.js';

/**
 * Decide whether an MG reload should start this frame.
 * Reload only when the magazine is at or below the threshold, and only
 * once the player empties it or releases the trigger.
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld) {
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false;
    return burstLeft === 0 || !fireHeld;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/mg-reload.test.js`
Expected: PASS(5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/mgReload.js src/js/utils/Constants.js tests/mg-reload.test.js
git commit -m "feat: MGリロード判断の純関数shouldStartMGReloadを追加"
```

---

### Task 2: Player/main への配線と散在トリガー削除

**Files:**
- Modify: `src/js/entities/Player.js`(import、`update()`、`_updateTimers`、`switchWeapon`)
- Modify: `src/js/main.js`(`_fireMissile` ×2箇所、`_fireMachineGun`)
- Test: `tests/mg-reload.test.js`(統合テスト追記を試みる)

**Interfaces:**
- Consumes: Task 1 の `shouldStartMGReload(burstLeft, burstSize, fireHeld)`

- [ ] **Step 1: Player.js を変更**

import に追加(既存の Constants import とは別行):

```js
import { shouldStartMGReload } from '../utils/mgReload.js';
```

`_updateTimers()` の該当行を変更。現行:

```js
if (this.mgReloadTimer > 0) this.mgReloadTimer--;
```

→

```js
if (this.mgReloadTimer > 0) {
    this.mgReloadTimer--;
    if (this.mgReloadTimer === 0) {
        this.mgBurstLeft = PLAYER_MG_BURST_SIZE; // reload finished — refill now
    }
}
```

`update()` — `const input = this.game.input;` の直後に追加:

```js
this._updateMGReload(input);
```

`_updateTimers()` の直後に新メソッド追加:

```js
/** Start an MG reload when the magazine is low and the trigger allows it. */
_updateMGReload(input) {
    if (this.currentWeapon !== 'mg' || this.mgReloadTimer > 0) return;
    const fireHeld = input.mouse.left || input.isKeyDown('Space');
    if (shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld)) {
        this.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
    }
}
```

`switchWeapon()` を変更。現行:

```js
if (this.currentWeapon === 'missile') {
    this.currentWeapon = 'mg';
    // Start reload process when switching to MG (not instant)
    this.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
    this.mgBurstLeft = PLAYER_MG_BURST_SIZE;
} else {
```

→

```js
if (this.currentWeapon === 'missile') {
    this.currentWeapon = 'mg';
} else {
```

- [ ] **Step 2: main.js を変更**

`_fireMissile()` 内の2箇所(ミサイル切れ自動切替)から `player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;` の行だけを削除(`currentWeapon = 'mg'` と `playSwitch()` は残す)。

`_fireMachineGun()` の末尾ブロックを削除。現行:

```js
if (player.mgBurstLeft <= 0) {
    player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
    player.mgBurstLeft = PLAYER_MG_BURST_SIZE;
}
```

→ ブロックごと削除(残弾0は `Player._updateMGReload` が翌フレームに拾う)。

削除後、`PLAYER_MG_RELOAD_TIME` / `PLAYER_MG_BURST_SIZE` が main.js 内で他に使われていないか `grep -n "PLAYER_MG_RELOAD_TIME\|PLAYER_MG_BURST_SIZE" src/js/main.js` で確認し、未使用になった識別子だけ import 文から外す(まだ使われていれば残す)。

- [ ] **Step 3: 統合テストを追記(import可能な場合のみ)**

`tests/mg-reload.test.js` に追記を試みる:

```js
// Integration: refill happens when the reload timer completes
import { Player } from '../src/js/entities/Player.js';

test('magazine refills exactly when the reload timer reaches zero', () => {
  const input = {
    mouse: { left: false },
    isKeyDown: () => false,
  };
  const game = { input, map: { isSolidAtPixel: () => false }, carrier: null };
  const p = Object.create(Player.prototype);
  // Minimal state for _updateTimers/_updateMGReload only
  p.game = game;
  p.invincibleTimer = 0;
  p.missileCooldown = 0;
  p.mgFireTimer = 0;
  p.mgReloadTimer = 2;
  p.mgBurstLeft = 0;
  p.currentWeapon = 'mg';

  p._updateTimers();
  assert.equal(p.mgReloadTimer, 1);
  assert.equal(p.mgBurstLeft, 0);      // not yet
  p._updateTimers();
  assert.equal(p.mgReloadTimer, 0);
  assert.equal(p.mgBurstLeft, 16);     // refilled on completion

  // With a full mag and fire released, no new reload starts
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0);

  // Low mag + fire released -> reload starts
  p.mgBurstLeft = 8;
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0);
});
```

`node --test tests/mg-reload.test.js` を実行し、`Player` の import が node で失敗する場合(audioManager経由で `window`/`Audio` 参照など)は、この統合テストを削除して純関数テストのみとする(spec が許容済み)。その場合は報告に明記する。

- [ ] **Step 4: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS(116/116 または統合テスト断念時 115/115)

- [ ] **Step 5: Commit**

```bash
git add src/js/entities/Player.js src/js/main.js tests/mg-reload.test.js
git commit -m "feat: MGリロードを完了時補充+閾値判断に一本化し散在トリガーを削除"
```

---

### Task 3: 実機確認(ユーザー実施)

**Files:** なし

- [ ] ユーザーにチェックポイントを提示して引き渡す:
  - 満タン(9発以上)でMGへ切替 → RELOAD表示が出ず即撃てる
  - 8発以下で射撃キーを離すとリロード開始、完了で16発
  - 押しっぱなしなら0発まで撃ち切ってからリロード
  - ミサイル切れ自動切替でも残弾が十分なら即撃てる
  - リロード中に武器切替往復しても踏み倒せない
