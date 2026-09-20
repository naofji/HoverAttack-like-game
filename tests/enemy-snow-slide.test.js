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
  e.onGround = false;
  e.vx = 0;
  e._applyGroundSlide(e.maxSpeed);
  assert.equal(e.vx, e.maxSpeed);
});
