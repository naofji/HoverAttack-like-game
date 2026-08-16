import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

function render(scores) {
    const game = { canvas: { width: 960, height: 720 } };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawLocalRanking(ctx, scores, -1, '2026-W33');
    return ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

test('トライ 2 以上だけ T の印が出る', () => {
    const texts = render([
        { name: 'AAA', score: 50000, mission: 5, clearTime: null, country: '', tries: 1 },
        { name: 'BBB', score: 40000, mission: 4, clearTime: null, country: '', tries: 3 },
    ]);
    assert.ok(texts.includes('T3'));
    assert.ok(!texts.includes('T1'), 'トライ 1 は印を出さない');
});

test('tries が無い旧データでも印を出さない', () => {
    const texts = render([{ name: 'AAA', score: 50000, mission: 5, clearTime: null, country: '' }]);
    assert.ok(!texts.some((t) => /^T\d+$/.test(t)));
});

test('見出しに TRY が出る', () => {
    assert.ok(render([]).includes('TRY'));
});
