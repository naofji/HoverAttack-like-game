# Phase 2: 面別ランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週替わり・各面トップ5の面別ランキング（最速タイム＋ハイスコア、モード共通1本）をローカル＋オンライン(GAS)で記録・表示し、面クリア時にトップ5入りを通知する。

**Architecture:** 純ロジック（面別集計・stageScore算出・GAS純関数）は既存パターンどおりテスト可能なモジュールに分離し `node --test` で検証。ゲーム本体・描画・GAS配線は既存パターンに従い、ロジックを純関数に寄せてテストする。走行中は各面結果を `Game.stageResults` にバッファし、名前確定時（既存の全体ハイスコア入力時のみ）にローカル＆GASへ送信する。

**Tech Stack:** Vanilla ES Modules, HTML5 Canvas, `node --test`, Google Apps Script（`gas/Code.gs`）。

## Global Constraints

- ES Modules のみ。純ロジックはブラウザ/Node両対応（DOM/GAS依存を持ち込まない）。
- `gas/Code.gs` は Plain JS のみ（`import`/`export`禁止、関数宣言）。Google globals（SpreadsheetApp等）は関数内でのみ参照し、純関数は `node:vm` の `runInThisContext` でテスト可能に保つ（既存 `tests/gas-core.test.js` 準拠）。
- 面別ランキングは **週替わり**（既存 weekId と同周期）、各面 **トップ5**、**モード共通で1本**（mode で分けない）。
- 面は 1〜7。`time` は `timeMs` 昇順トップ5、`score` は `score` 降順トップ5。
- 面別送信は **名前が確定した場合のみ**（既存 `HighScoreManager.isHighScore` により `ranking_entry` に入り、Enter で名前確定した時）。
- stageScore = `(面クリア時点の score − 面開始時の score) + その面の targetTimeBonus`（＝撃破分＋フラグ加点＋タイムボーナス）。stageTime = 面クリア時の `missionTimer`(ms)。
- 既存フロー（全体ランキング、殿堂入り、GAS の Scores/Fame）は壊さない。面別は殿堂入り対象外。
- テスト: `node --test`（`npm test`）、テストは `tests/*.test.js`。
- 1タスク=1コミット。ゲーム本体/描画/GAS配線はこのリポジトリの慣習によりブラウザ実機/手動デプロイ確認（ユニットテスト対象外）。

## ファイル構成（新規/変更）

- Create: `src/js/systems/StageRankingManager.js` — ローカル面別ランキング（localStorage、週ロールオーバー）。
- Create: `tests/StageRankingManager.test.js`
- Modify: `src/js/utils/scoring.js` — `buildStageResult(...)` 追加（純関数）。
- Modify: `tests/scoring.test.js` — `buildStageResult` テスト追加。
- Modify: `src/js/utils/Constants.js` — `STAGE_PALETTES` を追加（Map.js から抽出）。
- Modify: `src/js/world/Map.js` — インライン palettes を `STAGE_PALETTES` 参照に置換。
- Modify: `src/js/systems/OnlineLeaderboard.js` — `submitStages(...)` 追加＋`fetchData` で `stageRankings` を通す。
- Modify: `tests/OnlineLeaderboard.test.js` — 追加分のテスト。
- Modify: `gas/Code.gs` — `StageScores` シート、`topStagesForWeek`、`validateStageEntry`、doGet/doPost 拡張。
- Modify: `tests/gas-core.test.js` — GAS 純関数テスト追加。
- Modify: `src/js/main.js` — 面別追跡・送信・表示ステート・巡回挿入・面クリア通知の配線。
- Modify: `src/js/systems/GameStateManager.js` — `stageStartScore` スナップショット。
- Modify: `src/js/ui/ScreenRenderer.js` — `drawStageRankings(...)`、面クリア通知描画。

---

### Task 1: ステージ配色 STAGE_PALETTES の抽出

`Map.js` にインラインの7色パレットを共有定数へ切り出し、表示画面（Task 8）と共用する。

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/world/Map.js:30-40`
- Test: `tests/stage-palettes.test.js`

**Interfaces:**
- Produces: `STAGE_PALETTES` — 長さ7の配列 `[{ fill, border }, ...]`（面1..7）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/stage-palettes.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';

test('7 stage palettes with fill+border', () => {
    assert.equal(STAGE_PALETTES.length, 7);
    for (const p of STAGE_PALETTES) {
        assert.match(p.fill, /^#[0-9A-Fa-f]{6}$/);
        assert.match(p.border, /^#[0-9A-Fa-f]{6}$/);
    }
});

test('stage 1 is brown, stage 7 is dark slate blue', () => {
    assert.equal(STAGE_PALETTES[0].fill, '#8B4513');
    assert.equal(STAGE_PALETTES[6].fill, '#483D8B');
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test -- tests/stage-palettes.test.js`
Expected: FAIL（`STAGE_PALETTES` 未export）。

- [ ] **Step 3: Constants.js に追加**

`src/js/utils/Constants.js` に追記（既存のブロック定数付近）:

```javascript
// Per-stage normal-block palette (stage 1..7). Shared by Map rendering and the
// stage-ranking attract screen so each stage shows in its own colour.
export const STAGE_PALETTES = [
    { fill: '#8B4513', border: '#5c2e0b' }, // 1: Brown
    { fill: '#A0522D', border: '#70381d' }, // 2: Sienna
    { fill: '#B8860B', border: '#825e07' }, // 3: DarkGoldenrod
    { fill: '#2E8B57', border: '#1e5c39' }, // 4: SeaGreen
    { fill: '#4682B4', border: '#2e5677' }, // 5: SteelBlue
    { fill: '#4B3621', border: '#2b1e12' }, // 6: Cafe Noir
    { fill: '#483D8B', border: '#2e2759' }, // 7: DarkSlateBlue
];
```

