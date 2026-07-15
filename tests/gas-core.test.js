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
