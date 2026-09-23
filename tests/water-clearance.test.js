// waterClearance: groundClearance の水面版。足元の中心から下方向に水面を探し、
// 見つかるまでの距離(px)を返す。既に水面に触れている（水中）なら null
// （その場合はしぶき(spawnSplash)の領分なので、ホバーのミストは出さない）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waterClearance, hoverWaterMistCount, hoverWaterMistCloseness } from '../src/js/utils/surface.js';
import {
  HOVER_WATER_MIST_MIN_ALT,
  HOVER_WATER_MIST_MAX_ALT,
  HOVER_WATER_MIST_MIN_COUNT,
  HOVER_WATER_MIST_MAX_COUNT,
} from '../src/js/utils/Constants.js';

const TILE = 16;

/** row 以上が水になっている最小マップ。 */
function waterBelow(row) {
  return {
    isWaterAtPixel: (x, y) => Math.floor(y / TILE) >= row,
  };
}

function entityAt(feetY) {
  return { x: 0, y: feetY - 10, width: 10, height: 10 };
}

test('水面までの距離を4px刻みで返す', () => {
  const map = waterBelow(10); // 水面 y=160
  const game = { map };
  const e = entityAt(160 - 20); // 足元 y=140、水面まで20px
  const d = waterClearance(e, game, 100);
  assert.equal(d, 20);
});

test('maxPx 以内に水が無ければ null', () => {
  const map = waterBelow(100); // ずっと下
  const game = { map };
  const e = entityAt(140);
  assert.equal(waterClearance(e, game, 20), null);
});

test('既に水に触れていれば null（しぶきの領分）', () => {
  const map = waterBelow(0); // どこでも水
  const game = { map };
  const e = entityAt(140);
  assert.equal(waterClearance(e, game, 100), null);
});

test('途中に地形（岩ブロック等）があれば null（岩を貫通しない）', () => {
  // 水面 y=160、足元 y=140
  // 足元と水面の間に岩（y=148〜164、row 9〜10）がある
  const map = {
    isWaterAtPixel: (x, y) => Math.floor(y / TILE) >= 10,
    isSolidAtPixel: (x, y) => Math.floor(y / TILE) === 9,
  };
  const game = { map };
  const e = entityAt(140);
  assert.equal(waterClearance(e, game, 100), null);
});

test('機体が水中にいる（inWater または中心が水中）なら null', () => {
  const map = waterBelow(5); // 水面 y=80
  const game = { map };
  const e = entityAt(140); // 胴体も足元も水中
  assert.equal(waterClearance(e, game, 100), null);

  const eInWater = entityAt(60); // 足元 y=60（水面上空）だが inWater=true
  eInWater.inWater = true;
  assert.equal(waterClearance(eInWater, game, 100), null);
});

test('map か isWaterAtPixel が無ければ null', () => {
  assert.equal(waterClearance(entityAt(140), {}, 100), null);
  assert.equal(waterClearance(entityAt(140), null, 100), null);
});

test('hoverWaterMistCount: 距離が近いほど多く、遠いほど少ない', () => {
  const nearCount = hoverWaterMistCount(HOVER_WATER_MIST_MIN_ALT);
  const midCount = hoverWaterMistCount((HOVER_WATER_MIST_MIN_ALT + HOVER_WATER_MIST_MAX_ALT) / 2);
  const farCount = hoverWaterMistCount(HOVER_WATER_MIST_MAX_ALT);

  assert.equal(nearCount, HOVER_WATER_MIST_MAX_COUNT);
  assert.equal(farCount, HOVER_WATER_MIST_MIN_COUNT);
  assert.ok(nearCount > midCount);
  assert.ok(midCount > farCount);

  // 範囲外のクランプ
  assert.equal(hoverWaterMistCount(0), HOVER_WATER_MIST_MAX_COUNT);
  assert.equal(hoverWaterMistCount(HOVER_WATER_MIST_MAX_ALT + 100), HOVER_WATER_MIST_MIN_COUNT);
});
