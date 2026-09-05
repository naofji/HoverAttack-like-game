import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generateWaterPools } from '../src/js/world/waterPools.js';

// 20x12。row 0 と 11、col 0 と 19 が壁。真ん中に床 row 8 の部屋（cols 2..9）と、
// row 4 で右へ抜ける通路、右側に床 row 10 の深い部屋（cols 12..17）。
function grid() {
  const g = [];
  for (let r = 0; r < 12; r++) {
    g.push([]);
    for (let c = 0; c < 20; c++) {
      let solid = r === 0 || r === 11 || c === 0 || c === 19;
      if (!solid) solid = true; // いったん全部岩
      g[r].push(solid ? 1 : 0);
    }
  }
  const carve = (r0, r1, c0, c1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0; };
  carve(2, 8, 2, 9);     // 左の部屋（床は row 9 の岩）
  carve(4, 4, 10, 11);   // 通路
  carve(3, 10, 12, 17);  // 右の部屋（床は row 11 の壁）
  return g;
}

const rooms = [{ centerR: 5, centerC: 5 }, { centerR: 6, centerC: 14 }];

test('a pool fills the bottom of a room up to its surface row, and only cells connected to the floor', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(1),
    count: 1, depthMin: 3, depthRange: 0, maxTiles: 600,
  });
  assert.equal(pools.length, 1);
  const p = pools[0];
  // 深さ3 = 床の上3段。左の部屋なら row 6,7,8、右なら row 8,9,10
  const rowsUsed = new Set(p.cells.map(([r]) => r));
  assert.equal(rowsUsed.size, 3);
  assert.equal(Math.min(...rowsUsed), p.surfaceRow);
  for (const [r, c] of p.cells) assert.equal(grid()[r][c], 0, 'water only in empty cells');
});

test('pools never enter excluded rects (start / base rooms)', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [{ r0: 0, r1: 11, c0: 0, c1: 10 }],
    rng: new SeededRNG(1), count: 2, depthMin: 3, depthRange: 0, maxTiles: 600,
  });
  for (const p of pools) for (const [, c] of p.cells) assert.ok(c > 10, `cell col ${c} inside excluded rect`);
});

test('a pool that would spread beyond maxTiles is dropped', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(1),
    count: 2, depthMin: 3, depthRange: 0, maxTiles: 5,
  });
  assert.equal(pools.length, 0);
});

test('same rng gives the same pools', () => {
  const a = generateWaterPools({ grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(9), count: 2, depthMin: 3, depthRange: 2, maxTiles: 600 });
  const b = generateWaterPools({ grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(9), count: 2, depthMin: 3, depthRange: 2, maxTiles: 600 });
  assert.deepEqual(a, b);
});
