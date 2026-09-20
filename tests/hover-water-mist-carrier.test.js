// キャリア（母艦）の下でも水面で水滴が舞う。hover-snow-mist-carrier.test.js の水面版。
// キャリアには重力に逆らうホバー推力が無く、浮力(_applyBuoyancy)で水面にぴったり
// 乗ったところで止まるため、下限を設けず上限(HOVER_WATER_MIST_MAX_ALT)以内なら
// 常に水滴を出す（雪煙のキャリア判定と同じ理由）。船体は左・中央・右の3等分で
// 独立に判定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, flatWaterRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE,
  HOVER_WATER_MIST_MAX_ALT, HOVER_WATER_MIST_INTERVAL,
} from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'water' };
const SURFACE_Y = 20 * TILE_SIZE; // flatWaterRows(): row 20 から下が水

function hoveringCarrier(env, clearance) {
  const game = makeGame(makeMap(['.'.repeat(24)], flatWaterRows()));
  game.env = env;
  const mists = [];
  game.spawnWaterMist = (x, y, n) => mists.push({ x, y, n });
  const c = new Carrier(game, 5 * TILE_SIZE, 0);
  c.y = SURFACE_Y - clearance - c.height;
  c.motion = env.motionAt();
  game.carrier = c;
  return { game, c, mists };
}

function callMany(fn, times = HOVER_WATER_MIST_INTERVAL) {
  for (let i = 0; i < times; i++) fn();
}

test('水面から1〜2ブロック上空にいるキャリアの下でも水滴が舞う', () => {
  const { c, mists } = hoveringCarrier(WATER, HOVER_WATER_MIST_MAX_ALT / 2);
  callMany(() => c._kickHoverWaterMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('接地に近くても(clearance=0)水滴は出る（キャリアは下限が無い）', () => {
  const { c, mists } = hoveringCarrier(WATER, 0);
  callMany(() => c._kickHoverWaterMist());
  assert.ok(mists.length > 0, '出ていない');
});

test('高すぎると出さない', () => {
  const { c, mists } = hoveringCarrier(WATER, HOVER_WATER_MIST_MAX_ALT + TILE_SIZE);
  callMany(() => c._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('水面(kind)でなければ出さない', () => {
  const LAND = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const { c, mists } = hoveringCarrier(LAND, HOVER_WATER_MIST_MAX_ALT / 2);
  callMany(() => c._kickHoverWaterMist());
  assert.deepEqual(mists, []);
});

test('左・中・右の3カ所それぞれから水滴が出る（別々の x 座標）', () => {
  const { c, mists } = hoveringCarrier(WATER, HOVER_WATER_MIST_MAX_ALT / 2);
  callMany(() => c._kickHoverWaterMist());
  const xs = [...new Set(mists.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(xs.length, 3, `発生地点が3カ所になっていない: ${xs}`);
  const [left, mid, right] = xs;
  assert.ok(left < mid && mid < right, `左<中<右になっていない: ${xs}`);
});
