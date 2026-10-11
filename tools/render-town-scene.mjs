// 3面の町を PNG に書き出す。町の絵柄・密度を調整するとき、実機を開かずに
// 前後を見比べるためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/render-town-scene.mjs --out town.png                       # 今週の3面、左上（開始の部屋）
//   node tools/render-town-scene.mjs --seed 3 --x 1200 --y 300 --w 1366 --h 768 --scale 1 --out a.png
//   node tools/render-town-scene.mjs --stage 4 --out ferns.png            # 4面の苔とシダ（既定は3面の町）
//   node tools/render-town-scene.mjs --stage 5 --out snowtrees.png        # 5面の雪の木（地形の雪のふちは 5px の帯で近似）
//   node tools/render-town-scene.mjs --stats                              # 棟数・種類・生成時間・壊す時間
//   node tools/render-town-scene.mjs --x 1200 --y 300 --blast "1300,420,150;1340,400,36" --ticks 120 --out b.png
//       # 壊した後（段2）。--blast は「x,y,粒の数」を ; 区切りで何発でも（グレネード 150・ミサイル 36）。
//       # --ticks で town.update を回して、破片が落ちて瓦礫になるまで進める（落ちる破片・倒れる木は PixelCanvas.rotate で回して描く）
//   node tools/render-town-scene.mjs --x 1380 --y 660 --fire "1502,810" --ticks 900 --out f.png
//       # 燃やした後（段3）。--fire の点にミサイル1発ぶん（粒 36）の爆発を当てて火をつけ、--ticks 進める。
//       # 炎は四角で出る。煙は描かない（PixelCanvas は煙のパフを焼けない）
//   node tools/render-town-scene.mjs --list-explosives                    # 爆発物の位置（段3b）
//   node tools/render-town-scene.mjs --x 1200 --y 300 --boom "1300,420" --ticks 120 --out c.png
//       # 誘爆の後（段3b）。--boom の点に一番近い爆発物を欠かせて爆発させ、--ticks 進める
//
// 実物の Map を生成し、Map._buildTownSpecs() の設計図から画素を持つ canvas で町を作り直して描く。
// 地形はタイルを2色（縁と中）で塗るだけ（面取りは再現しない）。描く順はゲームと同じ
// （遠景の空洞の色 → 町 → 地形）。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, STAGE_ENVIRONMENTS, SNOW_CAP_COLOR, SNOW_CAP_THICKNESS } from '../src/js/utils/Constants.js';
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
const { SpawnEffects } = await import('../src/js/systems/SpawnEffects.js');

const MISSION = args.stage ? Number(args.stage) - 1 : 2;   // 既定は3面。--stage 4 で苔とシダ
const PROPS = STAGE_ENVIRONMENTS[MISSION % STAGE_ENVIRONMENTS.length].props;
const seed = args.seed ? Number(args.seed) : stageSeed(getCurrentWeek().seed, MISSION);
const map = new GameMap({ rng: new SeededRNG(seed) }, MISSION);

const t0 = performance.now();
const specs = PROPS === 'ferns' ? map._buildPlantSpecs() : PROPS === 'snowtrees' ? map._buildSnowTreeSpecs() : map._buildTownSpecs();
const t1 = performance.now();
// 画素を持たない canvas で作る時間 ＝ かけらの表と支えの計算（実機の canvas の確保・塗りは別）
const noPixels = () => ({ getContext: () => noopCtx });
// 煙のパフは PixelCanvas で焼けない（放射グラデーション）ので、どの Town も煙を描かない
const noSmoke = () => null;
const bench = new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: noPixels, smokeSprites: noSmoke });
const t2 = performance.now();

// 粒は出さない（camera が無いので注文は画面の中扱いで particles に積まれるだけ）。
// 町の爆発物（段3b）の爆発は spawnExplosion → town.blast を通るので、本物を混ぜる
const fakeGame = (town) => Object.assign({
    particles: [], projectiles: [], enemies: [], landmines: [], player: null, carrier: null,
    camera: null, canvas: null, map: { town },
}, SpawnEffects);
function applyBlasts(town, list, ticks) {
    const game = fakeGame(town);
    let maxFalling = 0;
    for (const [x, y, size] of list) {
        town.blast(x, y, size);
        maxFalling = Math.max(maxFalling, town.falling.length);
    }
    for (let i = 0; i < ticks; i++) {
        town.update(game);
        maxFalling = Math.max(maxFalling, town.falling.length);
    }
    return maxFalling;
}

