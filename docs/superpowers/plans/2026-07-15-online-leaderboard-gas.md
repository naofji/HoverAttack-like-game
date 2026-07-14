# GAS＋スプレッドシート オンライン週間ランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存のローカル週間ランキング／殿堂を、GAS Web App＋スプレッドシートによる全プレイヤー共通のオンラインランキングに拡張する（オンライン主・ローカル従）。

**Architecture:** ゲーム（GitHub Pages）は単一の GAS Web App エンドポイントに GET（読み取り）/ POST（登録）する。GAS が作者アカウント権限でスプレッドシート（Scores / Fame シート）を読み書きし、週次時間トリガーで前週トップ3を Fame へスナップショットする。取得結果はクライアントでキャッシュし、失敗時は既存 `HighScoreManager`（localStorage）へフォールバックする。

**Tech Stack:** バニラJS（ES6 modules、ビルド無し、GitHub Pages）。バックエンドは Google Apps Script（`gas/Code.gs`）。テストは Node 標準テストランナー（`node --test`、依存追加なし。GAS は `node:vm` で純粋関数のみ検証、クライアントは `fetch` スタブで検証）。

## Global Constraints

- 追加npm依存は入れない。テストは Node 標準の `node:test` / `node:assert` / `node:vm` / `node:fs` のみ。
- ソースは ES6 module。`gas/Code.gs` は GAS ランタイム用の**プレーンJS（`function` 宣言のみ、`import`/`export` 禁止、Google グローバルは関数内でのみ参照）**。
- weekId は **ISO 8601 週・月曜UTC**。形式は `"YYYY-Www"`（週は2桁ゼロ埋め）。GAS 側（`isoWeekId`）とクライアント側（既存 `WeekSeed.getCurrentWeek`）で同一定義。
- weekId は登録時に**サーバー（GAS）側で算出**し付与する。クライアント由来の weekId は信用しない。
- オンライン登録の条件はクライアント側の既存 `score > 10000`（`MIN_SCORE`）を踏襲。GAS 側でも `MIN_SCORE = 10000` 超を要求。
- `LEADERBOARD_URL` は空文字の場合、常にローカルフォールバック（オンライン呼び出しを行わない）。
- ネットワーク層（`OnlineLeaderboard`）は**例外を投げず**、必ず `{ ok:false, error }` 形で失敗を返す。
- CORSプリフライト回避のため、POST は `Content-Type: text/plain` で JSON 文字列を送る。
- 既存機能（決定論ステージ、名前入力フロー、アトラクト画面、ローカル記録）は壊さない。

## ランキング／殿堂のデータ形状（オンライン・ローカル共通）

- ranking エントリ: `{ name: string, score: number, mission: number, clearTime: string|null }`
- ranking: 上記の配列（スコア降順、最大20）
- fame: `{ weekId: string, entries: rankingエントリ[] }` の配列（新しい週が先頭）

これは既存 `HighScoreManager.getTop10()` / `getWallOfFame()` の返り値と同一形状。よって描画側はデータの出所を意識せず、main.js が「オンライン or ローカル」を選んで渡す。

---

### Task 1: GAS バックエンド（`gas/Code.gs`）＋ 純粋関数テスト

**Files:**
- Create: `gas/Code.gs`
- Test: `tests/gas-core.test.js`

**Interfaces:**
- Consumes: なし
- Produces（`gas/Code.gs` 内のグローバル関数。`node:vm` でロードしてテスト）:
  - `isoWeekId(date: Date): string` — `"YYYY-Www"`
  - `previousWeekId(date: Date): string`
  - `sanitizeName(raw: any): string` — 制御文字除去・大文字化・10文字・空なら `'AAA'`
  - `validateEntry(entry: any): { ok:true, value:{name,score,mission,clearTime} } | { ok:false, reason:string }`
  - `topNForWeek(rows: any[][], weekId: string, n: number): rankingエントリ[]`（rows は `[timestamp, weekId, name, score, mission, clearTime]`）
  - `groupFame(fameRows: any[][]): {weekId, entries}[]`（fameRows は `[weekId, rank, name, score, mission, clearTime]`、新しい週が先頭）
  - 副作用関数 `doGet(e)`, `doPost(e)`, `weeklySnapshot()`（テスト対象外）

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-core.test.js`:
```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

