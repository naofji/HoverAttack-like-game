# Phase 1: バランス調整＋ゲームモード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャリア残機削減・配点見直し・ノーマル/ニュータイプの2モード（0.8x/1.0x）とモード別タイムボーナスを実装する。

**Architecture:** 純粋ロジック（モード設定・タイムボーナス計算・固定タイムステップ算出）は `src/js/utils/` の新モジュールに切り出し `node --test` で単体テストする。ゲーム本体（`main.js`）とエンティティ／描画への配線は既存パターン（canvas依存で単体テスト対象外）に従い、実機起動で検証する。速度は固定タイムステップ・アキュムレータで実装し、カクつきはカメラ描画位置の補間で軽減する。

**Tech Stack:** Vanilla ES Modules, HTML5 Canvas, `node --test`（テスト）, Google Apps Script（本フェーズでは変更なし）。

## Global Constraints

- ES Modules のみ（`import`/`export`、ビルドツールなし）。ブラウザとNodeの両方で読める純関数に副作用を持ち込まない。
- 既存の物理はフレーム単位（`x += vx`、60fps想定）。タイマー（`totalTime`/`missionTimer`）は実 `deltaTime`(ms) 積算。
- モードは `'normal'`（デフォルト, gameSpeed=0.8, タイムボーナス減衰40/秒）と `'newtype'`（gameSpeed=1.0, 減衰50/秒）の2値のみ。
- テストは `node --test`（プロジェクトルートで `npm test`）。テストファイルは `tests/*.test.js`、`import` で対象モジュールを読む。
- コミットは各タスク末尾で行う。1タスク=1コミット。

---

### Task 1: バランス定数の変更（残機・撃破点・ドローンHP）

純粋な定数変更のみ。回帰ガードのテストを1本付ける。ホーミングミサイル撃墜点（`SCORE_HOMING_INTERCEPT=20`, `CollisionManager.js`）は**現状維持で変更しない**。

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/ui/ScreenRenderer.js`（HOW TO PLAY等の残機説明があれば整合）
- Test: `tests/balance-constants.test.js`

**Interfaces:**
- Produces: `Constants.js` から `CARRIER_INITIAL_LIVES=1`, `CRUISE_MISSILE_SCORE=150`, `ENEMY_DRONE_SCORE=250`, `ENEMY_DRONE_HP=8`, `ATTACKER_CONFIGS.standard.score=300` / `.heavy.score=500` / `.rival.score=700` / `.artillery.score=900`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/balance-constants.test.js` を新規作成:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIER_INITIAL_LIVES,
  CRUISE_MISSILE_SCORE,
  ENEMY_DRONE_SCORE,
  ENEMY_DRONE_HP,
  ATTACKER_CONFIGS,
} from '../src/js/utils/Constants.js';

test('carrier starts with a single life', () => {
  assert.equal(CARRIER_INITIAL_LIVES, 1);
});

test('rebalanced enemy scores', () => {
  assert.equal(CRUISE_MISSILE_SCORE, 150);
  assert.equal(ENEMY_DRONE_SCORE, 250);
});

test('drone durability bumped ~1.5x', () => {
  assert.equal(ENEMY_DRONE_HP, 8);
});

