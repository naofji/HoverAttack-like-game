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
  // NOTE: vm.createContext({}) creates a *separate V8 realm*, so object/array
  // literals returned by Code.gs (e.g. from validateEntry/topNForWeek/groupFame)
  // would have a different Object/Array constructor than this test file's. That
  // makes assert/strict's deepEqual (aliased to deepStrictEqual) fail with
  // "same structure but not reference-equal" even though the values are
  // identical. Running the script in *this* context via vm.Script/runInThisContext
  // avoids creating a new realm, so literals share intrinsics with the test file,
  // while still letting us capture the top-level function declarations off the
  // global object. Code.gs itself is unchanged.
  new vm.Script(code).runInThisContext();
  ctx = globalThis;
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

test('nextWeekId returns the ISO week 7 days later', () => {
  assert.equal(ctx.nextWeekId(new Date(Date.UTC(2026, 0, 5))), '2026-W03');
});

test('resolveWeekId accepts prev/current/next week id as-is (fixed date, not new Date())', () => {
  // 基準日を固定: 2026-01-05 (Mon) は 2026-W02。
  const now = new Date(Date.UTC(2026, 0, 5));
  assert.equal(ctx.resolveWeekId(ctx.previousWeekId(now), now), '2026-W01');
  assert.equal(ctx.resolveWeekId(ctx.isoWeekId(now), now), '2026-W02');
  assert.equal(ctx.resolveWeekId(ctx.nextWeekId(now), now), '2026-W03');
});

test('resolveWeekId falls back to server week when client week is 2+ weeks off', () => {
  const now = new Date(Date.UTC(2026, 0, 5)); // 2026-W02
  assert.equal(ctx.resolveWeekId('2025-W52', now), '2026-W02'); // 2週間前
  assert.equal(ctx.resolveWeekId('2026-W04', now), '2026-W02'); // 2週間後
});

test('resolveWeekId falls back to server week on missing/malformed/wrong-type input', () => {
  const now = new Date(Date.UTC(2026, 0, 5)); // 2026-W02
  assert.equal(ctx.resolveWeekId(undefined, now), '2026-W02');
  assert.equal(ctx.resolveWeekId(null, now), '2026-W02');
  assert.equal(ctx.resolveWeekId('', now), '2026-W02');
  assert.equal(ctx.resolveWeekId(20260101, now), '2026-W02');
  assert.equal(ctx.resolveWeekId('not-a-week', now), '2026-W02');
});

test('sanitizeName strips control chars, uppercases, caps length, defaults', () => {
  assert.equal(ctx.sanitizeName('abc'), 'ABC');
  assert.equal(ctx.sanitizeName('abcdefghijklmnop'), 'ABCDEFGHIJ'); // 10 max
  assert.equal(ctx.sanitizeName(''), 'AAA');
  assert.equal(ctx.sanitizeName('ab'), 'AB'); // control char removed
});

test('validateEntry accepts a valid entry and rejects bad ones', () => {
  const ok = ctx.validateEntry({ name: 'zz', score: 12345, mission: 4, clearTime: null, country: 'jp' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'ZZ', score: 12345, mission: 4, clearTime: null, country: 'JP', tries: 1 });
  assert.equal(ctx.validateEntry({ name: 'x', score: 10000 }).ok, false); // not > MIN_SCORE
  assert.equal(ctx.validateEntry({ name: 'x', score: -5 }).ok, false);
  assert.equal(ctx.validateEntry({ name: 'x', score: 1.5 }).ok, false); // non-integer
  assert.equal(ctx.validateEntry(null).ok, false);
});

test('validateEntry は tries を受け取り、無ければ 1 にする', () => {
  const withTries = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5, tries: 3 });
  assert.equal(withTries.ok, true);
  assert.equal(withTries.value.tries, 3);

  const without = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5 });
  assert.equal(without.value.tries, 1);
});

test('validateEntry は壊れた tries を 1 に落とす', () => {
  for (const bad of ['x', -5, 0, null, 1e9]) {
    const v = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5, tries: bad });
    assert.equal(v.ok, true);
    assert.ok(v.value.tries >= 1 && v.value.tries <= 999, String(bad));
  }
});

test('topNForWeek は同点でトライ数が少ないほうを上にする', () => {
  const rows = [
    [new Date(), '2026-W33', 'AAA', 50000, 5, '', 'JP', 3],
    [new Date(), '2026-W33', 'BBB', 50000, 5, '', 'JP', 1],
    [new Date(), '2026-W33', 'CCC', 60000, 6, '', 'JP', 9],
  ];
  const top = ctx.topNForWeek(rows, '2026-W33', 10);
  assert.deepEqual(top.map(function (e) { return e.name; }), ['CCC', 'BBB', 'AAA']);
  assert.equal(top[0].tries, 9);
});

test('topNForWeek は tries 列が無い旧行を 1 として扱う', () => {
  const rows = [
    [new Date(), '2026-W33', 'AAA', 50000, 5, '', 'JP', 2],
    [new Date(), '2026-W33', 'OLD', 50000, 5, '', 'JP'],   // 列が無い
  ];
  const top = ctx.topNForWeek(rows, '2026-W33', 10);
  assert.equal(top[0].name, 'OLD');
  assert.equal(top[0].tries, 1);
});

