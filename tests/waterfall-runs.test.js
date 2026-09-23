// ============================================
// 滝を1本の流れとして組み立てる（waterfallRuns.js）
// ============================================
//
// 実機のスクリーンショットの指摘4つを縛る:
//   1. 落ち際: 岩の口からは岩の下面から、床の縁からは床を流れる水の上面から始まる
//   2. 着水点: 床（を流れる水の上面）か水たまりの液面まで届く
//   3. 着水点から次の落ち際まで、床の上を水が流れる
//   4. 横位置は上端で1回だけ決まり、区間の全部で同じ（落ち際が縁に寄れば滝も寄る）
// 地形は、実機の場面（4面・今週の水源0）を縮めたもの。

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeWaterMap } from './helpers/water-map.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { collectWaterfallRuns, drainColFor } from '../src/js/world/environment/waterfallRuns.js';
import { isSubmergedFromAbove } from '../src/js/world/waterQuery.js';
import {
  TILE_SIZE as T, WATERFALL_BAND_WIDTH as W, RUNNING_WATER_THICKNESS as TH, MAX_WATER_MASS,
} from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
});

// 岩の口(列2)から出て床に着き、床を右へ流れて、床の縁(列6)から落ちる。
// シミュレーションは床に着いた水を同じフレームで落ち口まで運ぶので、着水点 (3,2) も
// 床の上も空のまま（実機で見た状態そのもの）
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

function runAt(runs, c) {
  const run = runs.find((r) => r.c === c);
  assert.ok(run, `列${c} に滝の区間があるべき`);
  return run;
}

test('1. 岩の口から出る滝は、岩の下面から中央に始まる', () => {
  const map = makeWaterMap(LEFT_SPILL);
  const run = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 2);
  assert.equal(run.source, 'mouth');
  assert.equal(run.topY, 1 * T, '岩の下面（口の下を1タイル空けない）');
  assert.equal(run.x, 2 * T + (T - W) / 2, '中央');
});

test('2. 床に着く滝は、床を流れる水の上面まで届く（1タイル上で途切れない）', () => {
  const map = makeWaterMap(LEFT_SPILL);
  assert.ok(!map.isWater(3, 2), '前提: 着水点のセルは空');
  const run = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 2);
  assert.equal(run.landing, 'floor');
  assert.equal(run.bottomY, 4 * T - TH);
});

test('3. 着水点から、シミュレーションが運ぶ先の落ち口まで床を流れる水がつながる', () => {
  const map = makeWaterMap(LEFT_SPILL);
  assert.equal(drainColFor(map, 3, 2), 6, '前提: 落ち口は列6');
  const runs = collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1);
  const fall = runAt(runs, 2);
  const spill = runAt(runs, 6);
  assert.ok(fall.sheet, '床を流れる水があるべき');
  assert.equal(fall.sheet.dir, 1);
  assert.equal(fall.sheet.y, 4 * T - TH);
  assert.equal(fall.sheet.x0, fall.x, '着水した帯の真下を全幅で覆う');
  assert.equal(fall.sheet.x1, spill.x, '落ちていく帯の縁で止まる（重ねると二重塗りで角が浮く）');
  assert.equal(spill.topY, fall.sheet.y, '落ち際の帯は床の水の上面から始まる（L字につながる）');
});

test('4. 床の縁の左から落ちる滝は、区間の全部で左に寄る（途中で中央へずれない）', async () => {
  const map = makeWaterMap(LEFT_SPILL);
  const spill = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 6);
  assert.equal(spill.source, 'spill');
  assert.equal(spill.align, 'left');
  assert.equal(spill.x, 6 * T + 1);
  assert.equal(spill.headR, 3);
  assert.equal(spill.footR, 6, '前提: 縁の横(行4)より下まで1本の区間');

  // 実際に描かれる帯も、どの高さでも同じ x
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const renderer = createWaterRenderer({ game: { map } });
  const ctx = makeFakeCtx();
  renderer.drawOverWorld(ctx, 0, 0);
  const bands = ctx.calls.filter((c) => c.name === 'fillRect' && c.args[2] === W
    && c.args[0] >= 6 * T && c.args[0] < 7 * T);
  assert.ok(bands.length > 0);
  for (const b of bands) assert.equal(b.args[0], 6 * T + 1, `帯が x=${b.args[0]} にずれている`);
});

test('4. 床の縁の右から落ちる滝は右に寄る（左右反転した地形）', () => {
  const map = makeWaterMap(`
    ##########
    .......1..
    .......1..
    ...1......
    ...1######
    ...1......
    ...1......
    ..........
    ##########
  `);
  const runs = collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1);
  const spill = runAt(runs, 3);
  assert.equal(spill.align, 'right');
  assert.equal(spill.x, 4 * T - W - 1);
  const fall = runAt(runs, 7);
  assert.equal(fall.sheet.dir, -1);
  assert.equal(fall.sheet.x0, spill.x + W);
  assert.equal(fall.sheet.x1, fall.x + W);
});

