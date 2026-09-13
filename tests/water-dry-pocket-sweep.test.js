// ============================================
// 取りこぼされた縦穴の再発見（findStuckDryPockets）
// ============================================
//
// 幅1タイルの縦穴は、両脇を壁に挟まれた「独立した1マスの区間」になるため、
// stepWaterSimulation のフェーズ2（横方向の水位平準化）では横から水を
// 受け取れない。唯一の経路はフェーズ1（真上から落ちる）だけだが、この
// シミュレーションは反応式（activeWaterCells に入っているセルしか処理しない）
// なので、入り口が「水を受け取れる瞬間」を逃すと二度と再挑戦されない。
//
// findStuckDryPockets は、この「取りこぼし」だけを狙い撃ちで見つける純関数。
// 洞窟の天井や湖面の真上の空気（左右に壁が無い、正しく乾いている場所）まで
// 拾ってしまうと、毎回ほぼ全マップを再アクティブ化することになり、反応式の
// 意味が無くなる。なので「両脇が壁の縦穴」だけに絞る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStuckDryPockets } from '../src/js/world/waterSimulation.js';

test('両脇が壁の縦穴で、入口の真上に水があれば見つける', () => {
  const rows = 5, cols = 3;
  const water = new Uint8Array(rows * cols);
  water[1 * cols + 1] = 5; // (r=1, c=1) に水
  // (r=1,c=1) と (r=2,c=1) は空洞、左右(c=0,c=2)は壁、床(r=3)も壁
  const isSolid = (r, c) => c === 0 || c === 2 || r >= 3;

  const found = findStuckDryPockets({ water, rows, cols, isSolid });

  assert.deepEqual(found, [2 * cols + 1], '縦穴の入口(r=2,c=1)だけが見つかるべき');
});

test('入口の真上に水が無ければ見つけない', () => {
  const rows = 5, cols = 3;
  const water = new Uint8Array(rows * cols); // 全部0
  const isSolid = (r, c) => c === 0 || c === 2 || r >= 3;

  assert.deepEqual(findStuckDryPockets({ water, rows, cols, isSolid }), []);
});

test('左右に壁が無い開けた空気（湖面の真上など）は拾わない', () => {
  const rows = 5, cols = 5;
  const water = new Uint8Array(rows * cols);
  for (let c = 0; c < cols; c++) water[2 * cols + c] = 8; // r=2 が満水の湖
  const isSolid = () => false; // 壁なし＝開けた空間

  // r=1 は湖面の真上で正しく乾いている（左右に壁が無い）ので拾わない
  assert.deepEqual(findStuckDryPockets({ water, rows, cols, isSolid }), []);
});

test('すでに水があるセルは対象外', () => {
  const rows = 4, cols = 3;
  const water = new Uint8Array(rows * cols);
  water[0 * cols + 1] = 5;
  water[1 * cols + 1] = 3; // すでに水がある縦穴の入口
  const isSolid = (r, c) => c === 0 || c === 2 || r >= 2;

  assert.deepEqual(findStuckDryPockets({ water, rows, cols, isSolid }), []);
});

test('固体セル自身は対象外', () => {
  const rows = 3, cols = 3;
  const water = new Uint8Array(rows * cols);
  water[0 * cols + 1] = 5;
  const isSolid = (r, c) => c === 0 || c === 2 || r === 1; // (1,1) 自体も壁
  assert.deepEqual(findStuckDryPockets({ water, rows, cols, isSolid }), []);
});
