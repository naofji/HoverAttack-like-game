import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_RELOAD_THRESHOLD, PLAYER_MG_BURST_SIZE } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE; // 16

test('threshold constant is 50%', () => {
  assert.equal(PLAYER_MG_RELOAD_THRESHOLD, 0.5);
});

test('more than 50% remaining: never reload (even with fire released)', () => {
  assert.equal(shouldStartMGReload(9, SIZE, false), false);
  assert.equal(shouldStartMGReload(SIZE, SIZE, false), false); // full mag
});

test('at or below 50% with fire held: keep shooting, no reload', () => {
  assert.equal(shouldStartMGReload(8, SIZE, true), false);
  assert.equal(shouldStartMGReload(1, SIZE, true), false);
});

test('at or below 50% with fire released: reload', () => {
  assert.equal(shouldStartMGReload(8, SIZE, false), true);  // boundary: exactly 50%
  assert.equal(shouldStartMGReload(3, SIZE, false), true);
});

test('empty magazine: reload regardless of fire key', () => {
  assert.equal(shouldStartMGReload(0, SIZE, true), true);
  assert.equal(shouldStartMGReload(0, SIZE, false), true);
});
