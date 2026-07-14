# 週替わり決定論ステージ ＋ ローカル週間ランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ISO週シードでステージ生成を決定論化し、同一週なら全員同じ1〜7面になるようにしたうえで、ローカルの週間ランキングと殿堂（Wall of Fame）を実装する。

**Architecture:** 軽量PRNG（mulberry32）を `game.rng` として各ステージ生成の直前にシード設定し、`Map` と `SpawnManager` の地形・敵配置ランダムをそれに置換する。戦闘中のランダム性（AI・弾・演出）は非決定論のまま。スコアは localStorage に「今週ランキング（上位20）」と「殿堂（各週トップ3の蓄積）」の2キーで保持し、週切り替わりを起動時に検出して殿堂へ繰り越す。

**Tech Stack:** バニラJS（ES6 modules、ビルドなし静的サイト、GitHub Pages）。テストは Node 標準テストランナー（`node --test`、依存追加なし）。

## Global Constraints

- 追加npm依存は入れない。テストは Node 標準の `node:test` / `node:assert` のみ使用。
- ソースは ES6 module（`import`/`export`）。テストを Node で動かすため `package.json` に `"type": "module"` を置く。
- 週の境界は **ISO 8601 週（月曜始まり・UTC基準）**。シード = ISO年とISO週番号の合成。
- 決定論化するのは `Map.js` の地形生成と `SpawnManager.js` の敵種抽選・位置微調整のみ。戦闘中の `Math.random()`（AI・弾ばらつき・パーティクル・カメラ揺れ・砲塔クールダウン等）はそのまま。
- `Map.js:894` 付近の `Math.imul` による見た目ハッシュは変更しない（`Math.random()` ではないため置換対象外）。
- 既存のダミースコア20件は廃止し、週間ランキングは空スタート。

---

### Task 1: SeededRNG（決定論PRNG）＋ テスト土台

