import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../src/js/utils/Constants.js';

// _simulationTick が env.update() を呼ぶこと、draw() が
// world → env.drawOverlay → hud の順で呼ぶことを、記録用のダミーで確かめる。
function countingEnv() {
  const n = { update: 0, over: 0, overlay: 0 };
  return {
    n,
    update() { n.update++; },
    drawBehindTerrain() {},
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

test('draw() paints world, then the environment overlay, then the HUD (in that order)', () => {
  const order = [];
  const fake = {
    gameState: 'playing',
    ctx: makeFakeCtx(),
    canvas: { width: 1366, height: 768 },
    _drawWorld() { order.push('world'); },
    env: { drawOverlay() { order.push('overlay'); } },
    hud: { draw() { order.push('hud'); }, drawCarrierArrow() {} },
    crosshair: { draw() {} },
    _drawOverlays() {},
  };
  Game.draw.call(fake);
  assert.deepEqual(order, ['world', 'overlay', 'hud']);
});

test('world pass draws snow behind the terrain: backdrop → env.behind → map', () => {
  const order = [];
  const fake = {
    gameState: 'playing', simAlpha: 1,
    camera: { renderX: () => 0, renderY: () => 0 },
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    _applyRenderInterpolation() {}, _restoreRenderInterpolation() {},
    map: { backdrop: { draw() { order.push('backdrop'); } }, draw() { order.push('map'); } },
    env: { drawBehindTerrain() { order.push('behind'); }, drawOverWorld() { order.push('over'); }, drawOverlay() {} },
    carrier: null, player: null, projectiles: [], particles: [], landmines: [], repairKits: [], autoAimUnits: [], missileKits: [],
    grenadeTrajectory: null, _drawHpBarIfDamaged() {}, enemies: [], enemyBullets: [], flag: null, smokeScreens: [],
  };
  Game._drawWorld.call(fake, makeFakeCtx());
  assert.deepEqual(order, ['backdrop', 'behind', 'map', 'over']);
});
