# ランキングの国旗による個別化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週間ランキング（オンライン／ローカル）に、プレイヤー端末のタイムゾーン由来の国コードを記録し、国旗を併記して同名プレイヤーを個別化する。

**Architecture:** クライアントが `Intl` のタイムゾーンから国コード（例 `JP`）を対応表で導出し、登録時に付与。GAS はシートに国コード列（G列）を追加保存し、`doGet` の返却エントリに含める。描画は国コードから国旗絵文字を生成して行末に表示。後方互換（旧データは国コード空＝国旗なし）。

**Tech Stack:** バニラJS（ES6 modules、ビルド無し）。バックエンドは GAS（`gas/Code.gs`）。テストは Node 標準テストランナー（`node --test`）。

## Global Constraints

- 追加npm依存は入れない。テストは Node 標準の `node:test` / `node:assert` / `node:vm` / `node:fs` のみ。
- ソースは ES6 module。`gas/Code.gs` はプレーンJS（`function` 宣言のみ、`import`/`export` 禁止、Google グローバルは関数内のみ）。
- 国コードは ISO 3166-1 alpha-2（2文字大文字）または空文字。
- データ列を6→7に拡張。追加列 G は `country`。旧データ（G空）は国旗なしで正常表示（後方互換）。
- ランキングのエントリ形状は `{ name, score, mission, clearTime, country }`（オンライン・ローカル共通）。
- 既存機能（決定論ステージ、名前入力、アトラクト、オフライン・フォールバック、`score > 10000` 記録閾値）を壊さない。
- 国旗はWindowsのcanvasでは2文字表示になる（OS制約、許容済み）。

---

### Task 1: タイムゾーン→国コード対応表 ＋ geo ユーティリティ ＋ テスト

**Files:**
- Create: `src/js/utils/timezoneCountry.js`
- Create: `src/js/utils/geo.js`
- Test: `tests/geo.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `TIMEZONE_COUNTRY: Record<string,string>`（IANA tz → ISO2）
  - `getCountryCode(timeZone?: string): string`
  - `flagEmoji(code: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/geo.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCountryCode, flagEmoji } from '../src/js/utils/geo.js';

test('getCountryCode maps known IANA timezones to ISO2', () => {
  assert.equal(getCountryCode('Asia/Tokyo'), 'JP');
  assert.equal(getCountryCode('America/New_York'), 'US');
  assert.equal(getCountryCode('Europe/London'), 'GB');
  assert.equal(getCountryCode('Australia/Sydney'), 'AU');
});

test('getCountryCode returns empty string for unknown or empty timezone', () => {
  assert.equal(getCountryCode('Antarctica/Troll'), ''); // valid IANA zone, intentionally not in the curated map
  assert.equal(getCountryCode(''), '');                 // empty string is guarded -> ''
});
// NOTE: do NOT assert getCountryCode(undefined) === '' — an omitted argument falls
// back to the host timezone (Intl), which on some dev machines (e.g. Asia/Tokyo) maps
// to a real code. That default path is only meaningful in the browser and is not
// unit-tested here. Pass an explicit timezone string in tests.

test('flagEmoji converts a 2-letter code to regional-indicator flag', () => {
  // 🇯🇵 = U+1F1EF U+1F1F5
  assert.equal(flagEmoji('JP'), String.fromCodePoint(0x1F1EF, 0x1F1F5));
  assert.equal(flagEmoji('jp'), String.fromCodePoint(0x1F1EF, 0x1F1F5)); // case-insensitive
});

test('flagEmoji returns empty string for invalid input', () => {
  assert.equal(flagEmoji(''), '');
  assert.equal(flagEmoji('J'), '');
  assert.equal(flagEmoji('JPN'), '');
  assert.equal(flagEmoji(null), '');
  assert.equal(flagEmoji(123), '');
});
```

Note: tests always pass an explicit timezone string so results are deterministic regardless of the host machine's timezone. `getCountryCode('')` returns `''` (empty is guarded), and an unmapped-but-valid zone like `'Antarctica/Troll'` returns `''` (absent from the curated map). The no-argument default path (host `Intl` timezone) is only exercised in the browser, not in these unit tests.

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/geo.test.js`
Expected: FAIL（`geo.js` が存在しない）