- [ ] **Step 4: Map.js を参照に置換**

`src/js/world/Map.js` の import に `STAGE_PALETTES` を追加。`constructor` 内のインライン `const palettes = [ ... ]`（7要素）を削除し、`const palettes = STAGE_PALETTES;` に置換。`const palIdx = (this.missionLevel || 0) % palettes.length;` 以降はそのまま。

- [ ] **Step 5: テスト＋回帰**

Run: `npm test`
Expected: 新規 stage-palettes PASS、既存の MapDeterminism 等も PASS（配色値は同一なので決定性不変）。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Constants.js src/js/world/Map.js tests/stage-palettes.test.js
git commit -m "refactor: ステージ配色をSTAGE_PALETTESに集約(Mapと面別ランキング画面で共用)"
```

---

### Task 2: stageScore 算出ヘルパ buildStageResult

面クリア時に確定できる純関数を `scoring.js` に追加。

**Files:**
- Modify: `src/js/utils/scoring.js`
- Test: `tests/scoring.test.js`（追記）

**Interfaces:**
- Produces: `buildStageResult({ stage, scoreNow, stageStartScore, targetTimeBonus, timeMs })` →
  `{ stage, timeMs, score }`。`score = (scoreNow - stageStartScore) + targetTimeBonus`（整数、負値は0にクランプ）。

- [ ] **Step 1: 失敗するテストを追記**

`tests/scoring.test.js` の末尾に追記（既存 import 行に `buildStageResult` を追加）:

```javascript
import { computeTimeBonus, TIME_BONUS_BASE_MULT, buildStageResult } from '../src/js/utils/scoring.js';

test('buildStageResult = (scoreNow - stageStartScore) + timeBonus', () => {
    const r = buildStageResult({ stage: 3, scoreNow: 18000, stageStartScore: 10000, targetTimeBonus: 2500, timeMs: 42000 });
    assert.deepEqual(r, { stage: 3, timeMs: 42000, score: 8000 + 2500 });
});

test('buildStageResult clamps negative to 0', () => {
    const r = buildStageResult({ stage: 1, scoreNow: 100, stageStartScore: 5000, targetTimeBonus: 0, timeMs: 1000 });
    assert.equal(r.score, 0);
});
```

（既存 `import { computeTimeBonus, TIME_BONUS_BASE_MULT } ...` の行を上記の3識別子版に置き換える。）

- [ ] **Step 2: 失敗確認**

Run: `npm test -- tests/scoring.test.js`
Expected: FAIL（`buildStageResult` 未定義）。

- [ ] **Step 3: 実装**

`src/js/utils/scoring.js` に追記:

```javascript
// A single stage's result, finalised at flag capture. score = points earned
// during the stage (kills + flag) plus that stage's time bonus.
export function buildStageResult({ stage, scoreNow, stageStartScore, targetTimeBonus, timeMs }) {
    const score = Math.max(0, (scoreNow - stageStartScore) + targetTimeBonus);
    return { stage, timeMs, score };
}
```

- [ ] **Step 4: テスト通過**

Run: `npm test -- tests/scoring.test.js`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/scoring.js tests/scoring.test.js
git commit -m "feat: 面別スコア算出 buildStageResult を追加"
```

---

### Task 3: StageRankingManager（ローカル面別ランキング）

localStorage ベースの面別ランキング。既存 `HighScoreManager` のロールオーバー方針を踏襲。

**Files:**
- Create: `src/js/systems/StageRankingManager.js`
- Test: `tests/StageRankingManager.test.js`

**Interfaces:**
- Produces: `class StageRankingManager`
  - `constructor(weekId)` — localStorage `hoverattack_stage_rankings` を読み、weekId 不一致ならリセット。
  - `addStageResult(stage, { name, timeMs, score, country })` — stage(1..7) の time/score に挿入・ソート・トップ5切詰め・保存。
  - `getStage(stage)` → `{ time: [{name,timeMs,country}], score: [{name,score,country}] }`（time昇順/score降順、各最大5）。
  - `wouldRankTime(stage, timeMs)` → boolean（トップ5に入るか）。
  - `wouldRankScore(stage, score)` → boolean。
- 定数: `STAGE_TOP = 5`, `STAGE_COUNT = 7`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/StageRankingManager.test.js`:

```javascript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function installStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };
    return store;
}
beforeEach(() => installStorage());

test('empty stage returns empty lists', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    assert.deepEqual(m.getStage(1), { time: [], score: [] });
});

test('time sorts ascending, score sorts descending, top 5 each', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    for (let i = 1; i <= 7; i++) {
        m.addStageResult(2, { name: 'P' + i, timeMs: i * 1000, score: i * 100, country: 'JP' });
    }
    const s = m.getStage(2);
    assert.equal(s.time.length, 5);
    assert.equal(s.score.length, 5);
    assert.equal(s.time[0].timeMs, 1000);          // fastest first
    assert.equal(s.time[4].timeMs, 5000);
    assert.equal(s.score[0].score, 700);           // highest first
    assert.equal(s.score[4].score, 300);
});

test('wouldRankTime / wouldRankScore boundaries', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    for (let i = 1; i <= 5; i++) m.addStageResult(1, { name: 'P' + i, timeMs: i * 1000, score: i * 100, country: '' });
    // time list full with 1000..5000; a 4500 beats the 5th (5000) -> ranks
    assert.equal(m.wouldRankTime(1, 4500), true);
    assert.equal(m.wouldRankTime(1, 5000), false); // not strictly faster than slowest kept
    // score list full with 100..500; 450 beats the 5th (100) -> ranks
    assert.equal(m.wouldRankScore(1, 450), true);
    assert.equal(m.wouldRankScore(1, 100), false);
});