let ctx;
before(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(path.join(dir, '../gas/Code.gs'), 'utf8');
  ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx); // top-level function declarations attach to ctx
});

test('isoWeekId matches ISO week (UTC, Monday start)', () => {
  assert.equal(ctx.isoWeekId(new Date(Date.UTC(2026, 0, 1))), '2026-W01'); // Thu
  assert.equal(ctx.isoWeekId(new Date(Date.UTC(2026, 0, 4))), '2026-W01'); // Sun same week
  assert.equal(ctx.isoWeekId(new Date(Date.UTC(2026, 0, 5))), '2026-W02'); // Mon next week
  assert.equal(ctx.isoWeekId(new Date(Date.UTC(2021, 0, 1))), '2020-W53'); // year boundary
});

test('previousWeekId returns the ISO week 7 days earlier', () => {
  assert.equal(ctx.previousWeekId(new Date(Date.UTC(2026, 0, 5))), '2026-W01');
});

test('sanitizeName strips control chars, uppercases, caps length, defaults', () => {
  assert.equal(ctx.sanitizeName('abc'), 'ABC');
  assert.equal(ctx.sanitizeName('abcdefghijklmnop'), 'ABCDEFGHIJ'); // 10 max
  assert.equal(ctx.sanitizeName(''), 'AAA');
  assert.equal(ctx.sanitizeName('ab'), 'AB'); // control char removed
});

test('validateEntry accepts a valid entry and rejects bad ones', () => {
  const ok = ctx.validateEntry({ name: 'zz', score: 12345, mission: 4, clearTime: null });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'ZZ', score: 12345, mission: 4, clearTime: null });
  assert.equal(ctx.validateEntry({ name: 'x', score: 10000 }).ok, false); // not > MIN_SCORE
  assert.equal(ctx.validateEntry({ name: 'x', score: -5 }).ok, false);
  assert.equal(ctx.validateEntry({ name: 'x', score: 1.5 }).ok, false); // non-integer
  assert.equal(ctx.validateEntry(null).ok, false);
});

test('topNForWeek filters by weekId, sorts desc, slices n', () => {
  const rows = [
    ['t', '2026-W29', 'A', 100, 1, ''],
    ['t', '2026-W29', 'B', 300, 2, ''],
    ['t', '2026-W28', 'C', 999, 3, ''], // other week
    ['t', '2026-W29', 'D', 200, 1, ''],
  ];
  const top = ctx.topNForWeek(rows, '2026-W29', 2);
  assert.deepEqual(top.map((e) => e.name), ['B', 'D']);
  assert.equal(top[0].score, 300);
});

test('groupFame groups by week, newest first, entries sorted desc', () => {
  const fameRows = [
    ['2026-W27', 1, 'A', 500, 3, ''],
    ['2026-W27', 2, 'B', 400, 2, ''],
    ['2026-W28', 1, 'C', 900, 4, ''],
  ];
  const fame = ctx.groupFame(fameRows);
  assert.equal(fame[0].weekId, '2026-W28'); // newest first
  assert.equal(fame[1].weekId, '2026-W27');
  assert.deepEqual(fame[1].entries.map((e) => e.name), ['A', 'B']);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/gas-core.test.js`
Expected: FAIL（`gas/Code.gs` が存在しない）

- [ ] **Step 3: `gas/Code.gs` を実装**

`gas/Code.gs`:
```javascript
// gas/Code.gs — Hover Attack online leaderboard backend (Google Apps Script).
// Deploy as a Web App (execute as: me, access: anyone). See gas-setup.md.
// NOTE: Plain JS only (function declarations, no import/export). Google globals
// (SpreadsheetApp, LockService, ContentService) are referenced inside functions
// only, so the pure helpers can be unit-tested under Node via node:vm.

var SCORES_SHEET = 'Scores';
var FAME_SHEET = 'Fame';
var MAX_RANKING = 20;
var FAME_TOP = 3;
var MIN_SCORE = 10000;       // score must exceed this to be recorded (matches client)
var SCORE_CAP = 100000000;   // reject absurd scores
var RATE_LIMIT_MS = 10000;   // reject same-name resubmit within 10s

// ---------- Pure helpers (unit-tested in Node) ----------

function isoWeekId(date) {
  var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  var dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  var isoYear = d.getUTCFullYear();
  var firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  var firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  var week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return isoYear + '-W' + (week < 10 ? '0' + week : '' + week);
}

function previousWeekId(date) {
  return isoWeekId(new Date(date.getTime() - 7 * 24 * 3600 * 1000));
}

function sanitizeName(raw) {
  var s = (raw == null ? '' : String(raw));
  s = s.replace(/[\x00-\x1F\x7F]/g, '');
  s = s.toUpperCase().substring(0, 10).trim();
  return s.length ? s : 'AAA';
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'bad-body' };
  var score = Number(entry.score);
  if (!isFinite(score) || Math.floor(score) !== score) return { ok: false, reason: 'bad-score' };
  if (score <= MIN_SCORE || score > SCORE_CAP) return { ok: false, reason: 'score-range' };
  var mission = Math.min(7, Math.max(1, Math.floor(Number(entry.mission) || 1)));
  var clearTime = (typeof entry.clearTime === 'string' && entry.clearTime) ? entry.clearTime : null;
  return { ok: true, value: { name: sanitizeName(entry.name), score: score, mission: mission, clearTime: clearTime } };
}

function topNForWeek(rows, weekId, n) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) === weekId) {
      out.push({ name: rows[i][2], score: Number(rows[i][3]), mission: Number(rows[i][4]), clearTime: rows[i][5] || null });
    }
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, n);
}