**Files:**
- Create: `package.json`
- Create: `src/js/utils/SeededRNG.js`
- Test: `tests/SeededRNG.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `class SeededRNG { constructor(seed: number); next(): number /* [0,1) */ }`

- [ ] **Step 1: テスト用 `package.json` を作成**

`package.json`:
```json
{
  "name": "hover-attack-web",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/SeededRNG.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

test('same seed produces identical sequence', () => {
  const a = new SeededRNG(12345);
  const b = new SeededRNG(12345);
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = new SeededRNG(1);
  const b = new SeededRNG(2);
  assert.notEqual(a.next(), b.next());
});

test('next() returns values in [0, 1)', () => {
  const rng = new SeededRNG(999);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `node --test tests/SeededRNG.test.js`
Expected: FAIL（`SeededRNG.js` が存在しない旨のエラー）

- [ ] **Step 4: 実装を書く**

`src/js/utils/SeededRNG.js`:
```js
// ============================================
// SeededRNG - Deterministic PRNG (mulberry32)
// ============================================

export class SeededRNG {
    constructor(seed) {
        this.state = seed >>> 0;
    }

    /** Returns a float in [0, 1). Drop-in replacement for Math.random(). */
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node --test tests/SeededRNG.test.js`
Expected: PASS（3 tests）

- [ ] **Step 6: コミット**

```bash
git add package.json src/js/utils/SeededRNG.js tests/SeededRNG.test.js
git commit -m "feat: 決定論PRNG SeededRNG を追加"
```

---

### Task 2: WeekSeed（ISO週シード）

**Files:**
- Create: `src/js/utils/WeekSeed.js`
- Test: `tests/WeekSeed.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `getCurrentWeek(date?: Date): { weekId: string /* "2026-W29" */, seed: number }`
  - `stageSeed(weekSeed: number, missionLevel: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`tests/WeekSeed.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentWeek, stageSeed } from '../src/js/utils/WeekSeed.js';

test('Thursday and Sunday of the same ISO week share a weekId', () => {
  const thu = getCurrentWeek(new Date(Date.UTC(2026, 0, 1)));  // 2026-01-01 Thu
  const sun = getCurrentWeek(new Date(Date.UTC(2026, 0, 4)));  // 2026-01-04 Sun
  assert.equal(thu.weekId, '2026-W01');
  assert.equal(sun.weekId, '2026-W01');
  assert.equal(thu.seed, sun.seed);
});

test('the following Monday starts a new ISO week', () => {
  const mon = getCurrentWeek(new Date(Date.UTC(2026, 0, 5)));  // 2026-01-05 Mon
  assert.equal(mon.weekId, '2026-W02');
});

test('year boundary belongs to previous ISO year (2021-01-01 -> 2020-W53)', () => {
  const w = getCurrentWeek(new Date(Date.UTC(2021, 0, 1)));    // 2021-01-01 Fri
  assert.equal(w.weekId, '2020-W53');
});

test('stageSeed is deterministic and differs per mission level', () => {
  const wk = getCurrentWeek(new Date(Date.UTC(2026, 0, 1))).seed;
  assert.equal(stageSeed(wk, 0), stageSeed(wk, 0));
  assert.notEqual(stageSeed(wk, 0), stageSeed(wk, 1));
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/WeekSeed.test.js`
Expected: FAIL（`WeekSeed.js` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/js/utils/WeekSeed.js`:
```js
// ============================================
// WeekSeed - ISO 8601 week (Monday start, UTC) -> deterministic seed
// ============================================

/** Returns { isoYear, week } for the ISO week containing the given date (UTC). */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Shift to the Thursday of the current ISO week (Mon=0 .. Sun=6).
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const isoYear = d.getUTCFullYear();
    // Thursday of ISO week 1 is the Thursday in the week of Jan 4th.
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
    return { isoYear, week };
}

/** Current week identity + base seed. Pass a Date for testing; defaults to now. */
export function getCurrentWeek(date = new Date()) {
    const { isoYear, week } = getISOWeek(date);
    const seed = (isoYear * 100 + week) >>> 0;
    return { weekId: `${isoYear}-W${String(week).padStart(2, '0')}`, seed };
}

/** Mixes the week seed with a mission level into a well-distributed stage seed. */
export function stageSeed(weekSeed, missionLevel) {
    let h = Math.imul((weekSeed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) >>> 0;
    h = Math.imul((h ^ (missionLevel + 1)) >>> 0, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/WeekSeed.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/WeekSeed.js tests/WeekSeed.test.js
git commit -m "feat: ISO週シード WeekSeed を追加"
```

---

### Task 3: Map の地形生成を rng に置換（決定論化）

**Files:**
- Modify: `src/js/world/Map.js`（メソッド内の全 `Math.random()`）
- Test: `tests/MapDeterminism.test.js`

**Interfaces:**
- Consumes: `game.rng`（`SeededRNG` インスタンス。`new Map(game, missionLevel)` の呼び出し前に設定済みである前提）
- Produces: なし（`Map` の `grid` と各 spawn 配列が `game.rng` のシードのみで決まる）

- [ ] **Step 1: 失敗するテストを書く**

`Map` は `_generate()` 内で `_generateMiniMap()` を呼び、`document.createElement('canvas')` を使う。Node では `document` が無いため、最小スタブを与える。

`tests/MapDeterminism.test.js`:
```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

// Minimal DOM stub so Map._generateMiniMap() can run under Node.
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => {} });
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => noopCtx,
    }),
  };
});

function buildMap(MapClass, seed, missionLevel) {
  const game = { rng: new SeededRNG(seed) };
  return new MapClass(game, missionLevel);
}

