import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generateIcicles } from '../src/js/world/town/generateIcicles.js';
import { rasterizeParts, computeAnchors, CHUNK } from '../src/js/world/town/chunks.js';
import { TILE_SIZE as T, BLOCK_EMPTY, ICICLE_LENGTH, ICICLE_KEEP_BELOW } from '../src/js/utils/Constants.js';
import { icicleDamage } from '../src/js/world/town/icicles.js';

// 岩に囲まれた 100x40 タイルの広い空洞（行 8〜31、列 6〜93）。床（行 32）・天井（行 7）・左右の壁がある。
// 左の列 6〜45 は天井が行 27 まで下がっていて、空きは 4 タイルしかない（床まで 3 タイル残すと吊るせない所）
const ROWS = 40, COLS = 100;
const SLAB_BOTTOM = 27, SLAB_COLS = [6, 45];
const grid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 8 && r <= 31 && c >= 6 && c <= 93
        && !(r <= SLAB_BOTTOM && c >= SLAB_COLS[0] && c <= SLAB_COLS[1]) ? BLOCK_EMPTY : 1)));
const isSolid = (r, c) => r < 0 || r >= ROWS || c < 0 || c >= COLS || grid[r][c] !== BLOCK_EMPTY;
const VILLAGES = [{ c: 50, r: 20, radius: 80, peak: 0.8 }];

const gen = (seed, extra = {}) => generateIcicles({
    grid, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES, ...extra,
});

test('天井にだけ、つららが並ぶ。設計図の印は soft・brittle・flora ice', () => {
    const specs = gen(11);
    assert.ok(specs.length > 20, `${specs.length} 本しか無い`);
    for (const s of specs) {
        assert.equal(s.site, 'ceiling');
        assert.equal(s.kind, 'icicle');
        assert.equal(s.soft, true);
        assert.equal(s.brittle, true);
        assert.equal(s.flora, 'ice');
        assert.equal(s.style, 'P');
    }
});

test('どのつららも天井の岩につながっている（支えのかけらが 1 つ以上）。上端の 4px が岩に埋まる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            const anchors = computeAnchors(cells, cw, ch, s.x, s.y, isSolid);
            assert.ok(anchors.length > 0, `(${s.x},${s.y}) が宙に浮いている`);
            // 上端の行だけが岩に入る（先は空洞の中）
            assert.ok(anchors.every((a) => a.i < cw), '上端の行以外のかけらが岩に入っている');
        }
    }
});

test('長さは設定の範囲。ダメージは長さに比例（icicleDamage と同じ）。footX は矩形の中', () => {
    const lengths = [];
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const len = s.h - CHUNK;
            lengths.push(len);
            assert.equal(s.length, len);
            assert.ok(len >= ICICLE_LENGTH[0] && len <= ICICLE_LENGTH[1], `長さ ${len}`);
            assert.equal(s.damage, icicleDamage(len));
            assert.ok(s.footX > 0 && s.footX < s.w);
        }
    }
    assert.ok(lengths.some((l) => l <= 32) && lengths.some((l) => l >= 56), '短いか長いつららが出ない');
});

/** 天井は行 20 まで、空洞は行 21 から emptyRows 行（列 6〜93）、その下が床。吊るせる長さが空きで決まる部屋 */
const lowRoom = (emptyRows) => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 21 && r < 21 + emptyRows && c >= 6 && c <= 93 ? BLOCK_EMPTY : 1)));

test('床まで ICICLE_KEEP_BELOW タイルの余白を残す（空き 5 タイルの部屋では、長さ 32px まで。先が床に近づかない）', () => {
    const grid5 = lowRoom(5);
    const floorTop = (21 + 5) * T;
    let longest = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const specs = generateIcicles({ grid: grid5, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES });
        for (const s of specs) {
            assert.ok(s.y + s.h <= floorTop - ICICLE_KEEP_BELOW * T, `(${s.x},${s.y}) の先 ${s.y + s.h} が床 ${floorTop} に近すぎる`);
            longest = Math.max(longest, s.length);
        }
        assert.ok(specs.length > 10, `${specs.length} 本しか無い（この検証が意味を失った）`);
    }
    assert.equal(longest, (5 - ICICLE_KEEP_BELOW) * T, '余白いっぱいの長さまで吊るしていない（余白を取りすぎている）');
});

