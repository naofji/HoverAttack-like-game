// ============================================
// villages - 町を村に分ける（どこが密集し、どこがまばらか）
// ============================================
//
// 段1の実機確認で「建物が想定より多い。まばらな所と密集した所の村があっていい」と言われた。
// 面全体で一律の確率で建てていたのを、村の中心からの距離で決める形に替える。
// 村は升目に1つずつ（ずらして）置くので、面のどこかに偏らず全体に散らばる。

import {
    TOWN_VILLAGE_GRID_COLS, TOWN_VILLAGE_GRID_ROWS,
    TOWN_VILLAGE_DENSE_CHANCE, TOWN_VILLAGE_SPARSE_CHANCE,
    TOWN_VILLAGE_DENSE_FILL, TOWN_VILLAGE_SPARSE_FILL, TOWN_VILLAGE_OUTSIDE_FILL,
    TOWN_VILLAGE_RADIUS_DENSE, TOWN_VILLAGE_RADIUS_SPARSE,
} from '../../utils/Constants.js';

const between = (rng, [lo, hi]) => lo + rng.next() * (hi - lo);

/**
 * 村を置く。返り値は [{c, r, radius, peak}]（タイル単位。peak は中心で建てる確率）。
 * 縦の列の升がどれも「村なし」になったら、まばらな集落を1つ置く
 * （面の幅の 1/5 がまるごと岩肌だけになると、町の面に見えない）
 */
export function placeVillages(rng, rows, cols) {
    const cw = cols / TOWN_VILLAGE_GRID_COLS;
    const ch = rows / TOWN_VILLAGE_GRID_ROWS;
    const villages = [];
    for (let gx = 0; gx < TOWN_VILLAGE_GRID_COLS; gx++) {
        const column = [];
        for (let gy = 0; gy < TOWN_VILLAGE_GRID_ROWS; gy++) {
            const u = rng.next();
            const kind = u < TOWN_VILLAGE_DENSE_CHANCE ? 'dense'
                : u < TOWN_VILLAGE_DENSE_CHANCE + TOWN_VILLAGE_SPARSE_CHANCE ? 'sparse' : null;
            // 位置は引いておく（村なしの升でも乱数の消費を揃え、確率を変えたとき他の升の村が動かない）
            const c = (gx + rng.next()) * cw;
            const r = (gy + rng.next()) * ch;
            column.push({ kind, c, r });
        }
        if (column.every((v) => !v.kind)) column[Math.floor(rng.next() * column.length)].kind = 'sparse';
        for (const v of column) {
            if (!v.kind) continue;
            const dense = v.kind === 'dense';
            villages.push({
                c: v.c, r: v.r,
                radius: between(rng, dense ? TOWN_VILLAGE_RADIUS_DENSE : TOWN_VILLAGE_RADIUS_SPARSE),
                peak: dense ? TOWN_VILLAGE_DENSE_FILL : TOWN_VILLAGE_SPARSE_FILL,
            });
        }
    }
    return villages;
}

/**
 * 列 c・行 r（タイル）で建てる確率。半径の半分までは村の密度のまま、そこから縁まで
 * なめらかに（smoothstep）村の外の密度へ下がる。村が重なる所は濃いほう
 */
export function villageFill(villages, c, r) {
    let fill = TOWN_VILLAGE_OUTSIDE_FILL;
    for (const v of villages) {
        const t = (Math.hypot(c - v.c, r - v.r) / v.radius - 0.5) * 2;
        if (t >= 1) continue;
        const k = t <= 0 ? 1 : 1 - t * t * (3 - 2 * t);
        fill = Math.max(fill, TOWN_VILLAGE_OUTSIDE_FILL + (v.peak - TOWN_VILLAGE_OUTSIDE_FILL) * k);
    }
    return fill;
}

/**
 * 町を建てない区域（最後の敵基地の周り）からの効き。zones は [{c, r, inner, outer}]（タイル）。
 * inner 以内は 0、outer より外は 1、あいだは smoothstep。村の密度に掛けて使う
 */
export function quietFactor(zones, c, r) {
    let f = 1;
    for (const z of zones) {
        const t = (Math.hypot(c - z.c, r - z.r) - z.inner) / (z.outer - z.inner);
        if (t >= 1) continue;
        f = Math.min(f, t <= 0 ? 0 : t * t * (3 - 2 * t));
    }
    return f;
}
