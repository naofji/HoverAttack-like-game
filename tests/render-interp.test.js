import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotEntity, interpolateEntity, restoreEntity, TELEPORT_THRESHOLD
} from '../src/js/utils/renderInterp.js';
import { advanceAccumulator, lerp, SIM_STEP, MAX_TICKS } from '../src/js/utils/timestep.js';

test('interpolates between the previous and current tick position', () => {
  const e = { x: 0, y: 0 };
  snapshotEntity(e);
  e.x = 10; e.y = 20;

  interpolateEntity(e, 0.5);
  assert.equal(e.x, 5);
  assert.equal(e.y, 10);
});

test('restore puts the entity back on its true simulation position', () => {
  const e = { x: 0, y: 0 };
  snapshotEntity(e);
  e.x = 10; e.y = 20;

  interpolateEntity(e, 0.5);
  restoreEntity(e);
  assert.equal(e.x, 10);
  assert.equal(e.y, 20);
});

test('an entity spawned since the last tick is drawn where it is', () => {
  const e = { x: 42, y: 99 }; // never snapshotted
  interpolateEntity(e, 0.5);
  assert.equal(e.x, 42);
  assert.equal(e.y, 99);
});

test('a teleport is drawn at the destination, not smeared across the gap', () => {
  const e = { x: 0, y: 0 };
  snapshotEntity(e);
  e.x = TELEPORT_THRESHOLD + 1; // respawn-sized jump

  interpolateEntity(e, 0.5);
  assert.equal(e.x, TELEPORT_THRESHOLD + 1);
});

test('movement below the teleport threshold still interpolates', () => {
  const e = { x: 0, y: 0 };
  snapshotEntity(e);
  e.x = TELEPORT_THRESHOLD - 1;

  interpolateEntity(e, 0.5);
  assert.equal(e.x, (TELEPORT_THRESHOLD - 1) / 2);
});

test('restore is a no-op for an entity that was never interpolated', () => {
  const e = { x: 7, y: 8 };
  restoreEntity(e);
  assert.equal(e.x, 7);
  assert.equal(e.y, 8);
});

// The reason this module exists: at gameSpeed 0.8 the raw tick positions
// advance 1,1,1,1,0 per frame — a frozen frame every fifth frame. Interpolated,
// every frame advances a uniform 0.8.
test('NORMAL mode renders uniform motion instead of a 5-frame stutter', () => {
  const e = { x: 0, y: 0 };
  let acc = 0;
  const raw = [];
  const interp = [];

  for (let f = 0; f < 12; f++) {
    const r = advanceAccumulator(acc, 0.8 * SIM_STEP, SIM_STEP, MAX_TICKS);
    for (let t = 0; t < r.ticks; t++) {
      snapshotEntity(e);
      e.x += 1; // one unit of travel per tick
    }
    acc = r.remainder;

    raw.push(e.x);
    interp.push(lerp(e._prevX, e.x, r.alpha));
  }

  // Raw positions freeze for one frame out of every five.
  const rawSteps = raw.slice(1).map((v, i) => v - raw[i]);
  assert.ok(rawSteps.includes(0), 'expected a frozen frame in the raw positions');

  // Interpolated positions advance uniformly. (Skip the first step, which is
  // the startup transient before the accumulator reaches steady state.)
  const interpSteps = interp.slice(2).map((v, i) => v - interp[i + 1]);
  for (const step of interpSteps) {
    assert.ok(Math.abs(step - 0.8) < 1e-9, `expected 0.8 per frame, got ${step}`);
  }
});

test('NEWTYPE mode is unaffected: one tick per frame, full-speed motion', () => {
  const e = { x: 0, y: 0 };
  let acc = 0;
  const interp = [];

  for (let f = 0; f < 8; f++) {
    const r = advanceAccumulator(acc, 1.0 * SIM_STEP, SIM_STEP, MAX_TICKS);
    assert.equal(r.ticks, 1);
    for (let t = 0; t < r.ticks; t++) {
      snapshotEntity(e);
      e.x += 1;
    }
    acc = r.remainder;
    interp.push(lerp(e._prevX, e.x, r.alpha));
  }

  const steps = interp.slice(1).map((v, i) => v - interp[i]);
  for (const step of steps) {
    assert.ok(Math.abs(step - 1) < 1e-9, `expected 1.0 per frame, got ${step}`);
  }
});
