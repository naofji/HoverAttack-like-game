// 5面の地形の絵の輪郭が、当たり判定の形（utils/tileShape.js）と一致することを縛る（設計 7章・決定3）。
// 本物の5面の地図の岩のタイルを1枚ずつ描き、ベース塗りの多角形の内外を、タイル内の全ピクセルで
// shapeContainsPoint と比べる。壊して形が作り直された後のタイルも同じく比べる。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
  TILE_SIZE as S, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, SNOW_CAP_COLOR,
} from '../src/js/utils/Constants.js';
import { shapeContainsPoint, shapeCornerCuts } from '../src/js/utils/tileShape.js';

before(() => {
  globalThis.document = {
    createElement: () => { const ctx = makeFakeCtx(); return { width: 0, height: 0, getContext: () => ctx }; },
  };
});

/** 最初の beginPath..closePath の頂点列（ベース塗りの多角形） */
function basePolygon(calls) {
  const pts = [];
  let inPath = false;
  for (const c of calls) {
    if (c.name === 'beginPath') { if (pts.length) break; inPath = true; continue; }
    if (!inPath) continue;
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(c.args);
    if (c.name === 'closePath') break;
  }
  return pts;
}

/** 偶奇則の点の内外 */
function inside(pts, px, py) {
  let odd = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < xi + (py - yi) * (xj - xi) / (yj - yi)) odd = !odd;
  }
  return odd;
}

/** 雪のふちの stroke が通る点（SNOW_CAP_COLOR を設定してから stroke までの moveTo/lineTo） */
function snowCapPath(calls) {
  const i = calls.findIndex((c) => c.name === 'set:strokeStyle' && c.args[0] === SNOW_CAP_COLOR);
  if (i < 0) return null;
  const pts = [];
  for (const c of calls.slice(i)) {
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(`${c.args[0]},${c.args[1]}`);
    if (c.name === 'stroke') break;
  }
  return new Set(pts);
}

function isRock(map, r, c) {
  const b = map.grid[r][c];
  return b !== BLOCK_EMPTY && b !== BLOCK_INDESTRUCTIBLE && b !== BLOCK_METAL;
}

/** タイルを描いて、輪郭の内外が形と食い違うピクセルの数。点は斜辺の上に乗らない (lx+0.25, ly+0.5) */
function mismatches(map, r, c) {
  const ctx = makeFakeCtx();
  map._drawRockyBlock(ctx, r, c, map.grid[r][c]);
  const pts = basePolygon(ctx.calls);
  const code = map.tileShapeAt(r, c);
  let bad = 0;
  for (let ly = 0; ly < S; ly++) {
    for (let lx = 0; lx < S; lx++) {
      const drawn = inside(pts, c * S + lx + 0.25, r * S + ly + 0.5);
      if (drawn !== shapeContainsPoint(code, lx + 0.25, ly + 0.5)) bad++;
    }
  }
  return bad;
}

async function snowMap(seed) {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(seed) }, 4);
  assert.equal(map.tileShapeRule, 'snowSlope', 'level 4 は5面（雪の坂の規則）');
  return map;
}

