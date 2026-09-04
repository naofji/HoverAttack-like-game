import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { carveSnowStairs } from '../src/js/world/snowStairs.js';
import { stairDirection } from '../src/js/utils/slope.js';

// 30x20。row 15 が床、上は空洞。
function world() {
  const grid = [], blockHP = [];
  for (let r = 0; r < 20; r++) {
    grid.push([]); blockHP.push([]);
    for (let c = 0; c < 30; c++) { const s = r >= 15 || r === 0 || c === 0 || c === 29; grid[r].push(s ? 1 : 0); blockHP[r].push(1); }
  }
  return { grid, blockHP, rows: 20, cols: 30, rooms: [{ centerR: 8, centerC: 15 }] };
}

function mapOf(w) {
  return { isSolid: (r, c) => r < 0 || c < 0 || r >= w.rows || c >= w.cols || w.grid[r][c] !== 0 };
}

test('carves a staircase of at least lengthMin steps that stairDirection recognises in the middle', () => {
  const w = world();
  const stairs = carveSnowStairs({ ...w, rng: new SeededRNG(2), count: 1, lengthMin: 5, lengthRange: 0 });
  assert.equal(stairs.length, 1);
  const s = stairs[0];
  assert.equal(s.length, 5);
  const map = mapOf(w);
  // 真ん中の段に立ったときの向きが s.dir
  const midStep = 2;
  const r = s.r - midStep;             // 段が1つ上がるごとに行が1つ減る
  const c = s.c + s.dir * midStep;
  assert.equal(stairDirection(map, r, c), s.dir);
});

test('same rng carves the same stairs', () => {
  const a = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  const b = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  assert.deepEqual(a, b);
});
