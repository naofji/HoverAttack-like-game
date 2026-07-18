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
