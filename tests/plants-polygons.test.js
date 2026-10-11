import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { signedArea, orient, pointInRing, ringTouchesRect } from '../src/js/world/town/polygons.js';
import { rasterizeParts, MAT_PLANT, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { ringPart, paintParts, mirrorParts } from '../src/js/world/town/shapes.js';
import { buildMoss, buildLowFern, buildTallFern, buildWallPlant, buildHangingVine } from '../src/js/world/town/plants.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { PixelCanvas } from '../tools/lib/pixel-canvas.mjs';

const V = MAT_PLANT | SOLID;
const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('ringTouchesRect: 頂点が中・辺が貫く・矩形が丸ごと中・離れている', () => {
    const tri = [[0, 0], [20, 0], [10, 20]];
    assert.equal(ringTouchesRect(tri, 8, 1, 12, 5), true, '矩形が輪の中に丸ごと入る');
    assert.equal(ringTouchesRect([[0, 0], [1, 0], [0, 1]], -2, -2, 0.5, 0.5), true, '頂点が矩形の中');
    // 頂点はどれも矩形の外で、細長い輪の辺が矩形を貫く
    assert.equal(ringTouchesRect([[-10, 4.9], [30, 5], [30, 5.2], [-10, 5.1]], 8, 0, 12, 10), true);
    assert.equal(ringTouchesRect(tri, 30, 30, 34, 34), false, '離れている');
    assert.equal(ringTouchesRect(tri, 0, 21, 4, 25), false, '外接矩形の中でも輪の外');
});

test('orient: 時計回り（面積が正）に揃え、すでに揃っていれば同じ並びを返す', () => {
    const cw = SQUARE, ccw = SQUARE.slice().reverse();
    assert.ok(signedArea(cw) > 0 && signedArea(ccw) < 0);
    assert.ok(signedArea(orient(ccw)) > 0);
    assert.equal(orient(cw), cw);
});

test('pointInRing', () => {
    assert.equal(pointInRing(SQUARE, 5, 5), true);
    assert.equal(pointInRing(SQUARE, 15, 5), false);
});

test('rasterizeParts: 多角形が掛かるかけらだけが、植物の厚い壁になる（細い斜めの帯も拾う）', () => {
    const parts = [];
    // 幅 1px の斜めの帯 (0,0)→(24,24)。かけらは 4px 角
    ringPart(parts, [[[0, 0.5], [0.5, 0], [24.5, 23.5], [24, 24]]], '#444', MAT_PLANT, true);
    const { cells, cw, ch } = rasterizeParts(parts, 24, 24);
    for (let k = 0; k < cw; k++) assert.equal(cells[k * cw + k], V, `対角 (${k}, ${k}) が空`);
    assert.equal(cells[0 * cw + (cw - 1)], 0, '右上のかけらは外');
    assert.equal(cells[(ch - 1) * cw + 0], 0, '左下のかけらは外');
});

test('rasterizeParts: 同じ部品の複数の輪をそれぞれ見る', () => {
    const parts = [];
    ringPart(parts, [[[1, 1], [3, 1], [3, 3], [1, 3]], [[17, 17], [19, 17], [19, 19], [17, 19]]], '#444', MAT_PLANT, true);
    const { cells, cw } = rasterizeParts(parts, 24, 24);
    assert.equal(cells[0], V);
    assert.equal(cells[4 * cw + 4], V);
    assert.equal(cells[2 * cw + 2], 0, '輪のあいだは空');
});

test('ringPart: 面積の無い輪は捨て、向きを揃える', () => {
    const parts = [];
    ringPart(parts, [[[0, 0], [5, 5]], [[0, 0], [4, 4], [8, 8]], SQUARE.slice().reverse()], '#444');
    assert.equal(parts.length, 1);
    assert.equal(parts[0].rings.length, 1, '2点の輪と一直線の輪は捨てる');
    assert.ok(signedArea(parts[0].rings[0]) > 0);
    ringPart(parts, [[[0, 0], [5, 5]]], '#555');
    assert.equal(parts.length, 1, '全部捨てられたら部品も作らない');
});

test('paintParts: 多角形の部品は色ごとに 1 回の経路で fill する', () => {
    const ctx = makeFakeCtx();
    const parts = [];
    ringPart(parts, [SQUARE, [[20, 0], [30, 0], [25, 9]]], '#445566', MAT_PLANT, true);
    paintParts(ctx, parts);
    const names = ctx.calls.map((c) => c.name);
    assert.equal(names.filter((n) => n === 'fill').length, 1);
    assert.equal(names.filter((n) => n === 'moveTo').length, 2);
    assert.equal(names.filter((n) => n === 'closePath').length, 2);
    assert.equal(names.filter((n) => n === 'fillRect').length, 0);
    assert.ok(ctx.calls.some((c) => c.name === 'set:fillStyle' && c.args[0] === '#445566'));
});

test('mirrorParts: 多角形も左右反転し、向きは時計回りのまま', () => {
    const parts = [];
    ringPart(parts, [[[1, 0], [5, 0], [5, 3]]], '#444', MAT_PLANT, true);
    const [m] = mirrorParts(parts, 10);
    assert.deepEqual(m.rings[0].map(([x]) => x).sort((a, b) => a - b), [5, 5, 9]);
    assert.ok(signedArea(m.rings[0]) > 0);
});

test('PixelCanvas.fill: 重なった輪は nonzero で塗りつぶし、縁は半透明になる', () => {
    const cv = new PixelCanvas(20, 10);
    const ctx = cv.getContext();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    for (const ring of [[[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 0], [15, 0], [15, 10], [5, 10]]]) {
        ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
    }
    ctx.fill();
    const a = (x, y) => cv.px[(y * 20 + x) * 4 + 3];
    assert.equal(a(7, 5), 1, '重なりが抜けた');
    assert.equal(a(18, 5), 0);
    const half = new PixelCanvas(4, 4);
    const h = half.getContext();
    h.fillStyle = '#00ff00';
    h.beginPath(); h.moveTo(0, 0); h.lineTo(4, 0); h.lineTo(0, 4); h.closePath(); h.fill();   // 対角で半分
    const edge = half.px[(1 * 4 + 2) * 4 + 3];
    assert.ok(edge > 0 && edge < 1, `縁が半透明でない (${edge})`);
});

// --- 植物の絵（5種）全体について ---
const BIG = { maxW: 400, maxH: 400, maxReach: 64, maxHang: 400 };
const kinds = {
    moss: (r) => buildMoss(r, BIG), lowFern: (r) => buildLowFern(r, BIG), tallFern: (r) => buildTallFern(r, BIG),
    wall: (r) => buildWallPlant(r, BIG), vine: (r) => buildHangingVine(r, BIG),
};
const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 1);

