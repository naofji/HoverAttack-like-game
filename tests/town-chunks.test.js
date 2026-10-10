import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHUNK, MAT_ADOBE, MAT_WOOD, SOLID, rasterizeParts, computeAnchors,
} from '../src/js/world/town/chunks.js';
import { normalizeUp, mirrorParts, step4 } from '../src/js/world/town/shapes.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

test('かけらは 4px 角', () => {
    assert.equal(CHUNK, 4);
});

test('部品の中にかけらの中心が入ったかけらだけが埋まる。材料と厚い壁の印が付く', () => {
    const parts = [{ x: 0, y: 0, w: 8, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true }];
    const { cells, cw, ch } = rasterizeParts(parts, 8, 8);
    assert.equal(cw, 2);
    assert.equal(ch, 2);
    assert.deepEqual(Array.from(cells), [MAT_ADOBE | SOLID, MAT_ADOBE | SOLID, 0, 0]);
});

test('後の部品が前の部品を上書きする', () => {
    const parts = [
        { x: 0, y: 0, w: 8, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true },
        { x: 4, y: 0, w: 4, h: 4, color: null, mat: MAT_WOOD, solid: false },
    ];
    const { cells } = rasterizeParts(parts, 8, 4);
    assert.deepEqual(Array.from(cells), [MAT_ADOBE | SOLID, MAT_WOOD]);
});

test('材料の無い部品（描くだけ）はかけらにならない', () => {
    const parts = [{ x: 0, y: 0, w: 8, h: 8, color: '#000000', mat: 0, solid: false }];
    const { cells } = rasterizeParts(parts, 8, 8);
    assert.deepEqual(Array.from(cells), [0, 0, 0, 0]);
});

test('中心(2px)を含む細い部品は埋まり、含まない部品は埋まらない', () => {
    const hit = rasterizeParts([{ x: 1, y: 0, w: 2, h: 4, color: null, mat: MAT_WOOD, solid: false }], 8, 4);
    assert.equal(hit.cells[0], MAT_WOOD);
    const miss = rasterizeParts([{ x: 3, y: 0, w: 2, h: 4, color: null, mat: MAT_WOOD, solid: false }], 8, 4);
    assert.deepEqual(Array.from(miss.cells), [0, 0]);
});

test('支え: 中心が岩のタイルに入っているかけらが、そのタイルに支えられる', () => {
    // 建物は (14, 10) に 8x8。かけらの中心は x=16,20 / y=12,16。
    // 下の段（y=16）だけがタイル行1、どちらの列もタイル列1。角（x=14, y=10）で
    // 判定すると行も列もずれるように、タイルの境目をまたぐ位置に置いてある
    const parts = [{ x: 0, y: 0, w: 8, h: 8, color: null, mat: MAT_ADOBE, solid: true }];
    const { cells, cw, ch } = rasterizeParts(parts, 8, 8);
    const anchors = computeAnchors(cells, cw, ch, 14, 10, (r, c) => r === 1 && c === 1);
    assert.deepEqual(anchors, [{ i: 2, r: 1, c: 1 }, { i: 3, r: 1, c: 1 }]);
});

test('normalizeUp は上へ積んだ部品（y が負）を 0 から始まるように下げる', () => {
    const { parts, h } = normalizeUp([
        { x: 0, y: -12, w: 4, h: 12, color: null, mat: 0, solid: false },
        { x: 0, y: 0, w: 4, h: 2, color: null, mat: 0, solid: false },
    ]);
    assert.equal(h, 14);
    assert.equal(parts[0].y, 0);
    assert.equal(parts[1].y, 12);
});

test('mirrorParts は左右を反転する', () => {
    const [p] = mirrorParts([{ x: 2, y: 0, w: 4, h: 4, color: null, mat: 0, solid: false }], 20);
    assert.equal(p.x, 14);
});

test('step4 は両端を含む 4 の倍数を返す', () => {
    const rng = new SeededRNG(1);
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(step4(rng, 16, 28));
    assert.deepEqual([...seen].sort((a, b) => a - b), [16, 20, 24, 28]);
    assert.equal(step4(rng, 16, 10), 16, 'hi < lo なら lo');
});