test('same seed produces identical grid and enemy spawns', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 2);
  const b = buildMap(Map, 42, 2);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
  assert.deepEqual(a.enemyAttackerSpawns, b.enemyAttackerSpawns);
  assert.deepEqual(a.enemyDroneSpawns, b.enemyDroneSpawns);
  assert.deepEqual(a.enemyTurretSpawns, b.enemyTurretSpawns);
  assert.deepEqual(a.landmineSpawns, b.landmineSpawns);
  assert.deepEqual(a.enemyBaseSpawn, b.enemyBaseSpawn);
});

test('different seeds produce different grids', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 1, 2);
  const b = buildMap(Map, 2, 2);
  assert.notDeepEqual(a.grid, b.grid);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/MapDeterminism.test.js`
Expected: FAIL（現状 `Map` は `Math.random()` を使うため2回の生成が一致しない、または `this.game.rng` 未使用で `notDeepEqual` は通っても `deepEqual` が落ちる）

- [ ] **Step 3: `Map.js` 内の `Math.random()` を `this.game.rng.next()` に一括置換**

`src/js/world/Map.js` の全メソッド内 `Math.random()`（21箇所）を `this.game.rng.next()` に置換する。`Math.imul(...)` を使う見た目ハッシュ（894行付近）は `Math.random()` を含まないため対象外。

エディタの全置換を使う場合の対象文字列と置換後:
- 対象: `Math.random()`
- 置換: `this.game.rng.next()`
- 範囲: `src/js/world/Map.js` 全体（`Math.imul` 行は `Math.random()` を含まないので影響なし）

置換後、`grep -c "Math.random()" src/js/world/Map.js` が `0` になることを確認する。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/MapDeterminism.test.js`
Expected: PASS（2 tests）

- [ ] **Step 5: コミット**

```bash
git add src/js/world/Map.js tests/MapDeterminism.test.js
git commit -m "feat: Map の地形生成をシードrngで決定論化"
```

---

### Task 4: SpawnManager の敵種抽選・位置微調整を rng に置換

**Files:**
- Modify: `src/js/systems/SpawnManager.js`（83行目・109行目の `Math.random()`）

**Interfaces:**
- Consumes: `this.game.rng`（`Map` 生成後、同一 `game.rng` ストリームを継続消費）
- Produces: なし

このタスクは敵エンティティ（`EnemyAttacker` 等、DOM/Audio依存）を生成するため Node 単体テストは行わず、Task 8 のブラウザ検証でカバーする。

- [ ] **Step 1: `resolveOverlap` のジッターを置換**

`src/js/systems/SpawnManager.js` 83行目付近:
```js
                if (!isOverlapping) return { x, y };
                x += (this.game.rng.next() < 0.5 ? -1 : 1) * 16;
```

- [ ] **Step 2: 敵種の重み付き抽選を置換**

`src/js/systems/SpawnManager.js` 109行目付近:
```js
        for (const pos of game.map.enemyAttackerSpawns) {
            let rnd = this.game.rng.next() * totalWeight;
            let selectedTypeKey = 'standard';
```

- [ ] **Step 3: 置換漏れがないことを確認**

Run: `grep -n "Math.random()" src/js/systems/SpawnManager.js`
Expected: 出力なし（0件）

- [ ] **Step 4: コミット**

```bash
git add src/js/systems/SpawnManager.js
git commit -m "feat: SpawnManager の敵抽選・位置調整をシードrngに置換"
```

---

### Task 5: rng の配線（週シード算出とステージ毎シード設定）

**Files:**
- Modify: `src/js/main.js`（import追加、`init` 内で週シード算出＋Map生成前にrng設定）
- Modify: `src/js/systems/GameStateManager.js`（import追加、`resetLevel` 内Map生成前にrng設定）

**Interfaces:**
- Consumes: `SeededRNG`（Task 1）、`getCurrentWeek`・`stageSeed`（Task 2）
- Produces: `game.week: { weekId, seed }`、`game.weekSeed: number`、`game.rng: SeededRNG`（各ステージ生成直前に再設定）

