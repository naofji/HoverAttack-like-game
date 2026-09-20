// 敵も雪の上では滑る（自機と同じ床の上に乗っている、という整理）。
// AI の分岐には手を入れず、AI が決めた vx を「目標速度」として扱う。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { ICE_SLIDE, TILE_SIZE, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function snowGame() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = SNOW;
  game.spawnSnowKick = () => {};
  return game;
}

/** 床の上に立たせて接地させる。 */
function grounded(game, typeKey = 'standard') {
  const e = makeAttacker(game, 200, 20 * TILE_SIZE - PLAYER_HEIGHT, typeKey);
  for (let i = 0; i < 3; i++) e.update();
  return e;
}

test('雪の地形に接地していれば onTerrain が立つ', () => {
  const e = grounded(snowGame());
  assert.equal(e.onGround, true, '接地していない');
  assert.equal(e.onTerrain, true);
});

test('雪の上では目標速度に一発で届かない（滑る）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = 0;
  const desired = e.maxSpeed;
  e._applyGroundSlide(desired);     // 1フレームぶん
  assert.ok(Math.abs(e.vx) < desired * 0.9, `氷の上で一発で届いている: ${e.vx}`);
  assert.ok(Math.abs(e.vx) > 0, '一切動いていない');
});

test('陸上では目標速度がそのまま出る（現行の挙動を変えない）', () => {
  const game = makeGame(makeMap(flatFloorRows()));   // env 無し＝陸上
  const e = grounded(game);
  e.vx = 0;
  e._applyGroundSlide(1.2);
  assert.equal(e.vx, 1.2);
});

test('雪の上でも、同じ向きを出し続ければ最高速に達する', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = 0;
  for (let i = 0; i < 120; i++) e._applyGroundSlide(e.maxSpeed);
  assert.ok(Math.abs(e.vx - e.maxSpeed) < 0.05, `最高速に届かない: ${e.vx}`);
});

test('雪の上では急に止まれない（目標 0 を出しても数フレーム流れる）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = e.maxSpeed;
  e._applyGroundSlide(0);
  assert.ok(Math.abs(e.vx) > e.maxSpeed * 0.5, `即止まっている: ${e.vx}`);
});

test('空中では滑りを掛けない（従来どおり AI の値がそのまま出る）', () => {
  const game = snowGame();
  const e = grounded(game);
  // 空中＝地形に乗っていない。_moveAndCollide が毎フレームこの2つを倒す
  e.onGround = false;
  e.onTerrain = false;
  e.vx = 0;
  e._applyGroundSlide(e.maxSpeed);
  assert.equal(e.vx, e.maxSpeed);
});

// --- 敵戦車 -------------------------------------------------------------------

import { EnemyTank } from '../src/js/entities/EnemyTank.js';

function tankOn(game) {
  const t = new EnemyTank(game, 200, 20 * TILE_SIZE - 20);
  game.enemies.push(t);
  for (let i = 0; i < 3; i++) t.update();
  return t;
}

test('戦車は雪の地形で向きを変えても即座には反転しない（滑る）', () => {
  const game = snowGame();
  const t = tankOn(game);
  // 右へ進みきった状態から、巡回方向だけ反転させる
  t.patrolDir = 1;
  for (let i = 0; i < 60; i++) t.update();
  assert.ok(t.vx > 0, `右へ進んでいない: ${t.vx}`);
  t.patrolDir = -1;
  t.update();
  assert.ok(t.vx > 0, `氷の上で1フレームで反転している: ${t.vx}`);
});

test('戦車は陸上では今までどおり即座に反転する', () => {
  const game = makeGame(makeMap(flatFloorRows()));   // 陸上
  game.spawnSnowKick = () => {};
  const t = tankOn(game);
  t.patrolDir = 1;
  for (let i = 0; i < 60; i++) t.update();
  t.patrolDir = -1;
  t.update();
  assert.ok(t.vx < 0, `陸上なのに反転が鈍っている: ${t.vx}`);
});

// --- 敵アタッカーの雪煙 --------------------------------------------------------

import { SNOW_KICK_WALK, ENEMY_SNOW_KICK_MIN_SPEED } from '../src/js/utils/Constants.js';

/** 雪煙の記録を取る世界。画面内判定のために camera / canvas も置く。 */
function kickGame() {
  const game = snowGame();
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  return game;
}

test('雪の地形を歩く敵アタッカーは雪を蹴る', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.vx = ENEMY_SNOW_KICK_MIN_SPEED + 0.5;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, [SNOW_KICK_WALK]);
});

test('止まっている敵アタッカーは雪を蹴らない', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.vx = 0;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});

test('空中の敵アタッカーは雪を蹴らない', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.onGround = false;
  e.onTerrain = false;
  e.vx = 2;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});

test('陸上の面では雪を蹴らない', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const e = grounded(game);
  e.vx = 2;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});