test('rolls over when weekId changes', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const a = new StageRankingManager('2026-W10');
    a.addStageResult(1, { name: 'X', timeMs: 1000, score: 999, country: '' });
    const b = new StageRankingManager('2026-W11'); // different week
    assert.deepEqual(b.getStage(1), { time: [], score: [] });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test -- tests/StageRankingManager.test.js`
Expected: FAIL（モジュール不在）。

- [ ] **Step 3: 実装**

`src/js/systems/StageRankingManager.js`:

```javascript
// ============================================
// StageRankingManager - per-stage weekly rankings (local)
// Two lists per stage: fastest time (asc) and high score (desc), top 5 each.
// ============================================

const STAGE_KEY = 'hoverattack_stage_rankings';
export const STAGE_TOP = 5;
export const STAGE_COUNT = 7;

function emptyStages() {
    return Array.from({ length: STAGE_COUNT }, () => ({ time: [], score: [] }));
}

export class StageRankingManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.stages = emptyStages();
        this._load();
    }

    _load() {
        let stored = null;
        try {
            const data = localStorage.getItem(STAGE_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load stage rankings:', e);
            stored = null;
        }
        if (stored && stored.weekId === this.weekId && Array.isArray(stored.stages) && stored.stages.length === STAGE_COUNT) {
            this.stages = stored.stages.map((s) => ({
                time: Array.isArray(s.time) ? s.time : [],
                score: Array.isArray(s.score) ? s.score : [],
            }));
        } else {
            this.stages = emptyStages();
            this._save();
        }
    }

    _save() {
        try {
            localStorage.setItem(STAGE_KEY, JSON.stringify({ weekId: this.weekId, stages: this.stages }));
        } catch (e) {
            console.error('Failed to save stage rankings:', e);
        }
    }

    _slot(stage) {
        const idx = stage - 1;
        if (idx < 0 || idx >= STAGE_COUNT) return null;
        return this.stages[idx];
    }

    addStageResult(stage, { name, timeMs, score, country }) {
        const slot = this._slot(stage);
        if (!slot) return;
        const nm = (name || 'AAA').toUpperCase().substring(0, 10);
        const co = country || '';
        slot.time.push({ name: nm, timeMs, country: co });
        slot.time.sort((a, b) => a.timeMs - b.timeMs);
        slot.time = slot.time.slice(0, STAGE_TOP);
        slot.score.push({ name: nm, score, country: co });
        slot.score.sort((a, b) => b.score - a.score);
        slot.score = slot.score.slice(0, STAGE_TOP);
        this._save();
    }

    getStage(stage) {
        const slot = this._slot(stage);
        return slot ? { time: slot.time, score: slot.score } : { time: [], score: [] };
    }

    wouldRankTime(stage, timeMs) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.time.length < STAGE_TOP) return true;
        return timeMs < slot.time[slot.time.length - 1].timeMs;
    }

    wouldRankScore(stage, score) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.score.length < STAGE_TOP) return true;
        return score > slot.score[slot.score.length - 1].score;
    }
}
```

- [ ] **Step 4: テスト通過**

Run: `npm test -- tests/StageRankingManager.test.js`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/js/systems/StageRankingManager.js tests/StageRankingManager.test.js
git commit -m "feat: 面別ランキングのローカル管理 StageRankingManager を追加"
```

---

### Task 4: 走行中の面別結果トラッキング

面開始時のスコアをスナップショットし、面クリア時に `buildStageResult` で結果をバッファ。あわせて面クリア通知用のトップ5判定フラグを立てる。

**Files:**
- Modify: `src/js/systems/GameStateManager.js:21-32`（`stageStartScore` スナップショット）
- Modify: `src/js/main.js`（状態追加、`_onFlagCaptured` に記録＋通知フラグ）

**Interfaces:**
- Consumes: `buildStageResult`（Task 2）、`Game.stageRankingManager`（Task 5 で初期化。本タスクでは通知判定に使うが、未初期化でも安全にガードする）。
- Produces:
  - `Game.stageStartScore`（number）— 面開始時の score。
  - `Game.stageResults`（array）— `[{ stage, timeMs, score }]`。
  - `Game.stageTop5Time` / `Game.stageTop5Score`（boolean）— 直近クリア面の暫定トップ5判定（面クリア画面表示用）。

- [ ] **Step 1: GameStateManager に stageStartScore スナップショット**

`src/js/systems/GameStateManager.js` の `resetLevel` 内、`game.missionTimer = 0;` の近くに追加:

```javascript
        game.stageStartScore = game.score;
```

（`resetScore` 時は既に score=0 済みなので、この行はどちらの経路でも「面開始時の累計スコア」を正しく捉える。）

- [ ] **Step 2: Game 状態フィールドを追加**

`src/js/main.js` の状態フィールド（`currentTimeBonus: 0,` 付近）に追加:

```javascript
    stageStartScore: 0,
    stageResults: [],
    stageTop5Time: false,
    stageTop5Score: false,
```

- [ ] **Step 3: main.js の import に buildStageResult を追加**

`import { computeTimeBonus } from './utils/scoring.js';` を
`import { computeTimeBonus, buildStageResult } from './utils/scoring.js';` に変更。

- [ ] **Step 4: _onFlagCaptured に記録＋通知判定**

`src/js/main.js` `_onFlagCaptured`（`this.currentTimeBonus = 0;` の直後、`this.slotRunning = true;` の前）に追加:

```javascript
        // Record this stage's result (finalised: kills + flag + time bonus).
        const clearedStage = this.missionsCompleted; // already incremented above (1..7)
        const stageResult = buildStageResult({
            stage: clearedStage,
            scoreNow: this.score,
            stageStartScore: this.stageStartScore,
            targetTimeBonus: this.targetTimeBonus,
            timeMs: this.missionTimer,
        });
        this.stageResults.push(stageResult);

        // Preliminary "would this make top 5?" notice for the mission-clear screen.
        // Prefer online stage rankings if loaded, else local manager.
        this.stageTop5Time = this._wouldStageRankTime(clearedStage, stageResult.timeMs);
        this.stageTop5Score = this._wouldStageRankScore(clearedStage, stageResult.score);
```

