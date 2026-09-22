// 4面の水の挙動を数値で測る。水の物理・分類を変える前後で比べるためのもので、
// ゲーム本体からは呼ばれない。trace-water.mjs が「1ビットも変わっていないか」を
// 見るのに対し、こちらは「変わったなら、どう変わったか」を見る。
//
// 使い方:
//   node tools/measure-water.mjs > metrics.json
//
// 測るもの（シードごと＋合計）:
//   massViolations… 水量の保存。1フレームの総量の増分は「0 以上、水源の数×WATER_SPRING_MASS
//                   以下」でなければならない（物理は保存的で、増えるのは水源からだけ）。
//                   外れたフレームの数
//   stepUs        … map.update() の所要時間（µs）の中央値・95%・最大
//   rebuildUs     … 種別キャッシュの作り直し（_rebuildWaterCacheIfDirty）の同上
//   active        … アクティブなセル数の中央値・最大
//   flicker       … 1フレームで「滝 ⇄ 滝以外」が入れ替わったセルの延べ数
//   floatingHeads … 真上が岩でも水でもない滝セル（宙に浮いた滝の始まり）の延べ数
//   sweepHits     … 乾いた縦穴の拾い直し（findStuckDryPockets）が何かを拾った回数と個数
//   mirrorDiff    … 左右反転したマップで同じだけ回し、結果を反転して比べたときに
//                   水量が食い違うセルの数（左右対称なら 0）

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { WATER_SPRING_MASS } from '../src/js/utils/Constants.js';

const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { WATER_FALL } = await import('../src/js/world/waterQuery.js');

const SEEDS = [1, 2, 3, 4, 5, 6];
const FRAMES = 2400;
const BLAST_EVERY = 150;
const MISSION_LEVEL = 3;

const q = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
};

function pickBlastTarget(map, rng) {
    const cand = [];
    for (let r = 1; r < map.rows - 1; r++) {
        for (let c = 1; c < map.cols - 1; c++) {
            if (!map.isSolid(r, c)) continue;
            let wet = false;
            for (let dr = -1; dr <= 1 && !wet; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (map.water[(r + dr) * map.cols + c + dc] > 0) { wet = true; break; }
                }
            }
            if (wet) cand.push([r, c]);
        }
    }
    return cand.length ? cand[Math.floor(rng.next() * cand.length)] : null;
}

/** 地形と水を左右反転する（水源の列も）。生成は済んでいるので地形だけ差し替える */
function mirror(map) {
    const { rows, cols } = map;
    for (let r = 0; r < rows; r++) {
        map.grid[r].reverse();
        map.blockHP[r].reverse();
        const row = map.water.slice(r * cols, (r + 1) * cols).reverse();
        map.water.set(row, r * cols);
    }
    for (const sp of map.waterSprings) sp.c = cols - 1 - sp.c;
    map.activeWaterCells = new Set([...map.activeWaterCells].map((k) => {
        const r = Math.floor(k / cols), c = k % cols;
        return r * cols + (cols - 1 - c);
    }));
    for (let c = 0; c < cols; c++) map.dirtyWaterCols.add(c);
}

