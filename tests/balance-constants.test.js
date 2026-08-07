import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOVER_MAX_FUEL, BURST_FUEL_CONSUMPTION, BURST_MIN_FUEL, CARRIER_MAX_HP,
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

// --- ホバー燃料と母艦HP（2026-08-07 調整） ---

test('バーストの下限は消費量と一致する', () => {
  // ずれると「燃料はあるのにバーストできない」あるいは「飛んだ直後にマイナス」
  // という状態が生まれる。HUD のバースト可否表示も BURST_MIN_FUEL を見ている。
  assert.equal(BURST_MIN_FUEL, BURST_FUEL_CONSUMPTION);
});

test('満タンからバーストできる回数', () => {
  assert.equal(Math.floor(HOVER_MAX_FUEL / BURST_FUEL_CONSUMPTION), 5);
});

test('母艦は敵ミサイル12発に耐える', () => {
  const ENEMY_MISSILE_DAMAGE_TO_CARRIER = 10;   // CollisionManager の値
  assert.equal(Math.ceil(CARRIER_MAX_HP / ENEMY_MISSILE_DAMAGE_TO_CARRIER), 12);
});
