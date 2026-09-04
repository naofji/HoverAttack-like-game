import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_LAYERS, SNOW_COLOR, SNOW_SHEET_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('in-game snow falls behind the terrain (world pass), not over the HUD', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  for (let i = 0; i < 30; i++) env.update();
  const behind = makeFakeCtx();
  env.drawBehindTerrain(behind, 640, 320);
  const draws = behind.calls.filter((c) => c.name === 'drawImage');
  const tilesX = Math.ceil(CANVAS_WIDTH / SNOW_SHEET_SIZE) + 1;
  const tilesY = Math.ceil(CANVAS_HEIGHT / SNOW_SHEET_SIZE) + 1;
  assert.ok(draws.length >= SNOW_LAYERS.length && draws.length <= SNOW_LAYERS.length * tilesX * tilesY, `drawImage ${draws.length}`);
  // ワールド座標: 全ての板がカメラの可視矩形に掛かる位置に置かれる
  for (const d of draws) {
    const [, x, y] = d.args;
    assert.ok(x + SNOW_SHEET_SIZE > 640 && x < 640 + CANVAS_WIDTH, `sheet x ${x} outside view`);
    assert.ok(y + SNOW_SHEET_SIZE > 320 && y < 320 + CANVAS_HEIGHT, `sheet y ${y} outside view`);
  }
  const over = makeFakeCtx();
  env.drawOverlay(over);
  assert.equal(over.calls.filter((c) => c.name === 'drawImage').length, 0, 'in-game overlay must not draw snow');
});

test('layers scroll at different speeds', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const at = () => {
    const ctx = makeFakeCtx();
    env.drawBehindTerrain(ctx, 640, 320);
    return ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[2]); // y
  };
  const y0 = at();
  env.update();
  const y1 = at();
  // 同じ添字の drawImage の y の差が層ごとに違う
  const deltas = new Set(y1.map((y, i) => Math.round((y - y0[i]) * 100) / 100));
  assert.ok(deltas.size >= 2, `expected different scroll speeds, got ${[...deltas]}`);
});

test('demo overlay still scrolls snow in screen space', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const ctx = makeFakeCtx();
  env.drawDemoOverlay(ctx, 0.5);
  assert.ok(ctx.calls.filter((c) => c.name === 'drawImage').length >= SNOW_LAYERS.length);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.includes(0.5));
});

test('snow flakes are small and dim grey so they read apart from bullets', async () => {
  const lum = (hex) => { const s = hex.slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0); };
  assert.ok(lum(SNOW_COLOR) < 160, `snow colour too bright: ${SNOW_COLOR}`); // 弾（白）と見分ける
  for (const layer of SNOW_LAYERS) assert.ok(layer.size <= 2, `flake size ${layer.size}`);
});