/**
 * 床の建物の中ほど 50 か所にグレネード（粒 150）を1発ずつ当て、120 tick 進めるまでの時間。
 * 画素を持たない canvas なので、ゲームでの clearRect・drawImage の費用は入らない（かけら・支え・落下の計算だけ）
 */
function blastStats() {
    const floors = bench.buildings.filter((b) => b.site === 'floor');
    const step = Math.max(1, Math.floor(floors.length / 50));
    const list = floors.filter((_, i) => i % step === 0).slice(0, 50)
        .map((b) => [b.x + b.width / 2, b.y + b.height / 2, 150]);
    const t3 = performance.now();
    const maxFalling = applyBlasts(bench, list, 120);
    const ms = performance.now() - t3;
    return {
        blasts: list.length, blastMs: +ms.toFixed(1), perBlastMs: +(ms / list.length).toFixed(2), maxFalling,
        collapsed: bench.buildings.filter((b) => b.collapsed).length, rubbleHeaps: bench.rubble.length,
        fire: fireStats(),
    };
}

/**
 * 段3: 床の建物の中ほど 30 か所にミサイル1発ぶんの爆発（火がつく）を当て、30秒（1800 フレーム）燃やす。
 * 1フレームの town.update の平均と最大。camera が無いので粒は全部「見えている」扱い（一番重い側）
 */
function fireStats() {
    const town = new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: noPixels, smokeSprites: noSmoke });
    const floors = town.buildings.filter((b) => b.site === 'floor');
    const step = Math.max(1, Math.floor(floors.length / 30));
    for (const b of floors.filter((_, i) => i % step === 0).slice(0, 30)) town.blast(b.x + b.width / 2, b.y + b.height / 2, 36);
    const game = fakeGame(town);
    let maxFires = 0, maxFlames = 0, maxMs = 0, sum = 0;
    for (let f = 0; f < 1800; f++) {
        const t = performance.now();
        town.update(game);
        const ms = performance.now() - t;
        sum += ms; maxMs = Math.max(maxMs, ms);
        maxFires = Math.max(maxFires, town.fire.fires.length);
        maxFlames = Math.max(maxFlames, town.fire.flames.length);
    }
    return {
        frames: 1800, avgMs: +(sum / 1800).toFixed(3), maxMs: +maxMs.toFixed(2), maxFires, maxFlames,
        burntBuildings: town.buildings.filter((b) => b.burnt.size > 0).length,
        collapsed: town.buildings.filter((b) => b.collapsed).length,
    };
}

/**
 * 段3b: 全部の爆発物に同じ tick で引き金を引いて 600 フレーム回す（一番重い側。上限で後ろへずれる）。
 * 1フレームの town.update の平均と最大、爆発の数、60 フレームあたりの最大
 */
function chainStats() {
    const town = new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: noPixels, smokeSprites: noSmoke });
    const game = fakeGame(town);
    const xs = town.buildings.filter((b) => b.explosive);
    for (const b of xs) town.explosives.trigger(b, 0);
    const frames = [];
    let maxMs = 0, sum = 0;
    for (let f = 0; f < 600; f++) {
        const before = xs.filter((b) => b.exploded).length;
        const t = performance.now();
        town.update(game);
        const ms = performance.now() - t;
        sum += ms; maxMs = Math.max(maxMs, ms);
        for (let i = before; i < xs.filter((b) => b.exploded).length; i++) frames.push(f);
    }
    const perWindow = Math.max(0, ...frames.map((f) => frames.filter((g) => g > f - 60 && g <= f).length));
    return {
        explosives: xs.length, exploded: xs.filter((b) => b.exploded).length,
        avgMs: +(sum / 600).toFixed(3), maxMs: +maxMs.toFixed(2), maxPer60Frames: perWindow,
    };
}