function groupFame(fameRows) {
  var byWeek = {};
  var order = [];
  for (var i = 0; i < fameRows.length; i++) {
    var wk = String(fameRows[i][0]);
    if (!byWeek[wk]) { byWeek[wk] = []; order.push(wk); }
    byWeek[wk].push({ name: fameRows[i][2], score: Number(fameRows[i][3]), mission: Number(fameRows[i][4]), clearTime: fameRows[i][5] || null });
  }
  var out = [];
  for (var j = order.length - 1; j >= 0; j--) {
    var w = order[j];
    byWeek[w].sort(function (a, b) { return b.score - a.score; });
    out.push({ weekId: w, entries: byWeek[w] });
  }
  return out;
}

// ---------- Spreadsheet glue (not unit-tested) ----------

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 6).getValues();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var weekId = isoWeekId(new Date());
  var scores = readRows_(getSheet_(SCORES_SHEET));
  var fame = readRows_(getSheet_(FAME_SHEET));
  return jsonOut_({ ok: true, weekId: weekId, ranking: topNForWeek(scores, weekId, MAX_RANKING), fame: groupFame(fame) });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonOut_({ ok: false, reason: 'busy' });
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut_({ ok: false, reason: 'bad-json' }); }
    var v = validateEntry(body);
    if (!v.ok) return jsonOut_({ ok: false, reason: v.reason });
    var entry = v.value;
    var sheet = getSheet_(SCORES_SHEET);
    var rows = readRows_(sheet);
    var now = new Date();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][2] === entry.name) {
        if (now.getTime() - new Date(rows[i][0]).getTime() < RATE_LIMIT_MS) {
          return jsonOut_({ ok: false, reason: 'rate-limited' });
        }
        break;
      }
    }
    var weekId = isoWeekId(now);
    var row = [now, weekId, entry.name, entry.score, entry.mission, entry.clearTime || ''];
    sheet.appendRow(row);
    rows.push(row);
    var top = topNForWeek(rows, weekId, MAX_RANKING);
    var rank = -1;
    for (var k = 0; k < top.length; k++) {
      if (top[k].name === entry.name && top[k].score === entry.score) { rank = k; break; }
    }
    return jsonOut_({ ok: true, rank: rank, weekId: weekId });
  } finally {
    lock.releaseLock();
  }
}

