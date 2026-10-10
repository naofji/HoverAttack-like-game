// 3面の町を PNG に書き出す。町の絵柄・密度を調整するとき、実機を開かずに
// 前後を見比べるためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/render-town-scene.mjs --out town.png                       # 今週の3面、左上（開始の部屋）
//   node tools/render-town-scene.mjs --seed 3 --x 1200 --y 300 --w 1366 --h 768 --scale 1 --out a.png
//   node tools/render-town-scene.mjs --stats                              # 棟数・種類・生成時間
//
// 実物の Map を生成し、Map._buildTownSpecs() の設計図から画素を持つ canvas で町を作り直して描く。
// 地形はタイルを2色（縁と中）で塗るだけ（面取りは再現しない）。描く順はゲームと同じ
// （遠景の空洞の色 → 町 → 地形）。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';
import { getCurrentWeek, stageSeed } from '../src/js/utils/WeekSeed.js';
import { PixelCanvas, writePng } from './lib/pixel-canvas.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
}, []));

// 地形キャッシュ・遠景・ミニマップの canvas は描かないので、何もしない ctx を渡す
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { Town } = await import('../src/js/world/town/Town.js');
const { backdropColors } = await import('../src/js/world/CaveBackdrop.js');

const MISSION = 2;   // 3面
const seed = args.seed ? Number(args.seed) : stageSeed(getCurrentWeek().seed, MISSION);
const map = new GameMap({ rng: new SeededRNG(seed) }, MISSION);

const t0 = performance.now();
const specs = map._buildTownSpecs();
const t1 = performance.now();
// 画素を持たない canvas で作る時間 ＝ かけらの表と支えの計算（実機の canvas の確保・塗りは別）
new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: () => ({ getContext: () => noopCtx }) });
const t2 = performance.now();

if (args.stats) {
    const by = {};
    for (const s of specs) by[`${s.site}/${s.style}/${s.kind}`] = (by[`${s.site}/${s.style}/${s.kind}`] || 0) + 1;
    const area = specs.reduce((sum, s) => sum + s.w * s.h, 0);
    console.log(JSON.stringify({
        seed, map: `${map.cols}x${map.rows}`, buildings: specs.length, byKind: by,
        spriteMB: +(area * 4 / 1e6).toFixed(2),
        specsMs: +(t1 - t0).toFixed(1), rasterizeMs: +(t2 - t1).toFixed(1),
    }, null, 2));
    process.exit(0);
}

const town = new Town(specs, {
    isSolidTile: (r, c) => map.isSolid(r, c),
    createCanvas: (w, h) => new PixelCanvas(w, h),
});

const X = Number(args.x ?? 0), Y = Number(args.y ?? 0);
const W = Number(args.w ?? 1366), H = Number(args.h ?? 768);
const scale = Number(args.scale ?? 1);
const screen = new PixelCanvas(W, H);
const ctx = screen.getContext();
const style = map.blockStyles[1];
ctx.fillStyle = backdropColors(style.fill, 'cave').voidColor;
ctx.fillRect(0, 0, W, H);
ctx.translate(-X, -Y);
town.draw(ctx, { x: X, y: Y, w: W, h: H });
for (let r = Math.floor(Y / T); r <= Math.floor((Y + H) / T); r++) {
    for (let c = Math.floor(X / T); c <= Math.floor((X + W) / T); c++) {
        if (r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.grid[r][c] === 0) continue;
        const st = map.blockStyles[map.grid[r][c]] || style;
        ctx.fillStyle = st.border; ctx.fillRect(c * T, r * T, T, T);
        ctx.fillStyle = st.fill; ctx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
    }
}
const out = args.out || 'town-scene.png';
writePng(out, screen, scale);
console.log(`seed ${seed} region (${X},${Y}) ${W}x${H} buildings ${specs.length} -> ${out}`);
