// ============================================
// 7面の施設エリア（純関数。grid を書き換える）
// ============================================
//
// 要塞の区画の外の洞窟に、メタルパネルで覆われた「施設」の矩形を置く。
// 設計: docs/superpowers/specs/2026-10-31-stage7-facility-metal-design.md
//
// エリアの中の岩は絵だけパネルになり（硬さは今のまま）、**縁の1層の岩だけ本物の金属**にする
// （ユーザー判断「混ぜる」(b)）。縁が空洞を通る所は空洞のまま＝壁を新しく建てないので、
// エリアへ入る道はふさがらない。

import { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, METAL_BLOCK_HP } from '../utils/Constants.js';
import { pickFortressZones } from './fortress.js';

/**
 * 施設エリアの矩形を選ぶ。選び方は要塞の区画と同じ（部屋の中心に矩形を置き、除外・既存と重なれば捨てる）。
 * 部屋を中心にするのは、エリアに空洞（通り道）と岩の両方が入り、金属の階段を盛る床もできるため。
 * 盤面の縁から一様に引くと、岩の塊の中に落ちてパネルが見えないエリアが多くなる
 * @returns {Array<{r0:number,r1:number,c0:number,c1:number}>}
 */
export function pickFacilityAreas({ rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin }) {
    // 1タイルずつ広げた矩形で選んでから縮める。エリア同士が接すると、境目で両方の縁の帯が並んで
    // 金属が2層になり、そこだけ掘るのに倍の弾が要った（最終レビューの指摘。8シードで12組が接していた）。
    // 縮めた後の大きさの分布は wMin〜wMin+wRange のまま
    const padded = pickFortressZones({
        rows, cols, rooms, excludeRects, rng, count,
        wMin: wMin + 2, wRange, hMin: hMin + 2, hRange, margin: margin - 1,
    });
    return padded.map((a) => ({ r0: a.r0 + 1, r1: a.r1 - 1, c0: a.c0 + 1, c1: a.c1 - 1 }));
}

/**
 * 矩形の縁1層の、空でも壊せない岩でもないタイルを本物の金属にする。
 * @returns {number} 金属にしたタイルの数
 */
export function metalizeFacilityBand(grid, blockHP, area) {
    let n = 0;
    for (let r = area.r0; r <= area.r1; r++) {
        for (let c = area.c0; c <= area.c1; c++) {
            if (r !== area.r0 && r !== area.r1 && c !== area.c0 && c !== area.c1) continue;
            const b = grid[r][c];
            if (b === BLOCK_EMPTY || b === BLOCK_INDESTRUCTIBLE) continue;
            grid[r][c] = BLOCK_METAL;
            blockHP[r][c] = METAL_BLOCK_HP;
            n++;
        }
    }
    return n;
}
