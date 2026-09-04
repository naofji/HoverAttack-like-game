import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairDirection, slopeDrawOffset } from '../src/js/utils/slope.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

// 右へ上る階段: 行 r の段が列 c、行 r-1 の段が列 c+1、…
function stairsRows() {
  const rows = [];
  for (let r = 0; r < 12; r++) {
    let s = '';
    for (let c = 0; c < 12; c++) s += (r >= 11 - c ? '#' : '.'); // 対角線の下が岩
    rows.push(s);
  }
  return rows;
}

test('stairDirection sees a rising-right staircase from a middle step', () => {
  const map = makeMap(stairsRows());
  // 段 (r=8, c=3): 右隣 (7,4) が1段高く、左隣 (8,2) は空で (9,2) が岩
  assert.equal(stairDirection(map, 8, 3), 1);
});

test('stairDirection is 0 on flat ground and on a single ledge', () => {
  const flat = makeMap(['............', '............', '############']);
  assert.equal(stairDirection(flat, 2, 5), 0);
  const ledge = makeMap(['............', '......######', '############']);
  assert.equal(stairDirection(ledge, 2, 4), 0); // 上りだけで下りが無い
});

test('slopeDrawOffset interpolates 0..-TILE across a rising step and 0 on flat', () => {
  assert.equal(slopeDrawOffset(0, 100), 0);
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE), 0);
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE + TILE_SIZE / 2), -TILE_SIZE / 2);
  assert.equal(slopeDrawOffset(-1, 3 * TILE_SIZE + TILE_SIZE / 2), -TILE_SIZE / 2);
  assert.equal(slopeDrawOffset(-1, 4 * TILE_SIZE - 0.001) > -0.1, true);
});