- [ ] **Step 5: 通知判定ヘルパを追加**

`src/js/main.js` に（`_onFlagCaptured` の近くに）メソッドを追加。オンライン `stageRankings` があればそれで、無ければローカル `stageRankingManager` で判定。どちらも無ければ false。

```javascript
    _onlineStageEntry(stage) {
        const sr = this.onlineData && this.onlineData.stageRankings;
        if (!Array.isArray(sr)) return null;
        return sr.find((e) => e.stage === stage) || null;
    },

    _wouldStageRankTime(stage, timeMs) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online.time || [];
            return list.length < 5 || timeMs < list[list.length - 1].timeMs;
        }
        return this.stageRankingManager ? this.stageRankingManager.wouldRankTime(stage, timeMs) : false;
    },

    _wouldStageRankScore(stage, score) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online.score || [];
            return list.length < 5 || score > list[list.length - 1].score;
        }
        return this.stageRankingManager ? this.stageRankingManager.wouldRankScore(stage, score) : false;
    },
```

- [ ] **Step 6: stageResults を full restart でリセット**

面別バッファは1走行単位。full restart（`resetScore=true`）でクリアするのが自然。`GameStateManager.resetLevel` の `if (resetScore) { ... }` ブロック内に追加:

```javascript
            game.stageResults = [];
```

- [ ] **Step 7: 回帰確認＋自己レビュー**

Run: `npm test`（全 PASS、既存不変）。
自己レビュー: `_onFlagCaptured` で `missionsCompleted++` 後に `clearedStage` を取るので 1..7 になること、`stageStartScore` が各面頭で更新されることを読み合わせで確認。

- [ ] **Step 8: コミット**

```bash
git add src/js/main.js src/js/systems/GameStateManager.js
git commit -m "feat: 走行中に面別結果を記録しトップ5暫定判定を保持"
```

---

### Task 5: StageRankingManager の初期化とローカル送信

`Game` に `stageRankingManager` を持たせ、名前確定時にバッファ済み各面結果をローカルへ記録する。

**Files:**
- Modify: `src/js/main.js`（import・init・`_updateRankingEntry`）

**Interfaces:**
- Consumes: `StageRankingManager`（Task 3）、`Game.stageResults`（Task 4）、`getCountryCode()`（既存）。
- Produces: `Game.stageRankingManager` インスタンス。ローカル面別ランキングが名前確定時に更新される。

- [ ] **Step 1: import 追加**

`src/js/main.js` の import 群に追加:

```javascript
import { StageRankingManager } from './systems/StageRankingManager.js';
```

- [ ] **Step 2: init で生成**

`src/js/main.js` の `init()` 内、`this.highScoreManager = new HighScoreManager(...)` の近くに追加（既存の highScoreManager 生成箇所を確認して同じ weekId を使う）:

```javascript
        this.stageRankingManager = new StageRankingManager(this.week.weekId);
```

（`this.week.weekId` は既存の highScoreManager 生成と同じ値を使うこと。実際の変数名は既存コードに合わせる。）

- [ ] **Step 3: _updateRankingEntry でローカル記録**

`src/js/main.js` `_updateRankingEntry` の Enter ブランチ、既存の `this._submitOnline(...)` 呼び出しの直後に追加:

```javascript
                // Persist this run's per-stage results locally (and online in Task 6).
                for (const r of this.stageResults) {
                    this.stageRankingManager.addStageResult(r.stage, {
                        name: this.playerNameInput,
                        timeMs: r.timeMs,
                        score: r.score,
                        country,
                    });
                }
```

（`country` は同ブランチ内で既に `getCountryCode()` から取得済みの変数を再利用する。）

- [ ] **Step 4: 回帰確認**

Run: `npm test`（全 PASS）。

- [ ] **Step 5: 自己レビュー＋コミット**

自己レビュー: 名前確定（Enter）時のみ記録されること、`stageResults` 内容が各面1件ずつであることを確認。

```bash
git add src/js/main.js
git commit -m "feat: 名前確定時に面別結果をローカルへ記録"
```

---

### Task 6: OnlineLeaderboard の面別対応（送信＋取得）

`OnlineLeaderboard` に面別バッチ送信を追加し、`fetchData` の戻りに `stageRankings` を通す。名前確定時にオンライン送信も行う。

**Files:**
- Modify: `src/js/systems/OnlineLeaderboard.js`
- Modify: `src/js/main.js`（`_updateRankingEntry` で `submitStages` 呼び出し、`_refreshOnline` は既存のまま stageRankings を取り込む）
- Test: `tests/OnlineLeaderboard.test.js`（追記）

**Interfaces:**
- Produces:
  - `OnlineLeaderboard.submitStages({ name, country, stages }, timeoutMs=5000)` → `{ ok: true }` or `{ ok: false, error }`。
    POST 本文 `{ kind: 'stages', name, country, stages: [{ stage, timeMs, score }] }`。
  - `fetchData` の戻り値に `stageRankings`（配列、無ければ `[]`）を含める。

- [ ] **Step 1: 失敗するテストを追記**

`tests/OnlineLeaderboard.test.js` に追記:

