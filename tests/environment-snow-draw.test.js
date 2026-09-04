import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_LAYERS, SNOW_SHEET_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('snow overlay is a bounded number of drawImage calls per layer', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const ctx = makeFakeCtx();
  for (let i = 0; i < 30; i++) env.update();
  env.drawOverlay(ctx);
  const tilesX = Math.ceil(CANVAS_WIDTH / SNOW_SHEET_SIZE) + 1;
  const tilesY = Math.ceil(CANVAS_HEIGHT / SNOW_SHEET_SIZE) + 1;
  const draws = ctx.calls.filter((c) => c.name === 'drawImage').length;
  assert.ok(draws <= SNOW_LAYERS.length * tilesX * tilesY, `drawImage ${draws}`);
  assert.ok(draws >= SNOW_LAYERS.length);
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, 0); // 粒を個別に描かない
});

test('layers scroll at different speeds', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const at = () => {
    const ctx = makeFakeCtx();
    env.drawOverlay(ctx);
    return ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[2]); // y
  };
  const y0 = at();
  env.update();
  const y1 = at();
  // 同じ添字の drawImage の y の差が層ごとに違う
  const deltas = new Set(y1.map((y, i) => Math.round((y - y0[i]) * 100) / 100));
  assert.ok(deltas.size >= 2, `expected different scroll speeds, got ${[...deltas]}`);
});
