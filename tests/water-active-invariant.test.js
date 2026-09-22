// ============================================
// 水のアクティブ管理の不変条件
// ============================================
//
// シミュレーションは反応式（activeCells に入っているセルしか処理しない）。
// だから「まだ落ちられる水」がアクティブから漏れると、その水は二度と動かない。
// 以前はこの漏れを後から拾う全マップ走査（findStuckDryPockets、90フレームごと）が
// 入っていたが、実物の4面を 12シード×3000フレーム（60フレームごとに半径2で爆破）
// 回して、拾い直しを止めた状態で毎フレーム確かめても違反は 0 / 451万回だった。
// 漏れは次の3つの経路で構造的に塞がっているので、走査は撤去し、代わりにこの
// 条件そのものを縛る:
//   - 落ちたセル・受けたセルは markChanged で周囲3×3ごとアクティブになる
//   - 落下しないフレーム（doFall=false）は、落ちられる水を明示的に持ち越す
//   - ブロックが壊れたら、Map.damageBlock が周囲3×3をアクティブにする
//
// 不変条件: 水があり、直下が岩でも満水でもないセルは、必ず次のアクティブに入っている。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { MAX_WATER_MASS, WATER_FALL_INTERVAL } from '../src/js/utils/Constants.js';

function randomWorld(rng, rows, cols) {
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) =>
    (r === rows - 1 || c === 0 || c === cols - 1 || rng.next() < 0.3) ? 1 : 0));
  const water = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c] && rng.next() < 0.25) water[r * cols + c] = 1 + Math.floor(rng.next() * MAX_WATER_MASS);
    }
  }
  return { grid, water };
}

function violations(water, rows, cols, isSolid, active) {
  const out = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (water[k] === 0 || isSolid(r, c)) continue;
      if (isSolid(r + 1, c) || water[k + cols] >= MAX_WATER_MASS) continue;
      if (!active.has(k)) out.push([r, c]);
    }
  }
  return out;
}

test('落ちられる水は、落下のないフレームも爆破のあとも必ずアクティブに残る', () => {
  const rows = 18, cols = 24;
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = new SeededRNG(seed);
    const { grid, water } = randomWorld(rng, rows, cols);
    const isSolid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== 0;
    // 初期状態は「水のあるセルを全部アクティブ」から始める（生成直後の Map と同じ意味）
    let active = new Set();
    for (let k = 0; k < water.length; k++) if (water[k] > 0) active.add(k);

    for (let step = 1; step <= 240; step++) {
      const res = stepWaterSimulation({
        water, rows, cols, isSolid, activeCells: active, doFall: step % WATER_FALL_INTERVAL === 0,
      });
      active = res.nextActiveCells;

      // 時々ブロックを壊す。Map.damageBlock と同じく周囲3×3をアクティブにする
      if (step % 20 === 0) {
        const r = 1 + Math.floor(rng.next() * (rows - 2));
        const c = 1 + Math.floor(rng.next() * (cols - 2));
        if (grid[r][c]) {
          grid[r][c] = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) active.add((r + dr) * cols + c + dc);
        }
      }

      const v = violations(water, rows, cols, isSolid, active);
      assert.deepEqual(v, [], `seed ${seed} step ${step}: 落ちられるのにアクティブでない水 ${JSON.stringify(v)}`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test('両脇が壁の縦穴の上に落ち着いた水たまりがあっても、蓋を壊せば縦穴へ流れ込む', () => {
  // 以前の拾い直し（findStuckDryPockets）が狙っていた場面そのもの。
  // 水たまりが落ち着いて休眠したあとに縦穴の蓋 (2,3) を壊す
  const rows = 7, cols = 7;
  const grid = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],   // (2,3) が蓋
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  const isSolid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== 0;
  const water = new Uint8Array(rows * cols);
  for (let c = 1; c <= 5; c++) water[1 * cols + c] = MAX_WATER_MASS;

  let active = new Set([...Array(5)].map((_, i) => 1 * cols + 1 + i));
  for (let step = 1; step <= 40; step++) {
    active = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active, doFall: step % WATER_FALL_INTERVAL === 0 }).nextActiveCells;
  }
  assert.equal(active.size, 0, '前提: 水たまりは落ち着いて休眠している');

  grid[2][3] = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) active.add((2 + dr) * cols + 3 + dc);
  for (let step = 1; step <= 400; step++) {
    active = stepWaterSimulation({ water, rows, cols, isSolid, activeCells: active, doFall: step % WATER_FALL_INTERVAL === 0 }).nextActiveCells;
  }
  assert.equal(water[5 * cols + 3], MAX_WATER_MASS, '縦穴の底まで満ちる');
  assert.equal(water[4 * cols + 3], MAX_WATER_MASS);
  assert.equal(water[3 * cols + 3], MAX_WATER_MASS);
});
