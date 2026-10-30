// 7面の要塞のパネル（金属・装甲板）の絵。設計 docs/superpowers/specs/2026-10-29-stage7-panel-tiles-design.md
// 絵柄そのものは tools/render-fortress-scene.mjs の PNG で見る。ここで縛るのは
// 「どのタイルがパネルになるか」「空洞に面した辺だけ面取りが付くか」「継ぎ目が格子にならないか」
// 「ひび割れるのは装甲板だけで金属は焼けるだけか」「タイルの全画素が塗られるか」。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { PixelCanvas } from '../tools/lib/pixel-canvas.mjs';
import {
  BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, HARD_BLOCK_HP, METAL_BLOCK_HP,
} from '../src/js/utils/Constants.js';
import { drawMetalPanel, drawArmorPanel, plateBreaksLeft, tileRng } from '../src/js/world/panelBlocks.js';

const S = 16;

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

/** 偽 ctx の呼び出しを「塗った矩形」の列にする（fillStyle の代入を追って色を付ける） */
function rects(ctx) {
  const out = [];
  let fill = null;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') fill = c.args[0];
    else if (c.name === 'fillRect') out.push({ x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3], fill });
  }
  return out;
}
const alphaOf = (fill) => parseFloat(String(fill).split(',')[3]);
const isWhite = (fill) => String(fill).startsWith('rgba(255,255,255');

const ALL_EDGES = { t: true, b: true, l: true, r: true };
const NO_EDGES = { t: false, b: false, l: false, r: false };

function metal(exp, extra = {}) {
  const ctx = makeFakeCtx();
  drawMetalPanel(ctx, 0, 0, S, { fill: '#6b7a8c', exp, seamLeft: false, heat: 0, rng: tileRng(3, 5), ...extra });
  return rects(ctx);
}

// ---- どのタイルがパネルになるか ------------------------------------------------

async function realMap() {
  const { Map } = await import('../src/js/world/Map.js');
  return new Map({ rng: new SeededRNG(1) }, 6);
}

/** _drawTile が呼ぶ3つの描き方を数える（偽のタイル盤面を作り、1タイルだけ置いて振り分けを見る） */
function routeOf(map, block, marked) {
  const calls = [];
  map.grid = [[BLOCK_EMPTY, block, BLOCK_EMPTY]];
  map.rows = 1; map.cols = 3;
  map.blockHP = [[0, 99, 0]];
  map.fortress = new Uint8Array(3);
  if (marked) map.fortress[1] = 1;
  map._drawPanelBlock = () => calls.push('panel');
  map._drawRockyBlock = () => calls.push('rocky');
  map._drawPolishedBlock = () => calls.push('polished');
  map._drawTile(makeFakeCtx(), 0, 1);
  return calls;
}

test('金属は区画の印に関係なくパネル、装甲（壊せない）は磨かれた板、通常岩は岩', async () => {
  const map = await realMap();
  assert.deepEqual(routeOf(map, BLOCK_METAL, false), ['panel']);
  assert.deepEqual(routeOf(map, BLOCK_METAL, true), ['panel']);
  assert.deepEqual(routeOf(map, BLOCK_INDESTRUCTIBLE, true), ['polished']);
  assert.deepEqual(routeOf(map, BLOCK_NORMAL, true), ['rocky'], '区画の中でも通常岩は岩（要塞には出ないが、印で絵を変えない）');
});

test('硬い岩は要塞の区画の中（印あり）だけ装甲板、区画の外では岩のまま', async () => {
  const map = await realMap();
  assert.deepEqual(routeOf(map, BLOCK_HARD, true), ['panel']);
  assert.deepEqual(routeOf(map, BLOCK_HARD, false), ['rocky'], '6面などの硬い岩まで装甲板になっている');
});

