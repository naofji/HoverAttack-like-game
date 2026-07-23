// ============================================
// Task 5: Game.triggerBaseEmergencyAlert / SpawnManager inheritance /
// mission-transition reset / HUD warning integration tests
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { HUD } from '../src/js/ui/HUD.js';

// `Game` (in main.js) is now `export const Game = {...}`, and the module's
// only DOM/window-touching top-level side effects (`window.onerror = ...`
// and the auto-`Game.init()` call at the bottom) are guarded behind
// `typeof window/document !== 'undefined'` checks specifically so this
// module can be imported here and its plain methods unit-tested via
// `Game.someMethod.call(mockGameObj, ...)`, without needing a real DOM.

// --- Minimal air map so EnemyAttacker/EnemyDrone/EnemyTank construction is inert ---
const AIR_MAP = {
  isSolidAtPixel: () => false,
  isSolid: () => false,
  cols: 1000,
  rows: 1000,
  enemyTankSpawns: [],
  enemyAttackerSpawns: [],
  enemyDroneSpawns: [],
  enemyTurretSpawns: [],
  enemyBaseSpawn: null,
  landmineSpawns: []
};

function makeSpawnGame(overrides = {}) {
  const map = { ...AIR_MAP, ...(overrides.map || {}) };
  const game = {
    map,
    enemies: [],
    enemyBullets: [],
    rng: { next: () => 0.5 },
    missionsCompleted: 1,
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    ...overrides
  };
  return game;
}

// ---------------------------------------------------------------------------
// Step 2: SpawnManager inherits an active emergency alert into fresh spawns.
// ---------------------------------------------------------------------------

test('spawnEnemies(): when baseEmergencyAlert is true, new EnemyAttacker/EnemyDrone get setEmergencyDefense(true, targetBase)', () => {
  const targetBase = { id: 'base-1' };
  const game = makeSpawnGame({
    baseEmergencyAlert: true,
    emergencyTargetBase: targetBase,
    map: {
      ...AIR_MAP,
      enemyAttackerSpawns: [{ x: 10, y: 10 }],
      enemyDroneSpawns: [{ x: 20, y: 20 }]
    }
  });
  const spawnManager = new SpawnManager(game);

  const calls = [];
  const origAttackerSet = EnemyAttacker.prototype.setEmergencyDefense;
  const origDroneSet = EnemyDrone.prototype.setEmergencyDefense;
  EnemyAttacker.prototype.setEmergencyDefense = function (active, base) {
    calls.push(['attacker', active, base]);
  };
  EnemyDrone.prototype.setEmergencyDefense = function (active, base) {
    calls.push(['drone', active, base]);
  };
  try {
    spawnManager.spawnEnemies();
  } finally {
    EnemyAttacker.prototype.setEmergencyDefense = origAttackerSet;
    EnemyDrone.prototype.setEmergencyDefense = origDroneSet;
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['attacker', true, targetBase]);
  assert.deepEqual(calls[1], ['drone', true, targetBase]);
});

test('spawnEnemies(): when baseEmergencyAlert is false, setEmergencyDefense is not called on new spawns', () => {
  const game = makeSpawnGame({
    baseEmergencyAlert: false,
    map: {
      ...AIR_MAP,
      enemyAttackerSpawns: [{ x: 10, y: 10 }],
      enemyDroneSpawns: [{ x: 20, y: 20 }]
    }
  });
  const spawnManager = new SpawnManager(game);

  const calls = [];
  const origAttackerSet = EnemyAttacker.prototype.setEmergencyDefense;
  const origDroneSet = EnemyDrone.prototype.setEmergencyDefense;
  EnemyAttacker.prototype.setEmergencyDefense = function (...args) { calls.push(args); };
  EnemyDrone.prototype.setEmergencyDefense = function (...args) { calls.push(args); };
  try {
    spawnManager.spawnEnemies();
  } finally {
    EnemyAttacker.prototype.setEmergencyDefense = origAttackerSet;
    EnemyDrone.prototype.setEmergencyDefense = origDroneSet;
  }

  assert.equal(calls.length, 0);
});

