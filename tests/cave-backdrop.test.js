import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, FAR_BG_PARALLAX,
} from '../src/js/utils/Constants.js';

/** 生成した疑似 canvas を記録しておき、テストから ctx を覗けるようにする。 */
let lastFakeCanvas = null;

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ctx,
        _ctx: ctx,
      };
      lastFakeCanvas = canvas;
      return canvas;
    },
  };
});

function makeBackdrop(BackdropClass, mapW, mapH, seed = 1) {
  return new BackdropClass(mapW, mapH, '#8B4513', new SeededRNG(seed));
}

test('parallax factor constant is 0.15', () => {
  assert.equal(FAR_BG_PARALLAX, 0.15);
});

test('backdrop canvas is sized for the smallest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  assert.equal(bd.width, 1230);
  assert.equal(bd.height, 841);
  assert.equal(bd.canvas.width, 1230);
  assert.equal(bd.canvas.height, 841);
});

test('backdrop canvas is sized for the largest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 4800, 2400);
  assert.equal(bd.width, 1590);
  assert.equal(bd.height, 1021);
});

test('source rect exactly spans the canvas across the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // camXmin = 0, camXmax = 1376 / camYmin = -60, camYmax = 432
  assert.equal(bd.sourceX(0), 0);
  assert.equal(bd.sourceX(1376), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-60), 0);
  assert.equal(bd.sourceY(432), bd.height - CANVAS_HEIGHT);
});

test('source rect is an integer for fractional camera positions', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // floor(500.7 * 0.15) = floor(75.105) = 75
  assert.equal(bd.sourceX(500.7), 75);
  // floor((100.3 - (-60)) * 0.15) = floor(24.045) = 24
  assert.equal(bd.sourceY(100.3), 24);
});

test('source rect clamps outside the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  assert.equal(bd.sourceX(-9999), 0);
  assert.equal(bd.sourceX(9999), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-9999), 0);
  assert.equal(bd.sourceY(9999), bd.height - CANVAS_HEIGHT);
});

test('draw issues exactly one drawImage with the parallax source rect', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  const ctx = makeFakeCtx();
  bd.draw(ctx, 500.7, 100.3);

  const draws = ctx.calls.filter((c) => c.name === 'drawImage');
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].args, [
    bd.canvas,
    75, 24, CANVAS_WIDTH, CANVAS_HEIGHT,   // 転送元 (整数化済み)
    500.7, 100.3, CANVAS_WIDTH, CANVAS_HEIGHT, // 転送先 = ワールド座標
  ]);
});

test('generation fills the base, then draws blobs and stipple dots', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  const calls = lastFakeCanvas._ctx.calls;

  const rects = calls.filter((c) => c.name === 'fillRect');
  // 1 (地色) + 25 (ブロブ) + 2955 (点描)
  assert.equal(rects.length, 1 + 25 + 2955);

  // 最初の fillRect は canvas 全面の地色塗り
  assert.deepEqual(rects[0].args, [0, 0, bd.width, bd.height]);

  const gradients = calls.filter(
    (c) => c.name === 'set:fillStyle' && c.args[0] && c.args[0].type === 'radialGradient'
  );
  assert.equal(gradients.length, 25);
  // 各ブロブは中心 alpha 0.5 → 外周 alpha 0 の2ストップ
  for (const g of gradients) {
    assert.equal(g.args[0].stops.length, 2);
    assert.equal(g.args[0].stops[0][0], 0);
    assert.equal(g.args[0].stops[1][0], 1);
    assert.match(g.args[0].stops[1][1], /, 0\)$/);
  }
});

test('generation never uses globalAlpha', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  makeBackdrop(CaveBackdrop, 2400, 1200);
  assert.equal(lastFakeCanvas._ctx.globalAlpha, 1);
});

test('same seed and palette produce an identical backdrop', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const a = JSON.stringify(lastFakeCanvas._ctx.calls);
  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const b = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.equal(a, b);
});

test('different palettes produce different colors', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const rngA = new SeededRNG(7);
  const rngB = new SeededRNG(7);

  new CaveBackdrop(2400, 1200, '#8B4513', rngA); // ステージ1: 茶
  const brown = JSON.stringify(lastFakeCanvas._ctx.calls);
  new CaveBackdrop(2400, 1200, '#4682B4', rngB); // ステージ5: 青
  const blue = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.notEqual(brown, blue);
});
