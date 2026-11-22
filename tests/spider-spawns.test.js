// スパイダーの置き場所（world/mapgen/spawns.js の _findSpiderPositions）と生成（SpawnManager）。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { boxHitsSolid, hasSupport } from '../src/js/utils/surfaceCrawl.js';
import { SPIDER_SIZE, SPIDER_COUNT, SPIDER_SPAWN_MIN_COL_GAP, TILE_SIZE } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() を Node で回すための最小の DOM（MapDeterminism.test.js と同じ）
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

async function buildMap(seed, missionLevel) {
  const { Map } = await import('../src/js/world/Map.js');
  const game = { rng: new SeededRNG(seed) };
  return { map: new Map(game, missionLevel), game };
}

const SEEDS = [7, 42, 2026];

test('6面（missionLevel 5）では数体が右半分に置かれ、面に接している', async () => {
  for (const seed of SEEDS) {
    const { map } = await buildMap(seed, 5);
    const sp = map.spiderSpawns;
    assert.ok(sp.length >= 1 && sp.length <= SPIDER_COUNT, `seed ${seed}: ${sp.length} 体`);
    const isSolid = (r, c) => map.isSolid(r, c);
    for (const p of sp) {
      assert.ok(p.x >= map.width / 2, `seed ${seed}: 左半分 ${p.x}`);
      assert.equal(boxHitsSolid(isSolid, p.x, p.y, SPIDER_SIZE), false, `seed ${seed}: めり込み ${JSON.stringify(p)}`);
      assert.equal(hasSupport(isSolid, { ...p, size: SPIDER_SIZE }), true, `seed ${seed}: 足場なし ${JSON.stringify(p)}`);
    }
    const cols = sp.map((p) => Math.floor(p.x / TILE_SIZE)).sort((a, b) => a - b);
    for (let i = 1; i < cols.length; i++) assert.ok(cols[i] - cols[i - 1] >= SPIDER_SPAWN_MIN_COL_GAP, `seed ${seed}: 近すぎる`);
  }
});

test('6面以外では置かれない', async () => {
  for (const ml of [0, 1, 2, 3, 4, 6]) {
    const { map } = await buildMap(42, ml);
    assert.deepEqual(map.spiderSpawns, [], `missionLevel ${ml}`);
  }
});

test('置いても game.rng の進み方と他の湧き位置は変わらない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const real = await buildMap(42, 5);
  const orig = Map.prototype._findSpiderPositions;
  Map.prototype._findSpiderPositions = () => [];
  let stub;
  try {
    stub = await buildMap(42, 5);
  } finally {
    Map.prototype._findSpiderPositions = orig;
  }
  assert.ok(real.map.spiderSpawns.length > 0);
  assert.equal(real.game.rng.state, stub.game.rng.state);
  assert.deepEqual(real.map.grid, stub.map.grid);
  for (const k of ['enemyTankSpawns', 'enemyAttackerSpawns', 'enemyDroneSpawns', 'enemyTurretSpawns', 'landmineSpawns', 'orbSpawns']) {
    assert.deepEqual(real.map[k], stub.map[k], k);
  }
});

test('同じシードなら同じ場所', async () => {
  const a = await buildMap(42, 5);
  const b = await buildMap(42, 5);
  assert.deepEqual(a.map.spiderSpawns, b.map.spiderSpawns);
});

test('SpawnManager が EnemySpider を作る', async () => {
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');
  const { EnemySpider } = await import('../src/js/entities/EnemySpider.js');
  const game = {
    rng: { next: () => 0.5 }, missionsCompleted: 5, weekSeed: 1,
    map: {
      isSolidAtPixel: () => false, isSolid: () => false, cols: 100, rows: 100,
      enemyTankSpawns: [], enemyAttackerSpawns: [], enemyDroneSpawns: [], enemyTurretSpawns: [],
      enemyBaseSpawn: null, landmineSpawns: [],
      spiderSpawns: [{ x: 100, y: 50, surface: 'ceiling' }, { x: 300, y: 82, surface: 'floor' }],
    },
  };
  new SpawnManager(game).spawnEnemies();
  const spiders = game.enemies.filter((e) => e instanceof EnemySpider);
  assert.equal(spiders.length, 2);
  assert.deepEqual(spiders.map((s) => [s.x, s.y, s.surface]), [[100, 50, 'ceiling'], [300, 82, 'floor']]);
});
