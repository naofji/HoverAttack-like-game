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

// --- WALL OF FAME ---
// 殿堂は週ランキングの上位3件をそのまま保存したもの。トライ数は同点時の
// ペナルティとして順位に効いているので、**アーカイブ側に出ないと「なぜこの順位か」
// の但し書きが落ちる**（実機の指摘）。
function renderFame(fame) {
    const game = { canvas: { width: 1024, height: 768 } };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawWallOfFame(ctx, fame);
    return ctx.calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
}

test('WALL OF FAME もトライ 2 以上だけ印を出す', () => {
    const texts = renderFame([{
        weekId: '2026-W32',
        entries: [
            { name: 'AAA', score: 90000, country: 'JP', tries: 1 },
            { name: 'BBB', score: 80000, country: 'US', tries: 4 },
            { name: 'CCC', score: 70000, country: '' },   // 旧データ（tries 無し）
        ],
    }]);
    assert.ok(texts.includes('T4'), texts.join(' | '));
    assert.ok(!texts.includes('T1'), 'トライ 1 に印が出ている');
    assert.ok(!texts.some((t) => /^T(0|NaN|undefined)$/.test(t)), '旧データに印が出ている');
});

test('WALL OF FAME の TRY は名前と国旗の右側に置く', () => {
    // 週ランキング表で名前列にぶら下げて浮いた反省。国旗より右へ置く
    const game = { canvas: { width: 1024, height: 768 } };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawWallOfFame(ctx, [{
        weekId: '2026-W32',
        entries: [{ name: 'AAAAAAAAAA', score: 90000, country: 'JP', tries: 4 }],
    }]);
    const call = (pred) => ctx.calls.find((c) => c.name === 'fillText' && pred(String(c.args[0])));
    const tryCall = call((t) => t === 'T4');
    const nameCall = call((t) => t === 'AAAAAAAAAA');
    assert.ok(tryCall && nameCall);
    assert.ok(tryCall.args[1] > nameCall.args[1], 'TRY が名前より左にある');
});