function run(seed, { mirrored = false, measure = true, blast = true } = {}) {
    const game = { rng: new SeededRNG(seed) };
    const map = new GameMap(game, MISSION_LEVEL);
    game.map = map;
    if (mirrored) mirror(map);
    const { rows, cols } = map;
    const blastRng = new SeededRNG(seed * 7919 + 13);

    const maxGain = map.waterSprings.length * WATER_SPRING_MASS;
    let massViolations = 0;
    const stepUs = [], rebuildUs = [], active = [];
    let flicker = 0, floatingHeads = 0;

    let prevFall = new Uint8Array(rows * cols);
    for (let f = 1; f <= FRAMES; f++) {
        let before = 0;
        for (const m of map.water) before += m;
        const t0 = process.hrtime.bigint();
        map.update();
        const t1 = process.hrtime.bigint();
        map._rebuildWaterCacheIfDirty();
        const t2 = process.hrtime.bigint();
        let after = 0;
        for (const m of map.water) after += m;
        if (after - before < 0 || after - before > maxGain) massViolations++;
        if (measure) {
            stepUs.push(Number(t1 - t0) / 1000);
            rebuildUs.push(Number(t2 - t1) / 1000);
            active.push(map.activeWaterCells.size);
        }

        if (f % BLAST_EVERY === 0) {
            const t = (mirrored || !blast) ? null : pickBlastTarget(map, blastRng);
            if (t) map.destroyArea(t[0], t[1], 1, 999);
        }

        const fall = new Uint8Array(rows * cols);
        for (let k = 0; k < rows * cols; k++) {
            if (map.waterKind[k] !== WATER_FALL) continue;
            fall[k] = 1;
            const r = Math.floor(k / cols), c = k % cols;
            if (r > 0 && !map.isSolid(r - 1, c) && map.water[k - cols] === 0) floatingHeads++;
        }
        for (let k = 0; k < rows * cols; k++) if (fall[k] !== prevFall[k]) flicker++;
        prevFall = fall;
    }
    return {
        map,
        stats: {
            massViolations,
            stepUs: { p50: q(stepUs, 0.5), p95: q(stepUs, 0.95), max: q(stepUs, 1) },
            rebuildUs: { p50: q(rebuildUs, 0.5), p95: q(rebuildUs, 0.95), max: q(rebuildUs, 1) },
            active: { p50: q(active, 0.5), max: q(active, 1) },
            flicker,
            floatingHeads,
        },
    };
}

// 乾いた縦穴の拾い直しが本当に何かを拾っているかは、Map._sweepDryPockets を
// 包んで数える（ESM の名前付き export は差し替えられないため）
let sweepHits = 0, sweepCells = 0;
const origSweep = GameMap.prototype._sweepDryPockets;
GameMap.prototype._sweepDryPockets = function () {
    const snapshot = new Set(this.activeWaterCells);
    origSweep.call(this);
    let added = 0;
    for (const k of this.activeWaterCells) if (!snapshot.has(k)) added++;
    if (added > 0) { sweepHits++; sweepCells += added; }
};

const out = { perSeed: {}, total: {} };
let violations = 0, flick = 0, heads = 0, mirrorDiff = 0;
for (const seed of SEEDS) {
    sweepHits = 0; sweepCells = 0;
    const a = run(seed);
    const hits = { sweepHits, sweepCells };
    // 左右対称性は爆破なしで比べる（爆破位置の選び方自体が左右非対称なので）
    const m = run(seed, { mirrored: true, measure: false });
    const ref = run(seed, { measure: false, blast: false }).map;
    let diff = 0;
    const { rows, cols } = m.map;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (ref.water[r * cols + c] !== m.map.water[r * cols + (cols - 1 - c)]) diff++;
        }
    }
    out.perSeed[seed] = { ...a.stats, ...hits, mirrorDiff: diff };
    violations += a.stats.massViolations; flick += a.stats.flicker; heads += a.stats.floatingHeads; mirrorDiff += diff;
}

out.total = { massViolations: violations, flicker: flick, floatingHeads: heads, mirrorDiff };
const seeds = Object.values(out.perSeed);
out.total.stepUsP95Max = Math.max(...seeds.map((s) => s.stepUs.p95));
out.total.stepUsMaxMax = Math.max(...seeds.map((s) => s.stepUs.max));
out.total.rebuildUsP95Max = Math.max(...seeds.map((s) => s.rebuildUs.p95));
out.total.sweepHits = seeds.reduce((a, s) => a + s.sweepHits, 0);
out.total.sweepCells = seeds.reduce((a, s) => a + s.sweepCells, 0);
console.log(JSON.stringify(out, null, 1));
