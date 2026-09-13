// グレネード・ミサイル・敵機の破壊はすべて spawnExplosion() に相乗りする
// 共通の入口（playBlast() → game.spawnExplosion()、destruction.js の playDestruction() も同じ）。
// 水中で爆発したときに水面が揺れるかどうかは、この1箇所だけ見ればよい。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SplashParticle } from '../src/js/entities/Particle.js';
import { WATER_RIPPLE_MAX, WATER_COLUMN_PARTICLE_COUNT, TILE_SIZE } from '../src/js/utils/Constants.js';

// r=3 (y: 48-64) から下を水、水面はタイル境界(y=48)とする単純な水マップ
function waterBelow(y0) {
  return {
    isWaterAtPixel: (x, y) => y >= y0,
    isWater: (r, c) => r * TILE_SIZE >= y0,
    getSurfaceY: (r, c) => y0,
  };
}

function makeGame(map) {
  const ripples = [];
  return {
    game: {
      particles: [], landmines: [],
      map,
      env: { renderer: { addRipple: (x, s) => ripples.push([x, s]) } },
      spawnWaterColumn: SpawnEffects.spawnWaterColumn,
    },
    ripples,
  };
}

test('spawnExplosion ripples the water surface when it happens underwater', () => {
  const { game, ripples } = makeGame(waterBelow(50));
  SpawnEffects.spawnExplosion.call(game, 20, 100, 40);
  assert.equal(ripples.length, 1);
  assert.equal(ripples[0][0], 20);
  assert.ok(ripples[0][1] > 0 && ripples[0][1] <= WATER_RIPPLE_MAX);
});

test('spawnExplosion does not ripple when it happens in the air', () => {
  const { game, ripples } = makeGame(waterBelow(50));
  SpawnEffects.spawnExplosion.call(game, 20, 10, 40);
  assert.equal(ripples.length, 0);
});

test('spawnExplosion does not throw on a stage without water (no env.renderer)', () => {
  const game = { particles: [], landmines: [], map: { isWaterAtPixel: () => false } };
  assert.doesNotThrow(() => SpawnEffects.spawnExplosion.call(game, 0, 0, 10));
});

test('spawnExplosion does not throw when there is no map at all', () => {
  const game = { particles: [], landmines: [] };
  assert.doesNotThrow(() => SpawnEffects.spawnExplosion.call(game, 0, 0, 10));
});

test('spawnExplosion shoots a water column (SplashParticle burst) up from the surface when underwater', () => {
  const { game } = makeGame(waterBelow(48));
  SpawnEffects.spawnExplosion.call(game, 20, 100, 40);

  const column = game.particles.filter((p) => p instanceof SplashParticle);
  assert.equal(column.length, WATER_COLUMN_PARTICLE_COUNT);
  for (const p of column) {
    assert.equal(p.y, 48, '水面から打ち上がっていない');
    assert.ok(p.vy < 0, '上向きに飛んでいない');
  }
});

test('spawnExplosion does not shoot a water column in the air', () => {
  const { game } = makeGame(waterBelow(48));
  SpawnEffects.spawnExplosion.call(game, 20, 10, 40);

  const column = game.particles.filter((p) => p instanceof SplashParticle);
  assert.equal(column.length, 0);
});