function weeklySnapshot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var prev = previousWeekId(new Date());
    var fameSheet = getSheet_(FAME_SHEET);
    var fameRows = readRows_(fameSheet);
    for (var i = 0; i < fameRows.length; i++) {
      if (String(fameRows[i][0]) === prev) return; // already archived
    }
    var top = topNForWeek(readRows_(getSheet_(SCORES_SHEET)), prev, FAME_TOP);
    for (var r = 0; r < top.length; r++) {
      fameSheet.appendRow([prev, r + 1, top[r].name, top[r].score, top[r].mission, top[r].clearTime || '']);
    }
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/gas-core.test.js`
Expected: PASS（6 tests）

- [ ] **Step 5: 全テストを実行**

Run: `node --test`
Expected: PASS（既存 + 新規、全てパス）

- [ ] **Step 6: コミット**

```bash
git add gas/Code.gs tests/gas-core.test.js
git commit -m "feat: GASオンラインランキングのバックエンドと純粋関数テストを追加"
```

---

### Task 2: クライアント・ネットワーク層（`OnlineLeaderboard.js`）＋テスト

**Files:**
- Create: `src/js/systems/OnlineLeaderboard.js`
- Test: `tests/OnlineLeaderboard.test.js`

**Interfaces:**
- Consumes: なし（`globalThis.fetch` を使用）
- Produces:
  - `new OnlineLeaderboard(url: string)`
  - `async fetchData(timeoutMs?=5000): { ok:true, weekId, ranking, fame } | { ok:false, error }`
  - `async submit(entry: {name,score,mission,clearTime}, timeoutMs?=5000): { ok:true, rank, weekId } | { ok:false, error }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/OnlineLeaderboard.test.js`:
```js
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineLeaderboard } from '../src/js/systems/OnlineLeaderboard.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('empty url returns not-configured without calling fetch', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return {}; };
  const lb = new OnlineLeaderboard('');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'not-configured' });
  assert.deepEqual(await lb.submit({ name: 'A', score: 1, mission: 1, clearTime: null }), { ok: false, error: 'not-configured' });
  assert.equal(called, false);
});

test('fetchData returns parsed data on success', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, weekId: '2026-W29', ranking: [{ name: 'A', score: 5, mission: 1, clearTime: null }], fame: [] }),
  });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.fetchData();
  assert.equal(res.ok, true);
  assert.equal(res.weekId, '2026-W29');
  assert.equal(res.ranking.length, 1);
  assert.deepEqual(res.fame, []);
});

test('fetchData returns bad-data when payload ok is not true', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'bad-data' });
});

test('fetchData returns network error when fetch throws', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'network' });
});

test('fetchData returns timeout when aborted', async () => {
  globalThis.fetch = async (url, opts) => {
    return await new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.fetchData(10); // 10ms timeout
  assert.deepEqual(res, { ok: false, error: 'timeout' });
});

test('submit posts as text/plain and returns rank', async () => {
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    seen = opts;
    return { ok: true, json: async () => ({ ok: true, rank: 3, weekId: '2026-W29' }) };
  };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.submit({ name: 'A', score: 20000, mission: 4, clearTime: null });
  assert.deepEqual(res, { ok: true, rank: 3, weekId: '2026-W29' });
  assert.equal(seen.method, 'POST');
  assert.match(seen.headers['Content-Type'], /text\/plain/);
  assert.equal(typeof seen.body, 'string'); // JSON string body
});

test('submit surfaces server reason on ok:false', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, reason: 'rate-limited' }) });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.submit({ name: 'A', score: 20000, mission: 4, clearTime: null }), { ok: false, error: 'rate-limited' });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/OnlineLeaderboard.test.js`
Expected: FAIL（`OnlineLeaderboard.js` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/js/systems/OnlineLeaderboard.js`:
```js
// ============================================
// OnlineLeaderboard - GAS Web App network client (fail-safe, no throws)
// ============================================

export class OnlineLeaderboard {
    constructor(url) {
        this.url = url || '';
    }

    async fetchData(timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, { signal: ctrl.signal });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: 'bad-data' };
            return { ok: true, weekId: data.weekId, ranking: data.ranking || [], fame: data.fame || [] };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }

    async submit(entry, timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(entry),
                signal: ctrl.signal,
            });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: (data && data.reason) || 'bad-data' };
            return { ok: true, rank: data.rank, weekId: data.weekId };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/OnlineLeaderboard.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add src/js/systems/OnlineLeaderboard.js tests/OnlineLeaderboard.test.js
git commit -m "feat: オンラインランキングのネットワーク層 OnlineLeaderboard を追加"
```

---

### Task 3: 設定定数 ＋ ScreenRenderer のオンライン状態表示

**Files:**
- Modify: `src/js/utils/Constants.js`（末尾に `LEADERBOARD_URL` を追記）
- Modify: `src/js/ui/ScreenRenderer.js`（`drawRankingDisplay` / `drawWallOfFame` に status バッジ）

