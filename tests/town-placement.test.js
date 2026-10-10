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

// 洞窟の床は平滑化で細かい段になっている。3面5週の実測で、天井まで 12 タイル以上ある
// 床の区間 233 本のうち 193 本が幅1タイルで、塔（幅 20px〜）が建たなかった。
// 1タイルの段差でつながる区間は1本にまとめ、一番低い床を地面にする
test('chainFloors: 1タイルの段差でつながる床を1本にまとめる。地面は一番低い床、天井は一番低い天井', async () => {
    const { chainFloors } = await import('../src/js/world/town/placement.js');
    const floors = [
        { r: 10, c0: 0, c1: 2, headroom: 8 },   // 天井の下端は行 2
        { r: 11, c0: 2, c1: 3, headroom: 6 },   // 1段下がる。天井の下端は行 5（一番低い）
        { r: 10, c0: 3, c1: 5, headroom: 7 },   // 1段上がる
        { r: 7, c0: 5, c1: 6, headroom: 4 },    // 3段上がる → つながらない
        { r: 20, c0: 0, c1: 4, headroom: 5 },   // 別の階の床（列が重なっても行が離れている）
    ];
    const chains = chainFloors(floors, 1);
    assert.deepEqual(chains, [
        { r: 11, c0: 0, c1: 5, ceil: 5, floorRows: [10, 10, 11, 10, 10] },
        { r: 20, c0: 0, c1: 4, ceil: 15, floorRows: [20, 20, 20, 20] },
        { r: 7, c0: 5, c1: 6, ceil: 3, floorRows: [7] },
    ]);
});

test('chainFloors: 1段ずつでも階段状に続くなら、区間全体の高低差が maxStep を超えたところで切る', async () => {
    // 隣どうしは1段差でも、10→11→12 とつなぐと全体で2段になり、低い床に建てた
    // 小屋が高い段の岩に埋もれる（3面 seed 11 の実マップで出た）
    const { chainFloors } = await import('../src/js/world/town/placement.js');
    const chains = chainFloors([
        { r: 10, c0: 0, c1: 2, headroom: 8 },
        { r: 11, c0: 2, c1: 4, headroom: 8 },
        { r: 12, c0: 4, c1: 6, headroom: 8 },
    ], 1);
    assert.deepEqual(chains, [
        { r: 11, c0: 0, c1: 4, ceil: 3, floorRows: [10, 10, 11, 11] },
        { r: 12, c0: 4, c1: 6, ceil: 4, floorRows: [12, 12] },
    ]);
});
