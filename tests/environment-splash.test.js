import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageEnvironment } from '../src/js/world/StageEnvironment.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SPLASH_MAX_PARTICLES, SPLASH_PARTICLES_PER_VY, TILE_SIZE } from '../src/js/utils/Constants.js';

function waterBelow(y0) {
  return { isWaterAtPixel: (x, y) => y >= y0, water: new Uint8Array(1) };
}

test('spawnSplash pushes particles proportional to |vy| and caps them', () => {
  const game = { particles: [], env: { renderer: { addRipple() {} } } };
  SpawnEffects.spawnSplash.call(game, 10, 100, 2);
  assert.equal(game.particles.length, Math.ceil(2 * SPLASH_PARTICLES_PER_VY));
  game.particles.length = 0;
  SpawnEffects.spawnSplash.call(game, 10, 100, 50);
  assert.equal(game.particles.length, SPLASH_MAX_PARTICLES);
  for (const p of game.particles) { p.update(); assert.ok(p.alive); }
});

test('a splash happens on the frame an entity crosses the surface, not while it stays inside', () => {
  const calls = [];
  const ent = { x: 0, y: 0, width: 16, height: 16, vy: 3, alive: true };
  const game = {
    map: waterBelow(100), player: ent, carrier: null, enemies: [], projectiles: [], enemyBullets: [], particles: [],
    spawnSplash: (x, y, vy) => calls.push([x, y, vy]),
  };
  const env = new StageEnvironment(game, 3);
  env.update();                 // 外（中心 y=8）
  assert.equal(calls.length, 0);
  ent.y = 96; env.update();     // 中心 104 → 中
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 3);
  ent.y = 120; env.update();    // まだ中
  assert.equal(calls.length, 1);
  ent.y = 0; env.update();      // 外へ
  assert.equal(calls.length, 2);
});

test('a null game does not throw when the environment is water', () => {
  const env = new StageEnvironment(null, 3);
  assert.doesNotThrow(() => env.update());
});