test('実際の7面で、金属は全部パネル・区画内の硬い岩は全部装甲板・施設エリアの岩はパネル・それ以外は岩になる（全面の描き直しの経路）', async () => {
  const map = await realMap();
  const seen = { panel: 0, rocky: 0, polished: 0 };
  let metalTiles = 0, armorTiles = 0, rockTiles = 0, facilityTiles = 0;
  map._drawPanelBlock = () => { seen.panel++; };
  map._drawRockyBlock = () => { seen.rocky++; };
  map._drawPolishedBlock = () => { seen.polished++; };
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const b = map.grid[r][c];
      if (b === BLOCK_EMPTY) continue;
      if (b === BLOCK_METAL) metalTiles++;
      else if (b === BLOCK_HARD && map.fortress[r * map.cols + c]) armorTiles++;
      // 施設エリア（2026-10-31）の通常の岩・硬い岩は、薄い板・装甲板のパネルで描く
      else if (b !== BLOCK_INDESTRUCTIBLE && map.facility[r * map.cols + c] === 1) facilityTiles++;
      else if (b !== BLOCK_INDESTRUCTIBLE) rockTiles++;
    }
  }
  map._renderAllToCache();
  assert.ok(metalTiles > 0 && armorTiles > 0, '7面に要塞が無い');
  assert.ok(facilityTiles > 0, '7面に施設エリアの岩が無い');
  assert.equal(seen.panel, metalTiles + armorTiles + facilityTiles);
  assert.equal(seen.rocky, rockTiles);
});

test('壊した周りは描き直され、空洞に面した辺が変わる（隣の金属が面取りの付く側になる）', async () => {
  const map = await realMap();
  let at = null;
  for (let r = 1; r < map.rows - 1 && !at; r++) {
    for (let c = 2; c < map.cols - 2 && !at; c++) {
      if ([c - 1, c, c + 1].every((cc) => map.grid[r][cc] === BLOCK_METAL)
        && map.grid[r - 1][c] === BLOCK_EMPTY) at = { r, c };
    }
  }
  assert.ok(at, '3枚並んだ金属が見つからない');
  const redrawn = [];
  const orig = map._drawPanelBlock.bind(map);
  map._drawPanelBlock = (ctx, r, c, b) => { redrawn.push(`${r},${c}`); return orig(ctx, r, c, b); };
  map.damageBlock(at.r, at.c, METAL_BLOCK_HP);
  assert.equal(map.grid[at.r][at.c], BLOCK_EMPTY);
  assert.ok(redrawn.includes(`${at.r},${at.c - 1}`) && redrawn.includes(`${at.r},${at.c + 1}`), `左右の隣が描き直されていない: ${redrawn}`);
});

// ---- 空洞に面した辺だけ面取り ---------------------------------------------------

/** 上辺の明るい面取り（タイルの全幅・高さ1の白）があるか */
const hasTopBevel = (rs) => rs.some((q) => isWhite(q.fill) && q.y === 0 && q.h === 1 && q.w === S && alphaOf(q.fill) >= 0.5);
/** 下辺の暗い縁（全幅・最下段の黒） */
const hasBottomEdge = (rs) => rs.some((q) => !isWhite(q.fill) && q.y === S - 1 && q.h === 1 && q.w === S);
const hasLeftBevel = (rs) => rs.some((q) => isWhite(q.fill) && q.x === 0 && q.w === 1 && q.h === S && alphaOf(q.fill) >= 0.4);
const hasRightEdge = (rs) => rs.some((q) => !isWhite(q.fill) && q.x === S - 1 && q.w === 1 && q.h === S);

test('金属: 面取りは空洞に面した辺にだけ付く（4辺が埋まっていれば何も付かない）', () => {
  const none = metal(NO_EDGES);
  assert.equal(hasTopBevel(none), false);
  assert.equal(hasBottomEdge(none), false);
  assert.equal(hasLeftBevel(none), false);
  assert.equal(hasRightEdge(none), false);
  const all = metal(ALL_EDGES);
  assert.equal(hasTopBevel(all), true);
  assert.equal(hasBottomEdge(all), true);
  assert.equal(hasLeftBevel(all), true);
  assert.equal(hasRightEdge(all), true);
  // 1辺ずつ: 立てた辺にだけ付く
  assert.deepEqual([hasTopBevel(metal({ ...NO_EDGES, t: true })), hasBottomEdge(metal({ ...NO_EDGES, t: true }))], [true, false]);
  assert.deepEqual([hasBottomEdge(metal({ ...NO_EDGES, b: true })), hasTopBevel(metal({ ...NO_EDGES, b: true }))], [true, false]);
  assert.deepEqual([hasLeftBevel(metal({ ...NO_EDGES, l: true })), hasRightEdge(metal({ ...NO_EDGES, l: true }))], [true, false]);
  assert.deepEqual([hasRightEdge(metal({ ...NO_EDGES, r: true })), hasLeftBevel(metal({ ...NO_EDGES, r: true }))], [true, false]);
});

