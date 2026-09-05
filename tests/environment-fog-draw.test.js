import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, FOG_LAYERS, FOG_OVERLAY_ALPHA } from '../src/js/utils/Constants.js';

// buildSheet が作る板ごとの fake ctx を集める（板の生成そのものを検証したいテスト用）。
// 各テストの冒頭でリセットする。
let sheets = [];

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      sheets.push(ctx);
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

test('fog sheets are built from organic smoke-shaped clouds, squashed horizontally', async () => {
  const { FOG_BLOB_COUNT, FOG_BLOB_ASPECT } = await import('../src/js/utils/Constants.js');
  const { SMOKE_SHAPES } = await import('../src/js/entities/smokeSprites.js');
  sheets = [];
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  new StageEnvironment(null, 5);
  assert.ok(sheets.length >= 2, 'two sheets built');
  for (const s of sheets) {
    const grads = s.calls.filter((c) => c.name === 'createRadialGradient').length;
    const minLobes = Math.min(...SMOKE_SHAPES.map((sh) => sh.length));
    assert.ok(grads >= FOG_BLOB_COUNT * minLobes, `expected ≥ ${FOG_BLOB_COUNT * minLobes} lobes, got ${grads}`);
    const scales = s.calls.filter((c) => c.name === 'scale');
    assert.ok(scales.length >= FOG_BLOB_COUNT && scales.every((c) => c.args[0] === FOG_BLOB_ASPECT && c.args[1] === 1));
    assert.equal(s.calls.filter((c) => c.name === 'arc').length, 0, 'no plain circles');
  }
  assert.ok(FOG_BLOB_ASPECT >= 1.8);
});

test('fog sheet build skips wrapped copies that fall fully outside the sheet', async () => {
  const { FOG_BLOB_COUNT } = await import('../src/js/utils/Constants.js');
  const { SMOKE_SHAPES } = await import('../src/js/entities/smokeSprites.js');
  sheets = [];
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  new StageEnvironment(null, 5);
  assert.ok(sheets.length >= 2, 'two sheets built');
  const minLobes = Math.min(...SMOKE_SHAPES.map((sh) => sh.length));
  const maxLobes = Math.max(...SMOKE_SHAPES.map((sh) => sh.length));
  for (const s of sheets) {
    const grads = s.calls.filter((c) => c.name === 'createRadialGradient').length;
    // 下限: 雲は必ず1回は描かれる（板の中に居るオフセットは常に1つある）
    assert.ok(grads >= FOG_BLOB_COUNT * minLobes, `expected ≥ ${FOG_BLOB_COUNT * minLobes} lobes, got ${grads}`);
    // 上限: 9オフセット全部を描いていた頃の 1/9 よりずっと少ない（境界をまたぐ雲だけ2回目を描く想定なので2倍未満に収まる）
    assert.ok(grads < FOG_BLOB_COUNT * maxLobes * 2, `expected < ${FOG_BLOB_COUNT * maxLobes * 2}, got ${grads}`);
  }
});
