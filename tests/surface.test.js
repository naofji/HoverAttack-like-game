// 床の性質（utils/surface.js）
//
// 「雪の上で滑る」のは自機だけの話ではないので、自機・敵アタッカー・敵戦車が
// 同じ関数を読む。ここはその純関数の単体テスト（DOM もマップの中身も要らない）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorSlide, groundSlide, approachVx, groundClearance, groundSlopeDirection } from '../src/js/utils/surface.js';
import { ICE_SLIDE, TILE_SIZE } from '../src/js/utils/Constants.js';
import { makeMap } from './helpers/enemy-world.js';

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

test('空中では滑らない（地形に乗っていない）', () => {
  assert.equal(groundSlide(entity({ onTerrain: false, onGround: false }), world(SNOW_ENV)), 0);
});

// 見るのは onTerrain ひとつだけ。onGround と AND を取ると、ホバー戦車のように
// 接地判定が1フレームおきに途切れる相手で「氷なのに即反転」が起きる（実測）
test('接地判定が途切れているフレームでも、地形に乗っていれば滑る', () => {
  const hovering = { x: 0, y: 0, width: 32, height: 12, grounded: false, onTerrain: true };
  assert.equal(groundSlide(hovering, world(SNOW_ENV)), ICE_SLIDE);
});

test('onTerrain を持たない相手は滑らない', () => {
  const legacy = { x: 0, y: 0, width: 16, height: 24, onGround: true };
  assert.equal(groundSlide(legacy, world(SNOW_ENV)), 0);
});

test('雪でない面では滑らない', () => {
  assert.equal(groundSlide(entity(), world(LAND_ENV)), 0);
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

// --- 床が滑るかと、その機体が滑るかは別物 -------------------------------------
// 戦車（履帯）は雪の上でも滑らないが、雪煙は上げてほしい。雪煙は床の性質なので
// floorSlide を見る、という切り分け。

test('滑らない機体（slideScale 0）でも、床は滑る床のまま', () => {
  const tank = { x: 0, y: 0, width: 32, height: 12, onTerrain: true, slideScale: 0 };
  assert.equal(groundSlide(tank, world(SNOW_ENV)), 0, '機体が滑ってしまっている');
  assert.equal(floorSlide(tank, world(SNOW_ENV)), ICE_SLIDE, '床の性質まで消えている');
});

test('slideScale を指定しない機体は床の滑りがそのまま効く', () => {
  assert.equal(groundSlide(entity(), world(SNOW_ENV)), floorSlide(entity(), world(SNOW_ENV)));
});

test('陸上では床も機体も滑らない', () => {
  assert.equal(floorSlide(entity(), world(LAND_ENV)), 0);
  assert.equal(groundSlide(entity(), world(LAND_ENV)), 0);
});

// --- groundClearance: 足元から地面までの距離 -----------------------------------
// ホバー中の雪煙（地表から1〜2ブロック上空だけ舞う）の判定に使う、
// 副作用のない純粋な探索関数。

/** 足元 y (entity.y + height) から指定 px 下に地面がある世界。 */
function worldWithGroundBelow(feetY, groundOffsetPx) {
  const groundY = feetY + groundOffsetPx;
  // 地面探しは形の問い合わせ（isSolidPoint）を読む。四角い地面なので isSolidAtPixel と同じ答え
  const solid = (x, y) => y >= groundY;
  return { map: { isSolidAtPixel: solid, isSolidPoint: solid, cols: 100, rows: 100 } };
}

test('足元のすぐ下（1ブロック未満）に地面があれば、その距離を返す', () => {
  const e = entity({ y: 100 }); // feetY = 124
  const d = groundClearance(e, worldWithGroundBelow(124, 8), 32);
  assert.ok(d !== null && d >= 4 && d <= 12, `期待した範囲外: ${d}`);
});

test('探索範囲(maxPx)より遠い地面は見つからない扱い', () => {
  const e = entity({ y: 100 }); // feetY = 124
  const d = groundClearance(e, worldWithGroundBelow(124, 48), 32);
  assert.equal(d, null);
});

test('足元がすでに地面に接していれば距離0', () => {
  const e = entity({ y: 100 }); // feetY = 124
  const d = groundClearance(e, worldWithGroundBelow(124, 0), 32);
  assert.equal(d, 0);
});

test('map が無い世界（デモ画面など）では null', () => {
  const e = entity({ y: 100 });
  assert.equal(groundClearance(e, { map: null }, 32), null);
});

// --- groundSlopeDirection: 探した地面が坂かどうか ------------------------------
// ホバー中の雪煙を、平地では横に・斜面では斜辺に沿わせるための判定。
// 足元中心の列で見つかった地面の、タイルの形（utils/tileShape.js）の上面の傾きを返す。

// 右へ上る階段。5面と同じ形の規則では (3,2)(2,3)(1,4) が斜めのタイルの坂になる
const STAIRS = ['......', '....##', '...###', '..####', '######'];

test('坂の上では上面の傾き（+1 = 右へ上る）を返す。地面がタイルの上端で見つかっていても斜辺を探す', () => {
  const map = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
  const e = entity({ x: 2 * TILE_SIZE + 4 - 8, y: 0, height: 0 }); // 中心 x = 2T+4（(3,2) の坂、斜辺は y = 3T+12）
  assert.equal(groundSlopeDirection(e, { map }, 3 * TILE_SIZE), 1);       // タイルの上端（斜辺より上）
  assert.equal(groundSlopeDirection(e, { map }, 3 * TILE_SIZE + 12), 1);  // 斜辺そのもの
});

test('平らな床では 0', () => {
  const map = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
  const e = entity({ x: 4 - 8, y: 0, height: 0 }); // 中心 x = 4（列 0 の床、row 4）
  assert.equal(groundSlopeDirection(e, { map }, 4 * TILE_SIZE), 0);
});

test('四角い形の規則の地図では、階段の並びでも 0（坂は形が持つ）', () => {
  const map = makeMap(STAIRS);
  const e = entity({ x: 2 * TILE_SIZE + 4 - 8, y: 0, height: 0 });
  assert.equal(groundSlopeDirection(e, { map }, 3 * TILE_SIZE), 0);
});

test('地面が見つかっていない(clearance が null)なら 0', () => {
  const map = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
  const e = entity({ x: 2 * TILE_SIZE + 4 - 8, y: 0, height: 0 });
  assert.equal(groundSlopeDirection(e, { map }, null), 0);
});

test('map が無い世界では 0', () => {
  const e = entity({ x: 160 - 8, y: 0, height: 0 });
  const d = groundSlopeDirection(e, { map: null }, 10 * TILE_SIZE);
  assert.equal(d, 0);
});