/** 中央に金属（または装甲板）を1枚、周りを隣で囲んだ盤面で、_drawPanelBlock が偽 ctx へ描いた矩形（中央のタイルを原点にずらす） */
async function paintCenter(block, { open = [], hp } = {}) {
  const map = await realMap();
  map.rows = 3; map.cols = 3;
  map.grid = Array.from({ length: 3 }, () => new Array(3).fill(BLOCK_METAL));
  map.blockHP = Array.from({ length: 3 }, () => new Array(3).fill(METAL_BLOCK_HP));
  map.grid[1][1] = block;
  if (hp !== undefined) map.blockHP[1][1] = hp;
  const dr = { t: [0, 1], b: [2, 1], l: [1, 0], r: [1, 2] };
  for (const side of open) map.grid[dr[side][0]][dr[side][1]] = BLOCK_EMPTY;
  const ctx = makeFakeCtx();
  map._drawPanelBlock(ctx, 1, 1, block);
  return rects(ctx).map((q) => ({ ...q, x: q.x - S, y: q.y - S }));
}

test('Map は4辺それぞれの隣が空洞かどうかを、対応する辺の面取りとして渡す', async () => {
  const bevel = { t: hasTopBevel, b: hasBottomEdge, l: hasLeftBevel, r: hasRightEdge };
  for (const open of ['t', 'b', 'l', 'r']) {
    const rs = await paintCenter(BLOCK_METAL, { open: [open] });
    for (const side of ['t', 'b', 'l', 'r']) {
      assert.equal(bevel[side](rs), side === open, `隣が空洞なのは ${open} だけなのに、${side} の辺の面取りが ${bevel[side](rs) ? '付いている' : '無い'}`);
    }
  }
});

test('Map は盤面の端を空洞に面した辺として扱う', async () => {
  const map = await realMap();
  map.rows = 1; map.cols = 1;
  map.grid = [[BLOCK_METAL]]; map.blockHP = [[METAL_BLOCK_HP]];
  const ctx = makeFakeCtx();
  map._drawPanelBlock(ctx, 0, 0, BLOCK_METAL);
  const rs = rects(ctx);
  assert.ok(hasTopBevel(rs) && hasBottomEdge(rs) && hasLeftBevel(rs) && hasRightEdge(rs));
});

test('Map は装甲板の受けたダメージ（HP の減り）をひびの本数として渡す', async () => {
  const crack = async (hp) => (await paintCenter(BLOCK_HARD, { hp }))
    .filter((q) => isWhite(q.fill) && q.w === 1 && q.h === 1 && alphaOf(q.fill) >= 0.4).length;
  assert.equal(await crack(HARD_BLOCK_HP), 0);
  assert.ok(await crack(HARD_BLOCK_HP - 1) > 0);
  assert.ok(await crack(HARD_BLOCK_HP - 2) > await crack(HARD_BLOCK_HP - 1));
});

// ---- 継ぎ目 ---------------------------------------------------------------------

test('継ぎ目: 上が金属なら上辺に溝が入り、上が空洞なら入らない（面取りになる）', () => {
  const groove = (rs) => rs.some((q) => q.y === 0 && q.h === 1 && q.w === S && q.fill === 'rgba(0,0,0,0.55)');
  assert.equal(groove(metal(NO_EDGES)), true);
  assert.equal(groove(metal({ ...NO_EDGES, t: true })), false);
});

test('継ぎ目: 左の溝は seamLeft のときだけ、左隣が空洞なら引かない', () => {
  const groove = (rs) => rs.some((q) => q.x === 0 && q.w === 1 && q.h === S && q.fill === 'rgba(0,0,0,0.55)');
  assert.equal(groove(metal(NO_EDGES, { seamLeft: true })), true);
  assert.equal(groove(metal(NO_EDGES, { seamLeft: false })), false);
  assert.equal(groove(metal({ ...NO_EDGES, l: true }, { seamLeft: true })), false);
});

test('継ぎ目は段違い: 同じ行で板の長さごとに1回、隣の行では半枚ずれる（格子にならない）', () => {
  for (let r = 0; r < 6; r++) {
    const row = Array.from({ length: 8 }, (_, c) => plateBreaksLeft(r, c));
    assert.equal(row.filter(Boolean).length, 4, `行 ${r}: 2タイルに1回のはず ${row}`);
    for (let c = 0; c < 8; c++) {
      assert.notEqual(plateBreaksLeft(r, c), plateBreaksLeft(r + 1, c), `行 ${r}・${r + 1} の列 ${c} で継ぎ目が揃っている（格子）`);
    }
  }
});

// ---- 焼けと割れ -----------------------------------------------------------------

