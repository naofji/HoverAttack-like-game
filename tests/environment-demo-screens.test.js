// ============================================
// 面別ランキング・面セレクト・タイトルの背景に、その面の環境（霧・雪・水）を
// 重ねる。設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
// ============================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGE_PALETTES, DEMO_OVERLAY_ALPHA_SCALE, FOG_OVERLAY_ALPHA } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function renderer(extra = {}) {
  const game = {
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    titleMenuItems: () => ['start'],
    selectedTitleItem: () => 'start',
    mode: 'normal',
    saveManager: { save: { missionsCompleted: 0, mode: 'normal', tries: 0 }, reached: 1 },
    stageSelectIndex: 1,
    ...extra,
  };
  return new ScreenRenderer(game);
}

test('stage ranking screen for stage 6 draws the fog overlay thinned for the demo', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawStageRankings(ctx, 5, { local: { time: [], score: [] }, global: { time: [], score: [] } }, STAGE_PALETTES[5]);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA * DEMO_OVERLAY_ALPHA_SCALE) < 1e-9), 'fog overlay missing');
});

test('stage ranking screen for stage 1 draws no environment overlay', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawStageRankings(ctx, 0, { local: { time: [], score: [] }, global: { time: [], score: [] } }, STAGE_PALETTES[0]);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 0);
});

test('title uses the continue stage when available, else stage 1', () => {
  const a = renderer();
  assert.equal(a._titleStageIndex(), 0);
  const b = renderer({
    titleMenuItems: () => ['start', 'continue'],
    saveManager: { save: { missionsCompleted: 4, mode: 'normal', tries: 1 }, reached: 5 },
  });
  assert.equal(b._titleStageIndex(), 4);
});

test('weekly ranking screen is untouched', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawLocalRanking(ctx, [], -1, '2026-W36');
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 0);
});
