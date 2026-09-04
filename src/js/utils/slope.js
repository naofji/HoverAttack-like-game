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
 * 足の中心 x が段の中でどこにいるかから、坂の斜辺に足を乗せるための描画の縦オフセット。
 * 当たり判定は段の上端（水平）なので、絵だけを斜辺まで下げる。
 * 段の低い側の端で +TILE_SIZE（斜辺はそこで1段下の上端と同じ高さ）、高い側の端で 0。
 *
 * 第1ラウンドでは段の上端どうしを結ぶ線（負のオフセット＝絵を上げる）だったが、
 * 実機で坂の絵（Map._drawRockyBlock の対角線の面取り）と向きが逆だったので反転した。
 * 描いている斜辺は段の上端より1タイル低いところを通る。
 */
export function slopeDrawOffset(dir, feetCenterX) {
    if (dir === 0) return 0;
    const frac = (feetCenterX - Math.floor(feetCenterX / TILE_SIZE) * TILE_SIZE) / TILE_SIZE;
    const t = dir > 0 ? frac : 1 - frac;
    return (1 - t) * TILE_SIZE;
}

/**
 * 高さ1の板状の突出（くの字に削れた先端）の検出。Map.js の chevronL/chevronR
 * （実機の指摘で追加した見た目）と**同じ条件**を isSolid ベースで表現する。
 *
 * タイル自体は岩、上下は空洞（板は宙に浮いている＝階段のように下が岩ではない）、
 * 左右のどちらか片方だけが空洞（もう片方でブロックに繋がっている）ことを要求する。
 * 両側とも空洞（幅1の柱）や両側とも岩（板の内側のタイル）は先端ではないので 0。
 *
 * @returns {-1|0|1} -1 = 左が露出（右辺で繋がっている）、+1 = 右が露出
 */
export function plateTipDirection(map, r, c) {
    if (!map.isSolid(r, c)) return 0;
    if (map.isSolid(r - 1, c) || map.isSolid(r + 1, c)) return 0;
    const leftEmpty = !map.isSolid(r, c - 1);
    const rightEmpty = !map.isSolid(r, c + 1);
    if (leftEmpty && !rightEmpty) return -1;
    if (rightEmpty && !leftEmpty) return 1;
    return 0;
}

/**
 * 板の先端に足を乗せるための描画だけの縦オフセット。slopeDrawOffset と違い、
 * 露出側には描いた面が無い（くの字の頂点はタイル中心で止まる）ので、
 * 中心を超えたところは TILE_SIZE/2 で頭打ちにする（それ以上下げると足が宙に浮く）。
 * 接している辺（dir=+1 なら左端、dir=-1 なら右端）で 0。
 */
export function plateDrawOffset(dir, feetCenterX) {
    if (dir === 0) return 0;
    const frac = (feetCenterX - Math.floor(feetCenterX / TILE_SIZE) * TILE_SIZE) / TILE_SIZE;
    const raw = (dir > 0 ? frac : 1 - frac) * TILE_SIZE;
    // frac がタイル境界ちょうどのとき raw が -0 になることがある（slopeDrawOffset と同じ罠）。
    // -0 は数値としては 0 と等しいが Object.is で区別されるため、+0 に矯正しておく
    return Math.min(TILE_SIZE / 2, raw) || 0;
}
