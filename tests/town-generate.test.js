import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, TOWN_CEILING_CLEARANCE, TOWN_FOUNDATION_SINK, TOWN_VILLAGE_DENSE_FILL, TOWN_BASE_QUIET_INNER,
} from '../src/js/utils/Constants.js';

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

/** 村を指定して並べる（村の効き方だけを見るため） */
async function stage3With(seed, villages) {
    const { Map } = await import('../src/js/world/Map.js');
    const { generateTown } = await import('../src/js/world/town/generate.js');
    const map = new Map({ rng: new SeededRNG(seed) }, 2);
    const specs = generateTown({
        grid: map.grid, rows: map.rows, cols: map.cols,
        excludeRects: [map._reservedRects()[1]], rng: new SeededRNG(seed * 7 + 1), villages,
    });
    return { map, specs };
}

/** 面全体を覆う密集した村（村の効き方を外して、ほかの性質だけを見るとき） */
const WHOLE_MAP_VILLAGE = { c: 0, r: 0, radius: 1e5, peak: TOWN_VILLAGE_DENSE_FILL };

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

/** 地形から測り直した、建物の足元の列で一番狭い「地面から天井までの空き」（タイル） */
function measuredHeadroom(map, s) {
    const ground = Math.floor((s.y + s.h - 1) / T);
    const c0 = Math.floor((s.x + s.footX) / T);
    const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
    let min = Infinity;
    for (let c = c0; c <= c1; c++) {
        let r = ground;
        while (r > 0 && map.isSolid(r - 1, c)) r--;          // 段の上面まで上がる
        let n = 0;
        while (!map.isSolid(r - 1 - n, c)) n++;              // そこから天井まで
        min = Math.min(min, ground - (r - 1 - n));
    }
    return min - 1;
}

test('天井までの空きで A と C の割合が変わる（広い所は A、狭い所は C）', async () => {
    // 生成側が付けた s.headroom ではなく、地形から測り直した空きで分ける
    // （区間全体の最小を付けていて、広い所が狭い扱いになっていたのを見逃した。レビュー指摘）
    // 村で建物が半分に減ると5つの種では標本が足りず、広い所の A が 63%（30種で数えると 74%）と
    // ぶれた。ここで見たいのは空きと様式の関係なので、面全体を1つの村にして数を確保する
    let wideA = 0, wideN = 0, narrowA = 0, narrowN = 0;
    for (const seed of SEEDS) {
        const { map, specs } = await stage3With(seed, [WHOLE_MAP_VILLAGE]);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const h = measuredHeadroom(map, s);
            if (h >= 12) { wideN++; if (s.style === 'A') wideA++; }
            if (h <= 5) { narrowN++; if (s.style === 'A') narrowA++; }
        }
    }
    assert.ok(wideN >= 30 && narrowN >= 30, `標本が少ない（広い ${wideN} / 狭い ${narrowN}）`);
    assert.ok(wideA / wideN >= 0.65, `広い所の A ${wideA}/${wideN}`);
    assert.ok(narrowA / narrowN <= 0.25, `狭い所の A ${narrowA}/${narrowN}`);
});

test('床の建物の最下段は、足元のどの列でも岩の中にある（浮いた足場の下に根元がはみ出さない）', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const ground = Math.floor((s.y + s.h - 1) / T);
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            for (let c = c0; c <= c1; c++) {
                assert.ok(map.isSolid(ground, c), `seed ${seed}: ${s.kind} の根元 r${ground} c${c} が空洞`);
            }
        }
    }
});

test('床の建物の上端が見えている列では、その上 2 タイルが空いている（軒や張り出しも含む）', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const rTop = Math.floor(s.y / T);
            for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + s.w - 1) / T); c++) {
                if (map.isSolid(rTop, c)) continue;   // 上端が岩の奥に隠れている列は見えない
                for (let r = rTop - TOWN_CEILING_CLEARANCE; r < rTop; r++) {
                    assert.ok(!map.isSolid(r, c), `seed ${seed}: ${s.kind} (top ${s.y}) の上 r${r} c${c} が岩`);
                }
            }
        }
    }
});

test('村の外はまばら: 村が無いと、面全体が密集した村のときの 2割未満しか建たない', async () => {
    for (const seed of SEEDS) {
        const { specs: noneSpecs } = await stage3With(seed, []);
        const none = noneSpecs.length;
        const full = (await stage3With(seed, [WHOLE_MAP_VILLAGE])).specs.length;
        assert.ok(none < full * 0.2, `seed ${seed}: 村なし ${none} / 全面が村 ${full}`);
    }
});

