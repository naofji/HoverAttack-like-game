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
