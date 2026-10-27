// ============================================
// 階段の検出（純関数）。**5面の地形の描画（Map._drawRockyBlock）だけが使う**
// ============================================
//
// 当たり判定と機体の坂の扱いは、タイルの形（utils/tileShape.js）へ移った（タイル形状つき
// 当たり判定 段2。docs/superpowers/plans/2026-10-27-tile-shape-2-bodies.md）。絵は段5で
// 形から描くように置き換えるので、そのときにこのファイルごと消す。
// 検出は両側を要求する（片側だけだとただの段差も斜面になる）。

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
