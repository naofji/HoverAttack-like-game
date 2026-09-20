// キャリアが水面に浮く。キャリアには重力に逆らうホバー推力が無く、通常は
// ソリッドタイル(isSolidAtPixel)にぶつかった位置で止まるだけなので、当たり判定を
// 持たない水の上では底（あるいは無い床）まで沈んでしまう。_applyBuoyancy が
// 水面(map.getSurfaceY)を疑似的な床として扱い、船体の底が液面に一致した高さで
// 止める。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, flatFloorRows, flatWaterRows } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'water' };
const SURFACE_Y = 20 * TILE_SIZE; // flatWaterRows(): row 20 から下が水

function carrierAboveWater(startY) {
  const openRows = [];
  for (let r = 0; r < 24; r++) openRows.push('.'.repeat(24)); // ソリッドは無し
  const game = makeGame(makeMap(openRows, flatWaterRows()));
  game.env = WATER;
  const c = new Carrier(game, 5 * TILE_SIZE, startY);
  game.carrier = c;
  return { game, c };
}

test('水面の上空から落とすと、船体の底が液面で止まる（沈まない）', () => {
  const { c } = carrierAboveWater(SURFACE_Y - 100);
  for (let i = 0; i < 200; i++) c.update();
  assert.ok(c.y + c.height <= SURFACE_Y + 0.5, `液面より沈んでいる: bottom=${c.y + c.height}`);
  assert.ok(c.y + c.height >= SURFACE_Y - 0.5, `液面から浮きすぎている: bottom=${c.y + c.height}`);
});

test('液面で止まると vy が 0 になる', () => {
  const { c } = carrierAboveWater(SURFACE_Y - 100);
  for (let i = 0; i < 200; i++) c.update();
  assert.equal(c.vy, 0);
});

test('陸地では通常どおりソリッドな床に着地する（浮力の影響を受けない）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const c = new Carrier(game, 5 * TILE_SIZE, 0);
  game.carrier = c;
  const floorY = 20 * TILE_SIZE;
  for (let i = 0; i < 200; i++) c.update();
  assert.ok(Math.abs((c.y + c.height) - floorY) < 1, `床に着地していない: bottom=${c.y + c.height}`);
});
