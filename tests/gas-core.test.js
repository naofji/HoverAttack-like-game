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

test('sanitizeName strips control chars, uppercases, caps length, defaults', () => {
  assert.equal(ctx.sanitizeName('abc'), 'ABC');
  assert.equal(ctx.sanitizeName('abcdefghijklmnop'), 'ABCDEFGHIJ'); // 10 max
  assert.equal(ctx.sanitizeName(''), 'AAA');
  assert.equal(ctx.sanitizeName('ab'), 'AB'); // control char removed
});

test('validateEntry accepts a valid entry and rejects bad ones', () => {
  const ok = ctx.validateEntry({ name: 'zz', score: 12345, mission: 4, clearTime: null, country: 'jp' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'ZZ', score: 12345, mission: 4, clearTime: null, country: 'JP' });
  assert.equal(ctx.validateEntry({ name: 'x', score: 10000 }).ok, false); // not > MIN_SCORE
  assert.equal(ctx.validateEntry({ name: 'x', score: -5 }).ok, false);
  assert.equal(ctx.validateEntry({ name: 'x', score: 1.5 }).ok, false); // non-integer
  assert.equal(ctx.validateEntry(null).ok, false);
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
