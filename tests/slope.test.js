// stairDirection（5面の地形の描画だけが使う。段5で描画を形から描くように置き換えたら消す）。
// 機体の坂の判定・描画オフセット・くの字の先端の判定は、タイルの形（utils/tileShape.js）へ移った
// （tests/tile-shape-slope.test.js・player-slope.test.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairDirection } from '../src/js/utils/slope.js';
import { makeMap } from './helpers/enemy-world.js';

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