- [ ] **Step 3: 対応表を実装**

`src/js/utils/timezoneCountry.js`:
```js
// ============================================
// IANA timezone -> ISO 3166-1 alpha-2 country code (curated, common zones).
// Unknown zones are simply absent (treated as no country).
// ============================================

export const TIMEZONE_COUNTRY = {
    // --- Asia ---
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
    'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
    'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY',
    'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Kolkata': 'IN',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA', 'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL',
    'Asia/Yangon': 'MM', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
    'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ', 'Asia/Baghdad': 'IQ',
    'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Beirut': 'LB',
    'Asia/Amman': 'JO',
    // --- Europe ---
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT',
    'Europe/Zurich': 'CH', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU',
    'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR', 'Europe/Kyiv': 'UA',
    'Europe/Kiev': 'UA', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
    'Asia/Istanbul': 'TR', 'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS',
    'Europe/Sofia': 'BG', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI',
    'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
    'Europe/Luxembourg': 'LU', 'Europe/Reykjavik': 'IS',
    // --- Americas ---
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
    'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Sao_Paulo': 'BR',
    'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Buenos_Aires': 'AR',
    'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL',
    'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Caracas': 'VE',
    'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/La_Paz': 'BO',
    'America/Guatemala': 'GT', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA',
    'America/Havana': 'CU', 'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR',
    // --- Africa ---
    'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG',
    'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN',
    'Africa/Algiers': 'DZ', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET',
    'Africa/Dar_es_Salaam': 'TZ', 'Africa/Khartoum': 'SD',
    // --- Oceania ---
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
    'Pacific/Fiji': 'FJ', 'Pacific/Guam': 'GU', 'Pacific/Port_Moresby': 'PG',
};
```

- [ ] **Step 4: geo ユーティリティを実装**

`src/js/utils/geo.js`:
```js
// ============================================
// geo - derive a country code from the device timezone, and a flag emoji.
// ============================================

import { TIMEZONE_COUNTRY } from './timezoneCountry.js';

/**
 * Resolve a 2-letter country code from an IANA timezone.
 * Defaults to the host timezone; unknown/missing zones return ''.
 */
export function getCountryCode(timeZone = _hostTimeZone()) {
    if (!timeZone) return '';
    return TIMEZONE_COUNTRY[timeZone] || '';
}

function _hostTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
        return '';
    }
}

/** Convert a 2-letter country code to a regional-indicator flag emoji, or '' if invalid. */
export function flagEmoji(code) {
    if (typeof code !== 'string') return '';
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return '';
    const base = 0x1F1E6; // Regional Indicator Symbol Letter A
    return String.fromCodePoint(base + (c.charCodeAt(0) - 65), base + (c.charCodeAt(1) - 65));
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node --test tests/geo.test.js`
Expected: PASS（4 tests）

- [ ] **Step 6: 全テスト実行**

