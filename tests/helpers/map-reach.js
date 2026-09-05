// ============================================
// 到達可能性（テスト用）
// ============================================
//
// 「開始地点から基地まで行けるか」を測る。掘れるブロックは通れる扱いにして、
// 装甲（BLOCK_INDESTRUCTIBLE）だけを壁とみなす。自機は地形を掘って進めるので、
// 通れないのは壊せないものだけ。

import { BLOCK_INDESTRUCTIBLE } from '../../src/js/utils/Constants.js';

/**
 * start から goal へ、装甲を避けて到達できるか。
 * @param {{rows:number, cols:number, grid:number[][]}} map
 * @param {{r:number, c:number}} start
 * @param {{r:number, c:number}} goal
 */
export function reachable(map, start, goal) {
  const { rows, cols, grid } = map;
  if (grid[start.r][start.c] === BLOCK_INDESTRUCTIBLE) return false;
  const seen = new Uint8Array(rows * cols);
  const goalIdx = goal.r * cols + goal.c;
  const stack = [start.r * cols + start.c];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    if (i === goalIdx) return true;
    const r = (i / cols) | 0;
    const c = i % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (seen[ni]) continue;
      if (grid[nr][nc] === BLOCK_INDESTRUCTIBLE) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return false;
}