```javascript
test('fetchData passes through stageRankings', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ ok: true, weekId: '2026-W29', ranking: [], fame: [], stageRankings: [{ stage: 1, time: [], score: [] }] }),
    });
    const lb = new OnlineLeaderboard('https://example.test/exec');
    const res = await lb.fetchData();
    assert.equal(res.ok, true);
    assert.equal(res.stageRankings.length, 1);
    assert.equal(res.stageRankings[0].stage, 1);
});

test('fetchData defaults stageRankings to [] when absent', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, weekId: 'W', ranking: [], fame: [] }) });
    const lb = new OnlineLeaderboard('https://example.test/exec');
    const res = await lb.fetchData();
    assert.deepEqual(res.stageRankings, []);
});

test('submitStages posts kind=stages and returns ok', async () => {
    let sent = null;
    globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; };
    const lb = new OnlineLeaderboard('https://example.test/exec');
    const res = await lb.submitStages({ name: 'ZZ', country: 'JP', stages: [{ stage: 1, timeMs: 1000, score: 500 }] });
    assert.equal(res.ok, true);
    assert.equal(sent.kind, 'stages');
    assert.equal(sent.name, 'ZZ');
    assert.equal(sent.stages[0].stage, 1);
});

test('submitStages returns not-configured with empty url', async () => {
    const lb = new OnlineLeaderboard('');
    assert.deepEqual(await lb.submitStages({ name: 'A', country: '', stages: [] }), { ok: false, error: 'not-configured' });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test -- tests/OnlineLeaderboard.test.js`
Expected: FAIL（`submitStages` 未定義、`stageRankings` 未通過）。

- [ ] **Step 3: fetchData に stageRankings を追加**

`src/js/systems/OnlineLeaderboard.js` の `fetchData` 成功 return を変更:

```javascript
            return { ok: true, weekId: data.weekId, ranking: data.ranking || [], fame: data.fame || [], stageRankings: data.stageRankings || [] };
```

- [ ] **Step 4: submitStages を追加**

`OnlineLeaderboard` クラスに `submit` と同型のメソッドを追加:

```javascript
    async submitStages(payload, timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ kind: 'stages', name: payload.name, country: payload.country, stages: payload.stages || [] }),
                signal: ctrl.signal,
            });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: (data && data.reason) || 'bad-data' };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }
```

- [ ] **Step 5: テスト通過**

Run: `npm test -- tests/OnlineLeaderboard.test.js`
Expected: PASS。

- [ ] **Step 6: main.js でオンライン送信を配線**

`src/js/main.js` `_updateRankingEntry` の Enter ブランチ、Task 5 で追加したローカル記録ループの直後に追加（`stageResults` が空でなければ送信）:

```javascript
                if (this.stageResults.length > 0 && this.onlineLeaderboard && this.onlineLeaderboard.url) {
                    this.onlineLeaderboard.submitStages({
                        name: this.playerNameInput,
                        country,
                        stages: this.stageResults.map((r) => ({ stage: r.stage, timeMs: r.timeMs, score: r.score })),
                    });
                }
```

（fire-and-forget。既存 `_submitOnline` も await していない方針に合わせる。送信後の再取得は既存 `_submitOnline`→`_refreshOnline` が担うため追加不要。）

- [ ] **Step 7: 回帰確認＋コミット**

Run: `npm test`（全 PASS）。

```bash
git add src/js/systems/OnlineLeaderboard.js tests/OnlineLeaderboard.test.js src/js/main.js
git commit -m "feat: 面別ランキングのオンライン送信/取得(submitStages/stageRankings)"
```

---

### Task 7: GAS Code.gs の面別対応

`StageScores` シート、`topStagesForWeek`（純関数）、面別バリデーション、doGet/doPost 拡張。GAS 純関数はテストする。**シート作成と再デプロイはユーザーの手動作業**（本タスクはコードのみ）。

**Files:**
- Modify: `gas/Code.gs`
- Test: `tests/gas-core.test.js`（追記）

**Interfaces:**
- Produces（純関数）:
  - `validateStageEntry(entry)` → `{ ok, value: { name, country, stages: [{stage,timeMs,score}] } }` or `{ ok:false, reason }`。stage は 1..7 にクランプ、timeMs/score は有限の非負整数、stages は 1..7 件。
  - `topStagesForWeek(stageRows, weekId, n)` → 長さ7の配列 `[{ stage, time:[top n asc], score:[top n desc] }, ...]`。
  - 列: `StageScores` = `timestamp, weekId, name, stage, timeMs, score, country`。

- [ ] **Step 1: 失敗するテストを追記**

`tests/gas-core.test.js` に追記（`ctx` 経由で関数を参照）:

```javascript
test('validateStageEntry accepts a well-formed stage batch', () => {
    const v = ctx.validateStageEntry({ kind: 'stages', name: 'ab', country: 'jp', stages: [{ stage: 1, timeMs: 1000, score: 500 }, { stage: 9, timeMs: 2000, score: 100 }] });
    assert.equal(v.ok, true);
    assert.equal(v.value.name, 'AB');
    assert.equal(v.value.country, 'JP');
    assert.equal(v.value.stages[0].stage, 1);
    assert.equal(v.value.stages[1].stage, 7); // clamped 9 -> 7
});

test('validateStageEntry rejects empty or oversized batch', () => {
    assert.equal(ctx.validateStageEntry({ stages: [] }).ok, false);
    const many = Array.from({ length: 8 }, (_, i) => ({ stage: 1, timeMs: 1, score: 1 }));
    assert.equal(ctx.validateStageEntry({ stages: many }).ok, false);
});

test('validateStageEntry rejects bad numbers', () => {
    assert.equal(ctx.validateStageEntry({ stages: [{ stage: 1, timeMs: -5, score: 100 }] }).ok, false);
    assert.equal(ctx.validateStageEntry({ stages: [{ stage: 1, timeMs: 100, score: 1.5 }] }).ok, false);
});

test('topStagesForWeek returns 7 stages, time asc / score desc top-n', () => {
    // rows: [timestamp, weekId, name, stage, timeMs, score, country]
    const rows = [
        [new Date(), 'W1', 'A', 1, 5000, 100, 'JP'],
        [new Date(), 'W1', 'B', 1, 3000, 900, 'US'],
        [new Date(), 'W1', 'C', 1, 4000, 500, ''],
        [new Date(), 'W2', 'D', 1, 100, 9999, ''], // other week ignored
    ];
    const out = ctx.topStagesForWeek(rows, 'W1', 5);
    assert.equal(out.length, 7);
    const s1 = out[0];
    assert.equal(s1.stage, 1);
    assert.equal(s1.time[0].timeMs, 3000);   // fastest
    assert.equal(s1.score[0].score, 900);    // highest
    assert.equal(out[1].time.length, 0);     // stage 2 empty
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test -- tests/gas-core.test.js`
Expected: FAIL（`validateStageEntry`/`topStagesForWeek` 未定義）。

