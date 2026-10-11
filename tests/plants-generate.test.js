import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generatePlants } from '../src/js/world/town/generatePlants.js';
import { rasterizeParts, computeAnchors, MAT_PLANT, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { TILE_SIZE as T, PLAYER_HEIGHT, BLOCK_EMPTY, TOWN_CEILING_CLEARANCE } from '../src/js/utils/Constants.js';

// 岩に囲まれた 100x40 タイルの広い空洞（行 8〜31、列 6〜93）。床・天井・左右の壁が全部ある。
// 左の列 6〜45 は天井が行 27 まで下がっていて、床（行 32）の上の空きは 4 タイルしかない（高いシダが天井に刺さる所）
const ROWS = 40, COLS = 100;
const SLAB_BOTTOM = 27, SLAB_COLS = [6, 45];
const grid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 8 && r <= 31 && c >= 6 && c <= 93
        && !(r <= SLAB_BOTTOM && c >= SLAB_COLS[0] && c <= SLAB_COLS[1]) ? BLOCK_EMPTY : 1)));
const isSolid = (r, c) => r < 0 || r >= ROWS || c < 0 || c >= COLS || grid[r][c] !== BLOCK_EMPTY;
// 村は1つ、空洞の真ん中の密集（どの種類も出やすい）
const VILLAGES = [{ c: 50, r: 20, radius: 80, peak: 0.8 }];

const gen = (seed, extra = {}) => generatePlants({
    grid, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES, ...extra,
});

test('床・壁・天井に、苔・低いシダ・高いシダ・蔓が並ぶ', () => {
    const specs = gen(11);
    const kinds = new Set(specs.map((s) => s.kind));
    for (const k of ['moss', 'lowFern', 'tallFern', 'vine']) assert.ok(kinds.has(k), `${k} が無い`);
    for (const site of ['floor', 'wall', 'ceiling']) assert.ok(specs.some((s) => s.site === site), `${site} が無い`);
});

test('設計図の印: 全部 soft（燃えない・崩壊の演出なし）で、絵柄は P', () => {
    for (const s of gen(11)) {
        assert.equal(s.soft, true);
        assert.equal(s.style, 'P');
    }
});

test('どの植物も岩につながっている（支えのかけらが1つ以上）', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            const anchors = computeAnchors(cells, cw, ch, s.x, s.y, isSolid);
            assert.ok(anchors.length > 0, `${s.site}/${s.kind} (${s.x},${s.y}) が宙に浮いている`);
        }
    }
});

test('床の苔・シダの高さの種類: 苔は 8px 以下、低いシダは機体より低く、高いシダは高い', () => {
    const specs = [...gen(1), ...gen(2), ...gen(3)].filter((s) => s.site === 'floor');
    for (const s of specs) {
        const visible = s.h - CHUNK;
        if (s.kind === 'moss') assert.ok(visible <= 8, `苔 ${visible}`);
        if (s.kind === 'lowFern') assert.ok(visible < PLAYER_HEIGHT, `低いシダ ${visible}`);
        if (s.kind === 'tallFern') assert.ok(visible > PLAYER_HEIGHT, `高いシダ ${visible}`);
    }
    assert.ok(specs.some((s) => s.kind === 'lowFern') && specs.some((s) => s.kind === 'tallFern'), '混ざっていない');
});

test('天井に刺さらない: 天井が低い所の床の植物は、上端が天井から 2 タイル（TOWN_CEILING_CLEARANCE）以上離れる', () => {
    let low = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const s of gen(seed).filter((o) => o.site === 'floor')) {
            const mid = (s.x + s.w / 2) / T;
            if (mid < SLAB_COLS[0] + 3 || mid > SLAB_COLS[1] - 3) continue;   // 天井が低い所の真ん中だけ（縁は葉が張り出す）
            low++;
            assert.ok(s.y >= (SLAB_BOTTOM + 1 + TOWN_CEILING_CLEARANCE) * T, `${s.kind} (${s.x},${s.y}) が天井に近すぎる`);
        }
    }
    assert.ok(low > 20, `低い天井の下に置いた植物が ${low} しか無い（この検証が意味を失った）`);
});

test('除外の矩形（基地の部屋）には置かない', () => {
    const rc = { r0: 8, r1: 31, c0: 50, c1: 93 };
    for (const s of gen(7, { excludeRects: [rc] })) {
        const c1 = Math.floor((s.x + s.w - 1) / T), r1 = Math.floor((s.y + s.h - 1) / T);
        const hit = s.x / T <= rc.c1 && c1 >= rc.c0 && s.y / T <= rc.r1 && r1 >= rc.r0;
        assert.ok(!hit, `${s.kind} (${s.x},${s.y}) が除外の矩形に掛かる`);
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

test('村の外（濃さ 0.1）より、密集した村の中のほうが植物が多い', () => {
    const count = (villages) => generatePlants({ grid, rows: ROWS, cols: COLS, rng: new SeededRNG(9), villages }).length;
    assert.ok(count(VILLAGES) > count([]) * 2);
});
