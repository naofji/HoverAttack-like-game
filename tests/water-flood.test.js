import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillDestroyedCells } from '../src/js/world/waterPools.js';

// 最小の Map もどき。5x5、水は (3,1),(4,1)（水面 row 3）。
function mapStub() {
  const rows = 5, cols = 5;
  const water = new Uint8Array(rows * cols);
  const waterSurface = new Int16Array(rows * cols).fill(-1);
  const set = (r, c) => { water[r * cols + c] = 1; waterSurface[r * cols + c] = 3; };
  set(3, 1); set(4, 1);
  const changed = [];
  return {
    rows, cols, water, waterSurface,
    isWater(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols && water[r * cols + c] === 1; },
    waterSurfaceRow(r, c) { return this.isWater(r, c) ? waterSurface[r * cols + c] : -1; },
    onWaterChanged(cells) { changed.push(...cells); },
    changed,
  };
}

test('a destroyed cell below the surface and touching water becomes water', () => {
  const m = mapStub();
  const got = fillDestroyedCells(m, [[3, 2]]);
  assert.deepEqual(got, [[3, 2]]);
  assert.ok(m.isWater(3, 2));
  assert.equal(m.waterSurfaceRow(3, 2), 3);
});

test('a destroyed cell above the surface stays dry even if it touches water', () => {
  const m = mapStub();
  assert.deepEqual(fillDestroyedCells(m, [[2, 1]]), []);
  assert.ok(!m.isWater(2, 1));
});

test('a crater destroyed at once fills through the chain, in any order', () => {
  const m = mapStub();
  // (3,3) は (3,2) 経由でしか水に接しない。先に並んでいても埋まる
  const got = fillDestroyedCells(m, [[3, 3], [3, 2]]);
  assert.deepEqual(got.sort(), [[3, 2], [3, 3]].sort());
  assert.deepEqual(m.changed.sort(), [[3, 2], [3, 3]].sort());
});

test('pre-existing empty cells are not flooded (only the destroyed set)', () => {
  const m = mapStub();
  // (3,2) を壊した。(3,3) は元から空洞だが壊れていないので水にならない
  fillDestroyedCells(m, [[3, 2]]);
  assert.ok(!m.isWater(3, 3));
});
