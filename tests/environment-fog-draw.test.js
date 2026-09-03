import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, FOG_LAYERS, FOG_OVERLAY_ALPHA } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('fog overlay costs a few drawImage plus one full-screen fill per frame', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: { isWaterAtPixel: () => false } }, 5);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverlay(ctx);
  const draws = ctx.calls.filter((c) => c.name === 'drawImage');
  const fills = ctx.calls.filter((c) => c.name === 'fillRect');
  // 層ごとに最大2回（画面端の継ぎ目で板を2枚並べる）
  assert.ok(draws.length >= FOG_LAYERS.length && draws.length <= FOG_LAYERS.length * 2, `drawImage ${draws.length}`);
  assert.equal(fills.length, 1);
  assert.deepEqual(fills[0].args, [0, 0, CANVAS_WIDTH, CANVAS_HEIGHT]);
  // globalAlpha は戻す
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.equal(alphas[alphas.length - 1], 1);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA) < 1e-9));
});

test('fog does not draw in the world pass', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: { isWaterAtPixel: () => false } }, 5);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.length, 0);
});

test('demo alpha scale thins the fog', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 5);
  const ctx = makeFakeCtx();
  env.drawOverlay(ctx, 0.5);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA * 0.5) < 1e-9));
});
