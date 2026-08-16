// ミサイルの煙（TrailParticle）の描画。
//
// 2026-08-16 の実測で、`particles` の中身は TrailParticle が支配的だと分かった
// （平均 177 個・**ピーク 690 個**。Particle は平均 34、DebrisPart は 2.2、
// FlashParticle と ImpactFlash に至っては 0.5 と 0.3 で事実上いない）。
//
// TrailParticle は save/restore で囲っているだけで、やっているのは globalAlpha と
// 定数の fillStyle を置くこと。同じ仕事をする Particle は save/restore を使わず
// 最後に globalAlpha を 1 へ戻して済ませている。1個 3 呼び出しが 1 呼び出しになる。
//
// **描かれる矩形と alpha は変えない**（見た目を1ピクセルも動かさないため）ので、
// そこも一緒に縛る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TrailParticle, Particle } from '../src/js/entities/Particle.js';

test('TrailParticle は save/restore を使わない', () => {
    const ctx = makeFakeCtx();
    new TrailParticle(100, 50, 20).draw(ctx);

    const names = ctx.calls.map((c) => c.name);
    assert.equal(names.filter((n) => n === 'save').length, 0);
    assert.equal(names.filter((n) => n === 'restore').length, 0);
});

test('TrailParticle は描き終わりに globalAlpha を 1 へ戻す', () => {
    // save/restore を外す以上、戻し忘れると**以降の描画が全部薄くなる**。
    // 煙は毎フレーム何百個も出るので、抜けたら画面全体が確実に壊れる。
    //
    // **歳を取らせてから見る。** 出たばかりの粒は alpha が 1.0 なので、
    // 戻していなくてもこの assert が通ってしまい、失敗しうるテストにならない
    const p = new TrailParticle(100, 50, 20);
    for (let i = 0; i < 5; i++) p.update();   // alpha 0.75

    const ctx = makeFakeCtx();
    p.draw(ctx);

    assert.equal(ctx.globalAlpha, 1);
});

test('TrailParticle が描く矩形と alpha は従来のまま', () => {
    // 寿命 20 のうち 5 消費 → progress 0.25、alpha 0.75、size 2.5。
    // 位置は Math.round(x) を中心に size/2 だけ戻した左上
    const p = new TrailParticle(100.4, 50.6, 20);
    for (let i = 0; i < 5; i++) p.update();

    const ctx = makeFakeCtx();
    p.draw(ctx);

    const alpha = ctx.calls.find((c) => c.name === 'set:globalAlpha');
    assert.equal(alpha.args[0], 0.75);

    const rect = ctx.calls.find((c) => c.name === 'fillRect');
    assert.deepEqual(rect.args, [100 - 2.5 / 2, 51 - 2.5 / 2, 2.5, 2.5]);

    const fill = ctx.calls.find((c) => c.name === 'set:fillStyle');
    assert.equal(fill.args[0], '#FFFFFF');
});

test('TrailParticle は Particle と同じ数の ctx 呼び出しで済む', () => {
    // 「同じ仕事なのに片方だけ 3 倍払っている」という不揃いを潰したのが趣旨。
    // メソッド呼び出しだけを数える（プロパティ代入は set: で始まるので除く）
    const countMethods = (draw) => {
        const ctx = makeFakeCtx();
        draw(ctx);
        return ctx.calls.filter((c) => !c.name.startsWith('set:')).length;
    };

    const trail = countMethods((ctx) => new TrailParticle(100, 50, 20).draw(ctx));
    const plain = countMethods((ctx) => new Particle(100, 50, 0, 0, '#FFF', 2, 20).draw(ctx));

    assert.equal(trail, plain);
    assert.equal(trail, 1);   // fillRect 1回だけ
});