test('空きが余白（ICICLE_KEEP_BELOW）＋最短の長さに足りない部屋には、1 本も吊るさない', () => {
    for (const emptyRows of [1, 2, 3, 4]) {
        const specs = generateIcicles({ grid: lowRoom(emptyRows), rows: ROWS, cols: COLS, rng: new SeededRNG(1), villages: VILLAGES });
        assert.equal(specs.length, 0, `空き ${emptyRows} タイルで ${specs.length} 本`);
    }
});

test('天井が低い所（空きが余白と最短の長さに足りない）には吊るさない', () => {
    let high = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const s of gen(seed)) {
            const mid = (s.x + s.w / 2) / T;
            assert.ok(!(mid >= SLAB_COLS[0] && mid <= SLAB_COLS[1] + 1 && s.y > 20 * T), `低い天井の下 (${s.x},${s.y}) にある`);
            high++;
        }
    }
    assert.ok(high > 30, '高い天井の下のつららが少なすぎる（この検証が意味を失った）');
});

test('隣のつららと重ならない', () => {
    for (const seed of [1, 2, 3]) {
        const specs = gen(seed);
        for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
            const a = specs[i], b = specs[j];
            assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `(${a.x},${a.y}) と (${b.x},${b.y}) が重なる`);
        }
    }
});

test('除外の矩形（開始の部屋・基地の部屋）には置かない。複数渡せる', () => {
    const rects = [{ r0: 8, r1: 31, c0: 6, c1: 30 }, { r0: 8, r1: 31, c0: 70, c1: 93 }];
    const specs = gen(7, { excludeRects: rects });
    assert.ok(specs.length > 0);
    for (const s of specs) {
        const c1 = Math.floor((s.x + s.w - 1) / T), r1 = Math.floor((s.y + s.h - 1) / T);
        for (const rc of rects) {
            assert.ok(!(s.x / T <= rc.c1 && c1 >= rc.c0 && s.y / T <= rc.r1 && r1 >= rc.r0), `(${s.x},${s.y}) が除外の矩形に掛かる`);
        }
    }
});

test('同じ乱数なら同じ設計図、違えば違う', () => {
    const sig = (specs) => JSON.stringify(specs.map((s) => [s.x, s.y, s.w, s.h]));
    assert.equal(sig(gen(3)), sig(gen(3)));
    assert.notEqual(sig(gen(3)), sig(gen(4)));
});

test('Math.random を使わない（週の決定性。渡した rng だけで決まる）', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('Math.random は使わない'); };
    try { gen(3); } finally { Math.random = real; }
});

test('村の外より、密集した村の中のほうがつららが多い', () => {
    const count = (villages) => generateIcicles({ grid, rows: ROWS, cols: COLS, rng: new SeededRNG(9), villages }).length;
    assert.ok(count(VILLAGES) > count([]) * 2);
});

test('根元の段のかけらは全部、岩に埋まる（天井の区間が段で終わる所で、根元が宙にはみ出さない）', () => {
    // 列 6〜40 は天井が行 20、列 41〜93 は天井が行 10（行 11〜31 が空洞）。行 20 の天井の区間は列 41 の手前で終わり、
    // その先（列 41 の行 20）は空洞。区間の端に吊るすと、根元の半分が空中に出る
    const stepGrid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => {
        if (c < 6 || c > 93 || r > 31) return 1;
        return r >= (c <= 40 ? 21 : 11) ? BLOCK_EMPTY : 1;
    }));
    const solid = (r, c) => r < 0 || r >= ROWS || c < 0 || c >= COLS || stepGrid[r][c] !== BLOCK_EMPTY;
    let nearEdge = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const specs = generateIcicles({ grid: stepGrid, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: [{ c: 30, r: 20, radius: 80, peak: 1 }] });
        for (const s of specs) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            let top = 0;
            for (let i = 0; i < cw; i++) if (cells[i]) top++;
            const anchors = computeAnchors(cells, cw, ch, s.x, s.y, solid);
            assert.equal(anchors.length, top, `(${s.x},${s.y}) の根元 ${top} かけらのうち ${anchors.length} しか岩に入らない`);
            if (s.x + s.w > 38 * T && s.x < 41 * T) nearEdge++;
        }
    }
    assert.ok(nearEdge > 0, '区間の端に 1 本も吊るしていない（この検証が意味を失った）');
});
