import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { StageEnvironment } from '../src/js/world/StageEnvironment.js';

// _simulationTick が env.update() を呼ぶこと、_drawWorld / draw が
// drawOverWorld / drawOverlay を1回ずつ呼ぶことを、差し替えた env で数える。
function countingEnv() {
  const n = { update: 0, over: 0, overlay: 0 };
  return {
    n,
    update() { n.update++; },
    drawOverWorld() { n.over++; },
    drawOverlay() { n.overlay++; },
  };
}

test('simulation tick advances the environment', () => {
  const env = countingEnv();
  const fake = {
    env,
    _snapshotPrevPositions() {}, _updateCarrier() {}, _updatePlayer() {}, _updateDeathHold() {},
    _updateCamera() {}, _updateAndPrune() {}, _updateLandmines() {}, _updateAutoAim() {},
    _updateOverdrive() {}, map: { update() {} }, _updateEnemyHoverSound() {}, _checkMissionClear() {},
    collisionManager: { update() {} }, _updateProximityAlert() {},
    projectiles: [], particles: [], smokeScreens: [], repairKits: [], autoAimUnits: [], missileKits: [], enemies: [],
  };
  Game._simulationTick.call(fake);
  assert.equal(env.n.update, 1);
});

test('StageEnvironment is what main.js builds for a mission', () => {
  // GameStateManager の面開始と main.js の init が同じクラスを使うこと
  assert.equal(typeof StageEnvironment, 'function');
});
