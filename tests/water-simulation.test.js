// ============================================
// セル・オートマトン水流シミュレーション テスト
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { MAX_WATER_MASS } from '../src/js/utils/Constants.js';

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