test('attacker scores span 300..900', () => {
  assert.equal(ATTACKER_CONFIGS.standard.score, 300);
  assert.equal(ATTACKER_CONFIGS.heavy.score, 500);
  assert.equal(ATTACKER_CONFIGS.rival.score, 700);
  assert.equal(ATTACKER_CONFIGS.artillery.score, 900);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/balance-constants.test.js`
Expected: FAIL（値が未変更のため）。

- [ ] **Step 3: Constants.js を変更**

`src/js/utils/Constants.js` で以下を変更（該当行を編集）:
- `export const CARRIER_INITIAL_LIVES = 3;` → `= 1;`
- `export const CRUISE_MISSILE_SCORE = 100;` → `= 150;`
- `export const ENEMY_DRONE_SCORE = 150;` → `= 250;`
- `export const ENEMY_DRONE_HP = 5;` → `= 8;`
- `ATTACKER_CONFIGS` 内 `standard.score: 100`→`300`、`heavy.score: 300`→`500`、`rival.score: 500`→`700`、`artillery.score: 800`→`900`。

（ホーミング撃墜点 `SCORE_HOMING_INTERCEPT=20` は `CollisionManager.js` のまま変更しない。）

- [ ] **Step 4: HOW TO PLAY の残機表記を確認**

`src/js/ui/ScreenRenderer.js` で残機数を明示している箇所を確認。`* GAME OVER IF THE CARRIER LOSES ALL ITS LIVES.` のような文言は残機1でも成立するため文言変更不要。ライフ数の数値を直書きしている箇所があればそこだけ更新する（無ければ変更なし）。

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/balance-constants.test.js`
Expected: PASS。
また全体回帰: `npm test` → 既存テストも PASS。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Constants.js src/js/ui/ScreenRenderer.js tests/balance-constants.test.js
git commit -m "balance: キャリア残機1化・撃破点・ドローンHPを再調整"
```

---

### Task 2: 新規スコア加点の配線（地雷撃破50・アイテム取得200）

地雷はプレイヤー弾で誘爆させた時のみ50点。アイテム（リペア/ミサイル/オートエイム）取得で各200点。canvas依存のため単体テストは行わず、定数追加＋配線＋実機検証とする。

**Files:**
- Modify: `src/js/utils/Constants.js`（`LANDMINE_SCORE`, `ITEM_PICKUP_SCORE` 追加）
- Modify: `src/js/main.js:441-449`（`_updateLandmines` の弾誘爆分岐）
- Modify: `src/js/entities/RepairKit.js`（pickup 分岐）
- Modify: `src/js/entities/MissileKit.js`（pickup 分岐）
- Modify: `src/js/entities/AutoAimUnit.js`（pickup 分岐）

**Interfaces:**
- Consumes: `Game.addScore(points)`（既存, `src/js/main.js:922`）、`proj.isPlayerOwned`（既存）。
- Produces: `Constants.js` から `LANDMINE_SCORE=50`, `ITEM_PICKUP_SCORE=200`。

- [ ] **Step 1: 定数を追加**

`src/js/utils/Constants.js` のスコア定数付近に追記:

```javascript
export const LANDMINE_SCORE = 50;      // Player-detonated landmine
export const ITEM_PICKUP_SCORE = 200;  // Any item (repair / missile / auto-aim) pickup
```

- [ ] **Step 2: 地雷の弾誘爆で加点**

`src/js/main.js` 冒頭の Constants import に `LANDMINE_SCORE` を追加。`_updateLandmines`（`src/js/main.js:441-449`）のプレイヤー弾誘爆分岐を、プレイヤー所有弾のときだけ加点するよう変更:

```javascript
            if (mine.alive) {
                for (const proj of this.projectiles) {
                    if (proj.alive && !proj.exploded && mine.collidesWithPoint(proj.x, proj.y)) {
                        mine.detonate();
                        proj.alive = false;
                        proj.exploded = true;
                        if (proj.isPlayerOwned) this.addScore(LANDMINE_SCORE);
                        break;
                    }
                }
            }
```

（プレイヤー接触による誘爆＝`src/js/main.js:436-439` では加点しない。現状のまま。）

- [ ] **Step 3: アイテム取得で加点（3ファイル）**

各キットの pickup 成立ブロック（`this.alive = false;` の直前）に加点を追加する。

`src/js/entities/RepairKit.js` の pickup ブロック:

```javascript
                player.repairKits++;
                this.game.addScore(ITEM_PICKUP_SCORE);
                this.alive = false;
```

`src/js/entities/MissileKit.js`:

```javascript
                player.missiles = MISSILE_INITIAL_COUNT;
                this.game.addScore(ITEM_PICKUP_SCORE);
                this.alive = false;
```

`src/js/entities/AutoAimUnit.js`:

```javascript
                player.autoAimTimer = Math.min(player.autoAimTimer + AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION);
                player.autoAimMaxTimer = AUTO_AIM_MAX_DURATION;
                this.game.addScore(ITEM_PICKUP_SCORE);
                this.alive = false;
```

3ファイルそれぞれの import に `ITEM_PICKUP_SCORE` を `Constants.js` から追加する。

- [ ] **Step 4: 既存テストの回帰確認**

Run: `npm test`
Expected: 全 PASS（新規ロジックは canvas 側のため既存テストに影響なし。壊れていないことの確認）。

- [ ] **Step 5: 実機検証**

`/run` でゲームを起動し、(a) プレイヤーのミサイルで地雷を撃つとスコアが+50、(b) 各アイテム取得で+200 されることを目視確認する。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Constants.js src/js/main.js src/js/entities/RepairKit.js src/js/entities/MissileKit.js src/js/entities/AutoAimUnit.js
git commit -m "balance: 地雷のプレイヤー誘爆で+50・アイテム取得で+200を加点"
```

---

### Task 3: モード設定とタイトル選択UI

モードの純粋設定と切替ヘルパを新モジュールに切り出してテストし、`Game` 状態とタイトルの ←/→ 選択・表示に配線する。

**Files:**
- Create: `src/js/utils/modes.js`
- Modify: `src/js/main.js`（`mode`/`gameSpeed` 初期化、`_updateTitle` に ←/→ 切替）
- Modify: `src/js/ui/ScreenRenderer.js:57-65`（タイトルにモード表示）
- Test: `tests/modes.test.js`

**Interfaces:**
- Produces:
  - `MODES = { normal: { gameSpeed: 0.8, timeBonusDecay: 40, label: 'NORMAL' }, newtype: { gameSpeed: 1.0, timeBonusDecay: 50, label: 'NEWTYPE' } }`
  - `MODE_ORDER = ['normal', 'newtype']`
  - `cycleMode(current, dir)` → 隣のモードキー（`dir` は `+1`/`-1`、両端でラップ）。
  - `Game.mode`（string）, `Game.gameSpeed`（number）を設定。

- [ ] **Step 1: 失敗するテストを書く**

`tests/modes.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODE_ORDER, cycleMode } from '../src/js/utils/modes.js';

test('mode table values', () => {
  assert.equal(MODES.normal.gameSpeed, 0.8);
  assert.equal(MODES.normal.timeBonusDecay, 40);
  assert.equal(MODES.newtype.gameSpeed, 1.0);
  assert.equal(MODES.newtype.timeBonusDecay, 50);
});

test('default order starts at normal', () => {
  assert.deepEqual(MODE_ORDER, ['normal', 'newtype']);
});

test('cycleMode wraps both directions', () => {
  assert.equal(cycleMode('normal', +1), 'newtype');
  assert.equal(cycleMode('newtype', +1), 'normal');
  assert.equal(cycleMode('normal', -1), 'newtype');
  assert.equal(cycleMode('newtype', -1), 'normal');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/modes.test.js`
Expected: FAIL（`modes.js` 不在）。

- [ ] **Step 3: modes.js を実装**

`src/js/utils/modes.js`:

```javascript
// Game modes: NORMAL adds a 0.8x wait (easier to dodge), NEWTYPE runs at full
// speed. Timers advance in real time regardless, so NEWTYPE earns time bonus
// more easily; NORMAL uses a gentler decay to compensate.
export const MODES = {
  normal:  { gameSpeed: 0.8, timeBonusDecay: 40, label: 'NORMAL' },
  newtype: { gameSpeed: 1.0, timeBonusDecay: 50, label: 'NEWTYPE' },
};

export const MODE_ORDER = ['normal', 'newtype'];

/** Return the neighbouring mode key. dir is +1 / -1, wrapping at both ends. */
export function cycleMode(current, dir) {
  const i = MODE_ORDER.indexOf(current);
  const n = MODE_ORDER.length;
  const next = ((i + dir) % n + n) % n;
  return MODE_ORDER[next];
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/modes.test.js`
Expected: PASS。

- [ ] **Step 5: Game 状態に配線**

`src/js/main.js` 冒頭の import に追加:

```javascript
import { MODES, cycleMode } from './utils/modes.js';
```

`Game` オブジェクトの状態フィールド付近（`missionsCompleted: 0,` の近く）に追加:

```javascript
    mode: 'normal',       // 'normal' | 'newtype'
    gameSpeed: MODES.normal.gameSpeed,
```

`_updateTitle(deltaTime)`（`src/js/main.js:197`）の先頭付近、`stateTimer` 加算の後に ←/→ 切替を追加（`_anyKeyOrClick` による開始判定より前に置く）:

```javascript
        if (this.input.isKeyPressed('ArrowLeft')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.input.isKeyPressed('ArrowRight')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        }
```

注意: 矢印キーは開始トリガに含めない。`_anyKeyOrClick` が矢印キーで開始してしまう場合は、矢印キーを除外する（該当実装を確認し、`ArrowLeft`/`ArrowRight` を開始判定から除く）。

- [ ] **Step 6: タイトルにモード表示**

`src/js/ui/ScreenRenderer.js` の `drawTitleScreen`（`:57-65` の CARRIER LIFT 表示の上あたり）にモード表示を追加:

```javascript
        // Mode selector
        ctx.font = '14px "Space Mono", monospace';
        ctx.fillStyle = '#AAAAAA';
        ctx.textAlign = 'center';
        ctx.fillText('[←/→] MODE: ' + MODES[this.game.mode].label, canvas.width / 2, canvas.height - 40);
```

`ScreenRenderer.js` の import に `MODES` を `../utils/modes.js` から追加する。

- [ ] **Step 7: 実機検証**

`/run` で起動 → タイトルで ←/→ を押すと `MODE: NORMAL`⇔`NEWTYPE` が切り替わり、任意キー/クリックでゲーム開始できることを確認。

- [ ] **Step 8: コミット**

```bash
git add src/js/utils/modes.js tests/modes.test.js src/js/main.js src/js/ui/ScreenRenderer.js
git commit -m "feat: ノーマル/ニュータイプのモード選択をタイトルに追加"
```

---

### Task 4: タイムボーナスのモード別再設定

タイムボーナス計算を純関数に切り出してテストし、`_onFlagCaptured` に配線。基準額1.5倍・減衰はモード別（normal=40 / newtype=50）。

**Files:**
- Create: `src/js/utils/scoring.js`
- Modify: `src/js/main.js:559-566`（`_onFlagCaptured` のタイムボーナス算出）
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: `MODES[mode].timeBonusDecay`（Task 3）。
- Produces: `computeTimeBonus({ totalTiles, elapsedMs, decayPerSec, baseMult })` → 整数（0未満は0）。
  - `baseBonus = Math.floor(totalTiles / 100) * 100 * baseMult`
  - `bonus = Math.max(0, baseBonus - Math.floor(elapsedMs / 1000) * decayPerSec)`
- Produces: `TIME_BONUS_BASE_MULT = 1.5`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/scoring.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTimeBonus, TIME_BONUS_BASE_MULT } from '../src/js/utils/scoring.js';

test('base multiplier is 1.5', () => {
  assert.equal(TIME_BONUS_BASE_MULT, 1.5);
});

test('base bonus scales with map area and multiplier', () => {
  // 20000 tiles => floor(20000/100)*100 = 20000, *1.5 = 30000, 0s elapsed
  const b = computeTimeBonus({ totalTiles: 20000, elapsedMs: 0, decayPerSec: 50, baseMult: 1.5 });
  assert.equal(b, 30000);
});

test('newtype decays 50/sec, normal 40/sec', () => {
  const newtype = computeTimeBonus({ totalTiles: 20000, elapsedMs: 10000, decayPerSec: 50, baseMult: 1.5 });
  const normal  = computeTimeBonus({ totalTiles: 20000, elapsedMs: 10000, decayPerSec: 40, baseMult: 1.5 });
  assert.equal(newtype, 30000 - 10 * 50); // 29500
  assert.equal(normal,  30000 - 10 * 40); // 29600 (normal keeps more)
});

test('never negative', () => {
  const b = computeTimeBonus({ totalTiles: 100, elapsedMs: 999999, decayPerSec: 50, baseMult: 1.5 });
  assert.equal(b, 0);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/scoring.test.js`
Expected: FAIL（`scoring.js` 不在）。

- [ ] **Step 3: scoring.js を実装**

`src/js/utils/scoring.js`:

```javascript
// Time bonus: proportional to map area, decays per elapsed real second.
// Base is boosted so a fast clear outweighs slow annihilation (high risk / high return).
export const TIME_BONUS_BASE_MULT = 1.5;

export function computeTimeBonus({ totalTiles, elapsedMs, decayPerSec, baseMult = TIME_BONUS_BASE_MULT }) {
  const baseBonus = Math.floor(totalTiles / 100) * 100 * baseMult;
  const seconds = Math.floor(elapsedMs / 1000);
  return Math.max(0, baseBonus - seconds * decayPerSec);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/scoring.test.js`
Expected: PASS。

- [ ] **Step 5: _onFlagCaptured に配線**

`src/js/main.js` の import に追加:

```javascript
import { computeTimeBonus } from './utils/scoring.js';
```

`_onFlagCaptured`（`src/js/main.js:559-566`）の現行:

```javascript
        // Time bonus: proportional to map area, decays 50pts/sec
        const totalTiles = this.map.cols * this.map.rows;
        const baseBonus = Math.floor(totalTiles / 100) * 100;
        const seconds = Math.floor(this.missionTimer / 1000);
        this.targetTimeBonus = Math.max(0, baseBonus - (seconds * 50));
        this.currentTimeBonus = 0;
```

を置換:

```javascript
        // Time bonus: mode-dependent decay (see utils/scoring.js).
        const totalTiles = this.map.cols * this.map.rows;
        this.targetTimeBonus = computeTimeBonus({
            totalTiles,
            elapsedMs: this.missionTimer,
            decayPerSec: MODES[this.mode].timeBonusDecay,
        });
        this.currentTimeBonus = 0;
```

（`MODES` は Task 3 で import 済み。未 import なら追加する。）

- [ ] **Step 6: 回帰＋実機検証**

Run: `npm test`（全 PASS）。
`/run` で1面クリアし、ノーマル/ニュータイプそれぞれでタイムボーナスが表示・加算されることを確認（ノーマルの方が同経過秒で僅かに多く残る）。

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/scoring.js tests/scoring.test.js src/js/main.js
git commit -m "balance: タイムボーナスを基準1.5倍・モード別減衰(40/50)に再設定"
```

---

### Task 5: 固定タイムステップ・アキュムレータ（速度モード実体化）

物理を固定ステップで駆動し、`gameSpeed` でスロー化。タイマーは実 `deltaTime`。ステップ数算出と `lerp` を純関数化してテストし、`loop`/`_updatePlaying` に配線する。入力・単発処理は毎フレーム1回、物理はステップ内で実行して多重発火を防ぐ。

**Files:**
- Create: `src/js/utils/timestep.js`
- Modify: `src/js/main.js`（状態追加、`_updatePlaying` を per-frame と `_simulationTick` に分割、`loop` は変更最小）
- Test: `tests/timestep.test.js`

**Interfaces:**
- Consumes: `Game.gameSpeed`（Task 3）。
- Produces:
  - `SIM_STEP = 1000 / 60`
  - `MAX_TICKS = 5`
  - `advanceAccumulator(accumulator, scaledDeltaMs, step, maxTicks)` → `{ ticks, remainder, alpha }`
    - `ticks`: 実行すべき物理ステップ数（`maxTicks` で上限）。
    - `remainder`: 消化後の残りアキュムレータ（ms）。
    - `alpha`: `remainder / step`（0..1、描画補間用）。
  - `lerp(a, b, t)` → `a + (b - a) * t`
  - `Game.simAccumulator`（number）, `Game.simAlpha`（number, 既定1）, `Game._simulationTick()`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/timestep.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceAccumulator, lerp, SIM_STEP, MAX_TICKS } from '../src/js/utils/timestep.js';

test('SIM_STEP is a 60Hz step', () => {
  assert.ok(Math.abs(SIM_STEP - 1000 / 60) < 1e-9);
});

test('one full step at 60fps, full speed', () => {
  const r = advanceAccumulator(0, SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, 1);
  assert.ok(Math.abs(r.remainder) < 1e-9);
});

test('0.8x under-runs: some frames advance 0 ticks', () => {
  // Feed 0.8 * SIM_STEP repeatedly; over 5 frames expect 4 ticks total.
  let acc = 0, total = 0;
  for (let i = 0; i < 5; i++) {
    const r = advanceAccumulator(acc, 0.8 * SIM_STEP, SIM_STEP, MAX_TICKS);
    total += r.ticks;
    acc = r.remainder;
  }
  assert.equal(total, 4);
});

test('caps ticks at maxTicks (no spiral of death)', () => {
  const r = advanceAccumulator(0, 100 * SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, MAX_TICKS);
});

test('alpha is fractional remainder', () => {
  const r = advanceAccumulator(0, 0.5 * SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, 0);
  assert.ok(Math.abs(r.alpha - 0.5) < 1e-9);
});

test('lerp', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/timestep.test.js`
Expected: FAIL（`timestep.js` 不在）。

- [ ] **Step 3: timestep.js を実装**

`src/js/utils/timestep.js`:

```javascript
// Fixed-timestep accumulator. Physics runs in discrete SIM_STEP ticks; the
// caller scales the incoming delta by gameSpeed before calling. maxTicks caps
// catch-up work so a long stall can't spiral.
export const SIM_STEP = 1000 / 60;
export const MAX_TICKS = 5;

export function advanceAccumulator(accumulator, scaledDeltaMs, step, maxTicks) {
  let acc = accumulator + scaledDeltaMs;
  let ticks = 0;
  while (acc >= step && ticks < maxTicks) {
    acc -= step;
    ticks++;
  }
  // If we hit the cap, drop the backlog so it doesn't keep growing.
  if (ticks >= maxTicks && acc >= step) acc = acc % step;
  return { ticks, remainder: acc, alpha: acc / step };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/timestep.test.js`
Expected: PASS。

- [ ] **Step 5: Game に状態を追加**

`src/js/main.js` の import に追加:

```javascript
import { advanceAccumulator, SIM_STEP, MAX_TICKS } from './utils/timestep.js';
```

`Game` の状態フィールドに追加（`gameSpeed` の近く）:

```javascript
    simAccumulator: 0,
    simAlpha: 1,
```

- [ ] **Step 6: _updatePlaying を分割**

`_updatePlaying(deltaTime)`（`src/js/main.js:339-372`）を、毎フレーム処理（タイマー＋入力単発）とアキュムレータ駆動の物理に分ける。置換後:

```javascript
    _updatePlaying(deltaTime) {
        // Timers advance in real time (mode does not slow the clock).
        this.totalTime += deltaTime;
        this.missionTimer += deltaTime;

        // Per-frame input / one-shots (run once regardless of tick count).
        if (this.input.crosshairLocked) {
            this.input.mouse.x = this.input.lockedWorldX - this.camera.x;
            this.input.mouse.y = this.input.lockedWorldY - this.camera.y;
        }
        this._updateMiniMap();
        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.switchWeapon();
        }
        this._handleDocking();
        this._handleShooting();

        // Fixed-timestep physics, scaled by gameSpeed.
        const { ticks, remainder, alpha } = advanceAccumulator(
            this.simAccumulator, deltaTime * this.gameSpeed, SIM_STEP, MAX_TICKS
        );
        for (let t = 0; t < ticks; t++) this._simulationTick();
        this.simAccumulator = remainder;
        this.simAlpha = alpha;
    },

    _simulationTick() {
        this._updateCarrier();
        this._updatePlayer();
        this._updateCamera();
        this._updateProjectiles();
        this._updateParticles();
        this._updateLandmines();
        this._updateRepairKits();
        this._updateAutoAimUnits();
        this._updateMissileKits();
        this._updateAutoAim();
        this.map.update();
        this._updateEnemies();
        this._checkMissionClear();
        this.collisionManager.update();
        this._updateProximityAlert();
    },
```

注意点:
- `_handleDocking` / `_handleShooting` は入力起点のため per-frame 側に置く（多重発火防止）。
- 元の `_updatePlaying` にあった処理はすべて上記いずれかに含まれること（漏れがないか元の 339-372 と突き合わせる）。

- [ ] **Step 7: 実機検証（速度）**

`/run` で起動。ニュータイプ＝現状どおりの体感、ノーマル＝敵/弾が約0.8倍でスロー、かつ画面右のタイマーは両モードとも実時間で進むことを確認。低フレーム環境でも暴走しない（MAX_TICKS でキャップ）。カクつきは Task 6 で対処するため、この時点で多少のスタッターは許容。

- [ ] **Step 8: 回帰確認＆コミット**

Run: `npm test`（全 PASS）。

```bash
git add src/js/utils/timestep.js tests/timestep.test.js src/js/main.js
git commit -m "feat: 固定タイムステップでモード速度(0.8x/1.0x)を実体化"
```

---

### Task 6: カメラ描画位置の補間（カクつき軽減）

物理ステップ間の余り `simAlpha` を使い、カメラの描画位置を前ステップ→現ステップで補間する。ワールド描画のオフセットのみ補間位置を使う（入力座標変換は従来どおり `camera.x/y`）。

**Files:**
- Modify: `src/js/world/Camera.js`（`prevX/prevY` スナップショット＋補間ヘルパ）
- Modify: `src/js/main.js:786-790`（`_drawWorld` のオフセットを補間位置に）
- Test: `tests/camera-interp.test.js`

**Interfaces:**
- Consumes: `Game.simAlpha`（Task 5）, `lerp`（Task 5）。
- Produces:
  - `Camera.prevX`, `Camera.prevY`（各 `update()` 開始時に更新前の `x/y` を保存）。
  - `Camera.renderX(alpha)` → `lerp(prevX, x, alpha)`、`Camera.renderY(alpha)` 同様。

- [ ] **Step 1: 失敗するテストを書く**

`tests/camera-interp.test.js`（Camera は canvas 非依存の座標計算のみ使用。`update()` は map/target 依存のため、補間ヘルパのみ検証する。最小 game スタブを渡す）:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/js/world/Camera.js';

function stubGame() {
  return { canvas: { width: 800, height: 600 }, map: { width: 8000, height: 6000 } };
}

test('renderX/renderY interpolate between prev and current', () => {
  const cam = new Camera(stubGame());
  cam.prevX = 100; cam.x = 200;
  cam.prevY = 50;  cam.y = 150;
  assert.equal(cam.renderX(0), 100);
  assert.equal(cam.renderX(1), 200);
  assert.equal(cam.renderX(0.5), 150);
  assert.equal(cam.renderY(0.5), 100);
});

test('prev defaults to current when unset (no jump)', () => {
  const cam = new Camera(stubGame());
  cam.x = 300; cam.y = 400;
  // prevX/prevY start equal to x/y (0 here) — after snapshotPrev they track.
  cam.snapshotPrev();
  assert.equal(cam.renderX(0.5), 300);
  assert.equal(cam.renderY(0.5), 400);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/camera-interp.test.js`
Expected: FAIL（`renderX`/`renderY`/`snapshotPrev` 未定義）。

- [ ] **Step 3: Camera を拡張**

`src/js/world/Camera.js` の import に `lerp` を追加:

```javascript
import { CAMERA_LERP, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from '../utils/Constants.js';
import { lerp } from '../utils/timestep.js';
```

`constructor` に前フレーム位置を追加:

```javascript
        this.x = 0;
        this.y = 0;
        this.prevX = 0;
        this.prevY = 0;
```

`update()` の先頭に現在位置のスナップショットを追加（早期 return より前）:

```javascript
    update() {
        this.snapshotPrev();
        if (!this.target) return;
        // ...既存の追従処理...
    }
```

クラスにメソッドを追加:

```javascript
    /** Record the current position as the previous-tick position (for render interpolation). */
    snapshotPrev() {
        this.prevX = this.x;
        this.prevY = this.y;
    }

    renderX(alpha) { return lerp(this.prevX, this.x, alpha); }
    renderY(alpha) { return lerp(this.prevY, this.y, alpha); }
```

また `snapToTarget()` の末尾（`this._clamp();` の後）に `this.snapshotPrev();` を追加し、初期スナップ時に prev と一致させてジャンプを防ぐ。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/camera-interp.test.js`
Expected: PASS。

- [ ] **Step 5: _drawWorld で補間位置を使う**

`src/js/main.js` の `_drawWorld`（`:786-790`）を、`playing` 中は `simAlpha`、それ以外は 1 を使って補間したオフセットに変更:

```javascript
    _drawWorld(ctx) {
        const alpha = (this.gameState === 'playing') ? this.simAlpha : 1;
        const camX = this.camera.renderX(alpha);
        const camY = this.camera.renderY(alpha);

        ctx.save();
        ctx.translate(-camX, -camY);

        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);

        this.map.draw(ctx);
```

（`ctx.restore()` までの範囲は変更なし。エンティティ自身は `this.x/y` で描かれ、カメラ補間により相対的に滑らかにスクロールする。）

- [ ] **Step 6: 実機検証（滑らかさ）**

`/run` でノーマルモードをプレイし、背景スクロールのカクつきが Task 5 時点より明確に軽減されていることを目視確認。ニュータイプでも従来どおり滑らかであること、カメラのロックオン/入力座標（クロスヘア）がズレていないことを確認。

- [ ] **Step 7: 回帰確認＆コミット**

Run: `npm test`（全 PASS）。

```bash
git add src/js/world/Camera.js tests/camera-interp.test.js src/js/main.js
git commit -m "feat: カメラ描画位置を補間しノーマルモードのカクつきを軽減"
```

---

## 完了条件

- `npm test` が全 PASS（新規: balance-constants / modes / scoring / timestep / camera-interp）。
- タイトルで ←/→ によりノーマル/ニュータイプを選択でき、選択が表示される。
- ノーマルは物理約0.8倍・ニュータイプは現状速度で、タイマーは両モード実時間。
- タイムボーナスがモード別減衰（40/50）・基準1.5倍で加算される。
- キャリア初期残機が1、配点（アタッカー300-900・巡航150・ドローン250/HP8・地雷50・アイテム200）が反映（ホーミング撃墜は20のまま）。
- ノーマルの背景スクロールのカクつきがカメラ補間で軽減されている。

## スコープ外（Phase 2 以降）

- 面別ランキング（別計画 `2026-07-18-phase2-stage-rankings-design.md`）。
- 全エンティティのレンダリング完全補間（カメラ補間で不足の場合のみ）。
- 設定画面（音量・キーコンフィグ等）。