**Interfaces:**
- Consumes: なし
- Produces:
  - `export const LEADERBOARD_URL`（`src/js/utils/Constants.js`）
  - `drawRankingDisplay(ctx, scores, highlightIndex, weekId, status)` — status を追加
  - `drawWallOfFame(ctx, fame, status)` — status を追加
  - status 値: `'ok' | 'loading' | 'offline'`

- [ ] **Step 1: `Constants.js` に URL 定数を追記**

`src/js/utils/Constants.js` の末尾に追加:
```js

// --- Online leaderboard (GAS Web App). Paste your deployed /exec URL here. ---
// Leave empty to run fully offline (local ranking only). See docs gas-setup.md.
export const LEADERBOARD_URL = '';
```

- [ ] **Step 2: ステータスバッジ描画ヘルパを `ScreenRenderer` に追加**

`src/js/ui/ScreenRenderer.js` の `drawRankingDisplay` の直前に新規メソッドを追加:
```js
    _drawStatusBadge(ctx, status) {
        if (!status || status === 'ok') return;
        const canvas = this.game.canvas;
        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px "Space Mono", monospace';
        ctx.fillStyle = status === 'loading' ? '#FFD700' : '#FF6666';
        ctx.fillText(status === 'loading' ? 'LOADING…' : 'OFFLINE', canvas.width - 12, 20);
        ctx.restore();
    }
```

- [ ] **Step 3: `drawRankingDisplay` の signature と描画に status を反映**

`src/js/ui/ScreenRenderer.js` の `drawRankingDisplay` の宣言行を変更し、冒頭の背景描画の直後にバッジ呼び出しを追加:
```js
    drawRankingDisplay(ctx, scores, highlightIndex = -1, weekId = '', status = 'ok') {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this._drawStatusBadge(ctx, status);
```
（残りの本体は既存のまま。空配列時は行が描画されないだけ。）

- [ ] **Step 4: `drawWallOfFame` の signature と描画に status を反映**

`src/js/ui/ScreenRenderer.js` の `drawWallOfFame` の宣言行を変更し、背景描画直後にバッジ呼び出しを追加:
```js
    drawWallOfFame(ctx, fame, status = 'ok') {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this._drawStatusBadge(ctx, status);
```
（残りの本体は既存のまま。）

- [ ] **Step 5: 構文チェックと既存テスト**

Run: `node --check src/js/ui/ScreenRenderer.js && node --test`
Expected: 構文OK、既存テスト全パス

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Constants.js src/js/ui/ScreenRenderer.js
git commit -m "feat: LEADERBOARD_URL定数とランキング画面のオンライン状態表示を追加"
```

---

### Task 4: main.js 配線（取得・登録・キャッシュ・描画切替）

**Files:**
- Modify: `src/js/main.js`

**Interfaces:**
- Consumes: `OnlineLeaderboard`（Task 2）、`LEADERBOARD_URL`（Task 3）、`drawRankingDisplay`/`drawWallOfFame` の status 付き signature（Task 3）
- Produces: なし

- [ ] **Step 1: import を追加**

`src/js/main.js` の import 群に追加:
```js
import { OnlineLeaderboard } from './systems/OnlineLeaderboard.js';
import { LEADERBOARD_URL } from './utils/Constants.js';
```
（既存の `Constants.js` からの import 行があるが、別行で追加してよい。）

- [ ] **Step 2: init でオンライン層とキャッシュ状態を用意**

`src/js/main.js` の `init` 内、`this.highScoreManager = new HighScoreManager(this.week.weekId);`（135行目付近）の直後に追加:
```js
        this.onlineLeaderboard = new OnlineLeaderboard(LEADERBOARD_URL);
        this.onlineData = null;                       // { weekId, ranking, fame } when loaded
        this.onlineStatus = LEADERBOARD_URL ? 'loading' : 'offline';
