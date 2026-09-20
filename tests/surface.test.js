// 床の性質（utils/surface.js）
//
// 「雪の上で滑る」のは自機だけの話ではないので、自機・敵アタッカー・敵戦車が
// 同じ関数を読む。ここはその純関数の単体テスト（DOM もマップの中身も要らない）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundSlide, approachVx } from '../src/js/utils/surface.js';
import { ICE_SLIDE } from '../src/js/utils/Constants.js';

const SNOW_ENV = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const LAND_ENV = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };

/** 足元に地形がある雪の世界。groundSlide は環境しか見ないので map は最小でよい。 */
function world(env) {
  return { env, map: { isSolidAtPixel: () => true, cols: 100, rows: 100 } };
}

function entity(over = {}) {
  return { x: 100, y: 100, width: 16, height: 24, onGround: true, onTerrain: true, ...over };
}

test('雪の地形に接地していれば滑る', () => {
  assert.equal(groundSlide(entity(), world(SNOW_ENV)), ICE_SLIDE);
});

test('接地面が地形でなければ滑らない（甲板・敵の頭）', () => {
  assert.equal(groundSlide(entity({ onTerrain: false }), world(SNOW_ENV)), 0);
});

test('空中では滑らない（接地していない）', () => {
  assert.equal(groundSlide(entity({ onGround: false }), world(SNOW_ENV)), 0);
});

test('雪でない面では滑らない', () => {
  assert.equal(groundSlide(entity(), world(LAND_ENV)), 0);
});

test('grounded しか持たない敵戦車でも読める', () => {
  const tank = { x: 0, y: 0, width: 32, height: 20, grounded: true, onTerrain: true };
  assert.equal(groundSlide(tank, world(SNOW_ENV)), ICE_SLIDE);
});

test('env が無い世界（デモ画面やテストの最小 game）では 0', () => {
  assert.equal(groundSlide(entity(), { map: null }), 0);
});

test('滑らない床では目標速度がそのまま出る（陸上の現行挙動）', () => {
  assert.equal(approachVx(3, -2, 0), -2);
});

test('滑る床では前フレームの速度が残る', () => {
  const v = approachVx(3, 0, 0.94);
  assert.ok(v > 2.8 && v < 3, `残りすぎ／残らなすぎ: ${v}`);
});

test('滑る床でも、同じ目標を与え続ければ単調に近づく', () => {
  let v = 0;
  const seen = [];
  for (let i = 0; i < 60; i++) { v = approachVx(v, 2, 0.94); seen.push(v); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], '単調でない');
  assert.ok(Math.abs(seen[seen.length - 1] - 2) < 0.1, `届かない: ${seen[seen.length - 1]}`);
});

test('滑る床で目標 0 を与え続ければ必ず止まる', () => {
  let v = 3;
  for (let i = 0; i < 600; i++) v = approachVx(v, 0, 0.94);
  assert.ok(Math.abs(v) < 0.05, `止まらない: ${v}`);
});
