// Map._sweepDryPockets() が findStuckDryPockets の結果を activeWaterCells に
// 実際に流し込んでいるか（本物の呼び出し経路の確認）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Map } from '../src/js/world/Map.js';

function makeStub({ rows, cols, water, isSolid }) {
  return { rows, cols, water, isSolid, activeWaterCells: null };
}

test('_sweepDryPockets は取りこぼされた縦穴を activeWaterCells に追加する', () => {
  const rows = 5, cols = 3;
  const water = new Uint8Array(rows * cols);
  water[1 * cols + 1] = 5; // (r=1,c=1) に水。(r=2,c=1) が縦穴の入口
  const isSolid = (r, c) => c === 0 || c === 2 || r >= 3;
  const map = makeStub({ rows, cols, water, isSolid });

  Map.prototype._sweepDryPockets.call(map);

  assert.ok(map.activeWaterCells instanceof Set);
  assert.ok(map.activeWaterCells.has(2 * cols + 1));
});

test('_sweepDryPockets は既存の activeWaterCells を消さずに足す', () => {
  const rows = 5, cols = 3;
  const water = new Uint8Array(rows * cols);
  water[1 * cols + 1] = 5;
  const isSolid = (r, c) => c === 0 || c === 2 || r >= 3;
  const map = makeStub({ rows, cols, water, isSolid });
  map.activeWaterCells = new Set([999]);

  Map.prototype._sweepDryPockets.call(map);

  assert.ok(map.activeWaterCells.has(999));
  assert.ok(map.activeWaterCells.has(2 * cols + 1));
});

test('_sweepDryPockets は何も見つからなければ activeWaterCells を作らない', () => {
  const rows = 3, cols = 3;
  const water = new Uint8Array(rows * cols);
  const isSolid = () => false;
  const map = makeStub({ rows, cols, water, isSolid });

  Map.prototype._sweepDryPockets.call(map);

  assert.equal(map.activeWaterCells, null);
});

test('_sweepDryPockets は water が無ければ何もしない', () => {
  const map = { rows: 3, cols: 3, water: null, activeWaterCells: null };
  assert.doesNotThrow(() => Map.prototype._sweepDryPockets.call(map));
  assert.equal(map.activeWaterCells, null);
});