Run: `node --test`
Expected: 全パス

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/timezoneCountry.js src/js/utils/geo.js tests/geo.test.js
git commit -m "feat: タイムゾーン→国コード対応表と国旗ユーティリティを追加"
```

---

### Task 2: GAS Code.gs に国コード列（G）を追加 ＋ gas-core テスト更新

**Files:**
- Modify: `gas/Code.gs`
- Test: `tests/gas-core.test.js`

**Interfaces:**
- Consumes: なし
- Produces（`gas/Code.gs` グローバル関数）:
  - `sanitizeCountry(raw): string`（英字2文字大文字 or ''）
  - `validateEntry` の value に `country` を追加
  - `topNForWeek` / `groupFame` のエントリに `country` を追加
  - 行データが7列（末尾 country）

- [ ] **Step 1: 失敗するテストを書く（既存テストの更新＋追加）**

`tests/gas-core.test.js` を次のように変更する。

(a) 既存の `validateEntry` テストの成功アサーションを、`country` を含む形に更新:
```js
test('validateEntry accepts a valid entry and rejects bad ones', () => {
  const ok = ctx.validateEntry({ name: 'zz', score: 12345, mission: 4, clearTime: null, country: 'jp' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'ZZ', score: 12345, mission: 4, clearTime: null, country: 'JP' });
  assert.equal(ctx.validateEntry({ name: 'x', score: 10000 }).ok, false); // not > MIN_SCORE
  assert.equal(ctx.validateEntry({ name: 'x', score: -5 }).ok, false);
  assert.equal(ctx.validateEntry({ name: 'x', score: 1.5 }).ok, false); // non-integer
  assert.equal(ctx.validateEntry(null).ok, false);
});
```

(b) `sanitizeCountry` の新規テストを追加:
```js
test('sanitizeCountry keeps 2 letters uppercased, else empty', () => {
  assert.equal(ctx.sanitizeCountry('jp'), 'JP');
  assert.equal(ctx.sanitizeCountry('US'), 'US');
  assert.equal(ctx.sanitizeCountry('j'), '');
  assert.equal(ctx.sanitizeCountry('jpn'), '');
  assert.equal(ctx.sanitizeCountry('1!'), '');
  assert.equal(ctx.sanitizeCountry(null), '');
});
```

(c) `topNForWeek` テストの行を7列にして country を検証:
```js
test('topNForWeek filters by weekId, sorts desc, slices n, carries country', () => {
  const rows = [
    ['t', '2026-W29', 'A', 100, 1, '', 'JP'],
    ['t', '2026-W29', 'B', 300, 2, '', 'US'],
    ['t', '2026-W28', 'C', 999, 3, '', 'GB'], // other week
    ['t', '2026-W29', 'D', 200, 1, '', ''],
  ];
  const top = ctx.topNForWeek(rows, '2026-W29', 2);
  assert.deepEqual(top.map((e) => e.name), ['B', 'D']);
  assert.equal(top[0].score, 300);
  assert.equal(top[0].country, 'US');
});
```

(d) `groupFame` テストの行を7列にして country を検証:
```js
test('groupFame groups by week, newest first, entries sorted desc, carries country', () => {
  const fameRows = [
    ['2026-W27', 1, 'A', 500, 3, '', 'JP'],
    ['2026-W27', 2, 'B', 400, 2, '', 'US'],
    ['2026-W28', 1, 'C', 900, 4, '', 'GB'],
  ];
  const fame = ctx.groupFame(fameRows);
  assert.equal(fame[0].weekId, '2026-W28'); // newest first
  assert.equal(fame[1].weekId, '2026-W27');
  assert.deepEqual(fame[1].entries.map((e) => e.name), ['A', 'B']);
  assert.equal(fame[1].entries[0].country, 'JP');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/gas-core.test.js`
Expected: FAIL（`sanitizeCountry` 未定義、`validateEntry` の value に country 無し、topN/groupFame の country 無し）

- [ ] **Step 3: `gas/Code.gs` を更新**

(a) `sanitizeName` の直後（33-38行目付近の後）に `sanitizeCountry` を追加:
```javascript
function sanitizeCountry(raw) {
  var s = (raw == null ? '' : String(raw)).toUpperCase().replace(/[^A-Z]/g, '');
  return s.length === 2 ? s : '';
}
```

(b) `validateEntry` の return（47行目付近）に country を追加:
```javascript
  return { ok: true, value: { name: sanitizeName(entry.name), score: score, mission: mission, clearTime: clearTime, country: sanitizeCountry(entry.country) } };
```

(c) `topNForWeek` の push（54行目付近）に country を追加:
```javascript
      out.push({ name: rows[i][2], score: Number(rows[i][3]), mission: Number(rows[i][4]), clearTime: rows[i][5] || null, country: rows[i][6] || '' });
```

(d) `groupFame` の push（67行目付近）に country を追加:
```javascript
    byWeek[wk].push({ name: fameRows[i][2], score: Number(fameRows[i][3]), mission: Number(fameRows[i][4]), clearTime: fameRows[i][5] || null, country: fameRows[i][6] || '' });
```

(e) `readRows_` の getRange（87行目付近）を6→7列に:
```javascript
  return sheet.getRange(2, 1, lastRow - 1, 7).getValues();
```

(f) `doPost` の追記行（122行目付近）に country を追加:
```javascript
    var row = [now, weekId, entry.name, entry.score, entry.mission, entry.clearTime || '', entry.country || ''];
```

(g) `weeklySnapshot` の Fame 追記（148行目付近）に country を追加:
```javascript
      fameSheet.appendRow([prev, r + 1, top[r].name, top[r].score, top[r].mission, top[r].clearTime || '', top[r].country || '']);
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/gas-core.test.js`
Expected: PASS（既存6 + 追加1 = 7 tests、更新済みアサーション含む）

- [ ] **Step 5: 全テスト実行**

Run: `node --test`
Expected: 全パス

- [ ] **Step 6: コミット**

```bash
git add gas/Code.gs tests/gas-core.test.js
git commit -m "feat: GASに国コード列(G)を追加し読み書き・集計に反映"
```

---

### Task 3: HighScoreManager に country 引数を追加

**Files:**
- Modify: `src/js/systems/HighScoreManager.js`
- Test: `tests/HighScoreManager.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `addScore(name, score, mission, clearTime = null, country = '')`（エントリに `country` を保存）

- [ ] **Step 1: 失敗するテストを追加**

`tests/HighScoreManager.test.js` に追加（既存テストは変更不要）:
```js
test('addScore stores country and defaults to empty string', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  m.addScore('AAA', 20000, 4, null, 'JP');
  m.addScore('BBB', 15000, 3, null); // no country
  const top = m.getTop10();
  assert.equal(top[0].country, 'JP');
  assert.equal(top[1].country, '');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/HighScoreManager.test.js`
Expected: FAIL（`country` 未保存 → `undefined`）

- [ ] **Step 3: `addScore` を更新**

`src/js/systems/HighScoreManager.js` の `addScore`（77行目付近）を次のように変更:
```js
    addScore(name, score, mission, clearTime = null, country = '') {
        const entry = {
            name: (name || 'AAA').toUpperCase().substring(0, 10),
            score: score,
            mission: mission,
            clearTime: clearTime,
            country: country || '',
        };
        this.scores.push(entry);
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > MAX_WEEKLY) {
            this.scores = this.scores.slice(0, MAX_WEEKLY);
        }
        this._saveWeekly();
        return this.scores.indexOf(entry);
    }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/HighScoreManager.test.js`
Expected: PASS（既存 + 追加）

- [ ] **Step 5: コミット**

```bash
git add src/js/systems/HighScoreManager.js tests/HighScoreManager.test.js
git commit -m "feat: HighScoreManager.addScore に country を追加"
```

---

### Task 4: ScreenRenderer に国旗表示

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`

**Interfaces:**
- Consumes: `flagEmoji`（Task 1）、エントリの `country`
- Produces: なし

- [ ] **Step 1: `flagEmoji` を import**

`src/js/ui/ScreenRenderer.js` の先頭の import 群に追加（既存の import 記法に合わせる）:
```js
import { flagEmoji } from '../utils/geo.js';
```

- [ ] **Step 2: `drawRankingDisplay` の行末に国旗を表示**

`src/js/ui/ScreenRenderer.js` の 517行目付近の `ctx.fillText(...)` を次のように変更:
```js
            const flag = flagEmoji(entry.country);
            ctx.fillText(`${rank}.  ${scoreStr}     ${nameStr}      ${missionStr}${timeStr}${flag ? '  ' + flag : ''}`, textLeft, startY + index * lineH);
```

- [ ] **Step 3: `drawWallOfFame` の行末に国旗を表示**

`src/js/ui/ScreenRenderer.js` の 569行目付近の `ctx.fillText(...)` を次のように変更:
```js
                    const flag = flagEmoji(e.country);
                    ctx.fillText(`  ${rank}.  ${scoreStr}   ${nameStr}${flag ? '  ' + flag : ''}`, textLeft, y);
```

- [ ] **Step 4: 構文チェックと既存テスト**

Run: `node --check src/js/ui/ScreenRenderer.js && node --test`
Expected: 構文OK、既存テスト全パス

- [ ] **Step 5: コミット**

```bash
git add src/js/ui/ScreenRenderer.js
git commit -m "feat: ランキング／殿堂の各行に国旗を表示"
```

---

### Task 5: main.js 配線（登録時に国コードを算出して付与）

**Files:**
- Modify: `src/js/main.js`

**Interfaces:**
- Consumes: `getCountryCode`（Task 1）、`HighScoreManager.addScore`（Task 3、country引数）、`_submitOnline`
- Produces: なし

- [ ] **Step 1: `getCountryCode` を import**

`src/js/main.js` の import 群に追加:
```js
import { getCountryCode } from './utils/geo.js';
```

- [ ] **Step 2: `_submitOnline` に country 引数を追加**

`src/js/main.js` の `_submitOnline`（262行目付近）を次のように変更:
```js
    async _submitOnline(name, score, mission, clearTime, country) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime, country });
        if (res.ok) {
            this.lastRankIndex = res.rank;
            await this._refreshOnline();
        }
    },
