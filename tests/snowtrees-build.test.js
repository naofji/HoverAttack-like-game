import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, MAT_PLANT, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { signedArea } from '../src/js/world/town/polygons.js';
import { buildFir, buildBareTree } from '../src/js/world/town/snowTrees.js';
import { SNOWTREE_COLORS } from '../src/js/world/town/palette.js';
import { SNOWTREE_HEIGHT, SNOWTREE_MAX_WIDTH, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';

const SEEDS = Array.from({ length: 80 }, (_, i) => i * 7919 + 1);
const each = (fn) => { for (const seed of SEEDS) fn(new SeededRNG(seed), seed); };
const BIG = { maxH: 400 };
const builds = { fir: buildFir, bare: buildBareTree };

for (const [name, build] of Object.entries(builds)) {
    test(`${name}: かけらは全部「植物の厚い壁」（弾が止まり、燃えず、爆発物でもない）`, () => {
        each((rng) => {
            const b = build(rng, BIG);
            assert.ok(b, '大きな余裕を渡せば必ず作れる');
            const { cells } = rasterizeParts(b.parts, b.w, b.h);
            assert.ok(cells.some((v) => v));
            for (const v of cells) if (v) assert.equal(v, MAT_PLANT | SOLID);
        });
    });

    test(`${name}: 外接矩形は 4px の倍数で、根元の x が矩形の中にある`, () => {
        each((rng) => {
            const b = build(rng, BIG);
            assert.equal(b.w % CHUNK, 0);
            assert.equal(b.h % CHUNK, 0);
            assert.ok(b.footX >= 0 && b.footX < b.w);
        });
    });

    test(`${name}: 同じ乱数なら同じ絵`, () => {
        assert.deepEqual(build(new SeededRNG(5), BIG), build(new SeededRNG(5), BIG));
    });

    test(`${name}: 絵は外接矩形に収まる`, () => {
        each((rng) => {
            const b = build(rng, BIG);
            for (const p of b.parts) for (const r of p.rings) for (const [x, y] of r) {
                assert.ok(x >= -1e-9 && x <= b.w + 1e-9 && y >= -1e-9 && y <= b.h + 1e-9, `${b.kind}: (${x}, ${y}) が ${b.w}x${b.h} の外`);
            }
        });
    });

    test(`${name}: 根元の段（一番下の行）に根元のかけらがある（岩に支えられる）`, () => {
        each((rng) => {
            const b = build(rng, BIG);
            const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
            const i = b.footX / CHUNK;
            assert.ok(cells[(ch - 1) * cw + i], `${b.kind}: 根元 (${i}, ${ch - 1}) が空`);
        });
    });

    test(`${name}: 見える高さ（根元の段は岩に埋まる）は SNOWTREE_HEIGHT の範囲（機体の 8割〜3倍）`, () => {
        const [lo, hi] = SNOWTREE_HEIGHT[name];
        assert.ok(lo >= PLAYER_HEIGHT * 0.8 && hi <= PLAYER_HEIGHT * 3, '設定が指定の範囲を出ている');
        for (let i = 0; i < 1500; i++) {
            const b = build(new SeededRNG(i * 31 + 7), BIG);
            const visible = b.h - CHUNK;
            assert.ok(visible >= lo && visible <= hi, `seed ${i * 31 + 7}: 見える高さ ${visible}`);
        }
    });

    test(`${name}: 範囲の端まで作り分ける（一様に近い。ある高さに偏らない）`, () => {
        const [lo, hi] = SNOWTREE_HEIGHT[name];
        const seen = new Set();
        for (let i = 0; i < 600; i++) seen.add(build(new SeededRNG(i * 13 + 1), BIG).h - CHUNK);
        assert.ok(seen.has(lo) && seen.has(hi), `${lo} と ${hi} が出ない: ${[...seen].sort((a, b) => a - b)}`);
        assert.ok(seen.size >= (hi - lo) / CHUNK, `高さが ${seen.size} 通りしか出ない`);
    });

    test(`${name}: 置ける高さを超えない。見える高さの下限（20px）に満たなければ作らない`, () => {
        for (let i = 0; i < 300; i++) {
            const maxH = 24 + (i % 12) * 4;
            const b = build(new SeededRNG(i + 1), { maxH });
            assert.ok(b, `maxH ${maxH} で作れない`);
            assert.ok(b.h <= maxH, `maxH ${maxH} に ${b.h}`);
        }
        assert.equal(build(new SeededRNG(1), { maxH: 20 }), null);
    });

    test(`${name}: 雪が載っている（雪の輪の面積が絵の2割以上）`, () => {
        const snow = new Set(SNOWTREE_COLORS.snow);
        each((rng) => {
            const b = build(rng, { maxH: 400 });
            let all = 0, white = 0;
            for (const p of b.parts) {
                const a = p.rings.reduce((n, r) => n + Math.abs(signedArea(r)), 0);
                all += a;
                if (snow.has(p.color)) white += a;
            }
            assert.ok(white / all >= 0.2, `${b.kind}: 雪 ${(100 * white / all).toFixed(0)}%`);
        });
    });

    test(`${name}: 絵の一番上は雪（頂に雪が積もっている）`, () => {
        const snow = new Set(SNOWTREE_COLORS.snow);
        each((rng) => {
            const b = build(rng, BIG);
            let topY = Infinity;
            for (const p of b.parts) for (const r of p.rings) for (const [, y] of r) topY = Math.min(topY, y);
            const atTop = b.parts.filter((p) => p.rings.some((r) => r.some(([, y]) => y <= topY + 1.5)));
            assert.ok(atTop.every((p) => snow.has(p.color)), `${b.kind}: 頂が雪でない`);
        });
    });
}

test('針葉樹は枝の段が重なり、背が高いほど段が多い', () => {
    const tiers = (h) => {
        const b = buildFir(new SeededRNG(3), { maxH: h + CHUNK });
        // 針葉の本体の色の輪の数 ＝ 段の数
        return b.parts.find((p) => p.color === SNOWTREE_COLORS.needle[1]).rings.length;
    };
    assert.ok(tiers(72) > tiers(20), `${tiers(72)} vs ${tiers(20)}`);
});

test('木の幅は SNOWTREE_MAX_WIDTH を超えない（床に置くとき、この幅ぶんの列の天井までの空きを測る）', () => {
    for (let i = 0; i < 6000; i++) {
        for (const build of [buildFir, buildBareTree]) {
            const b = build(new SeededRNG(i * 7 + 1), BIG);
            assert.ok(b.w <= SNOWTREE_MAX_WIDTH, `seed ${i * 7 + 1}: ${b.kind} の幅 ${b.w}`);
        }
    }
});
