// 描いた画素は必ず値 0 でないかけらの中（段1レビューの持ち越し）。かけらを抜いて clearRect
// したときに、どのかけらにも入っていない画素が宙に残らないように
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, chunkHash, CHUNK, MAT_WOOD, MAT_ADOBE, SOLID } from '../src/js/world/town/chunks.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

test('色のある部品の画素は、どれも値が 0 でないかけらの中にある（実際の3面の町で）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    for (const seed of [11, 22, 33]) {
        const map = new Map({ rng: new SeededRNG(seed) }, 2);
        let miss = 0, total = 0;
        for (const s of map._buildTownSpecs()) {
            const { cells, cw } = rasterizeParts(s.parts, s.w, s.h);
            for (const p of s.parts) {
                if (!p.color) continue;
                for (let y = Math.max(0, p.y); y < Math.min(s.h, p.y + p.h); y++) {
                    for (let x = Math.max(0, p.x); x < Math.min(s.w, p.x + p.w); x++) {
                        total++;
                        if (!cells[Math.floor(y / CHUNK) * cw + Math.floor(x / CHUNK)]) miss++;
                    }
                }
            }
        }
        assert.ok(total > 0);
        assert.equal(miss, 0, `seed ${seed}: ${miss}/${total} 画素がかけらの外`);
    }
});

test('描くだけの部品で埋めたかけらは細い木、材料のある部品なら細いその材料（厚い壁にはしない）', () => {
    // 2x2 の部品は 4px のかけらの中心 (2,2) に届かないので、中心の規則では埋まらない
    const paintOnly = rasterizeParts([{ x: 0, y: 0, w: 2, h: 2, color: '#000000', mat: 0, solid: false }], 4, 4);
    assert.equal(paintOnly.cells[0], MAT_WOOD);
    const adobe = rasterizeParts([{ x: 0, y: 0, w: 2, h: 2, color: '#000000', mat: MAT_ADOBE, solid: true }], 4, 4);
    assert.equal(adobe.cells[0], MAT_ADOBE);
    assert.equal(adobe.cells[0] & SOLID, 0);
});

test('中心の規則で埋まったかけらは上書きしない（厚い壁の印が残る）', () => {
    const { cells } = rasterizeParts([
        { x: 0, y: 0, w: 4, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true },
        { x: 0, y: 0, w: 1, h: 1, color: '#111111', mat: 0, solid: false },
    ], 4, 4);
    assert.equal(cells[0], MAT_ADOBE | SOLID);
});

test('chunkHash: 同じ引数なら同じ値、0 以上 1 未満、引数ごとにばらける', () => {
    assert.equal(chunkHash(3, 4, 5), chunkHash(3, 4, 5));
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const v = chunkHash(7, i, 2);
        assert.ok(v >= 0 && v < 1);
        seen.add(Math.floor(v * 10));
    }
    assert.equal(seen.size, 10, '10 等分のどこにも値が出る');
});