- [ ] **Step 1: `main.js` に import を追加**

`src/js/main.js` の他 import 群の近くに追加:
```js
import { SeededRNG } from './utils/SeededRNG.js';
import { getCurrentWeek, stageSeed } from './utils/WeekSeed.js';
```

- [ ] **Step 2: `init` で週シードを算出し、最初のMap生成前にrngを設定**

`src/js/main.js` の `init`、現状の118行目付近（`this.map = new Map(this, this.missionsCompleted);` の直前）を次のように変更:
```js
        this.input = new Input(this.canvas);

        // Weekly deterministic seed: same ISO week => same stages for everyone.
        this.week = getCurrentWeek();
        this.weekSeed = this.week.seed;
        this.rng = new SeededRNG(stageSeed(this.weekSeed, this.missionsCompleted));

        this.map = new Map(this, this.missionsCompleted);
```

- [ ] **Step 3: `GameStateManager.js` に import を追加**

`src/js/systems/GameStateManager.js` の import 群に追加:
```js
import { SeededRNG } from '../utils/SeededRNG.js';
import { stageSeed } from '../utils/WeekSeed.js';
```

- [ ] **Step 4: `resetLevel` の Map 再生成前に rng を設定**

`src/js/systems/GameStateManager.js` の46行目付近（`game.map = new Map(game, game.missionsCompleted);` の直前）を次のように変更:
```js
        // Regenerate map (seeded per week + mission for reproducibility)
        game.rng = new SeededRNG(stageSeed(game.weekSeed, game.missionsCompleted));
        game.map = new Map(game, game.missionsCompleted);
```

- [ ] **Step 5: コミット**

```bash
git add src/js/main.js src/js/systems/GameStateManager.js
git commit -m "feat: 週シード算出とステージ毎rng設定を配線"
```

---

### Task 6: HighScoreManager を週間ランキング＋殿堂の2層に

**Files:**
- Modify: `src/js/systems/HighScoreManager.js`（全面改修）
- Test: `tests/HighScoreManager.test.js`

**Interfaces:**
- Consumes: `weekId: string`（コンストラクタ引数。`getCurrentWeek().weekId` を渡す）
- Produces:
  - `new HighScoreManager(weekId: string)`
  - `isHighScore(score: number): boolean`
  - `addScore(name, score, mission, clearTime?): number`（今週ランキング内の順位index、範囲外は -1）
  - `getTop10(): Array<entry>`（今週ランキング、最大20件）
  - `getWallOfFame(): Array<{ weekId: string, entries: Array<entry> }>`（新しい週が先頭）
  - `entry = { name, score, mission, clearTime }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/HighScoreManager.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage stub.
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

test('weekly ranking starts empty (no dummy scores)', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  assert.deepEqual(m.getTop10(), []);
  assert.deepEqual(m.getWallOfFame(), []);
});

test('addScore keeps top 20 sorted descending', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  for (let i = 1; i <= 25; i++) m.addScore('P' + i, i * 100, 1, null);
  const top = m.getTop10();
  assert.equal(top.length, 20);
  assert.equal(top[0].score, 2500);
  assert.equal(top[19].score, 600);
});

test('week rollover archives previous week top 3 into wall of fame and resets', async () => {
  const mod = await import('../src/js/systems/HighScoreManager.js');
  const { HighScoreManager } = mod;

  const m1 = new HighScoreManager('2026-W10');
  m1.addScore('AAA', 500, 3, null);
  m1.addScore('BBB', 400, 2, null);
  m1.addScore('CCC', 300, 2, null);
  m1.addScore('DDD', 200, 1, null);

  // New week: same storage, different weekId.
  const m2 = new HighScoreManager('2026-W11');
  assert.deepEqual(m2.getTop10(), []); // this week reset
  const fame = m2.getWallOfFame();
  assert.equal(fame.length, 1);
  assert.equal(fame[0].weekId, '2026-W10');
  assert.equal(fame[0].entries.length, 3); // only top 3 kept
  assert.deepEqual(fame[0].entries.map((e) => e.name), ['AAA', 'BBB', 'CCC']);
});

test('same week reload preserves this week ranking without re-archiving', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m1 = new HighScoreManager('2026-W10');
  m1.addScore('AAA', 500, 3, null);
  const m2 = new HighScoreManager('2026-W10');
  assert.equal(m2.getTop10().length, 1);
  assert.deepEqual(m2.getWallOfFame(), []);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/HighScoreManager.test.js`
