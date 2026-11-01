// Orb の置き場所と、ゲームへの組み込み（設計 2026-11-01-stage2-orb-design.md 4.2）。
// 2面に5個（small 3・large 2）、盤面の上の方（上から 40% 以内）、坂の上でなくてよい、互いに離す。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
  TILE_SIZE as T, STAGE_ENVIRONMENTS, ORB_SIZES, ORB_SPAWN_TOP_FRACTION, ORB_SPAWN_MIN_COL_GAP, BLOCK_EMPTY,
} from '../src/js/utils/Constants.js';
import { SHAPE_FULL } from '../src/js/utils/tileShape.js';
import { ORB_CONTACT_EPS } from '../src/js/utils/orbPhysics.js';
import { Orb } from '../src/js/entities/Orb.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { Game } from '../src/js/main.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

async function buildMap(seed, level) {
  const { Map } = await import('../src/js/world/Map.js');
  const game = { rng: new SeededRNG(seed) };
  return { map: new Map(game, level), game };
}

const SEEDS = [1, 2, 3, 4];

test('2面に Orb が5個（small 3・large 2）', async () => {
  for (const seed of SEEDS) {
    const { map } = await buildMap(seed, 1);
    assert.equal(map.orbSpawns.length, 5, `seed ${seed}`);
    assert.equal(map.orbSpawns.filter((o) => o.size === 'small').length, 3);
    assert.equal(map.orbSpawns.filter((o) => o.size === 'large').length, 2);
  }
});

test('どれも上の方にあり（上から 40% 以内か、足りないときだけ下へ）、列が 20 以上離れ、予約矩形の外、平らな床の上に接して岩に入らない', async () => {
  let inTop = 0, total = 0;
  for (const seed of SEEDS) {
    const { map } = await buildMap(seed, 1);
    const rects = map._reservedRects();
    const cols = map.orbSpawns.map((o) => Math.floor(o.cx / T));
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        assert.ok(Math.abs(cols[i] - cols[j]) >= ORB_SPAWN_MIN_COL_GAP, `seed ${seed}: 列 ${cols[i]} と ${cols[j]}`);
      }
    }
    for (const o of map.orbSpawns) {
      total++;
      const r = ORB_SIZES[o.size].diameter / 2;
      const bottom = o.cy + r;
      if (bottom / T <= map.rows * ORB_SPAWN_TOP_FRACTION + 1) inTop++;
      const tr = Math.round(bottom / T), tc = Math.floor((o.cx - r) / T);
      assert.ok(!rects.some((q) => tr - 1 >= q.r0 && tr - 1 <= q.r1 && tc >= q.c0 && tc <= q.c1), '予約矩形の中');
      // 平らな床（真下のタイルが全部満ち）に接している
      for (let c = tc; c < tc + ORB_SIZES[o.size].diameter / T; c++) {
        assert.equal(map.tileShapeAt(tr, c), SHAPE_FULL, `seed ${seed}: 床 (${tr}, ${c}) が平らでない`);
        assert.equal(map.grid[tr - 1][c], BLOCK_EMPTY);
      }
      assert.ok(Math.abs(bottom - tr * T) < 1e-9, `床の上面に接していない: 下端 ${bottom}`);
      // 円が岩に入らない
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2, rr = r - ORB_CONTACT_EPS;
        assert.ok(!map.isSolidPoint(o.cx + Math.cos(a) * rr, o.cy + Math.sin(a) * rr), `seed ${seed}: 岩に入る`);
      }
    }
  }
  // 2面は上の方にも部屋が多いので、ほとんどは 40% 以内に収まるはず（候補が足りないときだけ下へ広げる）
  assert.ok(inTop >= total * 0.8, `上の方にある Orb ${inTop}/${total}`);
});

test('同じ種なら同じ置き場所。Orb を置いても、地図を作った後の game.rng と敵の湧き位置は変わらない', async () => {
  const a = await buildMap(7, 1), b = await buildMap(7, 1);
  assert.deepEqual(a.map.orbSpawns, b.map.orbSpawns);
  const row = STAGE_ENVIRONMENTS[1], saved = row.orbs;
  row.orbs = 0;
  let c;
  try { c = await buildMap(7, 1); } finally { row.orbs = saved; }
  assert.equal(c.map.orbSpawns.length, 0);
  assert.equal(a.game.rng.state, c.game.rng.state);
  assert.deepEqual(a.map.enemyTankSpawns, c.map.enemyTankSpawns);
  assert.deepEqual(a.map.enemyAttackerSpawns, c.map.enemyAttackerSpawns);
  assert.deepEqual(a.map.grid, c.map.grid);
});

test('ほかの面には Orb が無い', async () => {
  for (const level of [0, 2, 3, 4, 5, 6]) {
    const { map } = await buildMap(1, level);
    assert.deepEqual(map.orbSpawns, [], `level ${level}`);
  }
});

test('spawnOrbs は地図の置き場所から Orb を作り、前の面の Orb を残さない', () => {
  const game = {
    orbs: ['前の面の Orb'],
    map: { orbSpawns: [{ cx: 100, cy: 92, size: 'small' }, { cx: 200, cy: 88, size: 'large' }], isSolidPoint: () => false },
  };
  new SpawnManager(game).spawnOrbs();
  assert.equal(game.orbs.length, 2);
  assert.ok(game.orbs.every((o) => o instanceof Orb));
  assert.equal(game.orbs[1].size, 'large');
  assert.equal(game.orbs[1].cx, 200);
});

test('面を作り直すと前の面の Orb は消え、spawnOrbs が呼ばれる', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
  let called = 0;
  const game = {
    score: 0, missionsCompleted: 1, debugStartMission: 0, totalTime: 0, stageResults: [], weekSeed: 1,
    orbs: ['前の面の Orb'],
    spawnManager: {
      findSpawnPosition: () => ({ x: 0, y: 0 }), spawnLandmines() {}, spawnStorageTowers() {},
      spawnBarriers() {}, spawnElectricFloors() {}, spawnEnemies() {}, spawnOrbs() { called++; },
    },
    camera: { follow() {}, snapToTarget() {} },
  };
  new GameStateManager(game).resetLevel(false);
  assert.deepEqual(game.orbs, []);
  assert.equal(called, 1);
});

test('_simulationTick が Orb を更新する（配線）。敵の更新の後', () => {
  const order = [];
  const orb = { alive: true, update: () => order.push('orb') };
  const fake = new Proxy({
    orbs: [orb], enemies: [], projectiles: [], enemyBullets: [], landmines: [], particles: [],
    barriers: [], electricFloors: [], storageTowers: [], smokeScreens: [], autoAimUnits: [],
    repairKits: [], missileKits: [], lifeKits: [],
    _updateAndPrune: (list) => { if (list === fake.enemies) order.push('enemies'); },
  }, { get: (o, k) => (k in o ? o[k] : (k === 'map' || k === 'env' || k === 'collisionManager' ? { update() {} } : () => {})) });
  Game._simulationTick.call(fake);
  assert.deepEqual(order, ['enemies', 'orb']);
});

test('Orb は描画の補間の対象', () => {
  const seen = [];
  const orb = { x: 1, y: 2 };
  Game._forEachMovingEntity.call({ orbs: [orb], enemies: [], projectiles: [], enemyBullets: [], repairKits: [], autoAimUnits: [], missileKits: [], lifeKits: [], storageTowers: [] }, (e) => seen.push(e));
  assert.ok(seen.includes(orb));
});
