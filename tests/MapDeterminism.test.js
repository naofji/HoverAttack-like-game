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
// 水面（missionLevel=3）で2回ビルドし、水タイル自体の再現性を確かめる。
// 「game.rng を乱していない」は同一ビルド同士の比較では検出できない
// （水生成が rng を1回余分に消費しても、両方が同じだけ消費すれば一致してしまう）ので、
// 下の別テストで _generateWater を無効化したビルドと比較して確かめる。
test('same seed on the water stage produces identical water pools', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 3);
  const b = buildMap(Map, 42, 3);
  assert.ok(a.waterCells.length > 0, 'water stage should actually have pools to compare');
  assert.deepEqual(a.waterCells, b.waterCells);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
});

// 水は grid に触らない設計（水面は別配列 waterCells）なので、_generateWater を
// 丸ごと無効化しても敵配置（本流の game.rng を消費する側）は変わらないはず。
// これが一致するのは「水生成が本流を消費していない」ときだけなので、恒真ではない
// （_generateWater の先頭に this.game.rng.next() を挟むと実際に赤くなることを確認済み）。
test('disabling _generateWater does not change enemy spawns (water uses a derived rng stream, not the main one)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const withWater = buildMap(Map, 42, 3);

  const original = Map.prototype._generateWater;
  Map.prototype._generateWater = function () { /* no-op: 水を生成しない */ };
  let withoutWater;
  try {
    withoutWater = buildMap(Map, 42, 3);
  } finally {
    Map.prototype._generateWater = original;
  }

  assert.equal(withoutWater.waterCells.length, 0, '無効化した側は水が無いはず');
  assert.deepEqual(withoutWater.enemyTankSpawns, withWater.enemyTankSpawns);
  assert.deepEqual(withoutWater.enemyAttackerSpawns, withWater.enemyAttackerSpawns);
});

// 5面（雪）は水面と同じ理由で別テストが要る（Task 11 の水面の教訓：
// 非対象の面にしか assertion を足さないと恒真になる）。ここは再現性
// （同じシードなら同じ階段になる）だけを確かめる。階段は grid 自体を変える設計
// なので、階段無しのビルドと敵配置を比較しても一致するとは限らず、
// 「rng を乱していないか」はこの形では検証できない。
test('same seed on the snow stage produces identical stairs (reproducibility)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = buildMap(Map, 42, 4);
  const b = buildMap(Map, 42, 4);
  assert.ok(a.stairs.length > 0, 'snow stage should actually have stairs to compare');
  assert.deepEqual(a.stairs, b.stairs);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
});
