// ============================================
// セル・オートマトン水流シミュレーション テスト
// ============================================

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { MAX_WATER_MASS } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
});

test('垂直落下: 縦穴の上空に置かれた水が直下へ重力で落ちて溜まる', () => {
  const rows = 5, cols = 3;
  const water = new Uint8Array(rows * cols);
  // (0, 1) に満水 8 を配置
  water[0 * cols + 1] = MAX_WATER_MASS;
  // 左右 (c=0, c=2) を壁、一番下の行 (r=4) を床にする（幅1の縦穴）
  const isSolid = (r, c) => c === 0 || c === 2 || r === 4;

  let active = new Set([0 * cols + 1]);
  // 4ステップ進める
  for (let step = 0; step < 4; step++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
  }

  // 床の直上 (3, 1) に水が落ちて溜まっていること
  assert.equal(water[3 * cols + 1], MAX_WATER_MASS, '床の直上に水が落ちていない');
  assert.equal(water[0 * cols + 1], 0, '元の位置に水が残っている');
});

test('水平拡散: 左右に壁がある容器で水が平らに広がる', () => {
  const rows = 4, cols = 5;
  const water = new Uint8Array(rows * cols);
  // 左端(c=0)と右端(c=4)が壁、底(r=3)が床
  const isSolid = (r, c) => c === 0 || c === 4 || r === 3;

  // (2, 2) に満水 8 を配置
  water[2 * cols + 2] = MAX_WATER_MASS;

  let active = new Set([2 * cols + 2]);
  for (let step = 0; step < 10; step++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
    if (active.size === 0) break;
  }

  // (2, 1), (2, 2), (2, 3) の3セルに水がほぼ均等に広がっていること
  const total = water[2 * cols + 1] + water[2 * cols + 2] + water[2 * cols + 3];
  assert.equal(total, MAX_WATER_MASS, '水量が保存されていない');
  assert.ok(water[2 * cols + 1] > 0, '左に広がっていない');
  assert.ok(water[2 * cols + 3] > 0, '右に広がっていない');
  assert.ok(Math.abs(water[2 * cols + 1] - water[2 * cols + 3]) <= 1, '左右対称に広がっていない');
});

test('質量保存則: 複雑な形状でも総水量が厳密に保存される', () => {
  const rows = 6, cols = 6;
  const water = new Uint8Array(rows * cols);
  const isSolid = (r, c) => r === 5 || c === 0 || c === 5 || (r === 3 && c === 2);

  // 複数のセルに水を配置
  water[1 * cols + 1] = 8;
  water[1 * cols + 2] = 8;
  water[0 * cols + 3] = 4;
  const initialSum = 8 + 8 + 4;

  let active = new Set([1 * cols + 1, 1 * cols + 2, 0 * cols + 3]);
  for (let step = 0; step < 20; step++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
    let currentSum = 0;
    for (let i = 0; i < water.length; i++) currentSum += water[i];
    assert.equal(currentSum, initialSum, `ステップ ${step} で水量が変化した`);
  }
});

test('壁破壊による流出: 仕切り壁が破壊されると隣の低い空洞へ水が流れ込む', () => {
  // 4行 x 5列のマップ
  // c=0, c=4 は外壁。r=3 は底。
  // c=2 は仕切り壁だが、(2, 2) を破壊して穴を開ける
  // (2, 1) に水 8 がある状態
  const rows = 4, cols = 5;
  const water = new Uint8Array(rows * cols);
  let solid = [
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1], // (2, 2) は穴が開いている
    [1, 1, 1, 1, 1], // 底
  ];
  const isSolid = (r, c) => solid[r][c] === 1;

  water[2 * cols + 1] = 8; // 左の部屋の底に水

  let active = new Set([2 * cols + 1, 2 * cols + 2]);
  for (let step = 0; step < 10; step++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
  }

  // 穴 (2, 2) を通って右の部屋 (2, 3) へ水が流れ込んでいること
  assert.ok(water[2 * cols + 3] > 0, '右の部屋に水が流れていない');
  assert.equal(water[2 * cols + 1] + water[2 * cols + 2] + water[2 * cols + 3], 8, '総水量が保存されていない');
});

