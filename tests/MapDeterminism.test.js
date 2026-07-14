import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

// Minimal DOM stub so Map._generateMiniMap() can run under Node.
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => {} });
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => noopCtx,
    }),
  };
});

function buildMap(MapClass, seed, missionLevel) {
  const game = { rng: new SeededRNG(seed) };
  return new MapClass(game, missionLevel);
}

test('same seed produces identical grid and enemy spawns', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 2);
  const b = buildMap(Map, 42, 2);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
  assert.deepEqual(a.enemyAttackerSpawns, b.enemyAttackerSpawns);
  assert.deepEqual(a.enemyDroneSpawns, b.enemyDroneSpawns);
  assert.deepEqual(a.enemyTurretSpawns, b.enemyTurretSpawns);
  assert.deepEqual(a.landmineSpawns, b.landmineSpawns);
  assert.deepEqual(a.enemyBaseSpawn, b.enemyBaseSpawn);
});

test('different seeds produce different grids', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 1, 2);
  const b = buildMap(Map, 2, 2);
  assert.notDeepEqual(a.grid, b.grid);
});