test('spawnEnemies(): EnemyTank spawns are unaffected even when baseEmergencyAlert is true (no setEmergencyDefense method)', () => {
  const game = makeSpawnGame({
    baseEmergencyAlert: true,
    emergencyTargetBase: { id: 'base-1' },
    map: {
      ...AIR_MAP,
      enemyTankSpawns: [{ x: 5, y: 5 }]
    }
  });
  const spawnManager = new SpawnManager(game);
  assert.doesNotThrow(() => spawnManager.spawnEnemies());
  assert.equal(game.enemies.length, 1);
  assert.ok(game.enemies[0] instanceof EnemyTank);
});

// ---------------------------------------------------------------------------
// Step 1: Game.triggerBaseEmergencyAlert (tested against the real method,
// loaded by dynamically pulling it off the Game object via a DOM-free stub).
// ---------------------------------------------------------------------------

// main.js's `Game` object literal touches `document`/`window` only inside
// `init()`/other DOM-bound methods, not at module-evaluation time, so it is
// safe to import the module and grab the plain method off the exported
// object for direct `.call()`-based unit testing without a DOM.
const { Game } = await import('../src/js/main.js');
const { audioManager } = await import('../src/js/audio/AudioManager.js');

// The real AudioManager touches `window`/`AudioContext`, which don't exist in
// this Node test environment. Stub `playAlarm` for the duration of these
// tests so `triggerBaseEmergencyAlert()`'s alarm-sound side effect can be
// exercised (call count) without needing a real audio backend.
function withStubbedAlarm(fn) {
  const original = audioManager.playAlarm;
  const calls = [];
  audioManager.playAlarm = () => calls.push(1);
  try {
    fn(calls);
  } finally {
    audioManager.playAlarm = original;
  }
}

function makeMockGame({ missionsCompleted = 1, enemies = [] } = {}) {
  return {
    missionsCompleted,
    enemies,
    baseEmergencyAlert: false,
    emergencyTargetBase: null
  };
}

test('triggerBaseEmergencyAlert: mission 1 (missionsCompleted=0) is a no-op', () => {
  withStubbedAlarm((alarmCalls) => {
    const game = makeMockGame({ missionsCompleted: 0 });
    const base = { id: 'base' };
    Game.triggerBaseEmergencyAlert.call(game, base);
    assert.equal(game.baseEmergencyAlert, false);
    assert.equal(game.emergencyTargetBase, null);
    assert.equal(alarmCalls.length, 0);
  });
});

test('triggerBaseEmergencyAlert: mission 2+ latches the alert, stores the target base, and plays the alarm once', () => {
  withStubbedAlarm((alarmCalls) => {
    const game = makeMockGame({ missionsCompleted: 1 });
    const base = { id: 'base' };
    Game.triggerBaseEmergencyAlert.call(game, base);
    assert.equal(game.baseEmergencyAlert, true);
    assert.equal(game.emergencyTargetBase, base);
    assert.equal(alarmCalls.length, 1);
  });
});

test('triggerBaseEmergencyAlert: one-shot latch — second call with a different base does not overwrite state or replay the alarm', () => {
  withStubbedAlarm((alarmCalls) => {
    const game = makeMockGame({ missionsCompleted: 1 });
    const base1 = { id: 'base1' };
    const base2 = { id: 'base2' };
    Game.triggerBaseEmergencyAlert.call(game, base1);
    Game.triggerBaseEmergencyAlert.call(game, base2);
    assert.equal(game.emergencyTargetBase, base1);
    assert.equal(alarmCalls.length, 1);
  });
});

