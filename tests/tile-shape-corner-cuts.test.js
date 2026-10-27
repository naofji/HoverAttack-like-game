// shapeCornerCuts: タイルの形から、絵の輪郭で4つの角をどれだけ削るか（0 / 8 / 16px）。
// 5面の地形の絵（Map._drawRockyBlock）はこの値だけで輪郭の多角形を作る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTileShape, shapeCornerCuts, SHAPE_FULL } from '../src/js/utils/tileShape.js';

/** '#' が岩、'.' が空。範囲外は磨き仕上げ（computeTileShape の約束） */
function shapeOf(rows, r, c) {
  const cellAt = (rr, cc) => {
    if (rr < 0 || rr >= rows.length || cc < 0 || cc >= rows[0].length) return 'polished';
    return rows[rr][cc] === '#' ? 'rock' : 'empty';
  };
  return computeTileShape(cellAt, r, c, 'snowSlope');
}

test('満ちたタイルはどの角も削らない', () => {
  assert.deepEqual(shapeCornerCuts(SHAPE_FULL), { tl: 0, tr: 0, bl: 0, br: 0 });
});

test('単独のタイルは4角とも小さい面取り（菱形）', () => {
  assert.deepEqual(shapeCornerCuts(shapeOf(['...', '.#.', '...'], 1, 1)), { tl: 8, tr: 8, bl: 8, br: 8 });
});

test('浮いた2ブロックの板の左は「<=」: 左の上下の角だけ小さい面取り', () => {
  assert.deepEqual(shapeCornerCuts(shapeOf(['....', '.##.', '....'], 1, 1)), { tl: 8, tr: 0, bl: 8, br: 0 });
});

test('右上がりの階段の真ん中の段は、左上をタイル1枚ぶん斜めに削る', () => {
  assert.deepEqual(shapeCornerCuts(shapeOf(['....', '..##', '.###', '####'], 2, 1)), { tl: 16, tr: 0, bl: 0, br: 0 });
});

test('左上がりの階段（鏡像）は右上を斜めに削る', () => {
  assert.deepEqual(shapeCornerCuts(shapeOf(['....', '##..', '###.', '####'], 2, 2)), { tl: 0, tr: 16, bl: 0, br: 0 });
});

test('天井の階段は下の角を斜めに削る', () => {
  assert.deepEqual(shapeCornerCuts(shapeOf(['####', '.###', '..##', '....'], 1, 1)), { tl: 0, tr: 0, bl: 16, br: 0 });
});
