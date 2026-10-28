// ブロックを壊しても周りのタイルの岩が増えないことを縛る（設計 決定13）。
// 規則どおりに作り直すと、坂の条件が崩れたタイルが小さい面取りに戻って太って見えた（「<>」の左上を壊すと右上が太る）。
// 作り直した形と前の形の両方に収まる、一番岩の多い形にする。空になるときは前の形を残す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTileShape, shapeAfterBreak, shapeContainsPoint, shapeCornerCuts, shapeTriangle, SHAPE_EMPTY,
} from '../src/js/utils/tileShape.js';

// 点は斜辺（x = y、x + y = 8・16・24 など）の上に乗らないよう、x と y で半端をずらす
const PTS = [];
for (let y = 0.375; y < 16; y += 0.5) for (let x = 0.25; x < 16; x += 0.5) PTS.push([x, y]);
const area = (code) => PTS.filter(([x, y]) => shapeContainsPoint(code, x, y)).length / PTS.length;
const within = (a, b) => PTS.every(([x, y]) => !shapeContainsPoint(a, x, y) || shapeContainsPoint(b, x, y));
const cutsOf = (code) => { const k = shapeCornerCuts(code); return `${k.tl},${k.tr},${k.bl},${k.br}`; };

/** 文字の地図（# が岩）から cellAt を作る。外は空 */
function gridOf(rows) {
  const g = rows.map((s) => [...s].map((ch) => ch === '#'));
  const cellAt = (r, c) => (g[r] && g[r][c] ? 'rock' : 'empty');
  return { g, cellAt };
}

test('「<>」の左上を壊すと、右上は上に凸の三角「^」、左下は左に凸の三角「<」になる（1タイルの1/4）', () => {
  // X A B .      B は右上の坂（段が Y へ続く）、C は左下の坂（段が X へ続く）
  // . C D Y
  const { g, cellAt } = gridOf(['.....', '.###.', '..###', '.....']);
  const shape = (r, c) => computeTileShape(cellAt, r, c, 'snowSlope');
  const B0 = shape(1, 3), C0 = shape(2, 2);
  assert.equal(cutsOf(B0), '0,16,0,0', '壊す前の右上は右上の坂');
  assert.equal(cutsOf(C0), '0,0,16,0', '壊す前の左下は左下の坂');
  g[1][2] = false;   // A を壊す
  const B1 = shapeAfterBreak(B0, shape(1, 3));
  const C1 = shapeAfterBreak(C0, shape(2, 2));
  assert.equal(cutsOf(B1), '16,16,0,0');
  assert.equal(cutsOf(C1), '16,0,16,0');
  // 点で数えるので 1/4 ちょうどにはならない（斜辺の両側で点の並びが半端）
  assert.ok(Math.abs(area(B1) - 0.25) < 0.02, `^ ${area(B1)}`);
  assert.ok(Math.abs(area(C1) - 0.25) < 0.02, `< ${area(C1)}`);
  assert.deepEqual(shapeTriangle(B1).poly, [[0, 16], [8, 8], [16, 16]]);
  assert.deepEqual(shapeTriangle(C1).poly, [[16, 0], [16, 16], [8, 8]]);
});

test('両方に収まる形が空になるときは、前の形を残す（見えず当たらない岩のタイルを作らない）', () => {
  // 「<>」の左上を壊してできた「^」の下も壊れて単独のタイルになると、新しい形（菱形）と「^」の両方に収まる形は空
  const caret = shapeAfterBreak(computeTileShape(gridOf(['.....', '.###.', '..###']).cellAt, 1, 3, 'snowSlope'),
    computeTileShape(gridOf(['.....', '.#.#.', '..###']).cellAt, 1, 3, 'snowSlope'));
  assert.equal(cutsOf(caret), '16,16,0,0');
  const lone = computeTileShape(gridOf(['.....', '.#.#.', '..#.#']).cellAt, 1, 3, 'snowSlope');
  assert.equal(cutsOf(lone), '8,8,8,8');
  assert.equal(shapeAfterBreak(caret, lone), caret);
  assert.equal(shapeAfterBreak(caret, SHAPE_EMPTY), SHAPE_EMPTY, '自分が壊れたタイルは空');
});

