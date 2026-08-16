// 破片の画面外カリング。**判定を utils/viewCull.js へ寄せる前に現状を固定する**
// ためのテスト（2026-08-16）。同じ判定の写しを2つ持たないよう共通化するが、
// 破片の余裕の取り方は敵とは違う（max(w,h) + 8。敵は外接円の半径 + 64）ので、
// 寄せた拍子に値が変わっていないことを境界で押さえる。
//
// 破片の x,y は**中心**（DebrisPart のコンストラクタのコメント）。敵のように
// 左上ではないので、ここを取り違えると片側だけ半径ぶんずれる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';

const camera = { x: 1000, y: 500 };
const canvas = { width: 1024, height: 768 };
const game = { camera, canvas };

/** w=10, h=6 なので余裕は max(10,6) + 8 = 18 */
function part(x, y, opts = {}) {
    return new DebrisPart({
        x, y, w: 10, h: 6, color: '#888', angle: 0, vx: 0, vy: 0, spin: 0,
        holdFrames: 0, lifetime: 60, game,
        ...opts,
    });
}

const drew = (p) => {
    const ctx = makeFakeCtx();
    p.draw(ctx);
    return ctx.calls.some((c) => c.name === 'fillRect');
};

test('画面内の破片は描かれる', () => {
    assert.equal(drew(part(1500, 880)), true);
});

test('画面から余裕を超えて外れた破片は描かれない', () => {
    assert.equal(drew(part(4000, 880)), false);
    assert.equal(drew(part(1500, 3000)), false);
});

test('余裕ちょうどの位置はまだ描く（境界を内側に倒す）', () => {
    // 左端 1000 の外側 18px ちょうど。ここを外し始めると縁でちらつく
    assert.equal(drew(part(1000 - 18, 880)), true);
    assert.equal(drew(part(1000 - 19, 880)), false);
});

test('右端と下端の余裕も同じ 18px', () => {
    const right = 1000 + 1024;
    const bottom = 500 + 768;
    assert.equal(drew(part(right + 18, 880)), true);
    assert.equal(drew(part(right + 19, 880)), false);
    assert.equal(drew(part(1500, bottom + 18)), true);
    assert.equal(drew(part(1500, bottom + 19)), false);
});

test('大きい破片ほど余裕が広い（max(w,h) が効く）', () => {
    // w=100 なら余裕は 108。18px の破片が消える位置でもまだ描く
    const big = new DebrisPart({
        x: 4000, y: 880, w: 100, h: 6, color: '#888', angle: 0, vx: 0, vy: 0,
        spin: 0, holdFrames: 0, lifetime: 60, game,
    });
    assert.equal(drew(big), false);          // 4000 は 108 でも遠すぎる
    assert.equal(drew(part(2024 + 100, 880)), false);
    big.x = 2024 + 100;
    assert.equal(drew(big), true);           // 同じ位置でも大きければ描く
});

test('game が無ければカリングしない（安全側に倒す）', () => {
    const noGame = new DebrisPart({
        x: 99999, y: 99999, w: 10, h: 6, color: '#888', angle: 0, vx: 0, vy: 0,
        spin: 0, holdFrames: 0, lifetime: 60,
    });
    assert.equal(drew(noGame), true);
});
