import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERGENCY_DEFENSE_BASE_RADIUS,
  EMERGENCY_DEFENSE_SPEED_MULT,
  EMERGENCY_DEFENSE_SIGHT_RANGE
} from '../src/js/utils/Constants.js';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';

test('emergency defense base radius constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_BASE_RADIUS, 120);
});

test('emergency defense speed multiplier constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_SPEED_MULT, 1.15);
});

test('emergency defense sight range constant is defined', () => {
  assert.equal(EMERGENCY_DEFENSE_SIGHT_RANGE, 250);
});

// --- Task 2: EnemyBase attack-detection / alert-dispatch logic ---

/** Build a mock game object with a spy triggerBaseEmergencyAlert (latching, like the real impl will be). */
function makeMockGame({ missionsCompleted = 1, enemies = [] } = {}) {
  const game = {
    missionsCompleted,
    score: 0,
    enemies,
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    spawnSparks: () => { },
    spawnExplosion: () => { },
    // _finishDestruction がフィナーレ演出を積む先
    particles: [],
    triggerAlertCalls: [],
    triggerBaseEmergencyAlert(base) {
      game.triggerAlertCalls.push(base);
      // Mimic the real one-shot latch behavior from Task 5.
      if (game.baseEmergencyAlert) return;
      game.baseEmergencyAlert = true;
      game.emergencyTargetBase = base;
    }
  };
  return game;
}

function makeBase(game) {
  return new EnemyBase(game, 100, 100);
}

test('takeDamage on mission 2+ calls triggerBaseEmergencyAlert with itself', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);
  base.takeDamage(1);
  assert.equal(game.triggerAlertCalls.length, 1);
  assert.equal(game.triggerAlertCalls[0], base);
});

test('takeDamage on mission 1 (missionsCompleted=0) does NOT call triggerBaseEmergencyAlert', () => {
  const game = makeMockGame({ missionsCompleted: 0 });
  const base = makeBase(game);
  base.takeDamage(1);
  assert.equal(game.triggerAlertCalls.length, 0);
});

test('repeated hits call the spy each time, but latch keeps baseEmergencyAlert single-fire', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);
  base.shields = 0;
  base.hp = 10;
  base.takeDamage(1);
  base.takeDamage(1);
  base.takeDamage(1);
  // EnemyBase calls the hook every non-dying hit...
  assert.equal(game.triggerAlertCalls.length, 3);
  // ...but the (mocked) one-shot latch means the alert only actually flips on once.
  assert.equal(game.baseEmergencyAlert, true);
  assert.equal(game.emergencyTargetBase, base);
});

test('takeDamage does NOT call triggerBaseEmergencyAlert once the base is dying', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);

  // Simulate the ~1.5s "dying" window that _die() enters after the fatal hit
  // (this.alive stays true throughout, so takeDamage() can still be called).
  base.dying = true;

  base.takeDamage(1);
  assert.equal(game.triggerAlertCalls.length, 0);
});

test('_finishDestruction keeps baseEmergencyAlert and does NOT release defenders (alert remains until stage clear)', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);

  const enemyCalls = [];
  const attacker = { setEmergencyDefense: (active) => enemyCalls.push(['attacker', active]) };
  const drone = { setEmergencyDefense: (active) => enemyCalls.push(['drone', active]) };
  const nonEmergencyUnit = { name: 'turret' };
  game.enemies = [attacker, drone, nonEmergencyUnit];

  // Trigger the alert first.
  base.takeDamage(1);
  assert.equal(game.baseEmergencyAlert, true);

  base._finishDestruction();

  // Alert state and defenders stay active
  assert.equal(game.baseEmergencyAlert, true);
  assert.equal(game.emergencyTargetBase, base);
  assert.equal(enemyCalls.length, 0); // setEmergencyDefense(false) was NOT called
  assert.equal(base.alive, false);
});

test('_finishDestruction is a no-op on the alert state when no alert was ever active', () => {
  const game = makeMockGame({ missionsCompleted: 0 });
  const base = makeBase(game);
  const enemyCalls = [];
  game.enemies = [{ setEmergencyDefense: (active) => enemyCalls.push(active) }];

  base._finishDestruction();

  assert.equal(game.baseEmergencyAlert, false);
  assert.equal(game.emergencyTargetBase, null);
  assert.equal(enemyCalls.length, 0);
});

test('a fresh hit on mission 2+ starts the visual emergency pulse timer', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);
  assert.equal(base.emergencyPulseTimer, 0);
  base.takeDamage(1);
  assert.ok(base.emergencyPulseTimer > 0);
});

test('draw() with an active pulse does not throw (headless canvas stub)', () => {
  const game = makeMockGame({ missionsCompleted: 1 });
  const base = makeBase(game);
  base.takeDamage(1);

  const ctx = {
    save() { }, restore() { }, beginPath() { }, arc() { }, stroke() { }, fill() { },
    fillRect() { }, translate() { }, createRadialGradient: () => ({ addColorStop() { } }),
    moveTo() { }, lineTo() { }, setLineDash() { }
  };
  assert.doesNotThrow(() => base.draw(ctx));
});