```
（本体の他の行は既存のまま。上記は現行の `_submitOnline` 全体の置き換え。）

- [ ] **Step 3: 名前入力完了時に国コードを算出して両方へ渡す**

`src/js/main.js` の `_updateRankingEntry` の Enter 分岐（280-283行目付近）を次のように変更:
```js
                const country = getCountryCode();
                this.lastRankIndex = this.highScoreManager.addScore(
                    this.playerNameInput, this.score, displayMission, formattedTime, country
                );
                this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country);
```

- [ ] **Step 4: 構文チェックと全テスト**

Run: `node --check src/js/main.js && node --test`
Expected: 構文OK、全テスト（既存 + 新規）パス

- [ ] **Step 5: 配線確認**

Run: `grep -n "getCountryCode\|country" src/js/main.js`
Expected: import、addScore 呼び出し、_submitOnline 呼び出し／定義に country が現れる

- [ ] **Step 6: コミット**

```bash
git add src/js/main.js
git commit -m "feat: 登録時にタイムゾーン由来の国コードを付与"
```

---

### Task 6: 検証 ＋ スプレッドシート列追加の案内

**Files:**
- 変更なし（動作確認）

- [ ] **Step 1: 全テスト**

Run: `node --test`
Expected: 全テストPASS（geo / gas-core / HighScoreManager / OnlineLeaderboard / 既存）

- [ ] **Step 2: 構文チェック**

Run: `node --check src/js/main.js && node --check src/js/ui/ScreenRenderer.js`
Expected: いずれもOK

- [ ] **Step 3: ローカル・オフライン動作確認（ブラウザ）**

`LEADERBOARD_URL` 未設定でも動くこと（ローカル記録に国旗が付くこと）を確認:
1. `python3 -m http.server 8000` で起動、`http://localhost:8000/index.html`。
2. スコア（10000超）を出して名前登録 → THIS WEEK にその記録が国旗付き（Windowsでは2文字）で表示される。
3. コンソールエラーが無いこと。

- [ ] **Step 4: 作者の手作業（案内・オンライン反映用）**

以下は実装ではなく利用者への案内（このタスクでは実施のみ確認）:
- 既存スプレッドシートの `Scores` と `Fame` の **G1 セルに見出し `country` を追加**。
- 更新した `gas/Code.gs` を Apps Script に貼り直して保存。必要なら「デプロイを管理」から新バージョンを発行。
- 反映後、実機で登録 → シートG列に国コードが入り、ランキングに国旗が出ることを確認。

- [ ] **Step 5: 検証で見つかった不具合があれば修正してコミット**

```bash
git add -A
git commit -m "fix: 国旗個別化の検証で見つかった不具合を修正"
```

---

## 完了条件

- `node --test` 全パス（geo / gas-core 更新 / HighScoreManager 更新 / 既存）。
- ローカル・オフラインでも国旗付きで記録・表示され、既存挙動を壊さない。
- GAS が7列（末尾 country）を読み書きし、`doGet` エントリに country が含まれる。
- 旧データ（G空）は国旗なしで正常表示（後方互換）。
