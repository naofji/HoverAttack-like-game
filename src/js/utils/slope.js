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
 * 足が実際に乗っている段の列。行 r に「上面がある」列（r が岩で r-1 が空）を、
 * 足の左端から右端まで見て探す。中心の列が条件を満たせばそちらを優先する。
 *
 * 中心の列だけを見てはいけない。16px 幅の機体が 16px の段を降りるとき、
 * 体を支えている列より先に中心が次の（1段低い）列へ出るので、中心で引くと
 * 階段の途中でもほぼ常に「平地」と判定される。実測では階段を9段降りるあいだ
 * stairDirection が一度も 0 以外を返さず、下りの加速も吸着も効いていなかった。
 *
 * 「岩である最初の列」では駄目で「上面がその行にある列」でなければならない。
 * 1段高い段にまたがっているとき、高いほうの列も行 r では岩なので、単に岩を
 * 探すと1段ずれた列を掴んで階段を見失う（上り歩行のテストで実際に外した）。
 *
 * @returns {number} 見つからなければ中心の列（stairDirection はそこで 0 を返す）
 */
export function supportColumn(map, r, leftX, rightX, centerX) {
    const cl = Math.floor(leftX / TILE_SIZE);
    const cr = Math.floor(rightX / TILE_SIZE);
    const cc = Math.floor(centerX / TILE_SIZE);
    const topsHere = (c) => map.isSolid(r, c) && !map.isSolid(r - 1, c);
    if (cc >= cl && cc <= cr && topsHere(cc)) return cc;
    for (let c = cl; c <= cr; c++) if (topsHere(c)) return c;
    return cc;
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