if (args.stats) {
    const by = {};
    for (const s of specs) by[`${s.site}/${s.style}/${s.kind}`] = (by[`${s.site}/${s.style}/${s.kind}`] || 0) + 1;
    const area = specs.reduce((sum, s) => sum + s.w * s.h, 0);
    console.log(JSON.stringify({
        seed, map: `${map.cols}x${map.rows}`, buildings: specs.length, byKind: by,
        spriteMB: +(area * 4 / 1e6).toFixed(2),
        // 4面の植物は多角形。実機の canvas の fill の回数（色ごとに1回）と輪の数（node では塗りの時間を測れない）
        ...(PROPS === 'ferns' || PROPS === 'snowtrees' ? { fillCalls: specs.reduce((n, sp) => n + sp.parts.length, 0), rings: specs.reduce((n, sp) => n + sp.parts.reduce((m, p) => m + p.rings.length, 0), 0) } : {}),
        specsMs: +(t1 - t0).toFixed(1), rasterizeMs: +(t2 - t1).toFixed(1),
        ...blastStats(),
        chain: chainStats(),
    }, null, 2));
    process.exit(0);
}

if (args['list-explosives']) {
    const xs = specs.filter((s) => ['drum', 'crate', 'gas', 'oiljars'].includes(s.kind))
        .map((s) => ({ kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h }));
    console.log(JSON.stringify(xs));
    process.exit(0);
}

const town = new Town(specs, {
    isSolidTile: (r, c) => map.isSolid(r, c),
    createCanvas: (w, h) => new PixelCanvas(w, h),
    smokeSprites: noSmoke,
});

if (args.boom) {
    // その点に一番近い爆発物を弾1発ぶん欠かせる（爆発 → 誘爆）。--ticks で進める
    for (const t of String(args.boom).split(';').filter(Boolean)) {
        const [x, y] = t.split(',').map(Number);
        const b = town.buildings.filter((o) => o.explosive)
            .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
        if (b) town.chip(b, b.x + b.width / 2, b.y + b.height / 2, 4);
    }
    applyBlasts(town, [], Number(args.ticks ?? 0));
}

if (args.fire) {
    const list = String(args.fire).split(';').filter(Boolean).map((t) => [...t.split(',').map(Number), 36]);
    applyBlasts(town, list, Number(args.ticks ?? 0));
} else if (args.blast) {
    const list = String(args.blast).split(';').filter(Boolean).map((t) => t.split(',').map(Number));
    applyBlasts(town, list, Number(args.ticks ?? 0));
}

const X = Number(args.x ?? 0), Y = Number(args.y ?? 0);
const W = Number(args.w ?? 1366), H = Number(args.h ?? 768);
const scale = Number(args.scale ?? 1);
const screen = new PixelCanvas(W, H);
const ctx = screen.getContext();
const style = map.blockStyles[1];
ctx.fillStyle = backdropColors(style.fill, STAGE_ENVIRONMENTS[MISSION % STAGE_ENVIRONMENTS.length].backdrop).voidColor;
ctx.fillRect(0, 0, W, H);
ctx.translate(-X, -Y);
town.draw(ctx, { x: X, y: Y, w: W, h: H });
for (let r = Math.floor(Y / T); r <= Math.floor((Y + H) / T); r++) {
    for (let c = Math.floor(X / T); c <= Math.floor((X + W) / T); c++) {
        if (r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.grid[r][c] === 0) continue;
        const st = map.blockStyles[map.grid[r][c]] || style;
        ctx.fillStyle = st.border; ctx.fillRect(c * T, r * T, T, T);
        ctx.fillStyle = st.fill; ctx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
        // 5面: 上が空いている岩の上面に雪のふち（実機は面ごとの描き込みで、ここは同じ色の 5px の帯で近似）
        if (PROPS === 'snowtrees' && r > 0 && map.grid[r - 1][c] === 0) { ctx.fillStyle = SNOW_CAP_COLOR; ctx.fillRect(c * T, r * T, T, SNOW_CAP_THICKNESS); }
    }
}
const out = args.out || 'town-scene.png';
writePng(out, screen, scale);
console.log(`seed ${seed} region (${X},${Y}) ${W}x${H} buildings ${specs.length} -> ${out}`);
