import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIER_INITIAL_LIVES,
  CRUISE_MISSILE_SCORE,
  ENEMY_DRONE_SCORE,
  ENEMY_DRONE_HP,
  ENEMY_ATTACKER_TYPES,
} from '../src/js/utils/Constants.js';

test('carrier starts with a single life', () => {
  assert.equal(CARRIER_INITIAL_LIVES, 1);
});

test('rebalanced enemy scores', () => {
  assert.equal(CRUISE_MISSILE_SCORE, 150);
  assert.equal(ENEMY_DRONE_SCORE, 250);
});

test('drone durability bumped ~1.5x', () => {
  assert.equal(ENEMY_DRONE_HP, 8);
});

test('attacker scores span 300..900', () => {
  assert.equal(ENEMY_ATTACKER_TYPES.standard.score, 300);
  assert.equal(ENEMY_ATTACKER_TYPES.heavy.score, 500);
  assert.equal(ENEMY_ATTACKER_TYPES.rival.score, 700);
  assert.equal(ENEMY_ATTACKER_TYPES.artillery.score, 900);
});
