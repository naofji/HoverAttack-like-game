// 開始地点のまわりに敵を置かない。2026-11-23 ユーザー指定「ステージ開始地点から半径 200px には敵を配置しない。
// ただし地雷は別」。測ると、地図の生成が持っている除外（左上 20×16 タイルの矩形）だけでは、20シード×7面で
// 9体が 200px の内側にいた（一番近くて 96px、6面のアタッカー）。
// 初めは内側の敵を外していたが、「移すほうがいい」（同日ユーザー。週によって敵の数が減らないように）で、
// 内側の敵は 200px より外の、その敵が置ける一番近い場所へ移す。
// 開始地点（母艦）は地図を作った後に決まるので、敵を置くとき（SpawnManager.spawnEnemies）に移す。
// 置く処理は今までどおり全部走らせてから移す。移し先は地図だけで決める（game.rng を引く回数を変えると、
// 週次の決定性が壊れる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { START_SAFE_RADIUS, TILE_SIZE } from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
// 天井（row 0〜21、下面 y 352）と床（row 30〜、上面 y 480）の間の、高さ 8 タイルの横長の通路
const CEIL_Y = 22 * T;
const FLOOR_Y = 30 * T;
function corridorRows() {
  const rows = [];
  for (let r = 0; r < 40; r++) rows.push((r < 22 || r >= 30 ? '#' : '.').repeat(120));
  return rows;
}

/**
 * 自機（床の上、中心 x 208）から右へ dx の所に、5種の敵をそれぞれ置く。
 * タンク・アタッカー・スパイダーは床、ドローンは宙、砲台は天井
 */
function world(dxs) {
  const map = makeMap(corridorRows());
  const game = makeGame(map);
  let draws = 0;
  let s = 7;
  game.rng = { next: () => { draws++; s = (s * 16807) % 2147483647; return s / 2147483647; } };
  game.missionsCompleted = 6;   // 7面: アタッカーの型が全部出る・スパイダーも出る
  game.baseEmergencyAlert = false;
  game.player = { x: 200, y: FLOOR_Y - 24, width: 16, height: 24, alive: true };
  const px = 208;
  const tile = (dx) => Math.floor((px + dx) / T);
  map.enemyTankSpawns = dxs.map((dx) => ({ x: tile(dx) * T, y: FLOOR_Y - 12 }));
  map.enemyAttackerSpawns = dxs.map((dx) => ({ x: (tile(dx) + 2) * T, y: FLOOR_Y - 24 }));
  map.enemyDroneSpawns = dxs.map((dx) => ({ x: tile(dx) * T - 4, y: 25 * T }));
  map.spiderSpawns = dxs.map((dx) => ({ x: (tile(dx) + 4) * T + 1, y: FLOOR_Y - 14, surface: 'floor' }));
  map.enemyTurretSpawns = dxs.map((dx) => ({ x: tile(dx) * T - 4, y: CEIL_Y, isCeiling: true }));
  map.enemyBaseSpawn = null;
  map.landmineSpawns = [];
  game.spawnManager = new SpawnManager(game);
  return { game, map, px, py: FLOOR_Y - 12, draws: () => draws };
}

const center = (e) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
const NEAR = [40, 100];
const FAR = [420, 560];

test('開始地点から START_SAFE_RADIUS の内側の敵は、外へ移す（数は減らない）', () => {
  assert.equal(START_SAFE_RADIUS, 200);
  const { game, px, py } = world([...NEAR, ...FAR]);
  game.spawnManager.spawnEnemies();
  assert.equal(game.enemies.length, 5 * 4, '数が変わった');
  for (const e of game.enemies) {
    const c = center(e);
    const d = Math.hypot(c.x - px, c.y - py);
    assert.ok(d >= START_SAFE_RADIUS, `${e.constructor.name} が開始地点から ${d.toFixed(0)}px`);
  }
  const count = (name) => game.enemies.filter((e) => e.constructor.name === name).length;
  for (const k of ['EnemyTank', 'EnemyAttacker', 'EnemyDrone', 'EnemySpider', 'EnemyTurret']) assert.equal(count(k), 4, k);
});

test('移した先は、その敵が置ける場所（床に立つ・宙に浮く・天井に付く・同じ面に張り付く）で、外の敵は動かさない', () => {
  const { game, map, px } = world([...NEAR, ...FAR]);
  game.spawnManager.spawnEnemies();
  const isSolid = (x, y) => map.isSolidAtPixel(x, y);
  for (const e of game.enemies) {
    const name = e.constructor.name;
    if (name === 'EnemyTank' || name === 'EnemyAttacker') {
      assert.equal(e.y + e.height, FLOOR_Y, `${name} が床に立っていない y ${e.y}`);
    } else if (name === 'EnemyTurret') {
      assert.equal(e.isCeilingMounted, true);
      assert.equal(e.y, CEIL_Y, '天井に付いていない');
    } else if (name === 'EnemySpider') {
      assert.equal(e.surface, 'floor');
      assert.equal(e.y + e.height, FLOOR_Y);
    } else if (name === 'EnemyDrone') {
      for (const [x, y] of [[e.x, e.y], [e.x + e.width, e.y + e.height]]) assert.equal(isSolid(x, y), false, 'ドローンが岩の中');
    }
  }
  // 外にいた敵（dx 420・560）は元の場所のまま
  const tankXs = game.enemies.filter((e) => e.constructor.name === 'EnemyTank').map((e) => e.x).sort((a, b) => a - b);
  for (const dx of FAR) assert.ok(tankXs.includes(Math.floor((px + dx) / T) * T), `外のタンク ${dx} が動いた`);
});

test('移した敵どうし・ほかの敵と重ならない', () => {
  const { game } = world([...NEAR, ...FAR]);
  game.spawnManager.spawnEnemies();
  const es = game.enemies;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = center(es[i]);
      const b = center(es[j]);
      assert.ok(!(Math.abs(a.x - b.x) < 24 && Math.abs(a.y - b.y) < 24),
        `${es[i].constructor.name} と ${es[j].constructor.name} が重なる (${a.x}, ${a.y}) (${b.x}, ${b.y})`);
    }
  }
});

test('移しても game.rng を引く回数は変わらず、アタッカーの型・砲台の種類は元のまま（週次の決定性）', () => {
  const a = world([...NEAR, ...FAR]);
  a.game.spawnManager.spawnEnemies();
  const b = world([...NEAR, ...FAR]);
  b.game.player = null;   // 移さない場合
  b.game.spawnManager.spawnEnemies();
  assert.equal(a.draws(), b.draws());
  const kinds = (g) => g.enemies.map((e) => `${e.constructor.name}:${e.config ? e.config.name : ''}:${e.type || ''}`).sort();
  assert.deepEqual(kinds(a.game), kinds(b.game));
});

test('地雷は開始地点のそばでもそのまま置く', () => {
  const { game, px } = world([]);
  game.map.landmineSpawns = [{ x: px + 40, y: FLOOR_Y - 6 }, { x: px - 60, y: FLOOR_Y - 6 }];
  game.spawnManager.spawnLandmines();
  game.spawnManager.spawnEnemies();
  assert.equal(game.landmines.length, 2);
  assert.ok(game.landmines.some((m) => Math.abs(m.x - px) < START_SAFE_RADIUS));
});

test('敵基地は開始地点のそばでも動かさない（面の目的なので）', () => {
  const { game, px, py } = world([]);
  game.map.enemyBaseSpawn = { x: px + 50, y: py - 40 };
  game.spawnManager.spawnEnemies();
  assert.ok(game.base && game.enemies.includes(game.base));
  assert.equal(game.base.x, px + 50);
});
