// ============================================
// 地底湖の生成（純関数）
// ============================================
//
// 低い位置のチャンバーを選び、部屋の床から depth 段を水にする。塗るのは
// 「床からつながる空洞」だけ（通路の口から水が浮いて見えるのを避ける）。
// 塗り広がりが maxTiles を超えたら、その部屋は閉じていないとみなして捨てる。
//
// 乱数は呼び出し側が派生ストリームを渡す。game.rng を消費すると敵の構成が
// 変わって週の決定性が壊れる（CaveBackdrop と同じ理由）。

import { BLOCK_EMPTY } from '../utils/Constants.js';

function inRects(r, c, rects) {
    return rects.some((q) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1);
}

/** 部屋の中心から下へ辿って床の行を返す。空洞が無ければ -1。 */
function floorRowBelow(grid, rows, r, c) {
    if (grid[r] == null || grid[r][c] !== BLOCK_EMPTY) return -1;
    let rr = r;
    while (rr + 1 < rows && grid[rr + 1][c] === BLOCK_EMPTY) rr++;
    return rr + 1 < rows ? rr + 1 : -1;
}

/**
 * @returns {Array<{surfaceRow:number, cells:Array<[number,number]>}>}
 */
export function generateWaterPools({ grid, rows, cols, rooms, excludeRects, rng, count, depthMin, depthRange, maxTiles }) {
    // 低い部屋から順に候補にする（地底湖は下にあるほうが自然）。同じ高さは中心列で安定ソート
    const candidates = rooms
        .map((room) => ({ room, floor: floorRowBelow(grid, rows, room.centerR, room.centerC) }))
        .filter((x) => x.floor > 0 && !inRects(x.room.centerR, x.room.centerC, excludeRects))
        .sort((a, b) => (b.floor - a.floor) || (a.room.centerC - b.room.centerC));

    const pools = [];
    const taken = new Set();
    for (const { room, floor } of candidates) {
        if (pools.length >= count) break;
        const depth = depthMin + Math.floor(rng.next() * (depthRange + 1));
        const surfaceRow = floor - depth;
        if (surfaceRow <= 0) continue;

        // 床の直上から、surfaceRow 以下の空洞を4方向に塗り広げる
        const cells = [];
        const stack = [[floor - 1, room.centerC]];
        const seen = new Set();
        let overflow = false;
        while (stack.length) {
            const [r, c] = stack.pop();
            const key = r * cols + c;
            if (seen.has(key) || taken.has(key)) continue;
            if (r < surfaceRow || r >= rows || c < 0 || c >= cols) continue;
            if (grid[r][c] !== BLOCK_EMPTY) continue;
            if (inRects(r, c, excludeRects)) { overflow = true; break; }
            seen.add(key);
            cells.push([r, c]);
            if (cells.length > maxTiles) { overflow = true; break; }
            stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
        if (overflow || cells.length === 0) continue;
        cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        for (const [r, c] of cells) taken.add(r * cols + c);
        pools.push({ surfaceRow, cells });
    }
    return pools;
}

/**
 * 壊れたブロックのうち、水面より下で水に4方向で接するものを水にする。
 * 壊れたセルの集合の中だけを塗り広げる（元からの空洞には流さない。流すと
 * 「水面より下の空洞をどこまでも埋める」ことになり基地の部屋へ届く回が出る）。
 * 水面の行は動かさない。
 * @returns {Array<[number,number]>} 水になったセル
 */
export function fillDestroyedCells(map, destroyed) {
    const pending = new Set(destroyed.map(([r, c]) => r * map.cols + c));
    const filled = [];
    let progressed = true;
    while (progressed && pending.size) {
        progressed = false;
        for (const key of [...pending]) {
            const r = Math.floor(key / map.cols);
            const c = key % map.cols;
            const around = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
            let surface = -1;
            for (const [nr, nc] of around) {
                const s = map.waterSurfaceRow(nr, nc);
                if (s >= 0 && r >= s) { surface = s; break; }
            }
            if (surface < 0) continue;
            map.water[key] = 1;
            map.waterSurface[key] = surface;
            filled.push([r, c]);
            pending.delete(key);
            progressed = true;
        }
    }
    if (filled.length) map.onWaterChanged(filled);
    return filled;
}