- [ ] **Step 3: Code.gs に純関数とシート定数を追加**

`gas/Code.gs` の定数付近に追加:

```javascript
var STAGE_SCORES_SHEET = 'StageScores';
var STAGE_TOP = 5;
var STAGE_COUNT = 7;
```

純関数を（既存の純関数群の近くに）追加:

```javascript
function validateStageEntry(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.stages)) return { ok: false, reason: 'bad-body' };
  if (entry.stages.length < 1 || entry.stages.length > STAGE_COUNT) return { ok: false, reason: 'stage-count' };
  var out = [];
  for (var i = 0; i < entry.stages.length; i++) {
    var s = entry.stages[i];
    if (!s || typeof s !== 'object') return { ok: false, reason: 'bad-stage' };
    var timeMs = Number(s.timeMs);
    var score = Number(s.score);
    if (!isFinite(timeMs) || Math.floor(timeMs) !== timeMs || timeMs < 0 || timeMs > SCORE_CAP) return { ok: false, reason: 'bad-time' };
    if (!isFinite(score) || Math.floor(score) !== score || score < 0 || score > SCORE_CAP) return { ok: false, reason: 'bad-score' };
    var stage = Math.min(STAGE_COUNT, Math.max(1, Math.floor(Number(s.stage) || 1)));
    out.push({ stage: stage, timeMs: timeMs, score: score });
  }
  return { ok: true, value: { name: sanitizeName(entry.name), country: sanitizeCountry(entry.country), stages: out } };
}

function topStagesForWeek(rows, weekId, n) {
  var byStage = [];
  for (var s = 0; s < STAGE_COUNT; s++) byStage.push([]);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) !== weekId) continue;
    var stage = Number(rows[i][3]);
    if (stage < 1 || stage > STAGE_COUNT) continue;
    byStage[stage - 1].push({ name: rows[i][2], timeMs: Number(rows[i][4]), score: Number(rows[i][5]), country: rows[i][6] || '' });
  }
  var out = [];
  for (var k = 0; k < STAGE_COUNT; k++) {
    var entries = byStage[k];
    var timeSorted = entries.slice().sort(function (a, b) { return a.timeMs - b.timeMs; })
      .slice(0, n).map(function (e) { return { name: e.name, timeMs: e.timeMs, country: e.country }; });
    var scoreSorted = entries.slice().sort(function (a, b) { return b.score - a.score; })
      .slice(0, n).map(function (e) { return { name: e.name, score: e.score, country: e.country }; });
    out.push({ stage: k + 1, time: timeSorted, score: scoreSorted });
  }
  return out;
}
```

- [ ] **Step 4: doGet / doPost / glue を拡張**

`doGet` の return に `stageRankings` を追加:

```javascript
function doGet(e) {
  var weekId = isoWeekId(new Date());
  var scores = readRows_(getSheet_(SCORES_SHEET));
  var fame = readRows_(getSheet_(FAME_SHEET));
  var stageRows = readRows_(getSheet_(STAGE_SCORES_SHEET));
  return jsonOut_({
    ok: true,
    weekId: weekId,
    ranking: topNForWeek(scores, weekId, MAX_RANKING),
    fame: groupFame(fame),
    stageRankings: topStagesForWeek(stageRows, weekId, STAGE_TOP),
  });
}
```

`doPost` の冒頭（JSON parse 後、`validateEntry` の前）に面別分岐を追加:

```javascript
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut_({ ok: false, reason: 'bad-json' }); }

    if (body && body.kind === 'stages') {
      var sv = validateStageEntry(body);
      if (!sv.ok) return jsonOut_({ ok: false, reason: sv.reason });
      var stageSheet = getSheet_(STAGE_SCORES_SHEET);
      var stageRows = readRows_(stageSheet);
      var nowS = new Date();
      for (var si = stageRows.length - 1; si >= 0; si--) {
        if (stageRows[si][2] === sv.value.name) {
          if (nowS.getTime() - new Date(stageRows[si][0]).getTime() < RATE_LIMIT_MS) {
            return jsonOut_({ ok: false, reason: 'rate-limited' });
          }
          break;
        }
      }
      var weekS = isoWeekId(nowS);
      for (var sj = 0; sj < sv.value.stages.length; sj++) {
        var st = sv.value.stages[sj];
        stageSheet.appendRow([nowS, weekS, sv.value.name, st.stage, st.timeMs, st.score, sv.value.country || '']);
      }
      return jsonOut_({ ok: true });
    }
```

注意: `readRows_` は現在 7列固定（`getRange(2,1,lastRow-1,7)`）。`StageScores` も7列なのでそのまま流用可。`getSheet_(STAGE_SCORES_SHEET)` は該当シートが無いと null になるため、**ユーザーがスプレッドシートに `StageScores` シート（1行目ヘッダ: timestamp, weekId, name, stage, timeMs, score, country）を作成する**前提（手順は下記「デプロイ手順」）。doGet 側は防御的に、シート未作成でも落ちないよう `readRows_` 呼び出しを次のようにガードする:

```javascript
function readStageRows_() {
  var sh = getSheet_(STAGE_SCORES_SHEET);
  return sh ? readRows_(sh) : [];
}
```

