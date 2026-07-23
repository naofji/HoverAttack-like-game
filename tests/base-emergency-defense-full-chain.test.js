// ============================================
// Task 6: full-chain, no-mock integration test for "Enemy Base Emergency
// Defense Mode". Every collaborator in this file is the REAL class — a real
// EnemyBase, a real EnemyAttacker, a real EnemyDrone, a real EnemyTank, and
// the REAL Game.triggerBaseEmergencyAlert (imported from main.js) — wired
// together exactly as they are in the running game (base.takeDamage() ->
// game.triggerBaseEmergencyAlert() -> enemy.setEmergencyDefense()).
//
// This is deliberately NOT a re-test of anything already covered by:
//   - tests/base-emergency-defense.test.js (EnemyBase logic, but with a spy
//     game.triggerBaseEmergencyAlert)
//   - tests/enemy-attacker-emergency-defense.test.js /
//     tests/enemy-drone-emergency-defense.test.js (per-class state machine,
//     but no real EnemyBase / real Game trigger)
//   - tests/base-emergency-defense-integration.test.js (real
//     Game.triggerBaseEmergencyAlert, but plain-object enemies/base, not
//     real class instances chained together)
// See task-6-report.md for the full gap analysis.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

// Real Game object, loaded the same DOM-free way as
// base-emergency-defense-integration.test.js (main.js guards its only
// window/document-touching top-level side effects behind
// `typeof window/document !== 'undefined'`).
const { Game } = await import('../src/js/main.js');

// Trivial permissive map: nothing is ever solid, so real update() calls can
// freely move attacker/drone/tank without getting stuck on terrain. Same
// pattern used by tests/enemy-attacker-emergency-defense.test.js and
// tests/enemy-drone-emergency-defense.test.js.
const AIR_MAP = { isSolidAtPixel: () => false, isSolid: () => false, cols: 1000, rows: 1000 };

/**
 * AudioManager's real methods touch a Web Audio `AudioContext` that does not
 * exist in Node. Stub every function on the instance for the duration of a
 * test (mirrors the narrower `withStubbedAlarm` helper in
 * base-emergency-defense-integration.test.js, generalized because this file
 * drives real takeDamage()/_die()/_updateDyingSequence() calls that reach
 * several different audioManager.play*() methods, not just playAlarm).
 */
function withStubbedAudio(fn) {
  const proto = Object.getPrototypeOf(audioManager);
  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor' && typeof proto[name] === 'function'
  );
  const originals = {};
  for (const name of methodNames) {
    originals[name] = audioManager[name];
    audioManager[name] = () => {};
  }
  try {
    fn();
  } finally {
    for (const name of methodNames) {
      audioManager[name] = originals[name];
    }
  }
}

function attackerConfig() {
  return {
    hp: 30, speed: 2, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', climbThrust: 0.5, aimAccuracy: 1.0
  };
}

/**
 * Build a fully real game-like object plus real class instances, wired to
 * the real Game.triggerBaseEmergencyAlert (assigned by reference, so when
 * EnemyBase.takeDamage() calls `this.game.triggerBaseEmergencyAlert(this)`
 * it invokes the genuine main.js method with `this` correctly bound to
 * `game` via normal method-call semantics).
 *
 * The base sits far to the right (x=600); the attacker/drone/tank all start
 * far to the left (x=50), mirroring the brief's "far from the base" setup.
 */
function buildScenario({ missionsCompleted = 1 } = {}) {
  const game = {
    map: AIR_MAP,
    enemies: [],
    enemyBullets: [],
    projectiles: [],
    player: null,
    carrier: null,
    camera: null,
    rng: { next: () => 0.5 },
    missionsCompleted,
    score: 0,
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    spawnSparks: () => {},
    spawnExplosion: () => {},
    triggerBaseEmergencyAlert: Game.triggerBaseEmergencyAlert
  };

  const base = new EnemyBase(game, 600, 300);
  const attacker = new EnemyAttacker(game, 50, 300, attackerConfig());
  const drone = new EnemyDrone(game, 50, 320);
  const tank = new EnemyTank(game, 50, 340);

  game.base = base;
  game.enemies = [base, attacker, drone, tank];

  return { game, base, attacker, drone, tank };
}

