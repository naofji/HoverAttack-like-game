import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack,
} from '../src/js/world/town/mining.js';
import { rasterizeParts, SOLID, MAT_MASK, MAT_METAL } from '../src/js/world/town/chunks.js';

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}

test('小屋は幅と高さの上限を守り、部品は外接矩形の中に収まる', () => {
    const rng = new SeededRNG(7);
    const kinds = new Set();
    for (let i = 0; i < 400; i++) {
        const maxW = 16 + Math.floor(rng.next() * 40);
        const maxH = 24 + Math.floor(rng.next() * 100);
        const b = buildMiningShack(rng, { maxW, maxH });
        if (!b) continue;
        kinds.add(b.kind);
        assert.ok(b.footW <= maxW, `足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `${b.kind} 高さ ${b.h} > ${maxH}`);
        partsInside(b);
    }
    assert.deepEqual([...kinds].sort(), ['shack', 'stackShack', 'stiltShack'], '3種類とも出る');
});

test('狭すぎる・低すぎるところには建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildMiningShack(rng, { maxW: 12, maxH: 100 }), null);
    assert.equal(buildMiningShack(rng, { maxW: 40, maxH: 20 }), null);
    assert.equal(buildScaffoldShack(rng, { maxReach: 24 }), null);
});

test('小屋の一番下の段は床に埋まる（地面の小屋は壁、高床は柱が最下段にある）', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 80; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 100 });
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const bottom = Array.from(cells.slice((ch - 1) * cw, ch * cw));
        assert.ok(bottom.some((v) => v), `${b.kind} の最下段が空`);
    }
});

test('屋根はトタン（金属の厚い壁）', () => {
    const rng = new SeededRNG(8);
    for (let i = 0; i < 40; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 40 });
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells.some((v) => (v & MAT_MASK) === MAT_METAL && (v & SOLID)), '金属の屋根が無い');
    }
});

test('同じ絵の小屋はほとんど出ない', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    let n = 0;
    for (let i = 0; i < 100; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 80 });
        if (!b) continue;
        n++;
        seen.add(JSON.stringify(b.parts));
    }
    assert.ok(seen.size >= n - 3, `${n} 棟中 ${seen.size} 種類`);
});

test('足場の小屋は壁側の 4px が埋まる', () => {
    const rng = new SeededRNG(2);
    for (let i = 0; i < 40; i++) {
        const b = buildScaffoldShack(rng, { maxReach: 96 });
        partsInside(b);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        let wallCol = 0;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wallCol++;
        assert.ok(wallCol > 0);
    }
});

test('ランタンと吊り小屋は天井の段に結ばれ、吊る高さを守る。ランタンは弾を止めない', () => {
    const rng = new SeededRNG(4);
    for (let i = 0; i < 40; i++) {
        const maxHang = 64 + Math.floor(rng.next() * 64);
        const l = buildLantern(rng, { maxHang });
        partsInside(l);
        assert.ok(l.h <= maxHang);
        const lc = rasterizeParts(l.parts, l.w, l.h);
        assert.ok(lc.cells[0], 'ランタンの綱が天井の段に無い');
        assert.ok(!lc.cells.some((v) => v & SOLID));

        const s = buildHangingShack(rng, { maxHang });
        if (!s) continue;
        partsInside(s);
        assert.ok(s.h <= maxHang);
        const sc = rasterizeParts(s.parts, s.w, s.h);
        assert.ok(Array.from(sc.cells.slice(0, sc.cw)).some((v) => v), '吊り小屋の綱が天井の段に無い');
    }
});