test('triggerBaseEmergencyAlert: only EnemyAttacker/EnemyDrone instances receive setEmergencyDefense(true, base)', () => {
  withStubbedAlarm(() => {
    const attackerCalls = [];
    const droneCalls = [];
    const attacker = Object.create(EnemyAttacker.prototype);
    attacker.setEmergencyDefense = (active, base) => attackerCalls.push([active, base]);
    const drone = Object.create(EnemyDrone.prototype);
    drone.setEmergencyDefense = (active, base) => droneCalls.push([active, base]);
    const tank = Object.create(EnemyTank.prototype);
    tank.setEmergencyDefense = () => { throw new Error('should not be called on a tank'); };
    const plainTurret = { name: 'turret' }; // no setEmergencyDefense at all

    const game = makeMockGame({ missionsCompleted: 1, enemies: [attacker, drone, tank, plainTurret] });
    const base = { id: 'base' };

    assert.doesNotThrow(() => Game.triggerBaseEmergencyAlert.call(game, base));

    assert.deepEqual(attackerCalls, [[true, base]]);
    assert.deepEqual(droneCalls, [[true, base]]);
  });
});

test('triggerBaseEmergencyAlert: calling twice only iterates enemies once (second call short-circuits before the filter/loop)', () => {
  withStubbedAlarm(() => {
    const attackerCalls = [];
    const attacker = Object.create(EnemyAttacker.prototype);
    attacker.setEmergencyDefense = (...args) => attackerCalls.push(args);

    const game = makeMockGame({ missionsCompleted: 1, enemies: [attacker] });
    const base = { id: 'base' };
    Game.triggerBaseEmergencyAlert.call(game, base);
    Game.triggerBaseEmergencyAlert.call(game, base);

    assert.equal(attackerCalls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Step 3: mission-transition reset (GameStateManager.resetLevel via nextMission/restart)
// ---------------------------------------------------------------------------

test('GameStateManager.resetLevel() resets baseEmergencyAlert/emergencyTargetBase before spawning', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');

  // GameStateManager.resetLevel() constructs a real `Map`, which needs a
  // `document.createElement('canvas')` for its tile/mini-map caches. A Proxy
  // no-ops every 2D-context call/property so we don't have to hand-enumerate
  // the full canvas API surface just to exercise the reset-ordering logic.
  const stubCtx = new Proxy({}, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      return typeof prop === 'string' ? () => ({ addColorStop() {} }) : undefined;
    },
    set: () => true
  });
  const stubCanvas = { width: 0, height: 0, getContext: () => stubCtx };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => stubCanvas };

  try {
    // Build the minimal game surface resetLevel() touches, staged as if a
    // previous mission left the alert flags set.
    const game = {
      baseEmergencyAlert: true,
      emergencyTargetBase: { id: 'stale-base' },
      score: 0,
      missionsCompleted: 1,
      debugStartMission: 0,
      totalTime: 0,
      stageResults: [],
      weekSeed: 1,
      spawnManager: { findSpawnPosition: () => ({ x: 0, y: 0 }), spawnLandmines: () => {}, spawnEnemies: () => {} },
      camera: { follow: () => {}, snapToTarget: () => {} }
    };

    const stateManager = new GameStateManager(game);
    stateManager.resetLevel(false);

    assert.equal(game.baseEmergencyAlert, false);
    assert.equal(game.emergencyTargetBase, null);
  } finally {
    globalThis.document = originalDocument;
  }
});

// ---------------------------------------------------------------------------
// Step 4: HUD warning banner
// ---------------------------------------------------------------------------

function makeHudCtx({ textWidth = 100 } = {}) {
  let currentFontSize = 20;
  return {
    save() {}, restore() {}, beginPath() {}, arc() {}, stroke() {}, fill() {},
    fillRect() {}, strokeRect() {}, translate() {}, moveTo() {}, lineTo() {},
    setLineDash() {}, createRadialGradient: () => ({ addColorStop() {} }),
    fillText() {},
    measureText(text) { return { width: textWidth }; },
    set fillStyle(v) {}, set strokeStyle(v) {},
    set font(v) { const m = /(\d+)px/.exec(v); if (m) currentFontSize = Number(m[1]); },
    get font() { return `bold ${currentFontSize}px "Space Mono", monospace`; },
    set textAlign(v) {}, set textBaseline(v) {}, set lineWidth(v) {}
  };
}

test('HUD._drawBaseEmergencyAlert exists and does not throw when active', () => {
  const game = { baseEmergencyAlert: true, baseEmergencyAlertStartTime: Date.now(), canvas: { width: 800, height: 600 } };
  const hud = new HUD(game);
  assert.equal(typeof hud._drawBaseEmergencyAlert, 'function');
  assert.doesNotThrow(() => hud._drawBaseEmergencyAlert(makeHudCtx(), 800));
});

test('HUD._drawBaseEmergencyAlert shrinks the font until the text fits inside the box', () => {
  // Box interior is 680 - 2*24 = 632px wide. Report an oversized measured
  // width so the loop must shrink the font before it fits.
  const game = { baseEmergencyAlert: true, baseEmergencyAlertStartTime: Date.now(), canvas: { width: 800, height: 600 } };
  const hud = new HUD(game);
  const ctx = makeHudCtx({ textWidth: 900 }); // always "too wide" until font shrinks below threshold handled by measureText below
  // Make measureText width scale down as font size shrinks, mimicking real canvas behavior.
  let lastFontSize = 20;
  ctx.measureText = (text) => {
    const m = /(\d+)px/.exec(ctx.font);
    lastFontSize = m ? Number(m[1]) : lastFontSize;
    return { width: text.length * lastFontSize * 0.6 };
  };
  hud._drawBaseEmergencyAlert(ctx, 800);
  // 57 chars * fontSize * 0.6 <= 632  =>  fontSize <= ~18.5, so it must have shrunk from 20.
  assert.ok(lastFontSize < 20, `expected font to shrink below 20, got ${lastFontSize}`);
  assert.ok(lastFontSize >= 10, `expected font to stop shrinking at the floor, got ${lastFontSize}`);
});

test('HUD._drawBaseEmergencyAlert stops blinking after ~10 cycles (visually quiets down)', () => {
  const longAgo = Date.now() - 100000; // way past the 10-blink window
  const game = { baseEmergencyAlert: true, baseEmergencyAlertStartTime: longAgo, canvas: { width: 800, height: 600 } };
  const hud = new HUD(game);
  let drewSomething = false;
  const ctx = makeHudCtx();
  ctx.fillRect = () => { drewSomething = true; };
  ctx.fillText = () => { drewSomething = true; };
  hud._drawBaseEmergencyAlert(ctx, 800);
  assert.equal(drewSomething, false);
});

test('HUD._drawBaseEmergencyAlert is a no-op (draws nothing) when inactive', () => {
  const game = { baseEmergencyAlert: false, canvas: { width: 800, height: 600 } };
  const hud = new HUD(game);
  let drewSomething = false;
  const ctx = makeHudCtx();
  ctx.fillRect = () => { drewSomething = true; };
  ctx.fillText = () => { drewSomething = true; };
  hud._drawBaseEmergencyAlert(ctx, 800);
  assert.equal(drewSomething, false);
});

test('HUD.draw() calls _drawBaseEmergencyAlert as part of the normal draw pass', () => {
  // Full draw() has a large canvas-API surface (gradients, HP bars, gauges);
  // per the brief's "don't over-invest" guidance we don't mock all of it.
  // Instead we verify the wiring: draw() reaches _drawBaseEmergencyAlert.
  const game = { baseEmergencyAlert: true, canvas: { width: 800, height: 600 } };
  const hud = new HUD(game);
  let called = false;
  hud._drawBaseEmergencyAlert = () => { called = true; };
  hud._drawCarrierArrow = () => {};
  hud._drawWeaponStatus = () => {};
  hud._drawHoverGauge = () => {};
  hud._drawAutoAimBar = () => {};
  hud._drawUnitHpBar = () => {};
  hud._drawRepairKitIcons = () => {};
  hud._drawCarrierDamageAlert = () => {};
  hud._drawProximityAlert = () => {};
  game.liveTimeBonus = () => ({ current: 1, max: 1 });
  game.missionTimer = 0;
  game.missionsCompleted = 0;
  game.score = 0;
  game.player = null;
  game.carrier = null;
  game.base = null;
  hud.draw(makeHudCtx());
  assert.equal(called, true);
});
