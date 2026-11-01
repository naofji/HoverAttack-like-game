// 2面（level 1）の斜面（設計 docs/superpowers/specs/2026-11-01-stage2-orb-design.md 4.1）。
// 洞窟の縁は5面と同じ幾何（規則の別名 caveSlope）でなだらかにし、長い坂を 3本・4〜7段 盛る。
// 5面の階段は変わらないことも縛る。期待値は変更前のコード（9b60939）で記録したもの（実装から導かない）。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as S, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL } from '../src/js/utils/Constants.js';
import {
  computeTileShape, unpackShape, shapeContainsPoint, SHAPE_FULL, SHAPE_EMPTY,
  Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TR, Q_FULL,
} from '../src/js/utils/tileShape.js';

before(() => {
  globalThis.document = {
    createElement: () => { const ctx = makeFakeCtx(); return { width: 0, height: 0, getContext: () => ctx }; },
  };
});

async function buildMap(seed, level) {
  const { Map } = await import('../src/js/world/Map.js');
  const game = { rng: new SeededRNG(seed) };
  const map = new Map(game, level);
  return { map, game };
}

test('2面は caveSlope で、長い坂が 1〜3 本盛られ、どれも 4〜7 段、途中の段は45度の斜め', async () => {
  let checked = 0;
  for (const seed of [1, 2, 3]) {
    const { map } = await buildMap(seed, 1);
    assert.equal(map.tileShapeRule, 'caveSlope');
    assert.ok(map.stairs.length >= 1 && map.stairs.length <= 3, `seed ${seed}: 坂 ${map.stairs.length} 本`);
    for (const s of map.stairs) {
      assert.ok(s.length >= 4 && s.length <= 7, `段数 ${s.length}`);
      for (let i = 1; i < s.length - 1; i++) {
        const expected = s.dir === 1 ? [Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL] : [Q_TRI_NO_TR, Q_EMPTY, Q_FULL, Q_TRI_NO_TR];
        assert.deepEqual(unpackShape(map.tileShapeAt(s.r - i, s.c + s.dir * i)), expected, `坂 ${JSON.stringify(s)} の ${i} 段目`);
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
});

test('computeTileShape: caveSlope は 3x3 の全ての並びで snowSlope と同じ形を返す', () => {
  for (let bits = 0; bits < 512; bits++) {
    // 中央（bit 4）は岩に固定しない: 空のときも同じ（SHAPE_EMPTY）であることを含めて比べる
    const cellAt = (r, c) => {
      if (r < 0 || r > 2 || c < 0 || c > 2) return 'polished';
      return (bits >> (r * 3 + c)) & 1 ? 'rock' : 'empty';
    };
    assert.equal(computeTileShape(cellAt, 1, 1, 'caveSlope'), computeTileShape(cellAt, 1, 1, 'snowSlope'), `並び ${bits}`);
  }
  // 規則が効いていること自体の確認（全部 FULL/EMPTY なら上の比較は square と区別できない）
  const lone = (r, c) => (r === 1 && c === 1 ? 'rock' : 'empty');
  assert.notEqual(computeTileShape(lone, 1, 1, 'caveSlope'), SHAPE_FULL);
});

test('5面の階段と、地図を作った後の乱数の状態は変わらない', async () => {
  const want = {
    1: { stairs: [{ r: 47, c: 255, dir: -1, length: 6 }, { r: 127, c: 26, dir: -1, length: 8 }, { r: 121, c: 176, dir: -1, length: 5 }, { r: 111, c: 20, dir: 1, length: 5 }, { r: 30, c: 232, dir: -1, length: 7 }, { r: 42, c: 173, dir: -1, length: 5 }, { r: 60, c: 166, dir: -1, length: 6 }, { r: 64, c: 54, dir: -1, length: 5 }], rng: 2944676387 },
    2: { stairs: [{ r: 98, c: 53, dir: 1, length: 5 }, { r: 51, c: 235, dir: -1, length: 6 }, { r: 25, c: 200, dir: -1, length: 7 }, { r: 72, c: 131, dir: -1, length: 6 }, { r: 116, c: 77, dir: 1, length: 6 }, { r: 45, c: 37, dir: 1, length: 9 }, { r: 50, c: 73, dir: -1, length: 7 }, { r: 57, c: 133, dir: 1, length: 5 }], rng: 559453996 },
  };
  for (const seed of [1, 2]) {
    const { map, game } = await buildMap(seed, 4);
    assert.deepEqual(map.stairs, want[seed].stairs, `seed ${seed}`);
    assert.equal(game.rng.state, want[seed].rng, `seed ${seed} rng`);
  }
});

/** 最初の beginPath..closePath の頂点列（ベース塗りの多角形）。snow-drawing-matches-shape と同じ */
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
function inside(pts, px, py) {
  let odd = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < xi + (py - yi) * (xj - xi) / (yj - yi)) odd = !odd;
  }
  return odd;
}

test('2面の岩の絵の輪郭は当たり判定の形と一致する（坂のタイルが四角や乱数の面取りで描かれない）', async () => {
  const { map } = await buildMap(1, 1);
  let shaped = 0, bad = 0;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const b = map.grid[r][c];
      if (b === BLOCK_EMPTY || b === BLOCK_INDESTRUCTIBLE || b === BLOCK_METAL) continue;
      const code = map.tileShapeAt(r, c);
      if (code === SHAPE_FULL || code === SHAPE_EMPTY) continue;
      shaped++;
      const ctx = makeFakeCtx();
      map._drawRockyBlock(ctx, r, c, b);
      const pts = basePolygon(ctx.calls);
      for (let ly = 0; ly < S; ly++) {
        for (let lx = 0; lx < S; lx++) {
          if (inside(pts, c * S + lx + 0.25, r * S + ly + 0.5) !== shapeContainsPoint(code, lx + 0.25, ly + 0.5)) bad++;
        }
      }
    }
  }
  assert.ok(shaped > 100, `形のあるタイル ${shaped}`);
  assert.equal(bad, 0);
});
