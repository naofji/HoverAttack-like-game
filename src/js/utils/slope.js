// ============================================
// 階段の検出と45度の描画オフセット（純関数）
// ============================================
//
// 斜面ブロックは作らない。当たり判定は今の「1段の乗り上げ」のままで、
// 足元のタイル列から「階段の途中に立っている」ことだけを検出する。
// 検出は両側を要求する（片側だけだとただの段差も斜面になる）。階段の端の段は
// 平地扱いになるが、生成側（snowStairs）が 5 段以上を保証するので滑れる。

import { TILE_SIZE } from './Constants.js';

/**
 * @param {{isSolid(r,c):boolean}} map
 * @param {number} r 足が乗っているブロックの行
 * @param {number} c 同じく列
 * @returns {-1|0|1} +1 = 右へ上る階段、-1 = 左へ上る階段
 */
export function stairDirection(map, r, c) {
    const rightUp = map.isSolid(r - 1, c + 1) && !map.isSolid(r - 2, c + 1);
    const leftDown = !map.isSolid(r, c - 1) && map.isSolid(r + 1, c - 1);
    if (rightUp && leftDown) return 1;
    const leftUp = map.isSolid(r - 1, c - 1) && !map.isSolid(r - 2, c - 1);
    const rightDown = !map.isSolid(r, c + 1) && map.isSolid(r + 1, c + 1);
    if (leftUp && rightDown) return -1;
    return 0;
}

/**
 * 足の中心 x が段の中でどこにいるかから、45度の線に乗せる描画の縦オフセット。
 * 段の低い側の端で 0、高い側の端で -TILE_SIZE。
 */
export function slopeDrawOffset(dir, feetCenterX) {
    if (dir === 0) return 0;
    const frac = (feetCenterX - Math.floor(feetCenterX / TILE_SIZE) * TILE_SIZE) / TILE_SIZE;
    const t = dir > 0 ? frac : 1 - frac;
    // `-(t * TILE_SIZE)` だと段の端（t=0）で -0 を返し、呼び出し側の比較や
    // テストの Object.is 判定で 0 と別物になる。0 から引いて +0 に寄せる
    return 0 - t * TILE_SIZE;
}
