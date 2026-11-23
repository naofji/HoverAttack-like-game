// 開始地点のまわりに敵を置かない。2026-11-23 ユーザー指定「ステージ開始地点から半径 200px には敵を配置しない。
// ただし地雷は別」。測ると、地図の生成が持っている除外（左上 20×16 タイルの矩形）だけでは、20シード×7面で
// 9体が 200px の内側にいた（一番近くて 96px、6面のアタッカー）。
// 開始地点（母艦）は地図を作った後に決まるので、敵を置くとき（SpawnManager.spawnEnemies）に外す。
// 置く処理は今までどおり全部走らせてから外す（game.rng を引く回数を変えると、週次の決定性が壊れる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { START_SAFE_RADIUS, TILE_SIZE } from '../src/js/utils/Constants.js';

function openRows() {
  const rows = [];
  for (let r = 0; r < 60; r++) rows.push('.'.repeat(120));
  return rows;
}

/** 自機の中心 (px, py) から右へ dx の所に、それぞれの敵を1体ずつ置く地図 */
function world(dxs) {
  const map = makeMap(openRows());
  const game = makeGame(map);
  let draws = 0;
  let s = 7;
  game.rng = { next: () => { draws++; s = (s * 16807) % 2147483647; return s / 2147483647; } };
  game.missionsCompleted = 5;   // 6面: スパイダーも出る
  game.baseEmergencyAlert = false;
  game.player = { x: 200, y: 300, width: 16, height: 24, alive: true };
  const px = 208, py = 312;
  // 横に並べた敵どうしが重ならないよう、種類ごとに縦にずらす
  const at = (dx, dy) => ({ x: px + dx, y: py + dy });
  map.enemyTankSpawns = dxs.map((dx) => at(dx, -60));
  map.enemyAttackerSpawns = dxs.map((dx) => at(dx, -20));
  map.enemyDroneSpawns = dxs.map((dx) => at(dx, 20));
  map.spiderSpawns = dxs.map((dx) => ({ ...at(dx, 50), surface: 'floor' }));
  map.enemyTurretSpawns = dxs.map((dx) => ({ ...at(dx, 80), isCeiling: false }));
  map.enemyBaseSpawn = null;
  map.landmineSpawns = [at(40, 0), at(-60, 0)];
  game.spawnManager = new SpawnManager(game);
  return { game, px, py, draws: () => draws };
}

const center = (e) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

test(`開始地点（自機の中心）から START_SAFE_RADIUS の内側に敵を置かない。外の敵はそのまま`, () => {
  assert.equal(START_SAFE_RADIUS, 200);
  const { game, px, py } = world([60, 140, 260, 420]);
  game.spawnManager.spawnEnemies();
  for (const e of game.enemies) {
    const c = center(e);
    const d = Math.hypot(c.x - px, c.y - py);
    assert.ok(d >= START_SAFE_RADIUS, `${e.constructor.name} が開始地点から ${d.toFixed(0)}px`);
  }
  // 外側（260・420）の5種×2体は残る
  assert.equal(game.enemies.length, 10);
  const kinds = new Set(game.enemies.map((e) => e.constructor.name));
  for (const k of ['EnemyTank', 'EnemyAttacker', 'EnemyDrone', 'EnemySpider', 'EnemyTurret']) assert.ok(kinds.has(k), k);
});

test('地雷は開始地点のそばでもそのまま置く', () => {
  const { game, px } = world([60]);
  game.spawnManager.spawnLandmines();
  game.spawnManager.spawnEnemies();
  assert.equal(game.landmines.length, 2);
  assert.ok(game.landmines.some((m) => Math.abs(m.x - px) < START_SAFE_RADIUS));
});

test('外しても game.rng を引く回数は変わらない（週次の決定性）', () => {
  const a = world([60, 140, 260, 420]);
  a.game.spawnManager.spawnEnemies();
  const b = world([60, 140, 260, 420]);
  b.game.player = null;   // 外さない場合
  b.game.spawnManager.spawnEnemies();
  assert.equal(a.draws(), b.draws());
  assert.equal(b.game.enemies.length, 20);
});

test('敵基地は開始地点のそばでも外さない（面の目的が無くなる）', () => {
  const { game, px, py } = world([]);
  game.map.enemyBaseSpawn = { x: px + 50, y: py };
  game.spawnManager.spawnEnemies();
  assert.ok(game.base && game.enemies.includes(game.base));
  assert.ok(TILE_SIZE > 0);
});
