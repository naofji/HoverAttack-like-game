import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSites } from '../src/js/world/town/placement.js';

// 10行x12列。外周2行・左右1列が岩、中が空洞。(3,5) に柱を1本立てる
//   r0-1: 天井 / r8-9: 床 / c0, c11: 壁
function room() {
    const rows = 10, cols = 12;
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
            const rock = r <= 1 || r >= 8 || c === 0 || c === 11;
            grid[r][c] = rock ? 1 : 0;
        }
    }
    grid[3][5] = 1;
    return { grid, rows, cols };
}

test('床: 上が空いた区間を1本にまとめ、上の空きは区間内の最小で測る', () => {
    const { grid, rows, cols } = room();
    const { floors } = findSites(grid, rows, cols);
    // c5 は柱の下で空きが 4（行 7,6,5,4）。他の列は 6
    assert.deepEqual(floors.find((f) => f.r === 8), { r: 8, c0: 1, c1: 11, headroom: 4 });
    // 柱の上面も床（上は行2の1つだけ空き）
    assert.deepEqual(floors.find((f) => f.r === 3), { r: 3, c0: 5, c1: 6, headroom: 1 });
});

test('天井: 下が空いた区間。下の空きは区間内の最小', () => {
    const { grid, rows, cols } = room();
    const { ceilings } = findSites(grid, rows, cols);
    assert.deepEqual(ceilings.find((f) => f.r === 1), { r: 1, c0: 1, c1: 11, drop: 1 });
    assert.deepEqual(ceilings.find((f) => f.r === 3), { r: 3, c0: 5, c1: 6, drop: 4 });
});

test('壁: 横が空いた縦の区間。向きと横の空き（区間内の最小）', () => {
    const { grid, rows, cols } = room();
    const { walls } = findSites(grid, rows, cols);
    // 行3だけ柱で前がふさがる: 左の壁からは4、右の壁からは5
    assert.deepEqual(walls.find((w) => w.c === 0), { c: 0, r0: 2, r1: 8, side: 'right', reach: 4 });
    assert.deepEqual(walls.find((w) => w.c === 11), { c: 11, r0: 2, r1: 8, side: 'left', reach: 5 });
    assert.deepEqual(walls.find((w) => w.c === 5 && w.side === 'right'), { c: 5, r0: 3, r1: 4, side: 'right', reach: 5 });
    assert.deepEqual(walls.find((w) => w.c === 5 && w.side === 'left'), { c: 5, r0: 3, r1: 4, side: 'left', reach: 4 });
});

test('盤面の外は空気として数えない（外周の岩の外側に床や壁を作らない）', () => {
    const { grid, rows, cols } = room();
    const { floors, walls } = findSites(grid, rows, cols);
    assert.ok(!floors.some((f) => f.r === 0), '最上段は上が盤面の外');
    assert.ok(!walls.some((w) => w.c === 0 && w.side === 'left'));
});
