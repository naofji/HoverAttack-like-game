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

// 規則は自機と同じ（Player._updateHorizontal）: 動きたい向きがあれば目標の速さがそのまま出て、
// 滑るのは止まりたいときの惰性だけ。歩き出しまで追従させると坂の下り加速が積み上がって
// 雪の坂を上れなくなる（tests/attacker-slope.test.js の巡回のテストが落ちた）
test('雪の上でも、動きたい向きがあれば目標速度がそのまま出る（自機と同じ）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = 0;
  e._applyGroundSlide(e.maxSpeed);
  assert.equal(e.vx, e.maxSpeed);
  e._applyGroundSlide(-e.maxSpeed);   // 切り返しもすぐ効く
  assert.equal(e.vx, -e.maxSpeed);
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

// --- update() を通した経路 ---------------------------------------------------
// 上の4本は _applyGroundSlide を直接呼ぶので、update() の中で AI が先に this.vx を
// 目標で上書きしてしまう不具合（前の速さ＝目標になって滑りが消える）を見逃していた。
// ここでは update() を丸ごと回し、AI の出す目標だけを差し替えて確かめる。

/** AI の目標速度を固定する（AI の分岐に依らず、update() の順序だけを試す）。 */
function forceDesired(e, desired) {
  e._updateMovement = function () { this.vx = desired; };
}

test('update() を通しても、雪の上では急に止まれない', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = e.maxSpeed;
  forceDesired(e, 0);
  e.update();
  assert.equal(e.onTerrain, true, '雪の床に乗っていない');
  assert.ok(Math.abs(e.vx) > e.maxSpeed * 0.5, `update() で即止まっている: ${e.vx}`);
});

test('update() を通すと、雪の上では止まりたくなってから数フレーム流れて止まる', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = e.maxSpeed;
  forceDesired(e, 0);
  let frames = 0;
  while (e.vx !== 0 && frames < 300) { e.update(); frames++; }
  assert.equal(e.vx, 0, '止まらない');
  assert.ok(frames > 10, `すぐ止まっている: ${frames} フレーム`);
});

test('update() を通しても、陸上では目標速度がそのまま出る', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const e = grounded(game);
  e.vx = e.maxSpeed;
  forceDesired(e, 0);
  e.update();
  assert.equal(e.vx, 0);
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

// 戦車は履帯なので滑らない（実機の指摘）。滑らせたら雪の坂を上れなくなった。
// 原因は _applySnowSlope の下り加速(-0.06/frame)で、以前は毎フレーム巡回速度で
// 上書きされて消えていたものが、速度追従を入れたことで前フレームに持ち越され、
// 約 -0.94px/frame の定常ドリフトになって上り速度を食い潰していた。

/** 右へ下る階段（列 10..19）。左へ進む＝上り。 */
function slopeRows() {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 30; c++) {
      let floor = 20;
      if (c >= 10 && c < 20) floor = 11 + (c - 10);
      if (c < 10) floor = 11;
      s += r >= floor ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

/** 階段の下端から上りへ向かわせ、600フレームで稼いだ高さを返す。 */
function climbHeight(game) {
  const t = new EnemyTank(game, 19 * TILE_SIZE, 19 * TILE_SIZE);
  game.enemies.push(t);
  t.patrolDir = -1;
  const y0 = t.y;
  for (let i = 0; i < 600; i++) {
    t.update();
    if (t.patrolDir > 0) t.patrolDir = -1;   // 端で折り返しても上りへ向け直す
  }
  return y0 - t.y;
}

test('戦車は雪の坂も陸上と同じように上れる（滑らない）', () => {
  const land = makeGame(makeMap(slopeRows()));
  land.spawnSnowKick = () => {};
  // 雪は5面と同じ形の規則（階段は斜めのタイルの坂）。陸上は四角い階段を1段ずつ乗り上げる
  const snow = makeGame(makeMap(slopeRows(), null, { tileShape: 'snowSlope' }));
  snow.env = SNOW;
  snow.spawnSnowKick = () => {};

  const onLand = climbHeight(land);
  const onSnow = climbHeight(snow);
  assert.ok(onLand > 100, `前提が崩れている（陸上でも上れていない）: ${onLand}`);
  assert.ok(onSnow > onLand * 0.8,
    `雪で坂を上れなくなっている: 陸上 ${onLand}px に対し ${onSnow}px`);
});

test('戦車は雪の上でも即座に反転する（履帯なので滑らない）', () => {
  const game = snowGame();
  const t = tankOn(game);
  t.patrolDir = 1;
  for (let i = 0; i < 60; i++) t.update();
  assert.ok(t.vx > 0, `右へ進んでいない: ${t.vx}`);
  t.patrolDir = -1;
  t.update();
  assert.ok(t.vx < 0, `雪の上で反転が鈍っている: ${t.vx}`);
});

test('滑らなくても雪煙は上がる（床が雪かどうかで決まる）', () => {
  const game = snowGame();
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const t = tankOn(game);
  game.snowKicks.length = 0;
  for (let i = 0; i < 10; i++) t.update();
  assert.ok(game.snowKicks.length > 0, '雪の上を走っているのに雪煙が出ない');
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

test('滑らない設定のアタッカーでも雪煙は出る（雪煙は床の性質）', () => {
  // 戦車と同じ「履帯なので滑らない」設定を敵アタッカーに与えても、雪煙だけは
  // 残ること。雪煙の判定を機体の滑り(groundSlide)で書くとここが落ちる
  const game = kickGame();
  const e = grounded(game);
  e.slideScale = 0;
  game.snowKicks.length = 0;
  e.vx = ENEMY_SNOW_KICK_MIN_SPEED + 0.5;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, [SNOW_KICK_WALK]);
});
