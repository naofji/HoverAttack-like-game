// ============================================
// 雪の面の階段（純関数。grid を書き換える）
// ============================================
//
// 部屋の床に、length 段の階段を「盛る」（岩を足す）。滑れる長さを保証したいので
// 生成側で意図的に作る。乱数は派生ストリーム（game.rng を消費しない）。
// 段は上に行くほど dir の向きへ1列ずれる。頂上の先は空洞のまま（降りられる）。

import { BLOCK_NORMAL, BLOCK_EMPTY } from '../utils/Constants.js';

/** (r, c) から下へ辿った床の行。空洞でなければ -1。 */
function floorBelow(grid, rows, r, c) {
    if (grid[r] == null || grid[r][c] !== BLOCK_EMPTY) return -1;
    let rr = r;
    while (rr + 1 < rows && grid[rr + 1][c] === BLOCK_EMPTY) rr++;
    return rr + 1 < rows ? rr + 1 : -1;
}

export function carveSnowStairs({ grid, blockHP, rows, cols, rooms, rng, count, lengthMin, lengthRange }) {
    const stairs = [];
    let tries = 0;
    while (stairs.length < count && tries < count * 20) {
        tries++;
        const room = rooms[Math.floor(rng.next() * rooms.length)];
        const dir = rng.next() < 0.5 ? 1 : -1;
        const length = lengthMin + Math.floor(rng.next() * (lengthRange + 1));
        // 部屋の中心から dir と逆側に length/2 ずらした列を最下段にする
        const c0 = room.centerC - dir * Math.floor(length / 2);
        const floor = floorBelow(grid, rows, room.centerR, c0);
        if (floor < 0) continue;
        // 段ごとに「空洞であること」と「頭上に2段の余裕」を確かめる
        let ok = true;
        for (let i = 0; i < length && ok; i++) {
            const c = c0 + dir * i;
            for (let k = 0; k <= i; k++) {
                const r = floor - 1 - k;
                if (r < 2 || c < 1 || c >= cols - 1 || grid[r][c] !== BLOCK_EMPTY) ok = false;
            }
            if (grid[floor - 1 - i - 1] == null || grid[floor - 1 - i - 1][c] !== BLOCK_EMPTY) ok = false;
            if (grid[floor - 1 - i - 2] == null || grid[floor - 1 - i - 2][c] !== BLOCK_EMPTY) ok = false;
        }
        if (!ok) continue;
        for (let i = 0; i < length; i++) {
            const c = c0 + dir * i;
            for (let k = 0; k <= i; k++) {
                grid[floor - 1 - k][c] = BLOCK_NORMAL;
                blockHP[floor - 1 - k][c] = 1;
            }
        }
        stairs.push({ r: floor - 1, c: c0, dir, length });
    }
    return stairs;
}