`doGet` と面別 doPost の `readRows_(getSheet_(STAGE_SCORES_SHEET))` は `readStageRows_()` に置き換える（doPost 側の append はシート必須なので、null の場合は `{ ok:false, reason:'no-stage-sheet' }` を返す形にする）。実装時、doPost 面別分岐の先頭で `var stageSheet = getSheet_(STAGE_SCORES_SHEET); if (!stageSheet) return jsonOut_({ ok:false, reason:'no-stage-sheet' });` を入れること。

- [ ] **Step 5: テスト通過＋回帰**

Run: `npm test`（全 PASS。既存 gas-core テストは既存関数を対象に不変）。

- [ ] **Step 6: デプロイ手順を追記（ドキュメント）**

`docs/superpowers/specs/2026-07-15-gas-setup.md`（既存のGASセットアップ手順）に、`StageScores` シート作成（ヘッダ列: `timestamp, weekId, name, stage, timeMs, score, country`）と Web アプリの再デプロイが必要な旨を追記する。

- [ ] **Step 7: コミット**

```bash
git add gas/Code.gs tests/gas-core.test.js docs/superpowers/specs/2026-07-15-gas-setup.md
git commit -m "feat: GASに面別ランキング(StageScores/topStagesForWeek/面別doPost)を追加"
```

---

### Task 8: 面別ランキング表示画面（自動巡回）

新ステート `stage_ranking_display` を追加し、STAGE 1→7 を一定秒ずつステージ色で自動表示。既存巡回に挿入。

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`（`drawStageRankings` 追加）
- Modify: `src/js/main.js`（ステート・巡回・サブタイマー・draw dispatch）

**Interfaces:**
- Consumes: `STAGE_PALETTES`（Task 1）、`Game.onlineData.stageRankings`（Task 6）、`Game.stageRankingManager.getStage`（Task 3）、既存 `flagEmoji`。
- Produces: `ScreenRenderer.drawStageRankings(ctx, stageIndex, stageData, palette)`（stageIndex: 0..6、stageData: `{ time:[...], score:[...] }`、palette: `{ fill, border }`）。

- [ ] **Step 1: draw メソッドを追加**

`src/js/ui/ScreenRenderer.js` に追加（`_drawRankingList` の近く。`flagEmoji`/`_metallicText` は既存 import/メソッド）:

```javascript
    drawStageRankings(ctx, stageIndex, stageData, palette) {
        const canvas = this.game.canvas;
        const stageNo = stageIndex + 1;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header in this stage's colour.
        ctx.textAlign = 'center';
        this._metallicText(ctx, `STAGE ${stageNo}  RANKINGS`, canvas.width / 2, 44, palette.fill, 34);
        ctx.fillStyle = palette.border;
        ctx.font = 'bold 14px "Space Mono", monospace';
        ctx.fillText('THIS WEEK · TOP 5', canvas.width / 2, 68);

        this._drawStageBlock(ctx, 'FASTEST TIME', stageData.time || [], 100, palette, true);
        this._drawStageBlock(ctx, 'HIGH SCORE', stageData.score || [], 320, palette, false);

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 18px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height - 18);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    _drawStageBlock(ctx, label, rows, topY, palette, isTime) {
        const canvas = this.game.canvas;
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.fill;
        ctx.font = 'bold 20px "Space Mono", monospace';
        ctx.fillText(label, canvas.width / 2, topY);

        const startY = topY + 30;
        const lineH = 30;
        const textLeft = canvas.width / 2 - 200;
        if (rows.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#666666';
            ctx.font = 'bold 16px "Space Mono", monospace';
            ctx.fillText('NO RECORDS YET', canvas.width / 2, startY + 20);
            ctx.textAlign = 'left';
            return;
        }
        ctx.font = 'bold 18px "Space Mono", monospace';
        ctx.textAlign = 'left';
        rows.forEach((entry, i) => {
            const rank = String(i + 1);
            const name = (entry.name || '').padEnd(10, ' ');
            const flag = flagEmoji(entry.country);
            const valStr = isTime ? this._formatMs(entry.timeMs) : String(entry.score).padStart(7, ' ');
            const rowText = `${rank}. ${name}${flag ? ' ' + flag : ''}   ${valStr}`;
            ctx.fillStyle = lerpColor(palette.fill, palette.border, Math.min(i / 4, 1));
            ctx.fillText(rowText, textLeft, startY + i * lineH);
        });
    }

    _formatMs(ms) {
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const cs = Math.floor((ms % 1000) / 10);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    }
```

（`lerpColor`/`flagEmoji` が同ファイルで既に import 済みであることを確認。無ければ既存 import 行に追加。）

- [ ] **Step 2: main.js に STAGE_PALETTES を import**

`src/js/main.js` の Constants import に `STAGE_PALETTES` を追加。

- [ ] **Step 3: サブタイマー状態とステートを追加**

`Game` 状態に追加:

```javascript
    stageDisplayIndex: 0,   // which stage (0..6) the attract screen is showing
    stageDisplayTimer: 0,   // sub-timer for auto-advance
```

`gameState` のコメント（`'title' | ... | 'wall_of_fame_display'`）に `'stage_ranking_display'` を追記。

- [ ] **Step 4: 巡回にステートを挿入**

`_updateGlobalRanking`（10秒後に `wall_of_fame_display` へ遷移している箇所）を、`stage_ranking_display` へ遷移するよう変更:

```javascript
    _updateGlobalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'stage_ranking_display';
            this.stateTimer = 0;
            this.stageDisplayIndex = 0;
            this.stageDisplayTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

新しい `_updateStageRankingDisplay` を追加（各面3秒表示、7面後に `wall_of_fame_display` へ）:

```javascript
    _updateStageRankingDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        this.stageDisplayTimer += deltaTime;
        if (this.stageDisplayTimer > 3000) {
            this.stageDisplayTimer = 0;
            this.stageDisplayIndex++;
            if (this.stageDisplayIndex >= 7) {
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

`_updateGameState` の switch に `case 'stage_ranking_display': return this._updateStageRankingDisplay(deltaTime);` を追加。

注意: オフライン時は現在 `_updateLocalRanking` が `global_ranking_display` を経ずに `title` へ戻る。面別はローカルにも記録されるので、オフラインでも面別を見せたい場合は `_updateLocalRanking` のオフライン分岐を `stage_ranking_display` 経由に変更してもよいが、**本タスクの必須スコープはオンライン巡回への挿入**とし、オフライン分岐は既存挙動を維持する（YAGNI。必要なら後続で拡張）。

- [ ] **Step 5: draw dispatch を追加**

`src/js/main.js` の draw 分岐（`drawWallOfFame` などを呼んでいる箇所）に追加:

```javascript
        } else if (this.gameState === 'stage_ranking_display') {
            const idx = this.stageDisplayIndex;
            const online = this.onlineData && Array.isArray(this.onlineData.stageRankings)
                ? this.onlineData.stageRankings.find((e) => e.stage === idx + 1)
                : null;
            const data = online
                ? { time: online.time || [], score: online.score || [] }
                : this.stageRankingManager.getStage(idx + 1);
            this.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
```

（既存の draw 分岐の形（`this.gameState === 'wall_of_fame_display'` など）に合わせて挿入すること。）

- [ ] **Step 6: 実機検証**

`/run` で放置し、GLOBAL の後に STAGE 1→7 が各3秒・ステージ色で自動表示され、上段=FASTEST TIME/下段=HIGH SCORE のトップ5が出ること、7面後に WALL OF FAME へ流れること、任意キーでゲーム開始できることを確認。オンライン未取得時はローカル面別が出ること。

- [ ] **Step 7: 回帰確認＋コミット**

Run: `npm test`（全 PASS）。

```bash
git add src/js/ui/ScreenRenderer.js src/js/main.js
git commit -m "feat: 面別ランキングの自動巡回表示(STAGE1-7・ステージ色・時間/得点トップ5)"
```

---

### Task 9: 面クリア時のトップ5通知

`mission_clear` / `game_clear` 画面で、直前クリア面の暫定トップ5判定（Task 4 のフラグ）に応じて帯を表示。

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`（`drawMissionClear` / `drawGameClear` に通知描画、または共通ヘルパ）

**Interfaces:**
- Consumes: `Game.stageTop5Time` / `Game.stageTop5Score`（Task 4）。

- [ ] **Step 1: 通知描画ヘルパを追加**

`src/js/ui/ScreenRenderer.js` に共通ヘルパを追加:

```javascript
    _drawStageTop5Notice(ctx, y) {
        const canvas = this.game.canvas;
        const notices = [];
        if (this.game.stageTop5Time) notices.push('TOP 5!  FASTEST TIME');
        if (this.game.stageTop5Score) notices.push('TOP 5!  HIGH SCORE');
        if (notices.length === 0) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px "Space Mono", monospace';
        const blink = Math.floor(Date.now() / 350) % 2 === 0;
        ctx.fillStyle = blink ? '#FFD700' : '#FFA500';
        ctx.shadowColor = '#FF8800';
        ctx.shadowBlur = 12;
        notices.forEach((t, i) => ctx.fillText(t, canvas.width / 2, y + i * 26));
        ctx.restore();
        ctx.textAlign = 'left';
    }
```

- [ ] **Step 2: mission_clear / game_clear に組み込む**

`drawMissionClear` と `drawGameClear` の適切な位置（TIME BONUS 表示の下あたり）で `this._drawStageTop5Notice(ctx, <y>)` を呼ぶ。`<y>` は既存レイアウトに合わせて重ならない位置（例: `canvas.height / 2 + 80`）。両画面の既存描画コードを読み、TIME BONUS 行の下に配置する。

- [ ] **Step 3: 実機検証**

`/run` で、トップ5相当のタイム/得点で面クリアした時に帯が出て、そうでない時は出ないことを確認（オンライン取得済み or ローカル既存記録との比較で判定）。

- [ ] **Step 4: 回帰確認＋コミット**

Run: `npm test`（全 PASS）。

```bash
git add src/js/ui/ScreenRenderer.js
git commit -m "feat: 面クリア時にトップ5入り(タイム/得点)を通知表示"
```

---

## 完了条件

- `npm test` 全 PASS（新規: stage-palettes / StageRankingManager / scoring(buildStageResult) / OnlineLeaderboard(面別) / gas-core(面別)）。
- 面クリアごとに `stageResults` に `{stage,timeMs,score}` が積まれ、名前確定時にローカル＆（設定時）オンラインへ送信される。
- 巡回表示で GLOBAL の後に STAGE 1→7 がステージ色・トップ5（上段タイム/下段得点）で自動表示される。
- 面クリア時、暫定トップ5入りが通知される。
- GAS: `StageScores` シート作成＋再デプロイ後、`doGet` が `stageRankings` を返し、面別 `doPost` が記録する（**シート作成・デプロイはユーザー作業**）。

## デプロイ手順（ユーザー手動）

1. リーダーボードのスプレッドシートに `StageScores` シートを追加し、1行目に `timestamp | weekId | name | stage | timeMs | score | country` のヘッダを入れる。
2. `gas/Code.gs` の内容を GAS プロジェクトに反映。
3. Web アプリを新しいバージョンとして再デプロイ（既存URL維持なら「デプロイを管理」から更新）。

## スコープ外（YAGNI / 将来拡張）

- モード別の面別ランキング分割（モード共通1本に統一）。
- 面別の殿堂入りアーカイブ。
- 全体ハイスコア未達時でも面別記録を残す仕組み。
- オフライン巡回への面別画面挿入（必要になれば追加）。
