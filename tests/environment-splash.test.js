import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageEnvironment } from '../src/js/world/StageEnvironment.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SPLASH_MAX_PARTICLES, SPLASH_PARTICLES_PER_VY, TILE_SIZE } from '../src/js/utils/Constants.js';

function waterBelow(y0) {
  return {
    isWaterAtPixel: (x, y) => y >= y0,
    getSurfaceY: (r) => ((r + 1) * TILE_SIZE > y0 ? y0 : -1),
    water: new Uint8Array(1),
  };
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

test('debris crossing the water surface triggers a splash; a non-debris particle does not', () => {
  const calls = [];
  const debris = { isDebris: true, x: 0, y: 0, width: 4, height: 4, vy: 3, alive: true };
  const spark = { x: 0, y: 0, width: 4, height: 4, vy: 3, alive: true }; // isDebris なし
  const game = {
    map: waterBelow(100), player: null, carrier: null, enemies: [], projectiles: [], enemyBullets: [],
    particles: [debris, spark],
    spawnSplash: (x, y, vy) => calls.push([x, y, vy]),
  };
  const env = new StageEnvironment(game, 3);
  env.update();                       // 外（中心 y=2）
  assert.equal(calls.length, 0);
  debris.y = 100; spark.y = 100;      // どちらも中心 y=102 → 水中へ
  env.update();
  assert.equal(calls.length, 1, '破片だけがしぶきを出すこと');
});

test('a null game does not throw when the environment is water', () => {
  const env = new StageEnvironment(null, 3);
  assert.doesNotThrow(() => env.update());
});

test('ripple strength is capped at WATER_RIPPLE_MAX', async () => {
  const { WATER_RIPPLE_MAX } = await import('../src/js/utils/Constants.js');
  const ripples = [];
  const game = { particles: [], env: { renderer: { addRipple: (x, s) => ripples.push(s) } } };
  SpawnEffects.spawnSplash.call(game, 10, 100, 50);
  assert.deepEqual(ripples, [WATER_RIPPLE_MAX]);
  assert.ok(WATER_RIPPLE_MAX <= 2.5);
});

test('しぶきはタイルの上辺ではなく実際の液面に出る（本物の Map の問い合わせで）', async () => {
  const { makeWaterMap } = await import('./helpers/water-map.js');
  // 水量5の浅い水たまり。液面はタイルの途中（上辺より3px下）
  const map = makeWaterMap(`
    #.....#
    #.....#
    #55555#
    #######
  `);
  const level = map.getSurfaceY(2, 3);
  assert.ok(level > 2 * TILE_SIZE && level < 3 * TILE_SIZE, `前提: 液面 ${level} はタイルの途中`);

  const calls = [];
  const ent = { x: 3 * TILE_SIZE, y: 0, width: 16, height: 16, vy: 3, alive: true };
  const game = {
    map, player: ent, carrier: null, enemies: [], projectiles: [], enemyBullets: [], particles: [],
    spawnSplash: (x, y, vy) => calls.push([x, y, vy]),
  };
  const env = new StageEnvironment(game, 3);
  env.update();                                   // 外
  ent.y = level - 8 + 1; env.update();            // 中心が液面の1px下 → 入水
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], level, '入水のしぶきは液面の高さ');
  ent.y = level - 8 - 1; env.update();            // 中心が液面の1px上 → 出水
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], level, '出水のしぶきも液面の高さ');
});

test('getSurfaceY は、水量0でも液面がかかっているタイルでは液面を返す（isWaterAtPixel と同じ意味）', async () => {
  const { makeWaterMap } = await import('./helpers/water-map.js');
  // 量子化で1列だけ水量が届いていない水たまり。その列にも液面はかかっている
  const map = makeWaterMap(`
    #......#
    #......#
    #888888#
    ########
  `);
  map.water[1 * map.cols + 2] = 3;
  map.water[1 * map.cols + 3] = 3;
  map.water[1 * map.cols + 4] = 2;
  map.water[1 * map.cols + 5] = 2;
  map.refresh();
  let dryButCovered = 0;
  for (let c = 1; c <= 6; c++) {
    // このタイルの中で isWaterAtPixel が最初に水と答える y
    let firstWet = -1;
    for (let y = TILE_SIZE; y < 2 * TILE_SIZE; y++) {
      if (map.isWaterAtPixel(c * TILE_SIZE + 8, y)) { firstWet = y; break; }
    }
    if (firstWet >= 0 && map.water[1 * map.cols + c] === 0) dryButCovered++;
    const expected = firstWet >= 0 ? firstWet : (map.isWater(1, c) ? TILE_SIZE : -1);
    assert.equal(map.getSurfaceY(1, c), expected, `列${c}: getSurfaceY と isWaterAtPixel が食い違う`);
  }
  assert.ok(dryButCovered > 0, '前提: 水量0なのに液面がかかっている列がある');
});