test('どの並びから、どの順に壊しても、岩は増えず、形は角の削りか三角で描ける', () => {
  // 真ん中のタイルの形は 3×3 の並びだけで作り直されるので、8 つの隣を全部の順で壊していけば起こりうる状態を全部たどれる
  const NB = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const cellOf = (m) => (r, c) => {
    if (r === 0 && c === 0) return 'rock';
    const k = NB.findIndex(([a, b]) => a === r && b === c);
    return (m >> k) & 1 ? 'rock' : 'empty';
  };
  const seen = new Set();
  const stack = [];
  for (let m = 0; m < 256; m++) stack.push([m, computeTileShape(cellOf(m), 0, 0, 'snowSlope')]);
  const grew = [], blank = [], kinds = new Set();
  while (stack.length) {
    const [m, code] = stack.pop();
    if (seen.has(`${m}:${code}`)) continue;
    seen.add(`${m}:${code}`);
    kinds.add(cutsOf(code));
    if (code === SHAPE_EMPTY) blank.push(m);
    for (let i = 0; i < 8; i++) {
      if (!((m >> i) & 1)) continue;
      const m2 = m & ~(1 << i);
      const next = shapeAfterBreak(code, computeTileShape(cellOf(m2), 0, 0, 'snowSlope'));
      if (!within(next, code)) grew.push(`${m}->${m2}`);
      stack.push([m2, next]);
    }
  }
  assert.deepEqual(grew, []);
  assert.deepEqual(blank, [], '岩のタイルが空の形にならない');
  // 壊した後にだけ出る三角 4 種まで、全部たどれている
  for (const t of ['16,16,0,0', '0,0,16,16', '16,0,16,0', '0,16,0,16']) assert.ok(kinds.has(t), t);
});

test('作り直した形が前の形に収まるなら、作り直した形をそのまま使う（今までどおり）', () => {
  const { g, cellAt } = gridOf(['....', '.##.', '.##.']);
  const before = computeTileShape(cellAt, 1, 2, 'snowSlope');
  g[1][1] = false;
  const fresh = computeTileShape(cellAt, 1, 2, 'snowSlope');
  assert.ok(within(fresh, before));
  assert.equal(shapeAfterBreak(before, fresh), fresh);
});

test('三角の多角形は、判定の形と全ピクセルで一致する', () => {
  const inside = (pts, px, py) => {
    let odd = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < xi + (py - yi) * (xj - xi) / (yj - yi)) odd = !odd;
    }
    return odd;
  };
  const { cellAt } = gridOf(['.....', '.###.', '..###', '.....']);
  const B0 = computeTileShape(cellAt, 1, 3, 'snowSlope');
  let n = 0;
  // 4 向きは、坂の 4 向きを上下左右に回したもの。全部の形の候補から三角を拾う
  const NB = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const cellOf = (m) => (r, c) => (r === 0 && c === 0) || ((m >> NB.findIndex(([a, b]) => a === r && b === c)) & 1) ? 'rock' : 'empty';
  const tris = new Map();
  for (let m = 0; m < 256; m++) {
    const a = computeTileShape(cellOf(m), 0, 0, 'snowSlope');
    for (let k = 0; k < 8; k++) {
      const b = shapeAfterBreak(a, computeTileShape(cellOf(m & ~(1 << k)), 0, 0, 'snowSlope'));
      if (shapeTriangle(b)) tris.set(b, shapeTriangle(b));
    }
  }
  assert.equal(tris.size, 4);
  for (const [code, t] of tris) {
    for (const [x, y] of PTS) if (inside(t.poly, x, y) !== shapeContainsPoint(code, x, y)) n++;
  }
  assert.equal(n, 0);
  assert.equal(shapeTriangle(B0), null, '三角でない形は null');
});