test('壁の家と吊るすものも村に従う: 村が無いと、面全体が村のときの 2割未満', async () => {
    // 床の建物の数に埋もれないよう、壁と天井だけを数える
    let none = 0, full = 0;
    for (const seed of SEEDS) {
        const count = (specs) => specs.filter((s) => s.site !== 'floor').length;
        none += count((await stage3With(seed, [])).specs);
        full += count((await stage3With(seed, [WHOLE_MAP_VILLAGE])).specs);
    }
    assert.ok(full >= 30, `標本が少ない（${full}）`);
    assert.ok(none < full * 0.2, `村なし ${none} / 全面が村 ${full}`);
});

test('建物は村の周りに集まる: 左半分だけ村にすると、床の建物の 7割以上が左半分に建つ', async () => {
    for (const seed of SEEDS) {
        const { map } = await stage3With(seed, []);
        const half = map.cols / 2;
        // 左半分の中心に、右端が真ん中を少し越える大きさの村を1つ。縦は面の全体に届く
        const left = [{ c: half / 2, r: map.rows / 2, radius: half * 0.55, peak: TOWN_VILLAGE_DENSE_FILL }];
        const { specs } = await stage3With(seed, left);
        const floors = specs.filter((s) => s.site === 'floor');
        const inLeft = floors.filter((s) => (s.x + s.footX) / T < half).length;
        // 実機で比率を 密集 0.8・村の外 0.1 に調整（ユーザー）。村の中と外の差が 18倍 → 8倍になり、
        // 左の割合は 8割強 → 最小 78%（seed 55）。村が無いと 5割前後なので、7割で十分に差を見られる
        assert.ok(inLeft >= floors.length * 0.7, `seed ${seed}: 左 ${inLeft} / 全 ${floors.length}`);
    }
});

test('面全体に村がある: 左・中・右の3分割のどこにも床の建物が建つ', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        const third = map.cols / 3;
        for (let k = 0; k < 3; k++) {
            const n = specs.filter((s) => s.site === 'floor' && Math.floor((s.x + s.footX) / T / third) === k).length;
            assert.ok(n >= 5, `seed ${seed}: 3分割の ${k} 番目に ${n} 棟しかない`);
        }
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

test('最後の敵基地の周りには町が無い（基地の中心から TOWN_BASE_QUIET_INNER タイル以内に掛かる建物は無い）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    let near = 0;
    for (const seed of SEEDS) {
        const map = new Map({ rng: new SeededRNG(seed) }, 2);
        const b = map.enemyBaseCenter;
        for (const s of map._buildTownSpecs()) {
            // 建物の外接矩形のうち、基地の中心に一番近い点で測る（大きな塔の端が入り込まないこと）
            const nx = Math.max(s.x, Math.min((b.c + 0.5) * T, s.x + s.w));
            const ny = Math.max(s.y, Math.min((b.r + 0.5) * T, s.y + s.h));
            const d = Math.hypot(nx / T - (b.c + 0.5), ny / T - (b.r + 0.5));
            assert.ok(d >= TOWN_BASE_QUIET_INNER, `seed ${seed}: ${s.site}/${s.kind} が基地から ${d.toFixed(1)} タイル`);
            if (d < TOWN_BASE_QUIET_INNER + 15) near++;
        }
    }
    // 区域のすぐ外にはまた建つ（面の右端がまるごと空にはならない）
    assert.ok(near > 0, '区域のすぐ外にも1棟も無い');
});

test('静かな区域の縁がぼけていなくても、幅の広い塔が区域に入り込まない（外接矩形で判定）', async () => {
    // 縁をなめらかにしていると、区域の手前では建てる確率がほぼ 0 で、この判定が無くても入り込まない。
    // 縁を切り立たせて（outer ≒ inner）判定だけを見る
    for (const seed of SEEDS) {
        const { map } = await stage3With(seed, []);
        const z = { c: map.cols / 2, r: map.rows / 2, inner: 30, outer: 30.001 };
        const { generateTown } = await import('../src/js/world/town/generate.js');
        const specs = generateTown({
            grid: map.grid, rows: map.rows, cols: map.cols, rng: new SeededRNG(seed),
            villages: [WHOLE_MAP_VILLAGE], quietZones: [z],
        });
        for (const s of specs) {
            const nx = Math.max(s.x, Math.min((z.c + 0.5) * T, s.x + s.w));
            const ny = Math.max(s.y, Math.min((z.r + 0.5) * T, s.y + s.h));
            const d = Math.hypot(nx / T - (z.c + 0.5), ny / T - (z.r + 0.5));
            assert.ok(d >= z.inner, `seed ${seed}: ${s.site}/${s.kind} が区域の中心から ${d.toFixed(1)}`);
        }
    }
});
