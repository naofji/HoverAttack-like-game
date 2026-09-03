import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractTextsWithFont } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

/**
 * HOW TO PLAY は 10 秒ごとに2ページが入れ替わる。**枠の幅と左端が2ページで
 * 揃っていないと、切り替わるたびに枠が伸び縮みして見える。**
 *
 * 4:3 のころのパネル幅 800 が 16:9 (1366px) でも残っていて、画面の 58% しか
 * 使っていなかった（実機の指摘）。両ページとも 1140 に広げる。
 */

const CANVAS = { width: 1366, height: 768 };
const PANEL_W = 1140;
const PANEL_LEFT = Math.round((CANVAS.width - PANEL_W) / 2);   // 113
const TEXT_PAD = 32;   // パネルの内側、本文の左端まで（PANEL_PAD + SPACE.md）

function draw(page) {
    const ctx = makeFakeCtx();
    new ScreenRenderer({ canvas: CANVAS }).drawHowToPlay(ctx, page);
    return ctx;
}

/**
 * パネルの矩形。theme.drawPanel は見出し帯を fillRect(x+6, y+6, w-12, 30) で
 * 描くので、高さ 30 の塗りからパネルの位置と幅を復元できる。
 */
function panels(ctx) {
    return ctx.calls
        .filter((c) => c.name === 'fillRect' && c.args[3] === 30)
        .map((c) => ({ x: c.args[0] - 6, y: c.args[1] - 6, w: c.args[2] + 12 }));
}

test('両ページのパネルが同じ幅・同じ左端で、画面の横幅を使う', () => {
    const all = [...panels(draw(0)), ...panels(draw(1))];
    assert.ok(all.length >= 4, `パネルが見つからない: ${all.length}`);
    for (const p of all) {
        assert.equal(p.w, PANEL_W, `パネルの幅が揃っていない: ${p.w}`);
        assert.equal(p.x, PANEL_LEFT, `パネルの左端が揃っていない: ${p.x}`);
    }
});

/**
 * 文字の左右端。**textAlign を見ないと中央揃えの行を読み違える**
 * （fillText に渡る x が中央なので、そのまま左端として扱うと右へはみ出して見える）。
 */
function textBoxes(ctx) {
    const out = [];
    let size = 16;
    let align = 'left';
    for (const c of ctx.calls) {
        if (c.name === 'set:font') {
            const px = /(\d+(?:\.\d+)?)px/.exec(String(c.args[0]));
            if (px) size = parseFloat(px[1]);
        } else if (c.name === 'set:textAlign') {
            align = c.args[0];
        } else if (c.name === 'fillText') {
            const text = String(c.args[0]);
            const w = text.length * size * 0.6;
            const x = c.args[1];
            const left = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
            out.push({ text, left, right: left + w });
        }
    }
    return out;
}

test('1ページ目の本文がパネルの内側に収まる', () => {
    const right = PANEL_LEFT + PANEL_W;
    for (const t of textBoxes(draw(0))) {
        assert.ok(t.left >= PANEL_LEFT, `左へはみ出す: ${t.text} (${Math.round(t.left)})`);
        assert.ok(t.right <= right, `右へはみ出す: ${t.text} (${Math.round(t.right)})`);
    }
});

// ドッキングの図は BASIC RULES の本文の右隣。パネルが広がったぶん右へ動かさないと、
// 本文との間だけが空いて図が真ん中に取り残される
test('ドッキングの図はパネルの右端側に置かれる', () => {
    const ctx = draw(0);
    const frame = ctx.calls
        .filter((c) => c.name === 'roundRect' && Math.abs(c.args[3] - 115) <= 1)
        .map((c) => ({ x: c.args[0], w: c.args[2] }))[0];
    assert.ok(frame, 'ドッキングの図の枠が見つからない');

    const right = PANEL_LEFT + PANEL_W;
    const inset = right - (frame.x + frame.w);
    assert.ok(inset >= 20 && inset <= 60,
        `図がパネルの右端から離れすぎ／近すぎ: ${Math.round(inset)}px`);
});

// 本文の左端は2ページで揃える（1ページ目の箇条書きと2ページ目の図の左端）。
// **期待値は絶対座標で置く。** 「2ページが互いに等しい」だけだと、共通の余白を
// 動かしたときに両方が同時にずれて相殺し、テストが通ってしまう（実際に起きた）
test('本文の左端が2ページとも パネル左端＋32 にある', () => {
    const expected = PANEL_LEFT + TEXT_PAD;
    const leftOf = (ctx, prefix) => extractTextsWithFont(ctx.calls)
        .find((t) => t.text.startsWith(prefix)).x;
    assert.equal(leftOf(draw(0), '1) CONTROL CARRIER'), expected, '1ページ目の本文');
    assert.equal(leftOf(draw(1), '■ LEFT HAND'), expected, '2ページ目の図');
});