```

- [ ] **Step 3: 取得・登録メソッドを追加**

`src/js/main.js` の状態ハンドラ群（例えば `_updateWallOfFameDisplay` の直後）に、以下2メソッドを追加（オブジェクトリテラルのメソッドとしてカンマ区切りで）:
```js
    async _refreshOnline() {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) {
            this.onlineStatus = 'offline';
            return;
        }
        this.onlineStatus = 'loading';
        const res = await this.onlineLeaderboard.fetchData();
        if (res.ok) {
            this.onlineData = res;
            this.onlineStatus = 'ok';
        } else {
            this.onlineStatus = 'offline';
        }
    },

    async _submitOnline(name, score, mission, clearTime) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime });
        if (res.ok) {
            this.lastRankIndex = res.rank;
            await this._refreshOnline();
        }
    },
```

- [ ] **Step 4: アトラクトのランキング表示に入る時にオンライン取得**

`src/js/main.js` の `_updateHowToPlay` 内、`this.gameState = 'ranking_display';` を設定している箇所（206行目付近）の直後に追加:
```js
            this.gameState = 'ranking_display';
            this.stateTimer = 0;
            this.lastRankIndex = -1;
            this._refreshOnline(); // fire-and-forget; render falls back to local until ready
```
（既存の `this.stateTimer = 0;` / `this.lastRankIndex = -1;` が既にある場合は重複追加せず、`this._refreshOnline();` の1行のみ足す。）

- [ ] **Step 5: 名前入力完了時にオンライン登録**

`src/js/main.js` の `_updateRankingEntry` の Enter 分岐（250行目付近、`this.lastRankIndex = this.highScoreManager.addScore(...)` の直後）に追加:
```js
                this.lastRankIndex = this.highScoreManager.addScore(
                    this.playerNameInput, this.score, displayMission, formattedTime
                );
                this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime);
```

- [ ] **Step 6: 描画分岐でオンライン優先・ローカルフォールバック**

`src/js/main.js` の描画分岐（710・714行目付近）を次のように変更:
```js
        if (this.gameState === 'ranking_display') {
            const online = this.onlineStatus === 'ok' && this.onlineData;
            const scores = online ? this.onlineData.ranking : this.highScoreManager.getTop10();
            const weekId = online ? this.onlineData.weekId : this.week.weekId;
            this.screenRenderer.drawRankingDisplay(ctx, scores, this.lastRankIndex, weekId, this.onlineStatus);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            const online = this.onlineStatus === 'ok' && this.onlineData;
            const fame = online ? this.onlineData.fame : this.highScoreManager.getWallOfFame();
            this.screenRenderer.drawWallOfFame(ctx, fame, this.onlineStatus);
            return;
        }
```

- [ ] **Step 7: 構文チェックと既存テスト**

Run: `node --check src/js/main.js && node --test`
Expected: 構文OK、既存テスト全パス（13 + 新規、全て）

- [ ] **Step 8: コミット**

```bash
git add src/js/main.js
git commit -m "feat: オンラインランキングの取得・登録・描画切替を配線"
```

---

### Task 5: セットアップ手順書（`gas-setup.md`）

**Files:**
- Create: `docs/superpowers/specs/2026-07-15-gas-setup.md`

**Interfaces:**
- Consumes: なし
- Produces: なし（ドキュメント）

- [ ] **Step 1: 手順書を作成**

`docs/superpowers/specs/2026-07-15-gas-setup.md` に以下を記載:
```markdown
# オンラインランキング セットアップ手順（GAS＋スプレッドシート）

この手順は作者（デプロイする人）が一度だけ行う。

## 1. スプレッドシート作成
1. Google スプレッドシートを新規作成（名前は任意、例: HoverAttack Leaderboard）。
2. シートを2つ用意し、名前を正確に `Scores` と `Fame` にする。
3. それぞれ1行目に見出しを入れる。
   - `Scores`: A1..F1 = `timestamp` `weekId` `name` `score` `mission` `clearTime`
   - `Fame`:   A1..F1 = `weekId` `rank` `name` `score` `mission` `clearTime`

## 2. Apps Script を貼付
1. スプレッドシートのメニュー「拡張機能」→「Apps Script」を開く。
2. 既定の `Code.gs` の中身を、リポジトリの `gas/Code.gs` の内容で置き換える。
3. 保存する。

## 3. Web アプリとしてデプロイ
1. 右上「デプロイ」→「新しいデプロイ」。
2. 種類の歯車→「ウェブアプリ」を選択。
3. 「次のユーザーとして実行」= 自分、「アクセスできるユーザー」= 全員。
4. デプロイ。初回は権限承認が必要（自分のスプレッドシートへのアクセス許可）。
5. 表示される **ウェブアプリのURL（末尾が /exec）** をコピーする。
   - 注意: 後でコードを更新する際は「新しいデプロイ」ではなく
     「デプロイを管理」→ 既存デプロイの編集（バージョンを新規）にすると **URLが変わらない**。

