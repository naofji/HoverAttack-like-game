import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE, ENEMY_ATTACKER_TYPES,
  ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
  ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE,
  ATTACKER_SLOW_RISE_CAP, ATTACKER_BOOST_MAX_FRAMES, RIVAL_ALIGN_THRESHOLD,
  RIVAL_ALIGN_TRIGGER_FRAMES, RIVAL_EVADE_OFFSET_MIN, RIVAL_EVADE_OFFSET_MAX, RIVAL_EVADE_DURATION,
  ATTACKER_COVER_CHECK_INTERVAL, ATTACKER_COVER_SCAN_TILES, ATTACKER_COVER_MIN_DIST
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

/** Floor row 20 with a pit (cols 10-13, floor at row 22) between two ledges. */
function pitWorldRows() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 22; r++) rows.push('#'.repeat(10) + '....' + '#'.repeat(10));
  for (let r = 22; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

function makePlayer(x, y) {
  return { x, y, width: 16, height: 24, alive: true, docked: false };
}

test('chasing attacker does NOT walk off a ledge when the target is level with it', () => {
  const game = makeGame(makeMap(pitWorldRows()));
  game.player = makePlayer(16 * TILE_SIZE, FLOOR_Y); // same height, across the pit
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.config.movementType = 'stop_and_shoot'; // pin: this test verifies mechanics, not heavy's persona
  e.config.avoidsAlignment = false; // pin: alignment-avoidance is part of heavy's persona too

  for (let i = 0; i < 600; i++) e.update();

  assert.equal(e.aiState, 'chase');
  assert.equal(e.y, FLOOR_Y, 'stays on the upper floor');
  assert.ok(e.x + e.width <= 10 * TILE_SIZE + 1, 'stops at the ledge');
});

test('chasing attacker DOES drop down when the target is below', () => {
  const game = makeGame(makeMap(pitWorldRows()));
  game.player = makePlayer(11 * TILE_SIZE, 22 * TILE_SIZE - 24); // inside the pit
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.config.movementType = 'stop_and_shoot'; // pin: this test verifies mechanics, not heavy's persona
  e.config.avoidsAlignment = false; // pin: alignment-avoidance is part of heavy's persona too

  for (let i = 0; i < 600; i++) e.update();

  assert.ok(e.y > FLOOR_Y, 'followed the target down into the pit');
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

/** Flat floor at row 20 plus a thin platform at row 14 (cols 10-14). */
function platformWorldRows() {
  const rows = [];
  for (let r = 0; r < 14; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(10) + '#####' + '.'.repeat(9)); // row 14
  for (let r = 15; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('heavy attacker gains altitude when its target is 4+ tiles above', () => {
  const game = makeGame(makeMap(platformWorldRows()));
  game.player = makePlayer(12 * TILE_SIZE, 14 * TILE_SIZE - 24); // on the platform
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');

  let minY = e.y;
  for (let i = 0; i < 1200; i++) {
    e.update();
    minY = Math.min(minY, e.y);
  }

  assert.ok(minY < FLOOR_Y - 3 * TILE_SIZE,
    `should climb at least 3 tiles toward the target, minY=${minY}`);
});

test('movement personality constants match the spec', () => {
  assert.equal(ATTACKER_SLOW_RISE_CAP, -1.5);
  assert.equal(ATTACKER_BOOST_MAX_FRAMES, 20);
  assert.equal(RIVAL_ALIGN_THRESHOLD, 24);
  assert.equal(RIVAL_ALIGN_TRIGGER_FRAMES, 45);
  assert.equal(RIVAL_EVADE_OFFSET_MIN, 60);
  assert.equal(RIVAL_EVADE_OFFSET_MAX, 120);
  assert.equal(RIVAL_EVADE_DURATION, 40);
});

test('every attacker type has the spec climbStyle', () => {
  const expected = { standard: 'boost', heavy: 'jump', rival: 'hover', artillery: 'jump' };
  for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.equal(type.climbStyle, expected[key], `climbStyle of ${key}`);
  }
});

test("'jump' style never thrusts while falling (heavy cannot float)", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy'); // in the air, well above floor
  e.vy = 2.0; // falling
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, false);
  assert.equal(e.hovering, false);
  assert.equal(e.vy, 2.0);
});

test("'jump' style thrusts during ascent but stays above the slow-rise cap", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy');
  e.onGround = false;
  e.vy = -1.0; // ascending slower than the cap
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, true);
  // heavy climbThrust 0.45: -1.0 - 0.45 = -1.45, still above the -1.5 cap
  assert.ok(e.vy >= ATTACKER_SLOW_RISE_CAP && e.vy < -1.0, `vy=${e.vy}`);
});

test("'jump' style clamps to the slow-rise cap exactly", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'heavy');
  e.onGround = false;
  e.vy = -1.4; // -1.4 - 0.45 = -1.85 -> clamped to -1.5
  e._applyAerialThrust(-4.0);
  assert.equal(e.vy, ATTACKER_SLOW_RISE_CAP);
});

test("'boost' style stops after ATTACKER_BOOST_MAX_FRAMES per airborne leg", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'standard');
  e.onGround = false;
  let appliedCount = 0;
  for (let i = 0; i < 60; i++) {
    e.vy = -0.5; // keep it ascending so only the frame budget limits thrust
    if (e._applyAerialThrust(-4.0)) appliedCount++;
  }
  assert.equal(appliedCount, ATTACKER_BOOST_MAX_FRAMES);
});