function distToBase(entity, base) {
  const bcx = base.x + base.width / 2;
  const bcy = base.y + base.height / 2;
  const ecx = entity.x + entity.width / 2;
  const ecy = entity.y + entity.height / 2;
  return Math.hypot(ecx - bcx, ecy - bcy);
}

// ---------------------------------------------------------------------------
// 1) Real base.takeDamage() -> real Game.triggerBaseEmergencyAlert() ->
//    real setEmergencyDefense() on real attacker/drone instances.
// ---------------------------------------------------------------------------

test('full chain: base.takeDamage() on mission 2+ flips real game state and real attacker/drone instance state (no spies)', () => {
  withStubbedAudio(() => {
    const { game, base, attacker, drone, tank } = buildScenario({ missionsCompleted: 1 });

    assert.equal(attacker.emergencyDefense, false, 'sanity: attacker starts idle');
    assert.equal(drone.emergencyDefense, false, 'sanity: drone starts idle');

    base.takeDamage(1);

    assert.equal(game.baseEmergencyAlert, true);
    assert.equal(game.emergencyTargetBase, base);

    // Real instance state, not a spy call record.
    assert.equal(attacker.emergencyDefense, true);
    assert.equal(attacker.emergencyTargetBase, base);
    assert.equal(drone.emergencyDefense, true);
    assert.equal(drone.emergencyTargetBase, base);

    // The tank has no concept of emergency defense at all.
    assert.equal(typeof tank.setEmergencyDefense, 'undefined');
    assert.equal('emergencyDefense' in tank, false);
  });
});

test('full chain: mission 1 (missionsCompleted=0) leaves real attacker/drone instances untouched', () => {
  withStubbedAudio(() => {
    const { game, base, attacker, drone } = buildScenario({ missionsCompleted: 0 });
    base.takeDamage(1);
    assert.equal(game.baseEmergencyAlert, false);
    assert.equal(attacker.emergencyDefense, false);
    assert.equal(drone.emergencyDefense, false);
  });
});

// ---------------------------------------------------------------------------
// 2) Driving real update() frames actually moves the real attacker/drone
//    toward the real base coordinates.
// ---------------------------------------------------------------------------

test('full chain: driving real update() frames moves the attacker and drone toward the base', () => {
  withStubbedAudio(() => {
    const { base, attacker, drone } = buildScenario({ missionsCompleted: 1 });
    base.takeDamage(1); // real chain activates emergency defense on both

    const attackerStartDist = distToBase(attacker, base);
    const droneStartDist = distToBase(drone, base);

    for (let i = 0; i < 60; i++) {
      attacker.update();
      drone.update();
    }

    const attackerEndDist = distToBase(attacker, base);
    const droneEndDist = distToBase(drone, base);

    assert.ok(attackerEndDist < attackerStartDist,
      `attacker should have closed distance to base: ${attackerStartDist} -> ${attackerEndDist}`);
    assert.ok(droneEndDist < droneStartDist,
      `drone should have closed distance to base: ${droneStartDist} -> ${droneEndDist}`);

    // Both units are still actively defending (not knocked out of the mode
    // by the movement itself).
    assert.equal(attacker.emergencyDefense, true);
    assert.equal(drone.emergencyDefense, true);
  });
});

// ---------------------------------------------------------------------------
// 3) The real EnemyTank in the same game.enemies array is fully unaffected.
// ---------------------------------------------------------------------------

