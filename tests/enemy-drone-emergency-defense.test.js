import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import {
  EMERGENCY_DEFENSE_BASE_RADIUS,
  EMERGENCY_DEFENSE_SPEED_MULT,
  ENEMY_DRONE_SPEED,
  ENEMY_DRONE_WIDTH,
  ENEMY_DRONE_HEIGHT
} from '../src/js/utils/Constants.js';

// Trivial map: nothing is solid, so drones float freely and always have LOS.
const AIR_MAP = { isSolidAtPixel: () => false, isWaterAtPixel: () => false, cols: 1000, rows: 1000 };

/** Minimal drone built without running the real constructor's spawn logic. */
function makeDrone(x, y, game = {}) {
  const d = Object.create(EnemyDrone.prototype);
  d.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [], ...game };
  d.x = x; d.y = y;
  d.width = ENEMY_DRONE_WIDTH; d.height = ENEMY_DRONE_HEIGHT;
  d.vx = 0; d.vy = 0;
  d.alive = true;
  d.state = 'patrol';
  d.patrolDir = 1;
  d.stateTimer = 0;
  d.targetAngle = 0;
  d.burstShotsRemaining = 0;
  d.burstTimer = 0;
  d.kamikazeTarget = null;
  d.fireTimer = 0;
  d.propellerAngle = 0;
  d.tiltAngle = 0;
  d.blinkTimer = 0;
  d.dashTargetX = 0;
  d.dashTargetY = 0;
  // Emergency-defense fields (mirrors real constructor).
  d.emergencyDefense = false;
  d.emergencyTargetBase = null;
  d.emergencyAnchorX = null;
  d.emergencyAnchorY = null;
  d.dashingToAnchor = false;
  return d;
}

function makeBase(x = 600, y = 300) {
  return { x, y, width: 40, height: 40 };
}