test('Map.damageBlock: ブロック破壊時に即座に水ブロック化せず、自然に水が流れ込む（水増殖なし）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const game = { rng: new SeededRNG(1), settings: {} };
  const map = new Map(game, 3); // 4面: water

  // 水ブロックに隣接する破壊可能ブロックを探す
  let targetR = -1, targetC = -1;
  for (let r = 5; r < map.rows - 5; r++) {
    for (let c = 5; c < map.cols - 5; c++) {
      if (map.grid[r][c] !== 0 && !map.isSolid(r, c)) continue;
      // 固体ブロックで、左右上下のいずれかが水
      if (map.isSolid(r, c) && map.grid[r][c] === 1) {
        if (map.isWater(r, c - 1) || map.isWater(r, c + 1) || map.isWater(r - 1, c)) {
          targetR = r;
          targetC = c;
          break;
        }
      }
    }
    if (targetR >= 0) break;
  }

  if (targetR >= 0) {
    let totalWaterBefore = 0;
    for (let i = 0; i < map.water.length; i++) totalWaterBefore += map.water[i];

    // ブロックを破壊する
    map.damageBlock(targetR, targetC, 10);
    // 破壊された瞬間は水ブロック（以前の即時MAX_WATER）になっておらず、空洞であること
    assert.equal(map.water[targetR * map.cols + targetC], 0, '破壊直後に水ブロックが即時生成されてしまっている');

    let totalWaterImmediately = 0;
    for (let i = 0; i < map.water.length; i++) totalWaterImmediately += map.water[i];
    assert.equal(totalWaterImmediately, totalWaterBefore, 'ブロック破壊によって水が勝手に増殖してしまっている');

    // シミュレーション更新を進めると、隣の水が自然に流れ込む
    for (let i = 0; i < 20; i++) map.update();
    assert.ok(map.water[targetR * map.cols + targetC] > 0, 'セル・オートマトンで水が流れ込んでいない');
  }
});

test('水槽レベリング: まず最下層の横方向一面が満たされ、壁に当たって満杯になってから上方向に水位が上がっていく', () => {
  const rows = 5, cols = 7;
  const water = new Uint8Array(rows * cols);
  // c=0, c=6 は壁。r=4 は床。内側の空洞は c=1..5 (幅5マス)、r=0..3 (深さ4マス)
  const isSolid = (r, c) => c === 0 || c === 6 || r === 4;

  // 1. 水量 10 を床の上空 (1, 3) から落とす
  water[1 * cols + 3] = 10;
  let active = new Set([1 * cols + 3]);

  // 3ステップシミュレーション
  for (let s = 0; s < 3; s++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
  }

  // 床の最下層 (r=3, c=1..5) の5マスに水量10が均等（各セル2）に広がり、
  // 上の層 (r=2) には水が1滴も積み上がっていないこと！
  for (let c = 1; c <= 5; c++) {
    assert.equal(water[3 * cols + c], 2, `最下層 (3, ${c}) の水量は 2 であるべき: got ${water[3 * cols + c]}`);
    assert.equal(water[2 * cols + c], 0, `上の層 (2, ${c}) に水が積み上がってはならない: got ${water[2 * cols + c]}`);
  }

  // 2. さらに水量 30 を追加（合計 40）。最下層の最大容量は 5 * 8 = 40
  water[1 * cols + 3] += 30;
  active.add(1 * cols + 3);

  for (let s = 0; s < 15; s++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
  }

  // 最下層がピッタリ満水（各セル8、合計40）になり、上の層 (r=2) はまだ0であること
  for (let c = 1; c <= 5; c++) {
    assert.equal(water[3 * cols + c], 8, `最下層 (3, ${c}) は満水 8 であるべき: got ${water[3 * cols + c]}`);
    assert.equal(water[2 * cols + c], 0, `最下層が満杯になるまで上の層 (2, ${c}) は 0 であるべき: got ${water[2 * cols + c]}`);
  }

  // 3. さらに水量 10 を追加（合計 50）。最下層の40を超えて余剰が10発生
  water[1 * cols + 3] += 10;
  active.add(1 * cols + 3);

  for (let s = 0; s < 15; s++) {
    const res = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active });
    active = res.nextActiveCells;
  }

  // 最下層は満水（8）を維持し、上の層 (r=2) の5マスに余剰10が均等（各セル2）に溜まること！
  for (let c = 1; c <= 5; c++) {
    assert.equal(water[3 * cols + c], 8, `最下層 (3, ${c}) は満水 8 を維持: got ${water[3 * cols + c]}`);
    assert.equal(water[2 * cols + c], 2, `上の層 (2, ${c}) に水位が上がって均等に 2 溜まるべき: got ${water[2 * cols + c]}`);
    assert.equal(water[1 * cols + c], 0, `さらに上の層 (1, ${c}) はまだ 0 であるべき: got ${water[1 * cols + c]}`);
  }
});


