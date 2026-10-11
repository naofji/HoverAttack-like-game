import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, MAT_ICE, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { buildIcicle, icicleDamage } from '../src/js/world/town/icicles.js';
import { ICICLE_COLORS } from '../src/js/world/town/palette.js';
import { ICICLE_LENGTH, ICICLE_WIDTH, ICICLE_DAMAGE } from '../src/js/utils/Constants.js';

const SEEDS = Array.from({ length: 80 }, (_, i) => i * 7919 + 1);
const each = (fn) => { for (const seed of SEEDS) fn(new SeededRNG(seed), seed); };
const BIG = { maxLength: 400 };

test('かけらは全部「氷の厚い壁」（弾が止まり、燃えず、爆発物でもない）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        assert.ok(b, '大きな余裕を渡せば必ず作れる');
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells.some((v) => v));
        for (const v of cells) if (v) assert.equal(v, MAT_ICE | SOLID);
        // どの部品も氷の厚い壁（本体だけ材料が無いと、明るい面・影の筋が覆えないかけらが抜ける）
        for (const p of b.parts) { assert.equal(p.mat, MAT_ICE); assert.equal(p.solid, true); }
    });
});

test('外接矩形は 4px の倍数で、根元の x が矩形の中にある。絵は外接矩形に収まる', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        assert.equal(b.w % CHUNK, 0);
        assert.equal(b.h % CHUNK, 0);
        assert.ok(b.footX > 0 && b.footX < b.w);
        for (const p of b.parts) for (const r of p.rings) for (const [x, y] of r) {
            assert.ok(x >= -1e-9 && x <= b.w + 1e-9 && y >= -1e-9 && y <= b.h + 1e-9, `(${x}, ${y}) が ${b.w}x${b.h} の外`);
        }
    });
});

test('見える長さ（上の 4px は天井に埋まる）と根元の幅が、設定の範囲に収まる（数千通りの乱数）', () => {
    for (let i = 0; i < 3000; i++) {
        const b = buildIcicle(new SeededRNG(i * 31 + 7), BIG);
        assert.equal(b.length, b.h - CHUNK);
        assert.ok(b.length >= ICICLE_LENGTH[0] && b.length <= ICICLE_LENGTH[1], `seed ${i * 31 + 7}: 長さ ${b.length}`);
        assert.equal(b.length % CHUNK, 0);
        // 根元の段（一番上の行）に出る輪の幅 ≒ 根元の幅
        let x0 = Infinity, x1 = -Infinity;
        for (const p of b.parts) for (const r of p.rings) for (const [x, y] of r) if (y < 0.01) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        assert.ok(x1 - x0 >= ICICLE_WIDTH[0] - 1 && x1 - x0 <= ICICLE_WIDTH[1] + 1, `seed ${i * 31 + 7}: 幅 ${x1 - x0}`);
    }
});

test('長さの範囲の端まで作り分ける（偏らない）', () => {
    const seen = new Set();
    for (let i = 0; i < 600; i++) seen.add(buildIcicle(new SeededRNG(i * 13 + 1), BIG).length);
    assert.ok(seen.has(ICICLE_LENGTH[0]) && seen.has(ICICLE_LENGTH[1]), `端が出ない: ${[...seen].sort((a, b) => a - b)}`);
    assert.ok(seen.size >= (ICICLE_LENGTH[1] - ICICLE_LENGTH[0]) / CHUNK, `${seen.size} 通りしか出ない`);
});

test('置ける長さ（maxLength）を超えない。下限（24px）に満たなければ作らない', () => {
    for (let i = 0; i < 300; i++) {
        const maxLength = ICICLE_LENGTH[0] + (i % 12) * 4;
        const b = buildIcicle(new SeededRNG(i + 1), { maxLength });
        assert.ok(b, `maxLength ${maxLength} で作れない`);
        assert.ok(b.length <= maxLength, `maxLength ${maxLength} に ${b.length}`);
    }
    assert.equal(buildIcicle(new SeededRNG(1), { maxLength: ICICLE_LENGTH[0] - 4 }), null);
});

test('先が尖る: 根元の段より先の段のほうが、かけらが少ない（細くなる）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const row = (j) => { let n = 0; for (let i = 0; i < cw; i++) if (cells[j * cw + i]) n++; return n; };
        assert.ok(row(0) >= 2, '根元の段が 1 かけら以下');
        assert.ok(row(ch - 1) < row(0), `先 ${row(ch - 1)} が根元 ${row(0)} より細くない`);
        assert.ok(row(ch - 1) >= 1, '先の段が空');
    });
});

test('根元の段（一番上の行）にかけらがあり、そこから先まで 1 本につながっている（途中で切れない）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        for (let j = 0; j < ch; j++) {
            let any = false;
            for (let i = 0; i < cw; i++) if (cells[j * cw + i]) any = true;
            assert.ok(any, `${j} 段目が空（途中で切れている）`);
        }
    });
});

test('描き順は body → light → dark（明るい面と影の筋が本体の上に重なる）', () => {
    const b = buildIcicle(new SeededRNG(3), BIG);
    const order = b.parts.map((p) => p.color);
    assert.deepEqual(order, [ICICLE_COLORS.body, ICICLE_COLORS.light, ICICLE_COLORS.dark]);
});

test('同じ乱数なら同じ絵', () => {
    assert.deepEqual(buildIcicle(new SeededRNG(5), BIG), buildIcicle(new SeededRNG(5), BIG));
});

test('icicleDamage: 長さに比例（最短で ICICLE_DAMAGE[0]、最長で [1]、中間は線形で四捨五入）', () => {
    const [l0, l1] = ICICLE_LENGTH, [d0, d1] = ICICLE_DAMAGE;
    assert.equal(icicleDamage(l0), d0);
    assert.equal(icicleDamage(l1), d1);
    const mid = (l0 + l1) / 2;
    assert.equal(icicleDamage(mid), Math.round((d0 + d1) / 2));
    // つららの長さは 4px 刻みなので、ダメージは常に整数（2 刻み）に収まるが、丸めは長さが 4px 刻みでないときのための決まり
    assert.equal(icicleDamage(l0 + 3), Math.round(d0 + (3 / (l1 - l0)) * (d1 - d0)));
    assert.ok(Number.isInteger(icicleDamage(l0 + 3)));
    let prev = -Infinity;
    for (let len = l0; len <= l1; len += CHUNK) {
        const d = icicleDamage(len);
        assert.ok(d >= prev, '長いほうがダメージが小さい');
        prev = d;
    }
    const b = buildIcicle(new SeededRNG(9), BIG);
    assert.equal(b.damage, icicleDamage(b.length));
});