function baseCenter(base) {
  return { cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
}

function centerOf(d) {
  return { cx: d.x + d.width / 2, cy: d.y + d.height / 2 };
}

test('setEmergencyDefense(true) gives an anchor on the ring around the base and rushes toward it', () => {
  // Drone starts far from the base (patrolling near x=100).
  const d = makeDrone(100, 300);
  const base = makeBase(600, 300);
  d.setEmergencyDefense(true, base);

  assert.equal(d.emergencyDefense, true);
  assert.equal(d.emergencyTargetBase, base);

  // Anchor sits on the ring of radius EMERGENCY_DEFENSE_BASE_RADIUS around the base center.
  const { cx, cy } = baseCenter(base);
  const ringDist = Math.hypot(d.emergencyAnchorX - cx, d.emergencyAnchorY - cy);
  assert.ok(Math.abs(ringDist - EMERGENCY_DEFENSE_BASE_RADIUS) < 1e-6, `ring dist=${ringDist}`);

  // The anchor is near the base, not near the old patrol point (x=100).
  assert.ok(Math.abs(d.emergencyAnchorX - 100) > 50, `anchorX still near spawn: ${d.emergencyAnchorX}`);

  // It immediately starts dashing toward the anchor (not waiting for a state timer).
  assert.equal(d.state, 'dash');
  assert.equal(d.dashingToAnchor, true);
  assert.ok(Math.abs(d.dashTargetX - (d.emergencyAnchorX - d.width / 2)) < 1e-6);
  assert.ok(Math.abs(d.dashTargetY - (d.emergencyAnchorY - d.height / 2)) < 1e-6);
});

test('the rush dash actually moves the drone toward the base', () => {
  const d = makeDrone(100, 300);
  const base = makeBase(600, 300);
  d.setEmergencyDefense(true, base);
  const before = d.x;
  d.update();
  // Base is to the right (x=600), so the drone must move right.
  assert.ok(d.x > before, `expected rightward motion, x ${before} -> ${d.x}`);
});

test('setEmergencyDefense(false) clears emergency state and anchor', () => {
  const d = makeDrone(100, 300);
  const base = makeBase(600, 300);
  d.setEmergencyDefense(true, base);
  d.setEmergencyDefense(false);

  assert.equal(d.emergencyDefense, false);
  assert.equal(d.emergencyTargetBase, null);
  assert.equal(d.emergencyAnchorX, null);
  assert.equal(d.emergencyAnchorY, null);
  assert.equal(d.dashingToAnchor, false);
});

test('two drones defending the same base get distinct (spread-out) anchor points', () => {
  const base = makeBase(600, 300);
  const d1 = makeDrone(100, 300);
  const d2 = makeDrone(100, 300);
  d1.setEmergencyDefense(true, base);
  d2.setEmergencyDefense(true, base);
  const same = d1.emergencyAnchorX === d2.emergencyAnchorX &&
               d1.emergencyAnchorY === d2.emergencyAnchorY;
  assert.ok(!same, 'two defenders must not collapse onto the identical anchor point');
});

test('a defender that drifted far from its anchor gets pulled back (dashes toward anchor)', () => {
  const base = makeBase(600, 300);
  const d = makeDrone(100, 300);
  d.setEmergencyDefense(true, base);

  // Teleport it far from its anchor and drop it into idle patrol with no target.
  d.x = d.emergencyAnchorX + 400;
  d.y = d.emergencyAnchorY + 400;
  d.state = 'patrol';
  d.dashingToAnchor = false;
  d.game.player = null;
  d.game.carrier = null;

  d._updatePatrolState();

  assert.equal(d.state, 'dash', 'far-away defender must dash back rather than drift');
  assert.equal(d.dashingToAnchor, true);
  assert.ok(Math.abs(d.dashTargetX - (d.emergencyAnchorX - d.width / 2)) < 1e-6);
});

test('a defender still near its anchor is NOT yanked back (keeps orbiting/patrolling)', () => {
  const base = makeBase(600, 300);
  const d = makeDrone(100, 300);
  d.setEmergencyDefense(true, base);

  // Sit right on the anchor.
  d.x = d.emergencyAnchorX - d.width / 2;
  d.y = d.emergencyAnchorY - d.height / 2;
  d.state = 'patrol';
  d.dashingToAnchor = false;
  d.game.player = null;
  d.game.carrier = null;

  d._updatePatrolState();

  assert.equal(d.state, 'patrol', 'defender near its anchor should keep patrolling, not re-dash');
});

test('the anchor rush gets the emergency speed boost; an ordinary target dash does not', () => {
  const base = makeBase(600, 300);

  // Anchor rush: dashingToAnchor => boosted vx.
  const rush = makeDrone(100, 300);
  rush.setEmergencyDefense(true, base);
  // Force a clean, non-damped horizontal delta (dx large & positive).
  rush.dashTargetX = rush.x + 500;
  rush.dashTargetY = rush.y; // no vertical component
  rush.stateTimer = 30;
  rush._updateDashState();
  const boostedVx = Math.abs(rush.vx);

  // Ordinary dash toward a real target: no boost even while defending.
  const normal = makeDrone(100, 300);
  normal.setEmergencyDefense(true, base);
  const player = { x: 600, y: 300, width: 16, height: 24, alive: true, docked: false };
  normal.game.player = player;
  normal._startDash(player); // clears dashingToAnchor
  assert.equal(normal.dashingToAnchor, false, '_startDash on a real target must clear the anchor flag');
  normal.dashTargetX = normal.x + 500;
  normal.dashTargetY = normal.y;
  normal.stateTimer = 30;
  normal._updateDashState();
  const normalVx = Math.abs(normal.vx);

  assert.ok(Math.abs(normalVx - ENEMY_DRONE_SPEED) < 1e-6, `normal dash vx=${normalVx}`);
  assert.ok(Math.abs(boostedVx - ENEMY_DRONE_SPEED * EMERGENCY_DEFENSE_SPEED_MULT) < 1e-6,
    `boosted dash vx=${boostedVx}`);
  assert.ok(boostedVx > normalVx, 'anchor rush must be faster than an ordinary engage dash');
});

test('a nearby player is detected by _findTarget while defending (combat flow stays intact)', () => {
  const base = makeBase(600, 300);
  const d = makeDrone(100, 300, {
    player: { x: 260, y: 300, width: 16, height: 24, alive: true, docked: false }
  });
  d.setEmergencyDefense(true, base);
  const target = d._findTarget();
  assert.ok(target, 'a defending drone must still detect a nearby player');
  assert.equal(target, d.game.player);
});

test('emergency mode never REDUCES the drone native sight range', () => {
  // Drone native sight (CANVAS_WIDTH*0.7) already exceeds EMERGENCY_DEFENSE_SIGHT_RANGE,
  // so a player detectable when idle must remain detectable when defending.
  const base = makeBase(600, 300);
  const player = { x: 500, y: 300, width: 16, height: 24, alive: true, docked: false };

  const off = makeDrone(100, 300, { player });
  const on = makeDrone(100, 300, { player });
  on.setEmergencyDefense(true, base);

  assert.ok(off._findTarget(), 'idle drone detects the player within native sight');
  assert.ok(on._findTarget(), 'defending drone must not lose that detection');
});
