# ドック補給の実時間化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドック補給速度をモードの `gameSpeed` に依存しない実時間基準にし、NORMAL(0.8x)でもNEWTYPEと同じ秒数で補給が完了するようにする。

**Architecture:** `Player._updateDockedResupply()` の冒頭で `scale = 1 / (this.game.gameSpeed || 1)` を計算し、4つの補給レートに乗算するだけ。定数・モード定義・タイムステップは不変。

**Tech Stack:** Vanilla JS (ES Modules), `node --test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-07-19-dock-resupply-realtime-design.md`

## Global Constraints

- 変更は `Player._updateDockedResupply()` のみ。`DOCK_*_RATE` 定数・`modes.js`・`timestep.js` は変更しない
- `gameSpeed` 未設定時のフォールバックは `|| 1`
- 上限クランプ(`Math.min`)は現行どおり維持
- テスト実行: `node --test tests/dock-resupply.test.js` / `npm test`(現在117/117)

---

### Task 1: 補給レートの実時間スケーリング

**Files:**
- Modify: `src/js/entities/Player.js`(`_updateDockedResupply()` のみ)
- Test: `tests/dock-resupply.test.js`(新規)

**Interfaces:**
- Consumes: 既存 `DOCK_HP_RATE`, `DOCK_MISSILE_RATE`(24/360), `DOCK_GRENADE_RATE`, `DOCK_FUEL_RATE`, `MISSILE_INITIAL_COUNT`(24)
- Produces: なし(挙動変更のみ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/dock-resupply.test.js` を新規作成(`tests/mg-reload.test.js` の統合テストと同じ `Object.create(Player.prototype)` 方式):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { MISSILE_INITIAL_COUNT } from '../src/js/utils/Constants.js';

function makeDockedPlayer(gameSpeed) {
  const p = Object.create(Player.prototype);
  p.game = { gameSpeed };
  p.hp = 100;          // full — HP branch inactive
  p.missiles = 0;      // empty — the branch under test
  p.grenades = 12;     // full
  p.hoverFuel = 100;   // full
  return p;
}

test('NEWTYPE (1.0x): missiles refill in 360 sim frames (6 real seconds)', () => {
  const p = makeDockedPlayer(1.0);
  for (let i = 0; i < 360; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('NORMAL (0.8x): missiles refill in 288 sim frames (= same 6 real seconds)', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 288; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('NORMAL (0.8x): not already full well before the real-time budget', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 200; i++) p._updateDockedResupply();
  assert.ok(p.missiles < MISSILE_INITIAL_COUNT, `missiles=${p.missiles}`);
});

test('missing gameSpeed falls back to 1x without throwing', () => {
  const p = makeDockedPlayer(undefined);
  for (let i = 0; i < 360; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('refill never exceeds the cap', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 1000; i++) p._updateDockedResupply();
  assert.ok(p.missiles <= MISSILE_INITIAL_COUNT, `missiles=${p.missiles}`);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/dock-resupply.test.js`
Expected: 「NORMAL (0.8x): missiles refill in 288 sim frames」が FAIL(現状はスケーリングが無く 288×(24/360)=19.2発 < 24)。他の1.0x系テストは現状でも通る(回帰ガード)。

- [ ] **Step 3: 実装**

`src/js/entities/Player.js` の `_updateDockedResupply()` を置き換え:

```js
    /** Called every frame while docked — gradually restores HP, ammo, and fuel. */
    _updateDockedResupply() {
        // Rates are defined per real-time frame; sim frames tick gameSpeed× slower
        // in NORMAL mode, so scale up to keep resupply seconds equal across modes.
        const scale = 1 / (this.game.gameSpeed || 1);
        if (this.hp < PLAYER_MAX_HP) {
            this.hp = Math.min(PLAYER_MAX_HP, this.hp + DOCK_HP_RATE * scale);
        }
        if (this.missiles < MISSILE_INITIAL_COUNT) {
            this.missiles = Math.min(MISSILE_INITIAL_COUNT, this.missiles + DOCK_MISSILE_RATE * scale);
        }
        if (this.grenades < GRENADE_INITIAL_COUNT) {
            this.grenades = Math.min(GRENADE_INITIAL_COUNT, this.grenades + DOCK_GRENADE_RATE * scale);
        }
        if (this.hoverFuel < HOVER_MAX_FUEL) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + DOCK_FUEL_RATE * scale);
        }
    }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/dock-resupply.test.js`
Expected: PASS(5 tests)

- [ ] **Step 5: 全テストスイートを実行**

Run: `npm test`
Expected: 全て PASS(122/122)

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/Player.js tests/dock-resupply.test.js
git commit -m "fix: ドック補給をgameSpeed非依存の実時間基準に"
```

---

### Task 2: 実機確認(ユーザー実施)

**Files:** なし

- [ ] ユーザーにチェックポイントを提示して引き渡す:
  - NORMALモードでドッキング → ミサイル満タンまで体感6秒(従来7.5秒)
  - NEWTYPEモードは従来と変わらない