Expected: FAIL（現状は単一キー・ダミースコア・`weekId` 引数なし）

- [ ] **Step 3: `HighScoreManager.js` を全面改修**

`src/js/systems/HighScoreManager.js` を次の内容に置き換える:
```js
// ============================================
// HighScore Manager - weekly ranking + wall of fame (local)
// ============================================

const WEEKLY_KEY = 'hoverattack_weekly_ranking';
const FAME_KEY = 'hoverattack_wall_of_fame';
const MAX_WEEKLY = 20;
const FAME_TOP = 3;

export class HighScoreManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.scores = [];        // this week's ranking (up to MAX_WEEKLY)
        this.wallOfFame = [];     // [{ weekId, entries: [top3] }], oldest first in storage
        this._load();
    }

    _load() {
        // Load wall of fame (persistent archive).
        try {
            const fameData = localStorage.getItem(FAME_KEY);
            this.wallOfFame = fameData ? JSON.parse(fameData) : [];
        } catch (e) {
            console.error('Failed to load wall of fame:', e);
            this.wallOfFame = [];
        }

        // Load this week's ranking; roll over if the stored week differs.
        let stored = null;
        try {
            const data = localStorage.getItem(WEEKLY_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load weekly ranking:', e);
            stored = null;
        }

        if (stored && stored.weekId === this.weekId) {
            this.scores = Array.isArray(stored.scores) ? stored.scores : [];
        } else {
            // New week: archive the previous week's top 3, then reset.
            if (stored && Array.isArray(stored.scores) && stored.scores.length > 0) {
                this.wallOfFame.push({
                    weekId: stored.weekId,
                    entries: stored.scores.slice(0, FAME_TOP),
                });
                this._saveFame();
            }
            this.scores = [];
            this._saveWeekly();
        }
    }

    _saveWeekly() {
        try {
            localStorage.setItem(WEEKLY_KEY, JSON.stringify({ weekId: this.weekId, scores: this.scores }));
        } catch (e) {
            console.error('Failed to save weekly ranking:', e);
        }
    }

    _saveFame() {
        try {
            localStorage.setItem(FAME_KEY, JSON.stringify(this.wallOfFame));
        } catch (e) {
            console.error('Failed to save wall of fame:', e);
        }
    }

    isHighScore(score) {
        if (this.scores.length < MAX_WEEKLY) return true;
        return score > this.scores[this.scores.length - 1].score;
    }

    addScore(name, score, mission, clearTime = null) {
        const entry = {
            name: (name || 'AAA').toUpperCase().substring(0, 10),
            score: score,
            mission: mission,
            clearTime: clearTime,
        };
        this.scores.push(entry);
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > MAX_WEEKLY) {
            this.scores = this.scores.slice(0, MAX_WEEKLY);
        }
        this._saveWeekly();
        return this.scores.indexOf(entry);
    }

    /** This week's ranking (up to MAX_WEEKLY entries). */
    getTop10() {
        return this.scores;
    }

    /** Wall of fame, newest week first. */
    getWallOfFame() {
        return this.wallOfFame.slice().reverse();
    }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/HighScoreManager.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: 全テストを実行**

Run: `node --test`
Expected: PASS（全テスト。SeededRNG / WeekSeed / MapDeterminism / HighScoreManager）

- [ ] **Step 6: コミット**

```bash
git add src/js/systems/HighScoreManager.js tests/HighScoreManager.test.js
git commit -m "feat: HighScoreManager を週間ランキング＋殿堂の2層に改修"
```

---

### Task 7: UI 配線（HighScoreManager 生成に weekId・週表示・殿堂画面）

**Files:**
- Modify: `src/js/main.js`（`new HighScoreManager()` に weekId 付与、状態機械に `wall_of_fame_display` を追加、描画分岐）
- Modify: `src/js/ui/ScreenRenderer.js`（ランキング画面に weekId 表示、`drawWallOfFame` 追加）

**Interfaces:**
- Consumes: `game.week.weekId`、`highScoreManager.getTop10()`、`highScoreManager.getWallOfFame()`、`ScreenRenderer.drawRankingDisplay(ctx, scores, highlightIndex, weekId)`、`ScreenRenderer.drawWallOfFame(ctx, fame)`
- Produces: なし

- [ ] **Step 1: `HighScoreManager` 生成に weekId を渡す**

`src/js/main.js` の127行目付近:
```js
        this.highScoreManager = new HighScoreManager(this.week.weekId);
