import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, TOWN_CEILING_CLEARANCE, TOWN_MIN_HEADROOM, TOWN_FOUNDATION_SINK,
} from '../src/js/utils/Constants.js';
import { findSites } from '../src/js/world/town/placement.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [11, 22, 33, 44, 55];

/** 本物の3面の地形（missionLevel 2）と、そこに並べた町の設計図 */
async function stage3(seed) {
    const { Map } = await import('../src/js/world/Map.js');
    const { generateTown } = await import('../src/js/world/town/generate.js');
    const map = new Map({ rng: new SeededRNG(seed) }, 2);
    const base = map._reservedRects()[1];
    const specs = generateTown({
        grid: map.grid, rows: map.rows, cols: map.cols,
        excludeRects: [base], rng: new SeededRNG(seed * 7 + 1),
    });
    return { map, base, specs };
}

const tileRange = (s) => ({
    r0: Math.floor(s.y / T), r1: Math.floor((s.y + s.h - 1) / T),
    c0: Math.floor(s.x / T), c1: Math.floor((s.x + s.w - 1) / T),
});

test('adobeShare: 広い所は A が 8割、狭い所は 1割、あいだは線形', async () => {
    const { adobeShare } = await import('../src/js/world/town/generate.js');
    assert.equal(adobeShare(20), 0.8);
    assert.equal(adobeShare(12), 0.8);
    assert.equal(adobeShare(5), 0.1);
    assert.equal(adobeShare(3), 0.1);
    assert.ok(Math.abs(adobeShare(8.5) - 0.45) < 1e-9);
});

test('建物はすべて盤面の中', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs) {
            assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= map.width && s.y + s.h <= map.height,
                `seed ${seed}: ${s.kind} (${s.x},${s.y} ${s.w}x${s.h}) が盤面の外`);
        }
    }
});

test('基地の部屋に一部でも掛かる建物は無い', async () => {
    for (const seed of SEEDS) {
        const { base, specs } = await stage3(seed);
        for (const s of specs) {
            const t = tileRange(s);
            const overlap = t.r0 <= base.r1 && t.r1 >= base.r0 && t.c0 <= base.c1 && t.c1 >= base.c0;
            assert.ok(!overlap, `seed ${seed}: ${s.kind} が基地の部屋に掛かる`);
        }
    }
});

test('床の建物の上 2 タイルは空いている（天井にくっつかない）', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            const rTop = Math.floor((s.y - 1) / T);
            for (let r = rTop - TOWN_CEILING_CLEARANCE + 1; r <= rTop; r++) {
                for (let c = c0; c <= c1; c++) {
                    assert.ok(!map.isSolid(r, c),
                        `seed ${seed}: ${s.kind} (top ${s.y}) の上 r${r} c${c} が岩`);
                }
            }
        }
    }
});

test('床の建物は、足元のどの列でも床の岩から 16px 以上見えている（段差の岩に埋もれない）', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            for (let c = c0; c <= c1; c++) {
                // その列で建物の底より上にある一番下の岩の上面
                let r = Math.floor((s.y + s.h - 1) / T);
                while (r > 0 && map.isSolid(r - 1, c)) r--;
                // 平らな床でも土台の 4px は埋まるので、背の低い小屋（16px）は 12px しか見えない。
                // 段差の上の列でも「平らな床と同じだけ（ただし 16px まで）」見えていればよい
                const need = Math.min(16, s.h - TOWN_FOUNDATION_SINK);
                assert.ok(r * T - s.y >= need, `seed ${seed}: ${s.kind} が列 c${c} で ${r * T - s.y}px しか見えない（${need}px 要る）`);
            }
        }
    }
});

test('天井までの空きで A と C の割合が変わる（広い所は A、狭い所は C）', async () => {
    let wideA = 0, wideN = 0, narrowA = 0, narrowN = 0;
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            if (s.headroom >= 12) { wideN++; if (s.style === 'A') wideA++; }
            if (s.headroom <= 5) { narrowN++; if (s.style === 'A') narrowA++; }
        }
    }
    assert.ok(wideN >= 30 && narrowN >= 30, `標本が少ない（広い ${wideN} / 狭い ${narrowN}）`);
    assert.ok(wideA / wideN >= 0.65, `広い所の A ${wideA}/${wideN}`);
    assert.ok(narrowA / narrowN <= 0.25, `狭い所の A ${narrowA}/${narrowN}`);
});

test('面全体にまんべんなく: 建てられる床の半分以上に建物がある', async () => {
    for (const seed of SEEDS) {
        const { map, base, specs } = await stage3(seed);
        const covered = new Set();
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            const r = Math.floor((s.y + s.h - 1) / T);
            for (let c = c0; c <= c1; c++) covered.add(`${r},${c}`);
        }
        let total = 0, hit = 0;
        for (const f of findSites(map.grid, map.rows, map.cols).floors) {
            if (f.headroom < TOWN_MIN_HEADROOM || f.c1 - f.c0 < 2) continue;
            if (f.r >= base.r0 && f.r <= base.r1 && f.c1 > base.c0) continue;   // 基地の部屋の床は数えない
            for (let c = f.c0; c < f.c1; c++) { total++; if (covered.has(`${f.r},${c}`)) hit++; }
        }
        assert.ok(hit / total >= 0.5, `seed ${seed}: ${hit}/${total}`);
    }
});

test('床・壁・天井の3種類とも置かれ、壁と天井のものは他の建物と重ならない', async () => {
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const site of ['floor', 'wall', 'ceiling']) {
            assert.ok(specs.some((s) => s.site === site), `seed ${seed}: ${site} が無い`);
        }
        const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        specs.forEach((a, i) => {
            if (a.site === 'floor') return;
            specs.forEach((b, j) => {
                if (i !== j) assert.ok(!hits(a, b), `seed ${seed}: ${a.kind} と ${b.kind} が重なる`);
            });
        });
    }
});

test('隣り合う塔を橋でつなぐことがある（シバーム）', async () => {
    let bridged = 0;
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.insets)) {
            // 橋は隣の塔まで（隙間 16px 以上）伸びる。バルコニー(8)と梁(4)はそこまで届かない
            if (s.parts.some((p) => p.x + p.w > s.footX + s.footW + 12)) bridged++;
        }
    }
    assert.ok(bridged > 0);
});

test('同じ乱数なら同じ町（週の決定性）', async () => {
    const a = await stage3(11);
    const b = await stage3(11);
    assert.deepEqual(a.specs, b.specs);
});
