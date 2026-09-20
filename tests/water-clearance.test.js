// waterClearance: groundClearance の水面版。足元の中心から下方向に水面を探し、
// 見つかるまでの距離(px)を返す。既に水面に触れている（水中）なら null
// （その場合はしぶき(spawnSplash)の領分なので、ホバーのミストは出さない）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waterClearance } from '../src/js/utils/surface.js';

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

test('map か isWaterAtPixel が無ければ null', () => {
  assert.equal(waterClearance(entityAt(140), {}, 100), null);
  assert.equal(waterClearance(entityAt(140), null, 100), null);
});