## 4. 週次トリガーを設定（殿堂スナップショット）
1. Apps Script 左メニューの時計アイコン「トリガー」を開く。
2. 「トリガーを追加」。
3. 実行する関数 = `weeklySnapshot`、イベントのソース = 時間主導型、
   タイプ = 週ベースのタイマー、曜日 = 月曜、時刻 = 午前（UTCで月曜になる時間帯。
   タイムゾーンは Apps Script の設定に依存するため、月曜UTC 0時以降に発火するよう選ぶ）。
4. 保存。

## 5. ゲーム側にURLを設定
1. リポジトリの `src/js/utils/Constants.js` の
   `export const LEADERBOARD_URL = '';` に、手順3でコピーした /exec URL を貼る。
2. コミットして GitHub Pages に反映。

## 6. 動作確認
- ブラウザの開発者ツールで:
  ```js
  fetch('<あなたの/exec URL>').then(r=>r.json()).then(console.log)
  // => { ok:true, weekId:"...", ranking:[], fame:[] }
  ```
- ゲームでスコア（10000超）を出して名前登録 → `Scores` シートに行が増える →
  アトラクトの THIS WEEK に反映される。
- URL未設定（空）のままなら、ゲームはローカル表示＋画面右上に OFFLINE と出る。

## トラブルシュート
- 登録が反映されない: デプロイのアクセス設定が「全員」か、URLが /exec か確認。
- 画面が常に OFFLINE: `LEADERBOARD_URL` の綴り、Pages反映、コンソールのCORS/ネットワークエラーを確認。
- 殿堂が増えない: `weeklySnapshot` トリガーが設定・発火しているか、`Fame` シート名が正確か確認。
```

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-07-15-gas-setup.md
git commit -m "docs: オンラインランキングのGASセットアップ手順書を追加"
```

---

### Task 6: 検証（オフライン・フォールバックのブラウザ確認＋デプロイ後チェックリスト）

**Files:**
- 変更なし（動作確認のみ）

- [ ] **Step 1: 全テスト**

Run: `node --test`
Expected: 全テストPASS

- [ ] **Step 2: オフライン・フォールバックのブラウザ確認（URL未設定状態）**

`LEADERBOARD_URL` が空（既定）のまま:
1. `python3 -m http.server 8000` で起動、`http://localhost:8000/index.html` を開く。
2. アトラクト巡回で THIS WEEK / WALL OF FAME が**ローカル内容で表示**され、右上に `OFFLINE` バッジが出ること。
3. スコア（10000超）登録がローカルに反映され、コンソールにエラーが出ないこと（オンライン呼び出しは行われない）。

- [ ] **Step 3: オンライン経路の確認（作者がGASデプロイ後に実施）**

`docs/superpowers/specs/2026-07-15-gas-setup.md` の手順1〜5を実施し `LEADERBOARD_URL` を設定後:
1. アトラクトで THIS WEEK 表示中、右上が `LOADING…`→（取得成功で）バッジ消灯し、シート内容が表示される。
2. スコア登録 → `Scores` シートに行が追加され、再取得で順位反映。
3. ネットワークを切る/URLを一時的に不正にすると `OFFLINE` にフォールバックし、ゲームは継続動作する。
4. `weeklySnapshot` を手動実行（Apps Scriptエディタから）すると、前週トップ3が `Fame` に追記され、WALL OF FAME に反映される。

- [ ] **Step 4: 検証で見つかった不具合があれば修正してコミット**

```bash
git add -A
git commit -m "fix: オンラインランキング検証で見つかった不具合を修正"
```

---

## 完了条件

- `node --test` 全パス（gas-core / OnlineLeaderboard / 既存）。
- URL未設定時: ゲームはローカル表示＋`OFFLINE`バッジで正常動作（既存挙動を壊さない）。
- URL設定時（作者デプロイ後）: 取得・登録・殿堂スナップショットがオンラインで機能し、失敗時はローカルへフォールバック。
- セットアップ手順書が揃っている。
