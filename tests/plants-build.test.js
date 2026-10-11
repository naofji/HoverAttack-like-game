import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, MAT_PLANT, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import {
    buildMoss, buildLowFern, buildTallFern, buildWallPlant, buildHangingVine,
} from '../src/js/world/town/plants.js';
import { PLAYER_HEIGHT } from '../src/js/utils/Constants.js';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const each = (fn) => { for (const seed of SEEDS) fn(new SeededRNG(seed), seed); };
const BIG = { maxW: 400, maxH: 400, maxReach: 64, maxHang: 400 };

const builds = {
    moss: (r) => buildMoss(r, BIG),
    lowFern: (r) => buildLowFern(r, BIG),
    tallFern: (r) => buildTallFern(r, BIG),
    wallPlant: (r) => buildWallPlant(r, BIG),
    vine: (r) => buildHangingVine(r, BIG),
};

for (const [name, build] of Object.entries(builds)) {
    test(`${name}: かけらは全部「植物の厚い壁」（弾が止まり、燃えず、爆発物でもない）`, () => {
        each((rng) => {
            const b = build(rng);
            assert.ok(b, '大きな余裕を渡せば必ず作れる');
            const { cells } = rasterizeParts(b.parts, b.w, b.h);
            assert.ok(cells.some((v) => v), 'かけらが1つも無い');
            for (const v of cells) if (v) assert.equal(v, MAT_PLANT | SOLID);
        });
    });

    test(`${name}: 外接矩形は 4px の倍数で、根元の x が矩形の中にある`, () => {
        each((rng) => {
            const b = build(rng);
            assert.equal(b.w % CHUNK, 0);
            assert.equal(b.h % CHUNK, 0);
            assert.ok(b.footX >= 0 && b.footX < b.w);
        });
    });

    test(`${name}: 同じ乱数なら同じ絵`, () => {
        const a = build(new SeededRNG(5)), b = build(new SeededRNG(5));
        assert.deepEqual(a, b);
    });
}

test('苔: 見える高さ（根元の段は岩に埋まる）が 4〜8px', () => {
    each((rng) => {
        const b = buildMoss(rng, BIG);
        assert.ok(b.h - CHUNK >= 4 && b.h - CHUNK <= 8, `見える高さ ${b.h - CHUNK}`);
    });
});

test('低いシダは機体（24px）より低く、高いシダは高い', () => {
    each((rng) => {
        const low = buildLowFern(rng, BIG);
        assert.ok(low.h - CHUNK < PLAYER_HEIGHT, `低いシダ ${low.h - CHUNK}`);
        const tall = buildTallFern(rng, BIG);
        assert.ok(tall.h - CHUNK > PLAYER_HEIGHT, `高いシダ ${tall.h - CHUNK}`);
    });
});

test('床の植物は根元の段（一番下の行）に根元のかけらがある', () => {
    each((rng) => {
        for (const build of [buildMoss, buildLowFern, buildTallFern]) {
            const b = build(rng, BIG);
            const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
            const i = b.footX / CHUNK;
            assert.ok(cells[(ch - 1) * cw + i], `${b.kind}: 根元 (${i}, ${ch - 1}) が空`);
        }
    });
});

test('天井の蔓は上端の段に根元がある', () => {
    each((rng) => {
        const b = buildHangingVine(rng, BIG);
        const { cells, cw } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells.slice(0, cw).some((v) => v));
    });
});

test('置ける広さ・高さが足りなければ置かない（null）', () => {
    assert.equal(buildMoss(new SeededRNG(1), { maxW: 4 }), null);
    assert.equal(buildLowFern(new SeededRNG(1), { maxH: 8 }), null);
    assert.equal(buildTallFern(new SeededRNG(1), { maxH: 24 }), null);
    assert.equal(buildHangingVine(new SeededRNG(1), { maxHang: 8 }), null);
});

test('高いシダは maxH を超えない', () => {
    each((rng) => {
        const b = buildTallFern(rng, { maxH: 80 });
        if (b) assert.ok(b.h <= 80, `高さ ${b.h}`);   // 冠の葉も含めて、置ける高さに収まる
    });
});
