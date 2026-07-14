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