test('sanitizeCountry keeps 2 letters uppercased, else empty', () => {
  assert.equal(ctx.sanitizeCountry('jp'), 'JP');
  assert.equal(ctx.sanitizeCountry('US'), 'US');
  assert.equal(ctx.sanitizeCountry('j'), '');
  assert.equal(ctx.sanitizeCountry('jpn'), '');
  assert.equal(ctx.sanitizeCountry('1!'), '');
  assert.equal(ctx.sanitizeCountry(null), '');
});

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

test('topNForWeek coerces a numeric-looking sheet cell name to a string', () => {
  // Sheets' getValues() can return a purely-numeric cell as a JS number even
  // when it was written as a string (e.g. player name "007"). The client
  // calls entry.name.padEnd(...), which throws on a number.
  const rows = [
    ['t', '2026-W29', 999, 100, 1, '', 'JP'],
  ];
  const top = ctx.topNForWeek(rows, '2026-W29', 5);
  assert.equal(typeof top[0].name, 'string');
  assert.equal(top[0].name, '999');
});

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

test('topStagesForWeek coerces a numeric-looking sheet cell name to a string', () => {
    const rows = [
        [new Date(), 'W1', 42, 1, 5000, 100, 'JP'],
    ];
    const out = ctx.topStagesForWeek(rows, 'W1', 5);
    assert.equal(typeof out[0].time[0].name, 'string');
    assert.equal(out[0].time[0].name, '42');
    assert.equal(typeof out[0].score[0].name, 'string');
    assert.equal(out[0].score[0].name, '42');
});

// readRows_ 用の偽シート。getLastColumn() をそのまま getRange の numCols に渡す
// ことを確かめたいので、getRange が要求された列数を記録しておく。
function makeFakeSheet(lastRow, lastColumn, values) {
  var requestedNumCols = null;
  return {
    getLastRow: function () { return lastRow; },
    getLastColumn: function () { return lastColumn; },
    getRange: function (row, col, numRows, numCols) {
      requestedNumCols = numCols;
      return { getValues: function () { return values; } };
    },
    _requestedNumCols: function () { return requestedNumCols; },
  };
}

// コンティニューのたびにセーブ地点より前の面の記録が何度も appendRow されるため、
// GAS 側も取り込み(集計)時に name+timeMs+score が完全一致する行を1件に畳む。
test('topStagesForWeek は同一行(name+timeMs+score完全一致)を1件に畳む', () => {
    const rows = [
        [new Date(), 'W1', 'AAA', 1, 5000, 100, 'JP'],
        [new Date(), 'W1', 'AAA', 1, 5000, 100, 'JP'], // 完全に同じ行(重複投稿)
    ];
    const out = ctx.topStagesForWeek(rows, 'W1', 5);
    assert.equal(out[0].time.length, 1, `重複が畳まれていない: ${JSON.stringify(out[0].time)}`);
    assert.equal(out[0].score.length, 1);
});

test('topStagesForWeek は timeMs か score が違えば別記録として両方残す', () => {
    const rows = [
        [new Date(), 'W1', 'AAA', 1, 5000, 100, 'JP'],
        [new Date(), 'W1', 'AAA', 1, 5001, 100, 'JP'], // timeMs だけ違う
        [new Date(), 'W1', 'AAA', 1, 5000, 101, 'JP'], // score だけ違う
    ];
    const out = ctx.topStagesForWeek(rows, 'W1', 5);
    assert.equal(out[0].time.length, 3);
    assert.equal(out[0].score.length, 3);
});

test('readRows_ は getLastColumn() が返す列数ぶんだけ読む(8列のScoresシート)', () => {
  const sheet = makeFakeSheet(3, 8, [
    ['t', 'W1', 'AAA', 100, 1, '', 'JP', 3],
    ['t', 'W1', 'BBB', 200, 1, '', 'JP', 1],
  ]);
  const rows = ctx.readRows_(sheet);
  assert.equal(sheet._requestedNumCols(), 8);
  assert.equal(rows.length, 2);
});

test('readRows_ は7列のWallOfFame/StageScoresシートでも(getLastColumnに合わせて)読める', () => {
  const sheet = makeFakeSheet(2, 7, [
    ['W1', 1, 'AAA', 100, 1, '', 'JP'],
  ]);
  const rows = ctx.readRows_(sheet);
  assert.equal(sheet._requestedNumCols(), 7);
  assert.equal(rows.length, 1);
});

test('readRows_ は空シート(getLastRow<2)で[]を返し、getRangeを呼ばない', () => {
  const sheet = makeFakeSheet(1, 0, []);
  const rows = ctx.readRows_(sheet);
  assert.deepEqual(rows, []);
  assert.equal(sheet._requestedNumCols(), null); // getRange未呼び出し
});

test('readRows_ はgetLastColumnが0の壊れたシートでも例外を投げず[]を返す', () => {
  const sheet = makeFakeSheet(5, 0, []);
  const rows = ctx.readRows_(sheet);
  assert.deepEqual(rows, []);
});
