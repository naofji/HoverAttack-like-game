import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, WATER_WAVE_AMPLITUDE, WATER_RIPPLE_DECAY } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function mapWithPool() {
  const rows = 10, cols = 10;
  const water = new Uint8Array(rows * cols);
  const waterSurface = new Int16Array(rows * cols).fill(-1);
  const waterCells = [];
  for (let r = 7; r < 9; r++) for (let c = 2; c < 6; c++) {
    water[r * cols + c] = 1; waterSurface[r * cols + c] = 7; waterCells.push([r, c]);
  }
  return {
    rows, cols, width: cols * TILE_SIZE, height: rows * TILE_SIZE, water, waterSurface, waterCells,
    isWater(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols && water[r * cols + c] === 1; },
    isWaterAtPixel(x, y) { return this.isWater(Math.floor(y / 16), Math.floor(x / 16)); },
    waterSurfaceRow(r, c) { return this.isWater(r, c) ? waterSurface[r * cols + c] : -1; },
  };
}

test('surface wave stays within the amplitude and ripples decay', async () => {
  const { surfaceOffset } = await import('../src/js/world/environment/water.js');
  for (let x = 0; x < 500; x += 7) {
    for (let t = 0; t < 200; t += 13) {
      assert.ok(Math.abs(surfaceOffset(x, t, [])) <= WATER_WAVE_AMPLITUDE + 1e-9);
    }
  }
  const ripples = [{ x: 100, strength: 4 }];
  const near = Math.abs(surfaceOffset(100, 0, ripples));
  const far = Math.abs(surfaceOffset(400, 0, ripples));
  assert.ok(near > far);
});

test('world pass transfers the water cache once and draws one surface path', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'createLinearGradient' || c.name === 'createRadialGradient').length, 0);
});

test('ripples fade every update', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  env.renderer.addRipple(50, 4);
  const s0 = env.renderer.ripples[0].strength;
  env.update();
  assert.ok(Math.abs(env.renderer.ripples[0].strength - s0 * WATER_RIPPLE_DECAY) < 1e-9);
});

test('surface line is thin and the wave is fine', async () => {
  const { WATER_WAVE_LENGTH, WATER_WAVE_AMPLITUDE, WATER_SURFACE_LINE_WIDTH } = await import('../src/js/utils/Constants.js');
  // 実機の指摘: 波は細かく、線は細く淡く。設計時の 48 / 2.5 / 2 から下げた値を固定する
  assert.ok(WATER_WAVE_LENGTH <= 24, `wave length ${WATER_WAVE_LENGTH}`);
  assert.ok(WATER_WAVE_AMPLITUDE <= 1.5, `amplitude ${WATER_WAVE_AMPLITUDE}`);
  assert.equal(WATER_SURFACE_LINE_WIDTH, 1);

  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  const widths = ctx.calls.filter((c) => c.name === 'set:lineWidth').map((c) => c.args[0]);
  assert.deepEqual(widths, [WATER_SURFACE_LINE_WIDTH]);
});
