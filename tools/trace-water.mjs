// 4面の水の「状態の指紋」をフレームごとに記録する。水まわりのリファクタリングで
// 「挙動を1セルも変えていない」ことを示すためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/trace-water.mjs > before.json    # 変更前
//   node tools/trace-water.mjs > after.json     # 変更後
//   node tools/trace-water.mjs --compare before.json after.json
//
// 実物の Map を生成し、実物の描画（createWaterRenderer）を game.env.renderer に
// 配線したうえで、水源を流しながら一定間隔で水辺のブロックを爆破する。
// 配線を再現しないと Map.onWaterChanged() が invalidate を呼ばず、描画の差を
// 取りこぼす（memory: hoverattack-waterfall-zigzag-gaps の「診断で踏んだ罠」）。
//
// 記録するのは次の指紋（SHA-1）:
//   state  … water[] / waterKind / waterSurfaceY / activeWaterCells
//   query  … 全セルでの isWaterAtPixel(3点) / isWaterfallAtPixel / getSurfaceY /
//            isWaterSurface
//   paint  … 水のオフスクリーン canvas 2枚の「タイルごとの最終的な描画内容」。
//            clearRect でそのタイルの記録を捨て、以後の fillRect をタイルに積む。
//            タイルをまたぐ順序は無視する（塗り直しはタイルの中でしか描かないので、
//            塗る順が変わっても絵は同じ。区間の処理順を変えたとき、呼び出し順の
//            指紋だけがずれて「変わった」と誤判定した）
//   frame  … drawOverWorld が画面に出す呼び出し

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

if (process.argv[2] === '--compare') {
    const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    let diffs = 0;
    for (const key of Object.keys(a)) {
        const x = a[key], y = b[key];
        for (let i = 0; i < Math.max(x.length, (y || []).length); i++) {
            if (JSON.stringify(x[i]) === JSON.stringify(y && y[i])) continue;
            diffs++;
            if (diffs <= 10) console.log(`seed ${key} checkpoint ${i}:`, JSON.stringify(x[i]), '→', JSON.stringify(y && y[i]));
        }
    }
    console.log(diffs === 0 ? 'IDENTICAL' : `${diffs} checkpoint(s) differ`);
    process.exit(diffs === 0 ? 0 : 1);
}

/** 呼び出しを逐次ハッシュに流し込む疑似 ctx。全部を配列に溜めるとメモリが持たない */
function hashingCtx() {
    const h = createHash('sha1');
    const ctx = new Proxy({}, {
        get(target, prop) {
            if (prop === '__digest') return () => h.copy().digest('hex').slice(0, 16);
            if (prop in target) return target[prop];
            return (...args) => { h.update(`${String(prop)}(${args.map((v) => (typeof v === 'object' ? '#' : v)).join(',')});`); return { addColorStop() {} }; };
        },
        set(target, prop, value) {
            h.update(`${String(prop)}=${value};`);
            return true;
        },
    });
    return ctx;
}

/** タイル単位で最終的な描画内容を持つ疑似 ctx（水のオフスクリーン canvas 用） */
function tileCtx() {
    const S = TILE_SIZE;
    const tiles = new Map();
    let fill = '';
    const tileOf = (x, y) => `${Math.floor(x / S)},${Math.floor(y / S)}`;
    // 地形キャッシュなど水以外の canvas もこれで作られるので、知らないメソッドは黙って受ける
    const noop = () => ({ addColorStop() {} });
    const own = {
        set fillStyle(v) { fill = v; },
        get fillStyle() { return fill; },
        clearRect(x, y) { tiles.delete(tileOf(x, y)); },
        fillRect(x, y, w, h) {
            const key = tileOf(x, y);
            if (!tiles.has(key)) tiles.set(key, []);
            tiles.get(key).push(`${fill}:${x},${y},${w},${h}`);
        },
        __digest() {
            const h = createHash('sha1');
            for (const key of [...tiles.keys()].sort()) h.update(`${key}=${tiles.get(key).join(';')}|`);
            return h.digest('hex').slice(0, 16);
        },
    };
    return new Proxy(own, {
        get: (t, p) => (p in t ? t[p] : noop),
        set: (t, p, v) => { if (p === 'fillStyle') t.fillStyle = v; return true; },
    });
}

const canvases = [];
globalThis.document = {
    createElement: () => {
        const ctx = tileCtx();
        const cv = { width: 0, height: 0, getContext: () => ctx, ctx };
        canvases.push(cv);
        return cv;
    },
};

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

const SEEDS = [1, 2, 3, 4, 5, 6];
const FRAMES = 2400;
const CHECK_EVERY = 100;
const BLAST_EVERY = 150;
const MISSION_LEVEL = 3;   // 4面（0 起点）

const sha = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 16);

function queryFingerprint(map) {
    const h = createHash('sha1');
    const out = [];
    for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
            const x = c * TILE_SIZE + TILE_SIZE / 2;
            const y = r * TILE_SIZE;
            out.push(
                map.isWaterAtPixel(x, y + 1) ? 1 : 0,
                map.isWaterAtPixel(x, y + 8) ? 1 : 0,
                map.isWaterAtPixel(x, y + 15) ? 1 : 0,
                map.isWaterfallAtPixel(x, y + 8) ? 1 : 0,
                map.isWaterSurface(r, c) ? 1 : 0,
                map.getSurfaceY(r, c),
            );
        }
        h.update(out.join(','));
        out.length = 0;
    }
    return h.digest('hex').slice(0, 16);
}

/** 水に8近傍で接している壊せるブロックを1つ選ぶ（派生 RNG で決定的に） */
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
    if (!cand.length) return null;
    return cand[Math.floor(rng.next() * cand.length)];
}

const result = {};
for (const seed of SEEDS) {
    canvases.length = 0;
    const game = { rng: new SeededRNG(seed) };
    const map = new GameMap(game, MISSION_LEVEL);
    game.map = map;
    game.camera = { x: 0, y: 0 };
    game.canvas = { width: 1366, height: 768 };
    const env = { game };
    const waterCanvasStart = canvases.length;
    const renderer = createWaterRenderer(env);
    const waterCanvases = canvases.slice(waterCanvasStart);
    env.renderer = renderer;
    game.env = env;

    const blastRng = new SeededRNG(seed * 7919 + 13);
    const cams = [
        ...map.waterSprings.map((s) => [s.c * TILE_SIZE - 600, s.r * TILE_SIZE - 200]),
        ...map.waterCells.filter((_, i) => i % 400 === 0).map(([r, c]) => [c * TILE_SIZE - 600, r * TILE_SIZE - 400]),
    ];

    const checkpoints = [];
    for (let f = 1; f <= FRAMES; f++) {
        map.update();
        renderer.update();
        if (f % BLAST_EVERY === 0) {
            const t = pickBlastTarget(map, blastRng);
            if (t) map.destroyArea(t[0], t[1], 1, 999);
        }
        if (f % CHECK_EVERY === 0) {
            const frameCtx = hashingCtx();
            for (const [cx, cy] of cams) renderer.drawOverWorld(frameCtx, Math.max(0, cx), Math.max(0, cy));
            checkpoints.push({
                f,
                water: sha(map.water),
                kind: sha(map.waterKind),
                surfaceY: sha(Buffer.from(map.waterSurfaceY.buffer)),
                active: sha([...map.activeWaterCells].sort((a, b) => a - b).join(',')),
                query: queryFingerprint(map),
                paint: waterCanvases.map((cv) => cv.ctx.__digest()).join('/'),
                frame: frameCtx.__digest(),
            });
        }
    }
    result[seed] = checkpoints;
}
console.log(JSON.stringify(result));
