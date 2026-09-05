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

/**
 * (r, c) から**空洞だけ**を辿って届くマスの集合。掘らずに歩ける範囲。
 * 「要塞区画に開口があるので掘らずに出入りできる」を測るのに使う
 * （掘れる扱いの reachable() では、背面を掘れば必ず入れるので区別できない）。
 */
export function floodEmpty(map, start) {
  const { rows, cols, grid } = map;
  const seen = new Set();
  if (grid[start.r][start.c] !== 0) return seen; // BLOCK_EMPTY === 0
  const stack = [[start.r, start.c]];
  seen.add(`${start.r},${start.c}`);
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (grid[nr][nc] !== 0) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  return seen;
}
