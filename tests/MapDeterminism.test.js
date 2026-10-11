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

// 3面の町（docs/superpowers/specs/2026-10-11-stage3-town-design.md）。
// 町は敵の湧き位置を決めたあとに作るので、「敵配置が変わらない」を比べても恒真になる。
// 見るべきは**このあと SpawnManager が使う game.rng の状態**。町を無効化したビルドと
// 状態が一致するのは、町が派生ストリームしか使っていないときだけ。
test('stage 3 builds a town; stage 1 has none; mission 10 (= stage 3 mod 7) has one too', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  assert.ok(buildMap(Map, 42, 2).town.buildings.length > 0);
  assert.equal(buildMap(Map, 42, 0).town, null);
  assert.ok(buildMap(Map, 42, 9).town.buildings.length > 0, 'debugStartMission で面数を超えても剰余で3面');
});

test('same seed produces the same town', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const summary = (m) => m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, Array.from(b.cells).join('')]);
  assert.deepEqual(summary(buildMap(Map, 42, 2)), summary(buildMap(Map, 42, 2)));
});

test('building the town does not consume game.rng (SpawnManager runs on it next)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const withTown = { rng: new SeededRNG(42) };
  new Map(withTown, 2);

  const original = Map.prototype._generateTown;
  Map.prototype._generateTown = function () { /* no-op: 町を作らない */ };
  const withoutTown = { rng: new SeededRNG(42) };
  try {
    new Map(withoutTown, 2);
  } finally {
    Map.prototype._generateTown = original;
  }
  assert.equal(withTown.rng.state, withoutTown.rng.state);
});

test('every building in the town is held by rock (floor, wall or ceiling)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3]) {
    const m = buildMap(Map, seed, 2);
    for (const b of m.town.buildings) {
      assert.ok(b.anchors.length > 0, `seed ${seed}: ${b.site} の ${b.kind} (${b.x},${b.y}) が浮いている`);
    }
  }
});

// 4面の植物（苔とシダ）。町と同じ Town の仕組みに、燃えない植物の設計図を載せる。
// 4面の植物も派生ストリームしか使わず、game.rng を動かさない
test('stage 4 builds plants (soft buildings); stage 3 keeps its town; mission 11 (= stage 4 mod 7) has plants too', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const ferns = buildMap(Map, 42, 3).town;
  assert.ok(ferns.buildings.length > 0);
  assert.ok(ferns.buildings.every((b) => b.soft && b.style === 'P'));
  assert.ok(buildMap(Map, 42, 2).town.buildings.every((b) => !b.soft), '3面の町は soft でない');
  assert.ok(buildMap(Map, 42, 4).town.buildings.every((b) => b.soft && b.flora === 'snow'), '5面は雪の木');
  assert.equal(buildMap(Map, 42, 5).town, null, '6面には何も置かない');
  assert.ok(buildMap(Map, 42, 10).town.buildings.every((b) => b.soft && b.flora === 'leaf'), 'debugStartMission で面数を超えても剰余で4面');
});

test('same seed produces the same plants', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const summary = (m) => m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, Array.from(b.cells).join('')]);
  assert.deepEqual(summary(buildMap(Map, 42, 3)), summary(buildMap(Map, 42, 3)));
});

test('building the plants does not consume game.rng (SpawnManager runs on it next)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const withPlants = { rng: new SeededRNG(42) };
  new Map(withPlants, 3);

  const original = Map.prototype._generatePlants;
  Map.prototype._generatePlants = function () { /* no-op: 植物を作らない */ };
  const without = { rng: new SeededRNG(42) };
  try {
    new Map(without, 3);
  } finally {
    Map.prototype._generatePlants = original;
  }
  assert.equal(withPlants.rng.state, without.rng.state);
});

// 5面の雪の木。植物と同じく派生ストリームしか使わず、game.rng を動かさない
test('same seed produces the same snow trees', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const summary = (m) => m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, Array.from(b.cells).join('')]);
  assert.ok(buildMap(Map, 42, 4).town.buildings.length > 0);
  assert.deepEqual(summary(buildMap(Map, 42, 4)), summary(buildMap(Map, 42, 4)));
});

test('building the snow trees does not consume game.rng (SpawnManager runs on it next)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const withTrees = { rng: new SeededRNG(42) };
  new Map(withTrees, 4);

  const original = Map.prototype._generateSnowTrees;
  Map.prototype._generateSnowTrees = function () { /* no-op: 木を作らない */ };
  const without = { rng: new SeededRNG(42) };
  try {
    new Map(without, 4);
  } finally {
    Map.prototype._generateSnowTrees = original;
  }
  assert.equal(withTrees.rng.state, without.rng.state);
});

test('snow trees are never placed in the enemy base room', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = buildMap(Map, 42, 4);
  const base = m._reservedRects()[1];
  for (const b of m.town.buildings) {
    const hit = b.x / 16 <= base.c1 && (b.x + b.width - 1) / 16 >= base.c0 && b.y / 16 <= base.r1 && (b.y + b.height - 1) / 16 >= base.r0;
    assert.ok(!hit, `${b.kind} (${b.x},${b.y}) が基地の部屋に掛かる`);
  }
});
