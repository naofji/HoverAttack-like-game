import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generateSnowTrees } from '../src/js/world/town/generateSnowTrees.js';
import { rasterizeParts, computeAnchors, CHUNK } from '../src/js/world/town/chunks.js';
import {
    TILE_SIZE as T, BLOCK_EMPTY, TOWN_CEILING_CLEARANCE, PLAYER_HEIGHT, SNOWTREE_HEIGHT,
} from '../src/js/utils/Constants.js';

// 岩に囲まれた 100x40 タイルの広い空洞（行 8〜31、列 6〜93）。左の列 6〜45 は天井が行 27 まで下がっていて、
// 床（行 32）の上の空きは 4 タイルしかない（高い木が天井に刺さる所）
const ROWS = 40, COLS = 100;
const SLAB_BOTTOM = 27, SLAB_COLS = [6, 45];
const grid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 8 && r <= 31 && c >= 6 && c <= 93
        && !(r <= SLAB_BOTTOM && c >= SLAB_COLS[0] && c <= SLAB_COLS[1]) ? BLOCK_EMPTY : 1)));
const isSolid = (r, c) => r < 0 || r >= ROWS || c < 0 || c >= COLS || grid[r][c] !== BLOCK_EMPTY;
const VILLAGES = [{ c: 50, r: 20, radius: 80, peak: 0.8 }];

const gen = (seed, extra = {}) => generateSnowTrees({
    grid, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES, ...extra,
});

test('床に、針葉樹と枯れ木が並ぶ（壁・天井には置かない）', () => {
    const specs = gen(11);
    const kinds = new Set(specs.map((s) => s.kind));
    assert.ok(kinds.has('fir') && kinds.has('bareTree'), [...kinds].join());
    assert.ok(specs.every((s) => s.site === 'floor'));
    assert.ok(specs.length > 20, `${specs.length} 本しか無い`);
});

test('設計図の印: 全部 soft（燃えない・崩壊の演出なし）で、雪の木（flora: snow）', () => {
    for (const s of gen(11)) {
        assert.equal(s.soft, true);
        assert.equal(s.flora, 'snow');
        assert.equal(s.style, 'P');
    }
});

test('どの木も岩につながっている（支えのかけらが1つ以上）', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            assert.ok(computeAnchors(cells, cw, ch, s.x, s.y, isSolid).length > 0, `${s.kind} (${s.x},${s.y}) が宙に浮いている`);
        }
    }
});

test('見える高さは機体の 8割〜3倍（19.2〜72px）。置いた木の高さが偏らない', () => {
    const heights = [];
    for (const seed of [1, 2, 3, 4, 5]) for (const s of gen(seed)) heights.push(s.h - CHUNK);
    assert.ok(Math.min(...heights) >= PLAYER_HEIGHT * 0.8, `最小 ${Math.min(...heights)}`);
    assert.ok(Math.max(...heights) <= PLAYER_HEIGHT * 3, `最大 ${Math.max(...heights)}`);
    assert.ok(heights.some((h) => h <= 28) && heights.some((h) => h >= 64), '低い木か高い木が出ない');
});

test('天井に刺さらない: 天井が低い所の木は、上端が天井から 2 タイル（TOWN_CEILING_CLEARANCE）以上離れる', () => {
    let low = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const s of gen(seed)) {
            const mid = (s.x + s.w / 2) / T;
            if (mid < SLAB_COLS[0] + 3 || mid > SLAB_COLS[1] - 3) continue;
            low++;
            assert.ok(s.y >= (SLAB_BOTTOM + 1 + TOWN_CEILING_CLEARANCE) * T, `${s.kind} (${s.x},${s.y}) が天井に近すぎる`);
        }
    }
    assert.ok(low > 10, `低い天井の下の木が ${low} しか無い（この検証が意味を失った）`);
});

test('隣の木と重ならない', () => {
    for (const s of [1, 2, 3]) {
        const specs = gen(s);
        for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
            const a = specs[i], b = specs[j];
            const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            assert.ok(!hit, `(${a.x},${a.y}) と (${b.x},${b.y}) が重なる`);
        }
    }
});

test('除外の矩形（基地の部屋）には置かない', () => {
    const rc = { r0: 8, r1: 31, c0: 50, c1: 93 };
    const specs = gen(7, { excludeRects: [rc] });
    assert.ok(specs.length > 0);
    for (const s of specs) {
        const c1 = Math.floor((s.x + s.w - 1) / T), r1 = Math.floor((s.y + s.h - 1) / T);
        assert.ok(!(s.x / T <= rc.c1 && c1 >= rc.c0 && s.y / T <= rc.r1 && r1 >= rc.r0), `(${s.x},${s.y}) が除外の矩形に掛かる`);
    }
});

test('同じ乱数なら同じ設計図、違えば違う', () => {
    const sig = (specs) => JSON.stringify(specs.map((s) => [s.kind, s.x, s.y, s.w, s.h]));
    assert.equal(sig(gen(3)), sig(gen(3)));
    assert.notEqual(sig(gen(3)), sig(gen(4)));
});

test('Math.random を使わない（週の決定性。渡した rng だけで決まる）', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('Math.random は使わない'); };
    try { gen(3); } finally { Math.random = real; }
});

test('村の外より、密集した村の中のほうが木が多い', () => {
    const count = (villages) => generateSnowTrees({ grid, rows: ROWS, cols: COLS, rng: new SeededRNG(9), villages }).length;
    assert.ok(count(VILLAGES) > count([]) * 2);
});

test('SNOWTREE_HEIGHT の範囲が指定（機体の 8割〜3倍）を出ていない', () => {
    for (const [lo, hi] of Object.values(SNOWTREE_HEIGHT)) {
        assert.ok(lo >= PLAYER_HEIGHT * 0.8 && hi <= PLAYER_HEIGHT * 3);
    }
});

test('根元は床の上に立つ（細い足場の端でも、根元が縁の外で浮かない）', () => {
    // 行 15 の床が、幅 4 タイルの足場と幅 3 タイルの穴（深さ 4）を交互に繰り返す
    const R = 20, C = 80;
    const g = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (
        r >= 19 || c < 2 || c >= C - 2 || (r >= 15 && c % 7 < 4) ? 1 : BLOCK_EMPTY)));
    const solid = (r, c) => r < 0 || r >= R || c < 0 || c >= C || g[r][c] !== BLOCK_EMPTY;
    let n = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const specs = generateSnowTrees({ grid: g, rows: R, cols: C, rng: new SeededRNG(seed), villages: VILLAGES });
        for (const s of specs) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            const below = Math.floor((s.y + s.h) / T);
            for (let i = 0; i < cw; i++) {
                if (!cells[(ch - 1) * cw + i]) continue;
                n++;
                assert.ok(solid(below, Math.floor((s.x + i * CHUNK + CHUNK / 2) / T)), `${s.kind} (${s.x},${s.y}) の根元（列 ${i}）の下が空き`);
            }
        }
    }
    assert.ok(n > 10, `根元を ${n} 個しか調べていない（この検証が意味を失った）`);
});
