import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import {
  EMERGENCY_DEFENSE_BASE_RADIUS,
  EMERGENCY_DEFENSE_SIGHT_RANGE
} from '../src/js/utils/Constants.js';

// Trivial map: nothing is solid, so units float freely (fine for state-machine tests).
const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

function makeConfig(overrides = {}) {
  return {
    hp: 30, speed: 2, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', aimAccuracy: 1.0,
    ...overrides
  };
}

/** Minimal attacker built without running the real constructor's spawn logic. */
function makeAttacker(x, y, config = makeConfig(), game = {}) {
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [], ...game };
  a.x = x; a.y = y; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = false;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.score = config.score;
  a.facingRight = true;
  a.patrolDir = 1;
  a.fireTimer = 0;
  a.aiState = 'patrol';
  a.jumpCooldown = 0;
  a.homeX = x; a.homeY = y;
  a.returning = false;
  a.currentTarget = null;
  a.boostFrames = 100;
  a.alignXFrames = 0; a.alignYFrames = 0; a.evadeTimer = 0;
  a.evadeGoalX = 0; a.evadeVertical = 0;
  a.coverCheckTimer = 0; a.coverGoalX = null; a.inCover = false;
  a.walkFrame = 2; a.walkTimer = 0;
  a.hovering = false; a.crouching = false; a.crouchTimer = 0;
  a.burstCount = 0; a.burstTimer = 0;
  a.hoverFuel = 100; a.frameCounter = 0;
  a.emergencyDefense = false;
  a.emergencyTargetBase = null;
  return a;
}

function makeBase(x = 600, y = 300) {
  return { x, y, width: 40, height: 40 };
}

function baseCenter(base) {
  return { cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
}

test('setEmergencyDefense(true) redirects home toward the base (not the spawn point)', () => {
  const a = makeAttacker(100, 300);
  const base = makeBase(600, 300);
  a.setEmergencyDefense(true, base);

  assert.equal(a.emergencyDefense, true);
  assert.equal(a.emergencyTargetBase, base);
  // returning is forced so the return-movement branch drives it to the base next update.
  assert.equal(a.returning, true);

  // New home sits on the ring of radius EMERGENCY_DEFENSE_BASE_RADIUS around the base center.
  const { cx, cy } = baseCenter(base);
  const d = Math.hypot(a.homeX - cx, a.homeY - cy);
  assert.ok(Math.abs(d - EMERGENCY_DEFENSE_BASE_RADIUS) < 1e-6, `ring dist=${d}`);

  // And it is nowhere near the original spawn point (x=100).
  assert.ok(Math.abs(a.homeX - 100) > 50, `homeX still near spawn: ${a.homeX}`);
});

test('setEmergencyDefense(false) restores the original spawn home', () => {
  const a = makeAttacker(100, 300);
  const base = makeBase(600, 300);
  a.setEmergencyDefense(true, base);
  a.setEmergencyDefense(false);

  assert.equal(a.emergencyDefense, false);
  assert.equal(a.emergencyTargetBase, null);
  assert.equal(a.homeX, 100);
  assert.equal(a.homeY, 300);
});

test('re-activating does not clobber the saved spawn home', () => {
  const a = makeAttacker(100, 300);
  const base = makeBase(600, 300);
  a.setEmergencyDefense(true, base);
  a.setEmergencyDefense(true, base); // second activation while already defending
  a.setEmergencyDefense(false);
  assert.equal(a.homeX, 100, 'spawn home must survive repeated activation');
  assert.equal(a.homeY, 300);
});

test('two attackers around the same base get spread-out (distinct) home points', () => {
  const base = makeBase(600, 300);
  const a1 = makeAttacker(100, 300);
  const a2 = makeAttacker(100, 300);
  a1.setEmergencyDefense(true, base);
  a2.setEmergencyDefense(true, base);
  const same = a1.homeX === a2.homeX && a1.homeY === a2.homeY;
  assert.ok(!same, 'two defenders must not collapse onto the identical point');
});

test('a player in the widened sight range triggers chase ONLY while defending', () => {
  const base = makeBase(600, 300);
  // Player distance ~180px: outside config.sightRange (100) but inside EMERGENCY range (250).
  const dist = 180;
  assert.ok(dist > 100 && dist < EMERGENCY_DEFENSE_SIGHT_RANGE);

  const player = { x: 100 + dist, y: 300, width: 16, height: 24, alive: true, docked: false };

  // Inactive: should NOT chase.
  const off = makeAttacker(100, 300, makeConfig(), { player });
  off.update();
  assert.notEqual(off.aiState, 'chase', 'must not chase from beyond normal sight when idle');

  // Active: should chase (widened detection).
  const on = makeAttacker(100, 300, makeConfig(), { player });
  on.setEmergencyDefense(true, base);
  on.update();
  assert.equal(on.aiState, 'chase', 'defending unit must detect the approaching player');
});

test('a defending attacker in chase still fires (combat not disabled)', () => {
  const base = makeBase(600, 300);
  const player = { x: 150, y: 300, width: 16, height: 24, alive: true, docked: false };
  const a = makeAttacker(100, 300, makeConfig(), { player });
  a.setEmergencyDefense(true, base);
  a.aiState = 'chase';
  a.fireTimer = 0;
  a._handleShooting();
  assert.equal(a.game.projectiles.length, 1, 'defending unit must be able to fire');
});