for (const [name, build] of Object.entries(kinds)) {
    test(`${name}: 部品は全部多角形で、向きが揃っていて、色ごとにまとまっている（fill は少ない）`, () => {
        for (const seed of SEEDS) {
            const b = build(new SeededRNG(seed));
            for (const p of b.parts) {
                assert.ok(p.rings && p.rings.length > 0, 'fillRect の部品が混ざっている');
                for (const r of p.rings) assert.ok(signedArea(r) > 0, '向きが揃っていない');
            }
            assert.ok(b.parts.length <= 12, `fill が ${b.parts.length} 回（色ごとに 1 部品のはず）`);
            const colors = b.parts.map((p) => p.color);
            // 同じ色の部品が複数あってよいのは、描く順（上に重ねる）が違うときだけ。ここでは色の重複は無い
            assert.equal(new Set(colors).size, colors.length);
        }
    });

    test(`${name}: 描いた画素（半透明の縁を含む）は、必ず値のあるかけらの中`, () => {
        // 落ちる破片・欠けは「かけらを抜いて clearRect」で絵を消す。かけらに入らない画素は宙に残る
        for (const seed of SEEDS.slice(0, 10)) {
            const b = build(new SeededRNG(seed));
            const cv = new PixelCanvas(b.w, b.h);
            paintParts(cv.getContext(), b.parts);
            const { cells, cw } = rasterizeParts(b.parts, b.w, b.h);
            let stray = 0, drawn = 0;
            for (let y = 0; y < b.h; y++) {
                for (let x = 0; x < b.w; x++) {
                    if (cv.px[(y * b.w + x) * 4 + 3] < 0.05) continue;
                    drawn++;
                    if (!cells[Math.floor(y / CHUNK) * cw + Math.floor(x / CHUNK)]) stray++;
                }
            }
            assert.ok(drawn > 0);
            assert.equal(stray, 0, `${stray}/${drawn} 画素がかけらの外`);
        }
    });
}
