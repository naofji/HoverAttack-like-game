// 雪の木が欠ける・倒れるときに舞う雪（SnowFlurryParticle）。
// ホバーの粉雪（SnowMistParticle）との違い: 出た勢いで飛んで空気抵抗で止まり、左右に揺れながら落ちる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SnowFlurryParticle } from '../src/js/entities/Particle.js';
import {
    SNOWTREE_FLURRY_DRAG, SNOWTREE_FLURRY_GRAVITY, SNOWTREE_FLURRY_SWAY,
} from '../src/js/utils/Constants.js';
import { SNOWTREE_FLURRY_COLORS } from '../src/js/world/town/palette.js';
import { luminance } from '../src/js/utils/color.js';
import { SNOW_CAP_COLOR } from '../src/js/utils/Constants.js';

const make = (game = null, vx = 2, vy = -2, life = 60) => new SnowFlurryParticle(game, 100, 100, vx, vy, '#e2eaf3', 2, life);

test('出た勢いは空気抵抗で落ち着き、落ちる速さは重力と抵抗が釣り合う値（約 0.4px/tick）に収まる', () => {
    const p = make(null, 2, -2, 400);
    for (let i = 0; i < 100; i++) p.update();
    const terminal = SNOWTREE_FLURRY_GRAVITY / (1 - SNOWTREE_FLURRY_DRAG);
    assert.ok(Math.abs(p.vy - terminal) < 0.02, `vy ${p.vy}`);
    assert.ok(Math.abs(p.vx) < 0.02, `横の勢いが残る ${p.vx}`);
    assert.ok(terminal < 0.5, '落ちるのが速い');
});

test('勢いで飛んだあと、ほぼ止まる（1〜2 秒かけて 20〜40px ほど。ぱっと散らず、舞って落ちる）', () => {
    const p = make(null, 1.5, 0, 400);
    const x0 = p.x;
    for (let i = 0; i < 90; i++) p.update();
    const travelled = Math.abs(p.x - x0);
    assert.ok(travelled > 15 && travelled < 45, `${travelled}px`);
});

test('左右に揺れる（揺れが横の動きに乗る）。粒ごとに位相が違う', () => {
    const a = make(null, 0, 0, 400), b = make(null, 0, 0, 400);
    a.phase = 0; b.phase = Math.PI;
    let aMin = Infinity, aMax = -Infinity;
    for (let i = 0; i < 90; i++) {
        a.update(); b.update();
        aMin = Math.min(aMin, a.x); aMax = Math.max(aMax, a.x);
    }
    assert.ok(aMax - aMin > 2, `揺れが小さい ${aMax - aMin}`);
    assert.ok(Math.abs(a.x - b.x) > 0.5 || aMax - aMin > 2);
    // 位相が逆なら、同じ時刻に逆向きに揺れる
    const c = make(null, 0, 0, 400), d = make(null, 0, 0, 400);
    c.phase = 0; d.phase = Math.PI;
    c.update(); d.update();
    assert.ok((c.x - 100) * (d.x - 100) < 0, '位相が逆でも同じ向きに揺れた');
    assert.ok(Math.abs(c.x - 100) <= SNOWTREE_FLURRY_SWAY + 1e-9 + Math.abs(c.vx));
});

test('地面（game.map.isSolidAtPixel）に触れたら、跳ねずに消える。map が無ければ素通りする', () => {
    const game = { map: { isSolidAtPixel: (x, y) => y >= 110 } };
    const p = make(game, 0, 0.4, 400);
    for (let i = 0; i < 60 && p.alive; i++) p.update();
    assert.equal(p.alive, false);
    assert.ok(p.y < 112, `地面の下 ${p.y} へ入った`);
    const free = make(null, 0, 0.4, 400);
    for (let i = 0; i < 60; i++) free.update();
    assert.equal(free.alive, true);
});

test('寿命が尽きると消え、消えたあとは動かず描かない', () => {
    const p = make(null, 1, 1, 30);
    for (let i = 0; i < 30; i++) p.update();
    assert.equal(p.alive, false);
    const x = p.x;
    p.update();
    assert.equal(p.x, x);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.calls.length, 0);
});

test('寿命の最後の 4 割で薄れる。途中まではくっきり', () => {
    const p = make(null, 0, 0, 100);
    const alphaAt = (n) => {
        const q = make(null, 0, 0, 100);
        for (let i = 0; i < n; i++) q.update();
        const ctx = makeFakeCtx();
        q.draw(ctx);
        return ctx.calls.find((c) => c.name === 'set:globalAlpha').args[0];
    };
    assert.equal(alphaAt(10), 1);
    assert.equal(alphaAt(59), 1);
    assert.ok(alphaAt(80) < 0.6 && alphaAt(80) > 0.3);
    assert.ok(alphaAt(98) < 0.1);
    assert.equal(p.alive, true);
});

test('描き終わりに globalAlpha を 1 へ戻す。fillRect は 1 回', () => {
    const p = make();
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, 1);
    assert.equal(ctx.calls[ctx.calls.length - 1].args[0], 1);
});

test('舞う雪の色は、足場の雪のふち（SNOW_CAP_COLOR）より暗い', () => {
    for (const hex of SNOWTREE_FLURRY_COLORS) assert.ok(luminance(hex) < luminance(SNOW_CAP_COLOR), hex);
});
