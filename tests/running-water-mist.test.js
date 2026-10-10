// 床を流れる水（running water）の上でもホバーの水滴が舞う（2026-10-11 ユーザー指定）。
//
// 床を流れる水は描画だけの帯（厚さ RUNNING_WATER_THICKNESS）で、水のセルとしては空なので
// isWaterAtPixel では見つからない。描画が毎フレーム組み立てる帯の一覧を waterClearance が読む。
// 地形は waterfall-runs.test.js の LEFT_SPILL と同じ（岩の口(列2)から出て床に着き、床を右へ
// 流れて列6の縁から落ちる。床の水は行3、y = 4*T - TH から TH の厚さ）。

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeWaterMap } from './helpers/water-map.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { waterClearance } from '../src/js/utils/surface.js';
import {
  TILE_SIZE as T, RUNNING_WATER_THICKNESS as TH, HOVER_WATER_MIST_MAX_ALT, HOVER_WATER_MIST_INTERVAL,
} from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
});

const LEFT_SPILL = `
  ##########
  ..1.......
  ..1.......
  ..........
  ######....
  ..........
  ..........
  ..........
  ##########
`;
const SHEET_Y = 4 * T - TH;
const X = 4 * T + T / 2;   // 床を流れる水の途中（列4の中央）

/** 実物の描画を1回走らせて、床を流れる水の帯を組み立てさせる */
async function drawnWorld() {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const map = makeWaterMap(LEFT_SPILL);
  const renderer = createWaterRenderer({ game: { map } });
  renderer.drawOverWorld(makeFakeCtx(), 0, 0);
  const env = { kind: 'water', renderer, motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1 };
  return { map, renderer, env };
}

test('描画は、描いた床を流れる水の帯の場所を答えられる', async () => {
  const { map, renderer } = await drawnWorld();
  assert.ok(!map.isWaterAtPixel(X, SHEET_Y + 1), '前提: セルとしては水ではない');
  assert.equal(renderer.isRunningWaterAt(X, SHEET_Y), true);
  assert.equal(renderer.isRunningWaterAt(X, SHEET_Y + TH - 1), true);
  assert.equal(renderer.isRunningWaterAt(X, SHEET_Y - 1), false, '帯の上は空気');
  assert.equal(renderer.isRunningWaterAt(8 * T + T / 2, SHEET_Y), false, '帯の無い列');
});

test('waterClearance は床を流れる水も水面として距離を返す', async () => {
  const { map, env } = await drawnWorld();
  const game = { map, env };
  const feet = SHEET_Y - 20;
  const entity = { x: X - 4, y: feet - 16, width: 8, height: 16 };
  const d = waterClearance(entity, game, HOVER_WATER_MIST_MAX_ALT);
  assert.ok(d !== null, '水面が見つからない');
  assert.ok(Math.abs(d - 20) < 4, `距離 ${d}（4px 刻みで 20 前後のはず）`);
});

test('床を流れる水の帯（3px）は、4px 刻みの走査の刻みがどこにあっても見つかる', async () => {
  // 帯は床の上面に貼り付いた厚さ TH(3px) で、走査は 4px 刻み。足元の位置によっては刻みが
  // 帯を飛び越して床に当たり「水面なし」になった（キャリアのテストで見つかった）
  const { map, env } = await drawnWorld();
  const game = { map, env };
  for (let off = 0; off < 4; off++) {
    const feet = SHEET_Y - 16 - off;
    const d = waterClearance({ x: X - 4, y: feet - 16, width: 8, height: 16 }, game, HOVER_WATER_MIST_MAX_ALT);
    // 刻みが帯の途中に当たれば、帯の上端ではなくその深さが返る（4px の分解能）
    assert.ok(d !== null && d >= 16 + off && d < 16 + off + TH, `足元が帯の ${16 + off}px 上のとき: ${d}`);
  }
});

test('自機が床を流れる水の上でホバーすると水滴が舞う', async () => {
  const { Player } = await import('../src/js/entities/Player.js');
  const { PLAYER_HEIGHT, PLAYER_WIDTH } = await import('../src/js/utils/Constants.js');
  const { map, env } = await drawnWorld();
  const mists = [];
  const game = { map, env, spawnWaterMist: (x, y, n) => mists.push({ x, y, n }) };
  const p = new Player(game, X - PLAYER_WIDTH / 2, SHEET_Y - 16 - PLAYER_HEIGHT);
  p.onGround = false;
  p.onTerrain = false;
  p.hovering = true;
  for (let i = 0; i < HOVER_WATER_MIST_INTERVAL; i++) p._kickHoverWaterMist();
  assert.ok(mists.length > 0, '一度も撒かれていない');
  assert.ok(Math.abs(mists[0].y - SHEET_Y) < 4, `水滴は床の水の上面に出る（${mists[0].y}）`);
});

test('床を流れる水の上に止まっているキャリアの下でも水滴が舞う', async () => {
  const { Carrier } = await import('../src/js/entities/Carrier.js');
  const { map, env } = await drawnWorld();
  const mists = [];
  const game = { map, env, spawnWaterMist: (x, y, n) => mists.push({ x, y, n }) };
  const c = new Carrier(game, 2 * T, 0);
  c.y = 4 * T - c.height;   // 床（行4）の上に乗る
  for (let i = 0; i < HOVER_WATER_MIST_INTERVAL; i++) c._kickHoverWaterMist();
  assert.ok(mists.length > 0, '一度も撒かれていない');
});
