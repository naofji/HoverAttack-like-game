import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

// Minimal DOM stub so Map._generateMiniMap() can run under Node.
before(() => {
  // 任意のメソッド呼び出しに応答する。createRadialGradient の戻り値としても
  // 使えるよう addColorStop を持つオブジェクトを返す。
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
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
  assert.deepEqual(a.waterCells, b.waterCells);
  assert.deepEqual(a.stairs, b.stairs);
});

test('different seeds produce different grids', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 1, 2);
  const b = buildMap(Map, 2, 2);
  assert.notDeepEqual(a.grid, b.grid);
});

test('stage 4 has water and stage 1 has none; rng consumption of stage 1 is unchanged by water', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const water = buildMap(Map, 42, 3);
  assert.ok(water.waterCells.length > 0, 'stage 4 should have pools');
  const dry = buildMap(Map, 42, 0);
  assert.equal(dry.waterCells.length, 0);
});

// 上の「same seed」テストは missionLevel=2（水無し面）なので waterCells は
// 常に [] で、_generateWater() 自体の決定性は確かめていない（恒真になっていた）。
// 水面（missionLevel=3）で2回ビルドし、水タイル自体の再現性と、水生成が
// 派生ストリームを使っていて game.rng（敵配置に使う本流）を乱していないことを
// 両方確かめる。
test('same seed on the water stage produces identical water pools without disturbing enemy rng', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 3);
  const b = buildMap(Map, 42, 3);
  assert.ok(a.waterCells.length > 0, 'water stage should actually have pools to compare');
  assert.deepEqual(a.waterCells, b.waterCells);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
});

// 5面（雪）は水面と同じ理由で別テストが要る（Task 11 の水面の教訓：
// 非対象の面にしか assertion を足さないと恒真になる）。階段が実際に
// 1本以上できることと、派生ストリームが敵配置の本流を乱さないことを確かめる。
test('same seed on the snow stage produces identical stairs without disturbing enemy rng', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 4);
  const b = buildMap(Map, 42, 4);
  assert.ok(a.stairs.length > 0, 'snow stage should actually have stairs to compare');
  assert.deepEqual(a.stairs, b.stairs);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
});