test('4. 両側が床の縁（穴）のときは、水を送ってくる側に寄る', () => {
  // 左の床に落ちた水が、列4の穴へ流れ込む。右の床には水が無い
  const map = makeWaterMap(`
    ##########
    ..1.......
    ....1.....
    ####1#####
    ....1.....
    ..........
    ##########
  `);
  const spill = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 4);
  assert.equal(spill.source, 'spill');
  assert.equal(spill.align, 'left');

  // 右の床に落ちた水なら右へ寄る（決め打ちの既定値で通っていないことを確かめる）
  const mirrored = makeWaterMap(`
    ##########
    .......1..
    .....1....
    #####1####
    .....1....
    ..........
    ##########
  `);
  const spillR = runAt(collectWaterfallRuns(mirrored, 0, mirrored.cols - 1, 0, mirrored.rows - 1), 5);
  assert.equal(spillR.align, 'right');
});

test('岩の上面を流れる薄い水では、岩の真下は「沈んでいる」にならない', () => {
  // 以前は岩の上に水が1でもあれば沈んでいるとしたので、床の上を流れる水があるだけで
  // 床の真下のセルがタイル全体で塗られ、湖面より上に青い四角が浮いた
  const cols = 1;
  const isSolid = (r) => r === 1;
  const water = new Uint8Array(3);
  for (const [above, expected] of [[1, false], [2, false], [MAX_WATER_MASS / 2, true], [MAX_WATER_MASS, true]]) {
    water[0] = above;
    water[2] = 7;
    assert.equal(isSubmergedFromAbove(water, isSolid, cols, 2, 0), expected, `岩の上の水量 ${above}`);
  }
});

test('2. 滝の下端のすぐ下が1セルだけ空いていても、その下の水面まで届く（湖面の上で止まらない）', () => {
  // 細い流れは水量1の塊が並んだもので、下端の真下がその瞬間だけ空になる。
  // 以前は「まだ空中」として湖面の1タイル上で止まった（実機の指摘）
  const map = makeWaterMap(`
    ##########
    ....1.....
    ....1.....
    ..........
    8888888888
    ##########
  `);
  assert.ok(!map.isWater(3, 4) && map.isWater(4, 4), '前提: 下端の真下が空で、その下が水');
  const run = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 4);
  assert.equal(run.landing, 'pool');
  assert.equal(run.bottomY, map.getSurfaceY(4, 4));
});

test('2. 列の途中の1セルの空き（水量1の塊の継ぎ目）は越えて1本の滝にする', () => {
  const map = makeWaterMap(`
    ##########
    ....1.....
    ....1.....
    ..........
    ....1.....
    ....1.....
    ..........
    ##########
  `);
  const runs = collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1).filter((r) => r.c === 4);
  assert.equal(runs.length, 1, '1本の区間');
  assert.equal(runs[0].source, 'mouth');
  assert.equal(runs[0].landing, 'floor');
});

test('3. 水たまりからあふれる落ち際には、水たまりの縁から落ち際まで床の水が敷かれる', () => {
  // 以前は床の水を「滝が床に着いた点」からしか引かなかったので、水たまりが低い段へ
  // あふれる場面では、落ち際の短い帯が何も無いところから湧いた四角に見えた（実機の指摘）
  const map = makeWaterMap(`
    ..........
    ..........
    ..1..4444#
    ..1##8888#
    ..1#######
    ..1.......
    ##########
  `);
  const run = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 2);
  assert.equal(run.source, 'spill');
  assert.equal(run.align, 'right');
  assert.ok(run.feedSheet, '水たまりの縁から落ち際までの床の水があるべき');
  assert.equal(run.feedSheet.x0, run.x + W, '落ち際の帯の縁から');
  assert.equal(run.feedSheet.x1, 5 * T, '水たまりの縁まで');
  assert.equal(run.feedSheet.dir, -1, '落ち際へ向かって流れる');
  assert.equal(run.feedSheet.y, 3 * T - TH);
});

test('床の水は、キャッシュが既に水を塗っているタイルには重ねない（二重塗りでまだらにならない）', () => {
  const map = makeWaterMap(LEFT_SPILL);
  map.water[3 * map.cols + 4] = 1;   // 床の途中の (3,4) に、横へ流れている途中の水
  map.refresh();
  const fall = runAt(collectWaterfallRuns(map, 0, map.cols - 1, 0, map.rows - 1), 2);
  for (const [a, b] of fall.sheet.segments) {
    assert.ok(b <= 4 * T || a >= 5 * T, `水のあるタイル (列4) に床の水 [${a}, ${b}] が重なっている`);
  }
  assert.ok(fall.sheet.segments.length >= 2, 'そのタイルの前後で分かれる');
});