test('金属は焼けても割れない: 塗りは fillRect だけ（線・多角形・1画素のひび）が無い', () => {
  const ctx = makeFakeCtx();
  drawMetalPanel(ctx, 0, 0, S, { fill: '#8c3a1e', exp: ALL_EDGES, seamLeft: true, heat: 5 / 6, rng: tileRng(1, 1) });
  const names = new Set(ctx.calls.map((c) => c.name));
  assert.deepEqual([...names].filter((n) => n !== 'fillRect' && n !== 'set:fillStyle'), []);
});

test('金属は焼けるほど白い艶が弱くなる', () => {
  const peak = (heat) => Math.max(...metal(ALL_EDGES, { heat }).filter((q) => isWhite(q.fill)).map((q) => alphaOf(q.fill)));
  assert.ok(peak(0) > 0);
  assert.ok(peak(1) < peak(0) * 0.5, `艶が落ちていない: ${peak(0)} → ${peak(1)}`);
});

/** 装甲板のひび: 1画素の白（不透明度 0.4 以上） */
function crackPixels(damage) {
  const ctx = makeFakeCtx();
  drawArmorPanel(ctx, 0, 0, S, { fill: '#555555', exp: NO_EDGES, damage, rng: tileRng(9, 9) });
  return rects(ctx).filter((q) => isWhite(q.fill) && q.w === 1 && q.h === 1 && alphaOf(q.fill) >= 0.4).length;
}

test('装甲板は無傷ならひびが無く、ダメージを受けるほど増え、4本で止まる', () => {
  assert.equal(crackPixels(0), 0);
  assert.ok(crackPixels(1) > 0, '1発でひびが入っていない');
  assert.ok(crackPixels(2) > crackPixels(1), `2発でひびが増えていない: ${crackPixels(1)} → ${crackPixels(2)}`);
  // ゲームでは HP 3 なのでダメージは最大 2（＝4本）。上限は届かない側の守りだが、効くことは確かめる
  assert.equal(crackPixels(2), crackPixels(HARD_BLOCK_HP - 1));
  assert.equal(crackPixels(5), crackPixels(2), '4本を超えて増えている（上限が効いていない）');
});

test('装甲板には金属の艶（広い白のハイライト）が無い — 金属と見分けがつくこと', () => {
  const ctx = makeFakeCtx();
  drawArmorPanel(ctx, 0, 0, S, { fill: '#555555', exp: ALL_EDGES, damage: 0, rng: tileRng(2, 2) });
  const wide = rects(ctx).filter((q) => isWhite(q.fill) && alphaOf(q.fill) >= 0.3 && (q.w === S || q.h === S));
  assert.deepEqual(wide, [], '装甲板に金属のような明るい面取りが付いている');
});

// ---- 全画素が塗られる -----------------------------------------------------------

test('パネルはタイルの全画素を不透明に塗る（露出の16通り・金属／装甲板とも、穴が無い）', () => {
  for (const kind of ['metal', 'armor']) {
    for (let m = 0; m < 16; m++) {
      const exp = { t: !!(m & 1), b: !!(m & 2), l: !!(m & 4), r: !!(m & 8) };
      const cv = new PixelCanvas(S, S);
      const ctx = cv.getContext();
      if (kind === 'metal') drawMetalPanel(ctx, 0, 0, S, { fill: '#6b7a8c', exp, seamLeft: true, heat: 0.5, rng: tileRng(4, 7) });
      else drawArmorPanel(ctx, 0, 0, S, { fill: '#555555', exp, damage: 2, rng: tileRng(4, 7) });
      for (let i = 0; i < S * S; i++) {
        assert.ok(cv.px[i * 4 + 3] >= 0.999, `${kind} 露出 ${m}: 画素 ${i % S},${Math.floor(i / S)} が透けている`);
      }
    }
  }
});

test('タイルの絵は決定論的: 同じ引数なら同じ描き方、タイルが違えばむらが違う', () => {
  assert.deepEqual(metal(NO_EDGES), metal(NO_EDGES));
  const seen = new Set();
  for (let c = 0; c < 20; c++) {
    const ctx = makeFakeCtx();
    drawMetalPanel(ctx, 0, 0, S, { fill: '#6b7a8c', exp: NO_EDGES, seamLeft: false, heat: 0, rng: tileRng(2, c) });
    seen.add(JSON.stringify(rects(ctx)));
  }
  assert.ok(seen.size > 3, `タイルごとのむらが無い（${seen.size} 通り）`);
});
