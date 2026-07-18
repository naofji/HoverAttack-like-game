import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTimeBonus, TIME_BONUS_BASE_MULT, buildStageResult } from '../src/js/utils/scoring.js';

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

test('buildStageResult = (scoreNow - stageStartScore) + timeBonus', () => {
    const r = buildStageResult({ stage: 3, scoreNow: 18000, stageStartScore: 10000, targetTimeBonus: 2500, timeMs: 42000 });
    assert.deepEqual(r, { stage: 3, timeMs: 42000, score: 8000 + 2500 });
});

test('buildStageResult clamps negative to 0', () => {
    const r = buildStageResult({ stage: 1, scoreNow: 100, stageStartScore: 5000, targetTimeBonus: 0, timeMs: 1000 });
    assert.equal(r.score, 0);
});

test('buildStageResult rounds timeMs to an integer (server requires integer ms)', () => {
    // missionTimer accumulates float deltaTimes, so timeMs arrives fractional.
    const r = buildStageResult({ stage: 2, scoreNow: 8000, stageStartScore: 0, targetTimeBonus: 0, timeMs: 42315.6 });
    assert.equal(Number.isInteger(r.timeMs), true);
    assert.equal(r.timeMs, 42316);
});
