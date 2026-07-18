import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE, ENEMY_ATTACKER_TYPES,
  ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
  ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE
} from '../src/js/utils/Constants.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';

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

const FLOOR_Y = 20 * TILE_SIZE - 24; // standing y on the row-20 floor = 296

test('attacker remembers its spawn point as home', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  assert.equal(e.homeX, 64);
  assert.equal(e.homeY, FLOOR_Y);
  assert.equal(e.returning, false);
});

test('drops 8 tiles below home -> enters return state', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  e.homeY = e.y - 8 * TILE_SIZE; // home is 8 tiles above (beyond the 6-tile trigger)
  e.update();
  assert.equal(e.aiState, 'return');
  assert.equal(e.returning, true);
});

test('4 tiles below home: fresh attacker stays patrol, returning attacker keeps returning (hysteresis)', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const fresh = makeAttacker(game, 64, FLOOR_Y);
  fresh.homeY = fresh.y - 4 * TILE_SIZE; // inside trigger(6) but outside done(2)
  fresh.update();
  assert.equal(fresh.aiState, 'patrol');

  const returning = makeAttacker(game, 200, FLOOR_Y);
  returning.homeY = returning.y - 8 * TILE_SIZE;
  returning.update();                      // enters return
  returning.homeY = returning.y - 4 * TILE_SIZE; // now only 4 tiles off
  returning.update();
  assert.equal(returning.aiState, 'return'); // sticky until within 2 tiles
});

test('within 2 tiles of home -> return completes, back to patrol', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, FLOOR_Y);
  e.homeY = e.y - 8 * TILE_SIZE;
  e.update();                 // enters return
  e.homeX = e.x;
  e.homeY = e.y;              // teleport home for the state test only
  e.update();
  assert.equal(e.returning, false);
  assert.equal(e.aiState, 'patrol');
});

/** 24x24 world: low floor (row 20) on the left, an 8-tile step (top row 12) on the right half. */
function stepWorldRows() {
  const rows = [];
  for (let r = 0; r < 12; r++) rows.push('.'.repeat(24));
  for (let r = 12; r < 20; r++) rows.push('.'.repeat(12) + '#'.repeat(12));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('heavy attacker climbs an 8-tile step back to its home (no warp)', () => {
  const game = makeGame(makeMap(stepWorldRows()));
  const e = makeAttacker(game, 48, FLOOR_Y, 'heavy');
  // Pretend it originally spawned on top of the step at col 16
  e.homeX = 16 * TILE_SIZE;              // 256
  e.homeY = 12 * TILE_SIZE - 24;         // 168 (standing on the step top)

  let prevY = e.y;
  let maxStepPerFrame = 0;
  for (let i = 0; i < 3600; i++) {
    e.update();
    maxStepPerFrame = Math.max(maxStepPerFrame, Math.abs(e.y - prevY));
    prevY = e.y;
    if (!e.returning && Math.abs(e.y - e.homeY) <= 2 * TILE_SIZE) break;
  }

  assert.ok(Math.abs(e.y - e.homeY) <= 2 * TILE_SIZE,
    `should be back near home height, got y=${e.y} home=${e.homeY}`);
  assert.ok(Math.abs(e.x - e.homeX) <= 3 * TILE_SIZE,
    `should be near homeX, got x=${e.x}`);
  assert.equal(e.returning, false);
  assert.ok(maxStepPerFrame < TILE_SIZE, 'no warp: per-frame movement stays under one tile');
});
