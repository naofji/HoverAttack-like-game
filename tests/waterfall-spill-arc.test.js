// ============================================
// 床の縁から落ちる滝の角を、四分円で丸める（waterfallRuns.js の spillArcRows）
// ============================================
//
// 床を流れてきた水が縁を越えて落ち始めるところは、床の水（厚み3px）と落ちる帯（幅8px）が
// 直角の L 字でつながっているだけで、水が縁を回り込む感じが出なかった。
// 水の進む側（外側）の角を四分円で丸める。右から流れてくるなら円弧は左、左からなら右。

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeWaterMap } from './helpers/water-map.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { collectWaterfallRuns, spillArcRows } from '../src/js/world/environment/waterfallRuns.js';
import {
  TILE_SIZE as T, WATERFALL_BAND_WIDTH as W, WATERFALL_SPILL_ARC_RADIUS as R,
} from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
});

test('左から流れてくる水は、右側が丸い（上の行ほど右が欠け、最下行で帯の幅いっぱいになる）', () => {
  const rows = spillArcRows('left', 100, W, R);
  assert.equal(rows.length, R);
  for (const [x0] of rows) assert.equal(x0, 100, '床の水がつながる左端は欠けない');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i][1] >= rows[i - 1][1], `行${i} は上の行より右へ張り出す（凸）`);
  }
  assert.ok(rows[0][1] < 100 + W / 2, '一番上の行は帯の半分も届かない（角が丸い）');
  assert.ok(rows[R - 1][1] > 100 + W - 0.5, '最下行はほぼ帯の幅いっぱい');
});

test('右から流れてくる水は、左右反転（左側が丸い・右端は欠けない）', () => {
  const left = spillArcRows('left', 100, W, R);
  const right = spillArcRows('right', 100, W, R);
  assert.equal(right.length, left.length);
  for (let i = 0; i < left.length; i++) {
    assert.equal(right[i][1], 100 + W, '床の水がつながる右端は欠けない');
    // 鏡像: 左端までの距離 = 左版の右端までの距離
    assert.ok(Math.abs((right[i][0] - 100) - (W - (left[i][1] - 100))) < 1e-9);
  }
});

test('円弧は四分円の式どおり（行の中心での半径 R の円）', () => {
  const rows = spillArcRows('left', 0, W, R);
  for (let i = 0; i < rows.length; i++) {
    const dy = R - (i + 0.5);
    assert.ok(Math.abs(rows[i][1] - Math.sqrt(R * R - dy * dy)) < 1e-9, `行${i}`);
  }
});

test('半径は帯の幅を超えない（帯からはみ出して広がらない）', () => {
  const rows = spillArcRows('left', 0, 4, 100);
  assert.equal(rows.length, 4);
  for (const [x0, x1] of rows) assert.ok(x0 >= 0 && x1 <= 4);
});

// 実際に描かれる帯: 床の縁から落ちる滝（spill）の一番上の行が丸く、岩の口の滝は変えない
const LEFT_SPILL = `
  ##########
  ..1.......
  ..1.......
  ......1...
  ######1...
  ......1...
  ......1...
  ..........
  ##########
`;
const RIGHT_SPILL = `
  ##########
  .......1..
  .......1..
  ...1......
  ...1######
  ...1......
  ...1......
  ..........
  ##########
`;

async function drawnArcRows(grid, c) {
  const map = makeWaterMap(grid);
  const runs = collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1);
  const spill = runs.find((r) => r.c === c);
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const renderer = createWaterRenderer({ game: { map } });
  const ctx = makeFakeCtx();
  renderer.drawOverWorld(ctx, 0, 0);
  // 水の塗り（WATER_FILL）の 1px 行のうち、帯の範囲にあるもの
  const rows = ctx.calls.filter((k) => k.name === 'fillRect' && k.args[3] === 1
    && k.args[1] >= spill.topY && k.args[1] < spill.topY + R
    && k.args[0] >= spill.x - 0.001 && k.args[0] + k.args[2] <= spill.x + W + 0.001);
  return { spill, rows, ctx };
}

test('描画: 左から落ちる滝は、上端の R 行が右へ丸まる', async () => {
  const { spill, rows } = await drawnArcRows(LEFT_SPILL, 6);
  assert.equal(spill.align, 'left');
  assert.equal(rows.length, R);
  const top = rows.find((k) => k.args[1] === spill.topY);
  assert.equal(top.args[0], spill.x, '左端は床の水につながる位置のまま');
  assert.ok(top.args[2] < W / 2, '一番上の行は帯の半分も届かない');
  const bottom = rows.find((k) => k.args[1] === spill.topY + R - 1);
  assert.ok(bottom.args[2] > W - 0.5);
});

test('描画: 右から落ちる滝は、上端の R 行が左へ丸まる', async () => {
  const { spill, rows } = await drawnArcRows(RIGHT_SPILL, 3);
  assert.equal(spill.align, 'right');
  assert.equal(rows.length, R);
  const top = rows.find((k) => k.args[1] === spill.topY);
  assert.equal(top.args[0] + top.args[2], spill.x + W, '右端は床の水につながる位置のまま');
  assert.ok(top.args[2] < W / 2, '一番上の行は帯の半分も届かない');
});

test('描画: 丸めた部分の下は、帯が元の幅で続く', async () => {
  const { spill, ctx } = await drawnArcRows(LEFT_SPILL, 6);
  const rest = ctx.calls.find((k) => k.name === 'fillRect' && k.args[0] === spill.x
    && k.args[1] === spill.topY + R && k.args[2] === W);
  assert.ok(rest, '丸めた R 行の下から、幅 W の帯が続く');
  assert.equal(rest.args[1] + rest.args[3], spill.bottomY, '帯の下端は変わらない');
});

test('描画: 岩の口から出る滝は丸めない（先細りのまま）', async () => {
  const map = makeWaterMap(LEFT_SPILL);
  const mouth = collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1).find((r) => r.c === 2);
  assert.equal(mouth.source, 'mouth');
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const renderer = createWaterRenderer({ game: { map } });
  const ctx = makeFakeCtx();
  renderer.drawOverWorld(ctx, 0, 0);
  // 帯の幅いっぱいの塗りが口の最下段（taper を終えた位置）から始まる
  const body = ctx.calls.find((k) => k.name === 'fillRect' && k.args[0] === mouth.x
    && k.args[2] === W && k.args[1] === mouth.topY + 8);
  assert.ok(body);
});
