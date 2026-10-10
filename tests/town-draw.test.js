import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, SOLID } from '../src/js/world/town/chunks.js';

function fakeCanvasFactory() {
    const made = [];
    const create = (w, h) => {
        const cv = { width: w, height: h, ctx: makeFakeCtx() };
        cv.getContext = () => cv.ctx;
        made.push(cv);
        return cv;
    };
    return { made, create };
}

const spec = (x, y, extra = {}) => ({
    site: 'floor', style: 'A', kind: 'tower', x, y, w: 16, h: 16,
    parts: [
        { x: 0, y: 0, w: 16, h: 16, color: '#7d5a2a', mat: MAT_ADOBE, solid: true },
        { x: 0, y: 0, w: 4, h: 4, color: null, mat: MAT_ADOBE, solid: false },
    ],
    ...extra,
});

test('建物ごとに canvas を1枚作り、色のある部品だけを塗る', () => {
    const { made, create } = fakeCanvasFactory();
    new Town([spec(0, 0)], { createCanvas: create });
    assert.equal(made.length, 1);
    assert.equal(made[0].width, 16);
    const fills = made[0].ctx.calls.filter((c) => c.name === 'fillRect');
    assert.equal(fills.length, 1, 'color が null の部品は塗らない');
});

test('かけらの表と支えを持つ', () => {
    const { create } = fakeCanvasFactory();
    // (0, 12) に 16x16。下の段のかけら（中心 y=26）はタイル行1
    const town = new Town([spec(0, 12)], { createCanvas: create, isSolidTile: (r) => r === 1 });
    const b = town.buildings[0];
    assert.equal(b.cw, 4);
    assert.equal(b.cells[5], MAT_ADOBE | SOLID);
    assert.ok(b.anchors.length > 0);
    assert.ok(b.anchors.every((a) => a.r === 1));
});

test('画面に掛かる建物だけを、その位置に描く', () => {
    const { create } = fakeCanvasFactory();
    const town = new Town([
        spec(1100, 600),   // 中
        spec(4000, 600),   // 右の遠く
        spec(1100, 3000),  // 下の遠く
        spec(2020, 600),   // 右端をまたぐ（2020〜2036、画面は 〜2024）
        spec(990, 490),    // 左上の角をまたぐ（990〜1006 / 490〜506）
        spec(980, 600),    // 左の外にぴったり接する（980〜996 は 1000 に届かない）
    ], { createCanvas: create });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 1000, y: 500, w: 1024, h: 768 });
    const drawn = ctx.calls.filter((c) => c.name === 'drawImage').map((c) => [c.args[1], c.args[2]]);
    assert.deepEqual(drawn, [[1100, 600], [2020, 600], [990, 490]]);
});
