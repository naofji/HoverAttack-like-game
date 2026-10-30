// 7面の要塞（金属パネル）を PNG に書き出す。パネルの絵柄を調整するとき、実機を開かずに
// 前後を見比べるためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/render-fortress-scene.mjs --out fortress.png                  # 今週の7面、1つ目の区画
//   node tools/render-fortress-scene.mjs --seed 3 --zone 2 --scale 2 --out a.png
//   node tools/render-fortress-scene.mjs --zone 0 --damage "6,10,3;6,11,5"   # 「行,列,ダメージ」を ; 区切りで。金属の焼け・硬い岩のひびを見る
//   node tools/render-fortress-scene.mjs --phase warn                        # 電流の床の段階（active=放電、warn=予兆、rest=休み。既定は放電）
//   node tools/render-fortress-scene.mjs --facility 0                       # 区画ではなく施設エリア（メタルパネルと金属の斜面）
//   node tools/render-fortress-scene.mjs --x 400 --y 300 --w 800 --h 500     # 区画ではなく座標で指定
//
// 実物の Map を生成し、タイルの絵は Map の描画関数（_drawTile）を PixelCanvas に流して描く。
// PixelCanvas は clip / stroke / 乱数の多角形を持たないので、岩（_drawRockyBlock）は縁と中の2色で近似する
// （要塞の中は金属と硬い岩のパネルだけで、岩の近似が効くのは区画の外の地形）。
// 描く順はゲームと同じ（遠景の空洞の色 → 地形）。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, STAGE_ENVIRONMENTS, BLOCK_EMPTY, BLOCK_METAL, BLOCK_HARD } from '../src/js/utils/Constants.js';
import { getCurrentWeek, stageSeed } from '../src/js/utils/WeekSeed.js';
import { PixelCanvas, writePng } from './lib/pixel-canvas.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
}, []));

const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { backdropColors } = await import('../src/js/world/CaveBackdrop.js');

const MISSION = 6;
const seed = args.seed ? Number(args.seed) : stageSeed(getCurrentWeek().seed, MISSION);
const map = new GameMap({ rng: new SeededRNG(seed) }, MISSION);

// 被弾の再現。damageBlock を通さず blockHP を直接減らす（壊れる手前までで止める）
for (const t of String(args.damage || '').split(';').filter(Boolean)) {
    const [r, c, d] = t.split(',').map(Number);
    map.blockHP[r][c] = Math.max(1, map.blockHP[r][c] - d);
}

let X, Y, W, H;
if (args.x !== undefined) {
    X = Number(args.x); Y = Number(args.y ?? 0); W = Number(args.w ?? 800); H = Number(args.h ?? 500);
} else if (args.facility !== undefined) {
    const area = map.facilityAreas[Number(args.facility)];
    if (!area) throw new Error(`施設エリア ${args.facility} が無い（施設エリアは ${map.facilityAreas.length} 個）`);
    // 施設エリアに3タイルの余白（外の洞窟の岩と見比べる）
    X = (area.c0 - 3) * T; Y = (area.r0 - 3) * T;
    W = (area.c1 - area.c0 + 7) * T; H = (area.r1 - area.r0 + 7) * T;
} else {
    const zone = map.fortressZones[Number(args.zone ?? 0)];
    if (!zone) throw new Error(`区画 ${args.zone ?? 0} が無い（区画は ${map.fortressZones.length} 個）`);
    // 区画の矩形に1タイルの余白
    X = (zone.c0 - 1) * T; Y = (zone.r0 - 1) * T;
    W = (zone.c1 - zone.c0 + 3) * T; H = (zone.r1 - zone.r0 + 3) * T;
}
const scale = Number(args.scale ?? 1);

const screen = new PixelCanvas(W, H);
const ctx = screen.getContext();
const style = map.blockStyles[1];
ctx.fillStyle = backdropColors(style.fill, STAGE_ENVIRONMENTS[MISSION % STAGE_ENVIRONMENTS.length].backdrop).voidColor;
ctx.fillRect(0, 0, W, H);
ctx.translate(-X, -Y);

for (let r = Math.floor(Y / T); r <= Math.floor((Y + H) / T); r++) {
    for (let c = Math.floor(X / T); c <= Math.floor((X + W) / T); c++) {
        if (r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.grid[r][c] === BLOCK_EMPTY) continue;
        const block = map.grid[r][c];
        const marked = map.fortress[r * map.cols + c] === 1;
        const facility = map.facility[r * map.cols + c] === 1;
        if ((facility || (marked && (block === BLOCK_METAL || block === BLOCK_HARD))) && map._drawTile) {
            map._drawTile(ctx, r, c);
        } else if (block === BLOCK_METAL) {
            map._drawPolishedBlock(ctx, c * T, r * T, T, map.blockStyles[block], r, c);
        } else {
            const st = map.blockStyles[block] || style;
            ctx.fillStyle = st.border; ctx.fillRect(c * T, r * T, T, T);
            ctx.fillStyle = st.fill; ctx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
        }
    }
}

// バリア（位置関係の確認用。ユニットとバリアの帯だけで、被弾の演出は出さない）
const { FortressBarrier } = await import('../src/js/entities/FortressBarrier.js');
for (const zone of map.fortressZones) {
    for (const spec of zone.barriers) new FortressBarrier({ map }, spec).draw(ctx);
}

// 格納塔（お宝の入れ物）。ゲームと同じ StorageTower.draw。--tick で明滅の時刻を選べる
const { StorageTower } = await import('../src/js/entities/StorageTower.js');
for (const zone of map.fortressZones) {
    for (const t of zone.treasures) {
        const tower = new StorageTower({ map }, { x: t.c * T + T / 2, y: (t.r + 1) * T, kind: t.kind });
        tower.timer = Number(args.tick ?? 0);
        tower.draw(ctx);
    }
}

// 電流の床。ゲームと同じ ElectricFloor.draw を、段階を固定して描く（既定は一番目立つ放電）
const { ElectricFloor, electricPhase } = await import('../src/js/entities/ElectricFloor.js');
const wantPhase = args.phase || 'active';
for (const zone of map.fortressZones) {
    for (const spec of zone.electricFloors) {
        const floor = new ElectricFloor({ map }, spec);
        while (electricPhase(floor.timer) !== wantPhase) floor.timer++;
        floor.timer += 3;   // 段階の頭ではなく少し進んだ所（火花・放電の形が出ている）
        floor.draw(ctx);
    }
}

const out = args.out || 'fortress-scene.png';
writePng(out, screen, scale);
console.log(`seed ${seed} region (${X},${Y}) ${W}x${H} zones ${map.fortressZones.length} -> ${out}`);