for (const seed of [1, 2]) {
  test(`5面 seed ${seed}: 岩のタイルの絵の輪郭が、判定の形と全ピクセルで一致する`, async () => {
    const map = await snowMap(seed);
    let tiles = 0, shaped = 0, bad = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (!isRock(map, r, c)) continue;
        tiles++;
        if (map.tileShapeAt(r, c) !== 0b001001001001) shaped++;
        const n = mismatches(map, r, c);
        if (n) bad.push(`${r},${c}:${n}`);
      }
    }
    assert.ok(shaped > 100, `形のあるタイルが十分にある (${shaped}/${tiles})`);
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} 枚が食い違う`);
  });

  test(`5面 seed ${seed}: 壊して形が作り直されたタイルも、絵と判定の形が一致する`, async () => {
    const map = await snowMap(seed);
    const touched = [];
    let n = 0;
    for (let r = 2; r < map.rows - 2 && n < 30; r += 2) {
      for (let c = 2; c < map.cols - 2 && n < 30; c += 5) {
        // 空洞に面した岩を壊す（埋まった岩の中を壊しても周りの形は変わらない）
        if (!isRock(map, r, c) || map.grid[r - 1][c] !== BLOCK_EMPTY) continue;
        map.damageBlock(r, c, 99);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) touched.push([r + dr, c + dc]);
        n++;
      }
    }
    assert.equal(n, 30);
    const bad = touched.filter(([r, c]) => isRock(map, r, c) && mismatches(map, r, c) > 0);
    assert.deepEqual(bad.slice(0, 10), []);
  });

  test(`5面 seed ${seed}: 生成時に上が露出していた岩の雪のふちは、上の角の切り口に沿う`, async () => {
    const map = await snowMap(seed);
    let ramps = 0, chamfers = 0;
    for (let r = 1; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (!isRock(map, r, c) || !map.exposedAtGen[r * map.cols + c]) continue;
        const cuts = shapeCornerCuts(map.tileShapeAt(r, c));
        if (!cuts.tl && !cuts.tr) continue;
        const ctx = makeFakeCtx();
        map._drawRockyBlock(ctx, r, c, map.grid[r][c]);
        const path = snowCapPath(ctx.calls);
        assert.ok(path, `(${r},${c}) に雪のふちが無い`);
        const x = c * S, y = r * S;
        if (cuts.tl) assert.ok(path.has(`${x},${y + cuts.tl}`) && path.has(`${x + cuts.tl},${y}`), `(${r},${c}) 左上の切り口 ${[...path]}`);
        if (cuts.tr) assert.ok(path.has(`${x + S - cuts.tr},${y}`) && path.has(`${x + S},${y + cuts.tr}`), `(${r},${c}) 右上の切り口 ${[...path]}`);
        if (cuts.tl === S || cuts.tr === S) ramps++; else chamfers++;
      }
    }
    assert.ok(ramps > 10 && chamfers > 10, `坂 ${ramps}・面取り ${chamfers}`);
  });
}

/**
 * damageBlock が地形のキャッシュ（tileCacheCtx）へ描き直した呼び出しから、タイルごとのベース塗りの
 * 多角形を取り出す。clearRect(x, y, S, S) のあと、次の clearRect までに最初に閉じた経路がそのタイルの輪郭
 */
function redrawnPolygons(calls) {
  const out = [];
  let cur = null, pts = null;
  for (const c of calls) {
    if (c.name === 'clearRect') { cur = { r: c.args[1] / S, c: c.args[0] / S, pts: null }; out.push(cur); pts = null; continue; }
    if (!cur || cur.pts) continue;
    if (c.name === 'beginPath') pts = [];
    else if (pts && (c.name === 'moveTo' || c.name === 'lineTo')) pts.push(c.args);
    else if (pts && c.name === 'closePath') cur.pts = pts;
  }
  return out.filter((t) => t.pts);
}

for (const seed of [1, 2]) {
  test(`5面 seed ${seed}: 壊したときにキャッシュへ描き直した絵は、作り直した後の形と一致する（形→描き直しの順）`, async () => {
    const map = await snowMap(seed);
    const calls = map.tileCacheCtx.calls;
    let n = 0, checked = 0;
    const bad = [];
    for (let r = 2; r < map.rows - 2 && n < 30; r += 2) {
      for (let c = 2; c < map.cols - 2 && n < 30; c += 5) {
        if (!isRock(map, r, c) || map.grid[r - 1][c] !== BLOCK_EMPTY) continue;
        calls.length = 0;
        map.damageBlock(r, c, 99);
        n++;
        for (const t of redrawnPolygons(calls)) {
          if (!isRock(map, t.r, t.c)) continue;
          checked++;
          const code = map.tileShapeAt(t.r, t.c);
          for (let ly = 0; ly < S; ly++) {
            for (let lx = 0; lx < S; lx++) {
              if (inside(t.pts, t.c * S + lx + 0.25, t.r * S + ly + 0.5) !== shapeContainsPoint(code, lx + 0.25, ly + 0.5)) {
                bad.push(`${t.r},${t.c}`); ly = S; break;
              }
            }
          }
        }
      }
    }
    assert.ok(checked > 40, `描き直したタイル ${checked}`);
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} 枚が古い形で描かれた`);
  });
}
