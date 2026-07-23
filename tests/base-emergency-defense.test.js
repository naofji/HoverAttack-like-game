import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERGENCY_DEFENSE_BASE_RADIUS,
  EMERGENCY_DEFENSE_SPEED_MULT,
  EMERGENCY_DEFENSE_SIGHT_RANGE
} from '../src/js/utils/Constants.js';

test('emergency defense base radius constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_BASE_RADIUS, 120);
});

test('emergency defense speed multiplier constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_SPEED_MULT, 1.15);
});

test('emergency defense sight range constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_SIGHT_RANGE, 250);
});