test("'hover' style thrusts even while falling (rival floats)", () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = makeAttacker(game, 64, 100, 'rival');
  e.onGround = false;
  e.vy = 2.0; // falling
  const applied = e._applyAerialThrust(-4.0);
  assert.equal(applied, true);
  assert.equal(e.hovering, true);
  assert.ok(e.vy < 2.0);
});

/** Flat floor at row 20 with a single 1-tile step up at col 12 (top at row 19). */
function oneStepWorldRows() {
  const rows = [];
  for (let r = 0; r < 19; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 19: raised floor right half
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

test('walks up a 1-tile step without jumping', () => {
  const game = makeGame(makeMap(oneStepWorldRows()));
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.homeX = 18 * TILE_SIZE;            // walk right, over the step
  e.homeY = 19 * TILE_SIZE - 24;       // standing on the raised floor
  e.returning = true;

  let minVy = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    minVy = Math.min(minVy, e.vy);
    if (e.x > 14 * TILE_SIZE) break;   // crossed the step
  }

  assert.ok(e.x > 13 * TILE_SIZE, `should cross the step, x=${e.x}`);
  assert.equal(e.y, 19 * TILE_SIZE - 24, 'standing on the raised floor');
  assert.ok(minVy > -3.0, `must not jump (jumpForce is -5.0), minVy=${minVy}`);
});

test('still jumps at a 2-tile wall', () => {
  const rows = [];
  for (let r = 0; r < 18; r++) rows.push('.'.repeat(24));
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 18
  rows.push('.'.repeat(12) + '#'.repeat(12)); // row 19 (2-tile wall)
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  const game = makeGame(makeMap(rows));
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  e.homeX = 18 * TILE_SIZE;
  e.homeY = 18 * TILE_SIZE - 24;
  e.returning = true;

  let minVy = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    minVy = Math.min(minVy, e.vy);
  }
  assert.ok(minVy <= -4.0, `should have jumped at the wall, minVy=${minVy}`);
});

test('rival breaks X-axis alignment within the evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(64, 60); // directly ABOVE the rival (same X, far in Y)
  const e = makeAttacker(game, 64, FLOOR_Y, 'rival');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    const dx = (game.player.x + 8) - (e.x + e.width / 2);
    if (Math.abs(dx) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + RIVAL_EVADE_DURATION + 20,
    `X alignment persisted ${maxAlignedRun} frames`);
});

test('rival breaks Y-axis alignment within the evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(280, FLOOR_Y); // same height, to the right
  const e = makeAttacker(game, 64, FLOOR_Y, 'rival');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 600; i++) {
    e.update();
    const dy = (game.player.y + 12) - (e.y + e.height / 2);
    if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + RIVAL_EVADE_DURATION + 20,
    `Y alignment persisted ${maxAlignedRun} frames`);
});

test('heavy/artillery standoff config matches the spec', () => {
  const t = ENEMY_ATTACKER_TYPES;
  assert.equal(t.heavy.movementType, 'chase_and_jump');
  assert.equal(t.heavy.avoidsAlignment, true);
  assert.equal(t.heavy.evadeDuration, 90);
  assert.equal(t.rival.avoidsAlignment, true);
  assert.equal(t.rival.evadeDuration, 40);
  assert.equal(t.artillery.movementType, 'skirmish');
  assert.equal(t.artillery.seeksCover, true);
  assert.equal(ATTACKER_COVER_CHECK_INTERVAL, 30);
  assert.equal(ATTACKER_COVER_SCAN_TILES, 6);
  assert.equal(ATTACKER_COVER_MIN_DIST, 160);
});

test('heavy keeps its standoff distance instead of walking straight in', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(24, FLOOR_Y); // far left on the same floor
  const e = makeAttacker(game, 350, FLOOR_Y, 'heavy');

  let closeFrames = 0;   // frames spent closer than 60px (evade transits only)
  let minAbsDx = Infinity;
  let engaged = false;
  for (let i = 0; i < 900; i++) {
    e.update();
    const dx = Math.abs((game.player.x + 8) - (e.x + e.width / 2));
    minAbsDx = Math.min(minAbsDx, dx);
    if (dx < 60) closeFrames++;
    if (dx <= 200) engaged = true;
  }
  assert.ok(closeFrames <= 150, `hugged the player for ${closeFrames}/900 frames`);
  assert.ok(minAbsDx >= 16, `overlapped the player, minAbsDx=${minAbsDx}`);
  assert.ok(engaged, `never engaged, minAbsDx=${minAbsDx}`);
});

test('heavy breaks Y-axis alignment within its evade budget', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = makePlayer(400, FLOOR_Y); // same height
  const e = makeAttacker(game, 100, FLOOR_Y, 'heavy');

  let maxAlignedRun = 0;
  let run = 0;
  for (let i = 0; i < 900; i++) {
    e.update();
    const dy = (game.player.y + 12) - (e.y + e.height / 2);
    if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) run++; else run = 0;
    maxAlignedRun = Math.max(maxAlignedRun, run);
  }
  assert.ok(maxAlignedRun <= RIVAL_ALIGN_TRIGGER_FRAMES + 90 + 20,
    `Y alignment persisted ${maxAlignedRun} frames`);
});
