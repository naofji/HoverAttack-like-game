// ホバー中、雪の地形から1〜2ブロック上空を漂っているときだけ地表で粉雪が舞う。
//
// 接地中の雪煙（SNOW_KICK: 着地・滑走・歩行）とは別条件。こちらは onTerrain が
// 立っていない（＝ホバー中）ときの、地面までの距離(groundClearance)だけで決まる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, PLAYER_HEIGHT, ICE_SLIDE,
  HOVER_SNOW_MIST_MIN_ALT, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const FLOOR_Y = 20 * TILE_SIZE; // flatFloorRows(): row 20 から下が地形

/** 自機を、床から clearance px 上でホバーさせた状態で置く（onTerrain=false）。 */
function hoveringPlayer(env, clearance) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = env;
  const mists = [];
  game.spawnSnowMist = (x, y, n) => mists.push(n);
  const p = new Player(game, 5 * TILE_SIZE, FLOOR_Y - clearance - PLAYER_HEIGHT);
  p.onGround = false;
  p.onTerrain = false;
  p.motion = env.motionAt();
  game.player = p;
  return { game, p, mists };
}

/** インターバル分だけ呼んで、実際に撒かれたかを見る。 */
function callMany(fn, times = HOVER_SNOW_MIST_INTERVAL) {
  for (let i = 0; i < times; i++) fn();
}

test('雪面から1〜2ブロック上空でホバーしていると粉雪が舞う', () => {
  const { p, mists } = hoveringPlayer(SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => p._kickHoverSnowMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('接地していれば(onTerrain=true)ホバー粉雪は出さない（SNOW_KICK 側の担当）', () => {
  const { p, mists } = hoveringPlayer(SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  p.onTerrain = true;
  callMany(() => p._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

test('高すぎる（2ブロックより上）と出さない', () => {
  const { p, mists } = hoveringPlayer(SNOW, HOVER_SNOW_MIST_MAX_ALT + TILE_SIZE);
  callMany(() => p._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

test('低すぎる（1ブロック未満）と出さない（着地・滑走の SNOW_KICK に任せる）', () => {
  const { p, mists } = hoveringPlayer(SNOW, HOVER_SNOW_MIST_MIN_ALT - 4);
  callMany(() => p._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

test('雪の面でなければ出さない', () => {
  const LAND = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const { p, mists } = hoveringPlayer(LAND, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => p._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

test('毎フレームは撒かない（HOVER_SNOW_MIST_INTERVAL で間引く）', () => {
  const { p, mists } = hoveringPlayer(SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  for (let i = 0; i < HOVER_SNOW_MIST_INTERVAL - 1; i++) p._kickHoverSnowMist();
  assert.deepEqual(mists, [], `間引き前に撒かれている: ${mists.length}回`);
});

// --- 敵アタッカー --------------------------------------------------------------

function hoveringAttacker(clearance) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = SNOW;
  const mists = [];
  game.spawnSnowMist = (x, y, n) => mists.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const e = makeAttacker(game, 200, FLOOR_Y - clearance - 24, 'standard');
  e.onGround = false;
  e.onTerrain = false;
  e.motion = SNOW.motionAt();
  return { game, e, mists };
}

test('敵アタッカーも雪面の1〜2ブロック上空でホバーしていると粉雪が舞う', () => {
  const { e, mists } = hoveringAttacker((HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => e._kickHoverSnowMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('敵アタッカーは画面外なら粉雪を撒かない（particles を食い潰さないため）', () => {
  const { game, e, mists } = hoveringAttacker((HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  game.camera = { x: 5000, y: 0 }; // 画面の遥か外
  callMany(() => e._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});
