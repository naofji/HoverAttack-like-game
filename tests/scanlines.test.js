import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

/**
 * 走査線（CRT風の横縞）は全画面で同じ濃さで掛かること。
 *
 * WALL OF FAME だけが分岐の中と外で二重に drawScanlines を呼んでいて、
 * 実効の不透明度が 0.10 ではなく 0.19 相当になっていた。重ね掛けは
 * 「呼んだ回数」でしか効かないので、見た目のズレとして気づきにくい。
 */

const W = 1024;
const H = 768;

/** 走査線1パスぶんの本数。theme.drawScanlines は spacing=3 で1px塗る。 */
const LINES_PER_PASS = Math.ceil(H / 3);

/** 画面描画に必要なだけの ctx を用意する（fake-ctx に無いものを足す）。 */
function makeScreenCtx() {
    const ctx = makeFakeCtx();
    ctx.createLinearGradient = () => ({ addColorStop() {} });
    ctx.createRadialGradient = () => ({ addColorStop() {} });
    ctx.measureText = () => ({ width: 100 });
    for (const m of ['arcTo', 'quadraticCurveTo', 'ellipse', 'clip', 'bezierCurveTo', 'roundRect']) {
        if (typeof ctx[m] !== 'function') ctx[m] = () => {};
    }
    return ctx;
}

/** 走査線は「画面の全幅 × 1px」の塗りなので、その数を数える。 */
function countScanlines(draw) {
    const ctx = makeScreenCtx();
    draw(ctx);
    return ctx.calls.filter(
        (c) => c.name === 'fillRect' && c.args[2] === W && c.args[3] === 1,
    ).length;
}

function makeRenderer() {
    return new ScreenRenderer({ canvas: { width: W, height: H }, mode: 'normal' });
}

const FAME = [{ weekId: '2026-W32', entries: [{ name: 'AAA', score: 100, country: 'JP' }] }];

const SCREENS = [
    ['TITLE', (r, c) => r.drawTitleScreen(c)],
    ['HOW TO PLAY 1ページ目', (r, c) => r.drawHowToPlay(c, 0)],
    ['HOW TO PLAY 2ページ目', (r, c) => r.drawHowToPlay(c, 1)],
    ['LOCAL RANKING', (r, c) => r.drawLocalRanking(c, [], -1, '2026-W32')],
    ['GLOBAL RANKING', (r, c) => r.drawGlobalRanking(c, [], -1, '2026-W32')],
    ['STAGE RANKING', (r, c) => r.drawStageRankings(c, 0, { time: [], score: [] }, { fill: '#336699' })],
    ['WALL OF FAME（記録あり）', (r, c) => r.drawWallOfFame(c, FAME)],
    ['WALL OF FAME（記録なし）', (r, c) => r.drawWallOfFame(c, [])],
];

test('走査線はどの画面でもちょうど1パスぶん', () => {
    for (const [name, draw] of SCREENS) {
        const r = makeRenderer();
        assert.equal(
            countScanlines((ctx) => draw(r, ctx)), LINES_PER_PASS,
            `${name}: 走査線の重ね掛けが1パスでない`,
        );
    }
});

test('WALL OF FAME は記録の有無で走査線の濃さが変わらない', () => {
    // 以前は分岐の中と外の両方で呼んでいたので、どちらの枝を通っても
    // 二重掛けになっていた。分岐から出したことをここで押さえる
    const r = makeRenderer();
    const withRecords = countScanlines((ctx) => r.drawWallOfFame(ctx, FAME));
    const empty = countScanlines((ctx) => r.drawWallOfFame(ctx, []));
    assert.equal(withRecords, empty);
});
