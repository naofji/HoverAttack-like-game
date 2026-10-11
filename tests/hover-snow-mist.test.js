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
  HOVER_SNOW_MIST_MIN_ALT, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL, HOVER_SNOW_MIST_BURST_COUNT,
  HOVER_SNOW_MIST_COUNT, HOVER_MAX_FUEL,
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

test('下限は 0: 足元が雪面すれすれ（0px）でも、空中なら出る。接地中（onTerrain）は出ない（SNOW_KICK に任せる）', () => {
  assert.equal(HOVER_SNOW_MIST_MIN_ALT, 0, 'ユーザー指定: 雪が舞う条件の地面との距離の下限は 0');
  for (const clearance of [0, 2, 4, 6]) {
    const { p, mists } = hoveringPlayer(SNOW, clearance);
    callMany(() => p._kickHoverSnowMist());
    assert.ok(mists.length > 0, `${clearance}px で出ていない`);
  }
  const { p, mists } = hoveringPlayer(SNOW, 0);
  p.onTerrain = true;
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

// --- バースト（飛び立つ瞬間）-------------------------------------------------------
// 水面の水滴は「バーストの直後は、ホバーしていなくても出す」。雪面にも同じことを求められた。
// ホバーの粉雪は INTERVAL(4F) おきの間引きなので、バーストの 1 フレーム目に出るかは位相次第だった

/** 床の上に立った自機。W を押した入力を渡して _updateBurstHover を回すと、バーストジャンプになる */
function standingPlayer(env) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = env;
  const mists = [];
  game.spawnSnowMist = (x, y, n) => mists.push(n);
  const p = new Player(game, 5 * TILE_SIZE, FLOOR_Y - PLAYER_HEIGHT);
  p.onGround = true;
  p.onTerrain = true;
  p.hoverFuel = HOVER_MAX_FUEL;
  p.motion = env.motionAt();
  game.player = p;
  const input = { isKeyDown: (k) => k === 'KeyW' };
  return { game, p, mists, input };
}
/** バーストの 1 フレーム目: 飛び立って、足元が 6px 上がった状態で粉雪の判定が来る */
function burstFrame(p, input) {
  p._updateBurstHover(input);
  assert.equal(p.onGround, false, '前提: バーストで飛び立った');
  p.y -= 6;
  p.onTerrain = false;
  p._kickHoverSnowMist();
}

test('バーストで飛び立つ瞬間に、間引きを待たず粉雪が 1 回（HOVER_SNOW_MIST_BURST_COUNT）出る。どの位相でも', () => {
  assert.ok(HOVER_SNOW_MIST_BURST_COUNT > HOVER_SNOW_MIST_COUNT, 'バーストはホバー中の粉雪より多め');
  for (let phase = 0; phase < HOVER_SNOW_MIST_INTERVAL; phase++) {
    const { p, mists, input } = standingPlayer(SNOW);
    p._hoverMistTimer = phase;
    burstFrame(p, input);
    assert.deepEqual(mists, [HOVER_SNOW_MIST_BURST_COUNT], `位相 ${phase}`);
  }
});

test('バーストの粉雪は 1 回だけ。続く間引きは INTERVAL 後（バースト直後に続けて出さない。間引きの位相はバーストで数え直す）', () => {
  const { p, mists, input } = standingPlayer(SNOW);
  p._hoverMistTimer = HOVER_SNOW_MIST_INTERVAL - 2;   // 直前までの位相が進んでいても
  burstFrame(p, input);
  for (let i = 0; i < HOVER_SNOW_MIST_INTERVAL - 1; i++) p._kickHoverSnowMist();
  assert.deepEqual(mists, [HOVER_SNOW_MIST_BURST_COUNT]);
  p._kickHoverSnowMist();
  assert.deepEqual(mists, [HOVER_SNOW_MIST_BURST_COUNT, HOVER_SNOW_MIST_COUNT]);
});

test('雪の面でないステージのバーストは、粉雪の印を立てない（あとで雪の面へ移っても古い印が効かない）', () => {
  const LAND = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const { p, mists, input } = standingPlayer(LAND);
  p._updateBurstHover(input);
  assert.equal(p._burstSnowPuff, false);
  assert.deepEqual(mists, []);
});

test('バーストの印は、条件に合わず出せなかった呼び出しでも使い切る（あとの呼び出しで古い印が効かない）', () => {
  const { p, mists, input } = standingPlayer(SNOW);
  p._updateBurstHover(input);
  p.onTerrain = true;            // まだ接地扱い: 出せない
  p._kickHoverSnowMist();
  assert.equal(p._burstSnowPuff, false);
  p.onTerrain = false;
  p.y -= 20;
  p._hoverMistTimer = 0;
  p._kickHoverSnowMist();        // 印が残っていれば、ここで間引き無しに出てしまう
  assert.deepEqual(mists, []);
});

test('敵アタッカーのジャンプでも、飛び立つ瞬間に粉雪が 1 回（画面内）。画面外では出さず、印も残さない', () => {
  const { e, mists } = hoveringAttacker(0);
  e._hoverMistTimer = 1;
  e._jump();
  e.onTerrain = false;
  e._kickHoverSnowMist();
  assert.deepEqual(mists, [HOVER_SNOW_MIST_BURST_COUNT]);

  const off = hoveringAttacker(0);
  off.game.camera = { x: 5000, y: 0 };
  off.e._jump();
  off.e._kickHoverSnowMist();
  assert.deepEqual(off.mists, []);
  assert.equal(off.e._burstSnowPuff, false);
  off.game.camera = { x: 0, y: 0 };
  off.e._hoverMistTimer = 0;
  off.e._kickHoverSnowMist();
  assert.deepEqual(off.mists, [], '画面外で使い切った印があとで効いた');
});

test('敵アタッカーの下限も 0（足元が雪面すれすれでも空中なら出る）', () => {
  const { e, mists } = hoveringAttacker(0);
  callMany(() => e._kickHoverSnowMist());
  assert.ok(mists.length > 0);
});
