// ホバー中に水面で舞う水滴（WaterMistParticle）。SnowMistParticle と同じ形だが、
// 地面ではなく水面(isWaterAtPixel)に触れて消える。水滴は雪の粉より重いので
// 重力は SnowMist(0.02)より強く、しぶき(SplashParticle 0.18)より弱くする。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { WaterMistParticle } from '../src/js/entities/Particle.js';
import { HOVER_WATER_MIST_LIFETIME, HOVER_WATER_MIST_COLOR } from '../src/js/utils/Constants.js';

test('SnowMistより重く、Splashより軽い重力で漂う', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 0);
    p.update();
    assert.ok(p.vy > 0.02 && p.vy < 0.18, `重力が範囲外: ${p.vy}`);
});

test('寿命が尽きると消える', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 0);
    for (let i = 0; i < HOVER_WATER_MIST_LIFETIME; i++) p.update();
    assert.equal(p.alive, false);
});

test('死んだ後は update しても動かない', () => {
    const p = new WaterMistParticle(null, 100, 100, 1, 1);
    p.alive = false;
    p.update();
    assert.equal(p.x, 100);
    assert.equal(p.y, 100);
});

test('専用の色（HOVER_WATER_MIST_COLOR）で描く', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 0);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    const fill = ctx.calls.find((c) => c.name === 'set:fillStyle');
    assert.equal(fill.args[0], HOVER_WATER_MIST_COLOR);
});

test('描き終わりに globalAlpha を 1 へ戻す', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 0);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.globalAlpha, 1);
});

test('死んでいれば draw しても何もしない', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 0);
    p.alive = false;
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.calls.length, 0);
});

// --- 水面との当たり判定：触れると消える -----------------------------------------

/** 指定 y 以上を水面とする最小マップ。 */
function waterBelow(surfaceY) {
    return { isWaterAtPixel: (x, y) => y >= surfaceY };
}

test('水面に触れると消える', () => {
    const game = { map: waterBelow(101) };
    const p = new WaterMistParticle(game, 100, 100, 0, 1);
    p.update();
    assert.equal(p.alive, false, '水面に触れても消えていない');
});

test('水面に触れる前は普通に動く', () => {
    const game = { map: waterBelow(1000) };
    const p = new WaterMistParticle(game, 100, 100, 2, 0);
    p.update();
    assert.equal(p.alive, true);
    assert.equal(p.x, 102);
});

test('game.map が無ければ水面判定をせず素通りする（フォールバック）', () => {
    const p = new WaterMistParticle(null, 100, 100, 0, 5);
    p.update();
    assert.equal(p.alive, true);
    assert.ok(p.y > 100, '通常どおり動いていない');
});

test('消えると位置は水面の手前で止まり、水面の中にはめり込まない', () => {
    const game = { map: waterBelow(101) };
    const p = new WaterMistParticle(game, 100, 100, 0, 5);
    p.update();
    assert.ok(p.y < 101, `水面の中に入っている: y=${p.y}`);
});
