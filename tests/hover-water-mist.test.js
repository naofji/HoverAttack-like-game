// ホバー中、水面から1〜2ブロック上空を漂っているときだけ水面で水滴が舞う。
// hover-snow-mist.test.js の水面版。雪は「床の slide」で面を判定したが、
// 水は「床」を持たない（onTerrain は解決しない）ので env.kind === 'water' と
// waterClearance（水面までの距離）で判定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, makeAttacker, flatWaterRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, PLAYER_HEIGHT,
  HOVER_WATER_MIST_MIN_ALT, HOVER_WATER_MIST_MAX_ALT, HOVER_WATER_MIST_INTERVAL,
} from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'water' };
const SURFACE_Y = 20 * TILE_SIZE; // flatWaterRows(): row 20 から下が水

const EMPTY_WORLD_ROWS = Array.from({ length: 24 }, () => '.'.repeat(24));

/** 自機を、水面から clearance px 上でホバーさせた状態で置く。 */
function hoveringPlayer(env, clearance) {
  const game = makeGame(makeMap(EMPTY_WORLD_ROWS, flatWaterRows()));
  game.env = env;
  const mists = [];
  game.spawnWaterMist = (x, y, n) => mists.push(n);
  const p = new Player(game, 5 * TILE_SIZE, SURFACE_Y - clearance - PLAYER_HEIGHT);
  p.onGround = false;
  p.onTerrain = false;
  p.hovering = true;
  p.motion = env.motionAt();
  game.player = p;
  return { game, p, mists };
}

function callMany(fn, times = HOVER_WATER_MIST_INTERVAL) {
  for (let i = 0; i < times; i++) fn();
}

test('水面から1〜2ブロック上空でホバーしていると水滴が舞う', () => {
  const { p, mists } = hoveringPlayer(WATER, (HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  callMany(() => p._kickHoverWaterMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('水面に近いほど多くの水滴が舞う（近距離 > 遠距離）', () => {
  const near = hoveringPlayer(WATER, HOVER_WATER_MIST_MIN_ALT + 2);
  const far = hoveringPlayer(WATER, HOVER_WATER_MIST_MAX_ALT - 2);
  callMany(() => near.p._kickHoverWaterMist());
  callMany(() => far.p._kickHoverWaterMist());
  assert.ok(near.mists.length > 0 && far.mists.length > 0);
  assert.ok(near.mists[0] > far.mists[0], `近いほう(${near.mists[0]})が遠いほう(${far.mists[0]})より多くない`);
});

test('ホバー（スラスター）していなければ水滴は出さない', () => {
  const { p, mists } = hoveringPlayer(WATER, (HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  p.hovering = false;
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('接地していれば（onGround / onTerrain）水滴は出さない', () => {
  const { p, mists } = hoveringPlayer(WATER, (HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  p.onGround = true;
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);

  p.onGround = false;
  p.onTerrain = true;
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('高すぎる（3ブロックより上）と出さない', () => {
  const { p, mists } = hoveringPlayer(WATER, HOVER_WATER_MIST_MAX_ALT + TILE_SIZE);
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('低すぎる（0.5ブロック未満）と出さない', () => {
  const { p, mists } = hoveringPlayer(WATER, HOVER_WATER_MIST_MIN_ALT - 4);
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('水面(kind)でなければ出さない', () => {
  const LAND = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const { p, mists } = hoveringPlayer(LAND, (HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('毎フレームは撒かない（HOVER_WATER_MIST_INTERVAL で間引く）', () => {
  const { p, mists } = hoveringPlayer(WATER, (HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  for (let i = 0; i < HOVER_WATER_MIST_INTERVAL - 1; i++) p._kickHoverWaterMist();
  assert.deepEqual(mists, [], `間引き前に撒かれている: ${mists.length}回`);
});

test('すでに水中(waterClearance が null)なら出さない（しぶきの領分）', () => {
  const { p, mists } = hoveringPlayer(WATER, 0);
  // 足元ちょうどを水面に触れさせる
  p.y = SURFACE_Y - PLAYER_HEIGHT;
  callMany(() => p._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

// --- 敵アタッカー --------------------------------------------------------------

function hoveringAttacker(clearance) {
  const game = makeGame(makeMap(EMPTY_WORLD_ROWS, flatWaterRows()));
  game.env = WATER;
  const mists = [];
  game.spawnWaterMist = (x, y, n) => mists.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const e = makeAttacker(game, 200, SURFACE_Y - clearance - 24, 'standard');
  e.onGround = false;
  e.onTerrain = false;
  e.hovering = true;
  e.motion = WATER.motionAt();
  return { game, e, mists };
}

test('敵アタッカーも水面の1〜2ブロック上空でホバーしていると水滴が舞う', () => {
  const { e, mists } = hoveringAttacker((HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  callMany(() => e._kickHoverWaterMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('敵アタッカーもホバーしていなければ水滴は出さない', () => {
  const { e, mists } = hoveringAttacker((HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  e.hovering = false;
  callMany(() => e._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('敵アタッカーも接地していれば水滴は出さない', () => {
  const { e, mists } = hoveringAttacker((HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  e.onGround = true;
  callMany(() => e._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('敵アタッカーは画面外なら水滴を撒かない（particles を食い潰さないため）', () => {
  const { game, e, mists } = hoveringAttacker((HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  game.camera = { x: 5000, y: 0 };
  callMany(() => e._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});