```
（`this.week` は Task 5 Step 2 で `init` 冒頭に算出済み。`highScoreManager` 生成が `this.week` 算出より後にあることを確認する。もし前にある場合は週シード算出ブロックをその手前へ移す。）

- [ ] **Step 2: ランキング表示に weekId を渡す**

`src/js/main.js` の690行目付近:
```js
        if (this.gameState === 'ranking_display') {
            this.screenRenderer.drawRankingDisplay(ctx, this.highScoreManager.getTop10(), this.lastRankIndex, this.week.weekId);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            this.screenRenderer.drawWallOfFame(ctx, this.highScoreManager.getWallOfFame());
            return;
        }
```

- [ ] **Step 3: 状態機械の更新分岐に `wall_of_fame_display` を追加**

`src/js/main.js` の171行目付近（`_updateGameState` の switch 内）:
```js
            case 'ranking_display': return this._updateRankingDisplay(deltaTime);
            case 'wall_of_fame_display': return this._updateWallOfFameDisplay(deltaTime);
```

- [ ] **Step 4: `_updateRankingDisplay` の遷移先を殿堂画面に変更し、殿堂画面の更新関数を追加**

`src/js/main.js` の `_updateRankingDisplay`（207行目付近）内、タイトルへ戻していた分岐を殿堂画面へ変更:
```js
    _updateRankingDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'wall_of_fame_display';
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

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

- [ ] **Step 5: `drawRankingDisplay` に weekId を表示**

`src/js/ui/ScreenRenderer.js` の `drawRankingDisplay` シグネチャと見出しを変更（457行目付近）:
```js
    drawRankingDisplay(ctx, scores, highlightIndex = -1, weekId = '') {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 42px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('THIS WEEK', canvas.width / 2, 40);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 18px "Space Mono", monospace';
        ctx.fillText(weekId, canvas.width / 2, 68);
```
（続く `ctx.font = 'bold 19px ...'` 以降の見出し・行描画は既存のまま。ヘッダーY=95・startY=130 は据え置きでよい。空配列時は行が描画されないだけで問題ない。）

- [ ] **Step 6: `drawWallOfFame` を新規追加**