test('full chain: the real EnemyTank keeps patrolling untouched while attacker/drone rush the base', () => {
  withStubbedAudio(() => {
    const { base, tank } = buildScenario({ missionsCompleted: 1 });

    const tankStartX = tank.x;
    const tankStartPatrolDir = tank.patrolDir;

    base.takeDamage(1); // real emergency chain fires

    for (let i = 0; i < 30; i++) tank.update();

    // Tank keeps moving under its own ordinary patrol logic (unrelated to
    // the base/alert), proving the alert never touched it.
    assert.equal(typeof tank.setEmergencyDefense, 'undefined');
    assert.equal('emergencyDefense' in tank, false);
    assert.equal('emergencyTargetBase' in tank, false);
    assert.equal(tank.patrolDir, tankStartPatrolDir, 'patrol direction is untouched by the alert');
    assert.notEqual(tank.x, tankStartX, 'tank still moves under its own ordinary patrol AI');
  });
});

// ---------------------------------------------------------------------------
// 4) Driving the base through its real death sequence releases real
//    attacker/drone instances back to normal behavior.
// ---------------------------------------------------------------------------

test('full chain: driving the base through _die()/_finishDestruction() reverts real attacker/drone instance state', () => {
  withStubbedAudio(() => {
    const { game, base, attacker, drone } = buildScenario({ missionsCompleted: 1 });

    // ENEMY_BASE_SHIELDS = 3, ENEMY_BASE_HP = 1: three hits burn the
    // shields, a fourth reaches the core and calls the real _die().
    base.takeDamage(1);
    base.takeDamage(1);
    base.takeDamage(1);
    base.takeDamage(1);

    assert.equal(attacker.emergencyDefense, true, 'still defending mid-fight');
    assert.equal(drone.emergencyDefense, true);
    assert.equal(base.dying, true, 'fatal hit enters the dying sequence');
    assert.equal(base.alive, true, 'still alive during the ~1.5s dying window');

    // Drive the real cinematic dying sequence to completion via update().
    let guard = 0;
    while (base.alive && guard < 200) {
      base.update();
      guard++;
    }

    assert.equal(base.alive, false, 'base finished its destruction sequence');
    assert.equal(game.baseEmergencyAlert, false);
    assert.equal(game.emergencyTargetBase, null);

    // Real instance state reverted (not a spy call record).
    assert.equal(attacker.emergencyDefense, false);
    assert.equal(attacker.emergencyTargetBase, null);
    assert.equal(drone.emergencyDefense, false);
    assert.equal(drone.emergencyTargetBase, null);
  });
});

// ---------------------------------------------------------------------------
// 5) Multiple real units activated by ONE real trigger call converge on
//    distinct coordinates (no stacking) in a true multi-unit scenario.
// ---------------------------------------------------------------------------

test('full chain: a real attacker and a real drone activated by the same real trigger end up with distinct target coordinates', () => {
  withStubbedAudio(() => {
    const { base, attacker, drone } = buildScenario({ missionsCompleted: 1 });
    base.takeDamage(1); // single real trigger call activates both at once

    // Attacker rallies to a point on the ring stored in homeX/homeY; the
    // drone rallies to its own ring anchor stored in emergencyAnchorX/Y.
    // Both are independently randomized per-unit, so they must not collapse
    // onto the same point.
    const same = attacker.homeX === drone.emergencyAnchorX && attacker.homeY === drone.emergencyAnchorY;
    assert.ok(!same, 'attacker and drone must not converge on the identical coordinate');
  });
});

test('full chain: two real attackers activated by the same real trigger get distinct rally points', () => {
  withStubbedAudio(() => {
    const { game, base, attacker: attacker1 } = buildScenario({ missionsCompleted: 1 });
    const attacker2 = new EnemyAttacker(game, 900, 50, attackerConfig());
    game.enemies.push(attacker2);

    base.takeDamage(1); // single real trigger call activates both real attackers

    assert.equal(attacker2.emergencyDefense, true);
    const same = attacker1.homeX === attacker2.homeX && attacker1.homeY === attacker2.homeY;
    assert.ok(!same, 'two real attackers must not stack on the identical rally point');
  });
});
