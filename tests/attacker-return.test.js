import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE, ENEMY_ATTACKER_TYPES,
  ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
  ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE
} from '../src/js/utils/Constants.js';

test('return thresholds match the spec', () => {
  assert.equal(ATTACKER_RETURN_TRIGGER_Y, 6 * TILE_SIZE);
  assert.equal(ATTACKER_RETURN_TRIGGER_X, 20 * TILE_SIZE);
  assert.equal(ATTACKER_RETURN_DONE, 2 * TILE_SIZE);
  assert.ok(ATTACKER_CLIMB_MIN_FUEL > 0);
  assert.ok(ATTACKER_CLIMB_MAX_RISE < 0);
});

test('every attacker type has a climbThrust that beats gravity', () => {
  const expected = { standard: 0.55, heavy: 0.45, rival: 0.65, artillery: 0.5 };
  for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.equal(type.climbThrust, expected[key], `climbThrust of ${key}`);
    assert.ok(type.climbThrust > 0.30, `${key} must out-thrust GRAVITY`);
  }
});
