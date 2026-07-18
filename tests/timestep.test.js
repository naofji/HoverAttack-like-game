import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceAccumulator, lerp, SIM_STEP, MAX_TICKS } from '../src/js/utils/timestep.js';

test('SIM_STEP is a 60Hz step', () => {
  assert.ok(Math.abs(SIM_STEP - 1000 / 60) < 1e-9);
});

test('one full step at 60fps, full speed', () => {
  const r = advanceAccumulator(0, SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, 1);
  assert.ok(Math.abs(r.remainder) < 1e-9);
});

test('0.8x under-runs: some frames advance 0 ticks', () => {
  // Feed 0.8 * SIM_STEP repeatedly; over 5 frames expect 4 ticks total.
  let acc = 0, total = 0;
  for (let i = 0; i < 5; i++) {
    const r = advanceAccumulator(acc, 0.8 * SIM_STEP, SIM_STEP, MAX_TICKS);
    total += r.ticks;
    acc = r.remainder;
  }
  assert.equal(total, 4);
});

test('caps ticks at maxTicks (no spiral of death)', () => {
  const r = advanceAccumulator(0, 100 * SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, MAX_TICKS);
});

test('alpha is fractional remainder', () => {
  const r = advanceAccumulator(0, 0.5 * SIM_STEP, SIM_STEP, MAX_TICKS);
  assert.equal(r.ticks, 0);
  assert.ok(Math.abs(r.alpha - 0.5) < 1e-9);
});

test('lerp', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
});