`src/js/ui/ScreenRenderer.js` の `drawRankingDisplay` の直後に追加:
```js
    drawWallOfFame(ctx, fame) {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 42px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WALL OF FAME', canvas.width / 2, 50);

        ctx.font = 'bold 18px "Space Mono", monospace';

        if (!fame || fame.length === 0) {
            ctx.fillStyle = '#AAAAAA';
            ctx.fillText('NO CHAMPIONS YET', canvas.width / 2, canvas.height / 2);
        } else {
            const medals = ['#FFFF00', '#CCCCCC', '#CD7F32'];
            let y = 110;
            const textLeft = canvas.width / 2 - 255;
            for (const wk of fame) {
                if (y > canvas.height - 60) break;
                ctx.textAlign = 'left';
                ctx.fillStyle = '#00FF88';
                ctx.font = 'bold 18px "Space Mono", monospace';
                ctx.fillText(wk.weekId, textLeft, y);
                y += 24;
                ctx.font = 'bold 17px "Space Mono", monospace';
                wk.entries.forEach((e, i) => {
                    ctx.fillStyle = medals[i] || '#FFFFFF';
                    const rank = String(i + 1);
                    const scoreStr = String(e.score).padStart(7, ' ');
                    const nameStr = (e.name).padEnd(10, ' ');
                    ctx.fillText(`  ${rank}.  ${scoreStr}   ${nameStr}`, textLeft, y);
                    y += 22;
                });
                y += 8;
            }
        }

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }
```

- [ ] **Step 7: コミット**

```bash
git add src/js/main.js src/js/ui/ScreenRenderer.js
git commit -m "feat: 週表示付きランキングと殿堂画面のUIを追加"
```

---

### Task 8: ブラウザ実機検証

**Files:**
- 変更なし（動作確認のみ）

- [ ] **Step 1: ローカルサーバで起動**

Run: `python3 -m http.server 8000`
ブラウザで `http://localhost:8000/` を開く（ES6 module は `file://` では動かないためHTTP必須）。

- [ ] **Step 2: 決定論の確認**

- ゲームを開始し、1面の地形と敵配置を目視で記録（スクリーンショット可）。
- ページを再読み込みして再度1面を開始し、地形・敵配置が**同一**であることを確認。
- ブラウザのコンソールで `localStorage.clear()` を実行しても、同じ週内なら地形・敵配置は変わらないことを確認（シードは週由来のため）。

- [ ] **Step 3: 週切り替えとランキング/殿堂の確認**

コンソールで週を跨いだ状態を再現:
```js
// 先週のランキングを手動投入
localStorage.setItem('hoverattack_weekly_ranking', JSON.stringify({
  weekId: '2000-W01',
  scores: [
    { name: 'AAA', score: 999, mission: 3, clearTime: null },
    { name: 'BBB', score: 888, mission: 2, clearTime: null },
    { name: 'CCC', score: 777, mission: 2, clearTime: null },
    { name: 'DDD', score: 666, mission: 1, clearTime: null }
  ]
}));
location.reload();
```
再読み込み後、アトラクト画面（タイトル→操作説明→THIS WEEK→WALL OF FAME）を待つか、コンソールで確認:
```js
JSON.parse(localStorage.getItem('hoverattack_wall_of_fame'));
// => [{ weekId: '2000-W01', entries: [AAA, BBB, CCC の3件] }]
JSON.parse(localStorage.getItem('hoverattack_weekly_ranking')).scores; // => [] (今週分は空)
```
- WALL OF FAME 画面に `2000-W01` とトップ3が表示されること。
- THIS WEEK 画面に現在の `weekId`（例 `2026-W29`）が表示されること。

- [ ] **Step 4: 通常フロー確認**

- 実際にプレイしてスコアを出し、ハイスコアなら名前入力→THIS WEEK ランキングに反映されることを確認。
- コンソールエラーが出ていないことを確認。

- [ ] **Step 5: 検証結果をコミット（必要な微修正があれば）**

検証で見つかった不具合を修正した場合のみコミット:
```bash
git add -A
git commit -m "fix: ブラウザ検証で見つかった不具合を修正"
```

---

## 完了条件

- `node --test` が全てPASS。
- ブラウザで同一週内はステージ（地形・敵配置・敵種）が再現される。
- 週切り替わりで前週トップ3が殿堂に繰り越され、今週ランキングが空になる。
- THIS WEEK 画面に weekId、WALL OF FAME 画面に殿堂が表示される。
