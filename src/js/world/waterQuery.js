// ============================================
// waterQuery - 水量配列から「種別」と「液面の高さ」を導く（純関数）
// ============================================
//
// 「このセルは水か・水面か・滝か」は water[] から一意に決まるのに、以前は
// 問い合わせのたびにゼロから調べ直していた（滝判定が列を下へ走査し、液面が
// 行を左右に走査し、その中でまた滝判定を呼ぶ）。幅298タイルの水面で実測
// 22.4µs/回。エンティティごと・グレネードの軌道90ステップごとに呼ばれるので
// 毎フレーム数msを食っていた。
//
// ここで作る2本の配列に答えを焼いておき、水が変化した列だけ作り直す。
// 問い合わせ側は配列を1回読むだけになる。
//
// canvas も Map も参照しない純関数にしてあるのは、node --test でそのまま
// 検証できるようにするため。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../utils/Constants.js';

export const WATER_NONE = 0;
export const WATER_BODY = 1;     // 水中（タイル全体が水）
export const WATER_SURFACE = 2;  // 液面を形成するセル
export const WATER_FALL = 3;     // 落下中（滝）

/**
 * セルが落下中（滝）か。
 *
 * 「**満ちたセルは落ち着いた水であり、満ちたセルはその上の水を支える。
 * どちらも満ちていない縦の並びだけが、落下の途中の水柱**」という定義。
 *
 * 以前は「自分より下のどこかに空気がある」で判定していたため、湖底に穴が
 * 開くと水面までの列全部が滝と判定され、湖を貫く縦縞が出ていた。実際に
 * 3つのルールを走らせて「帯⇄満水」の往復回数（＝ちらつき）を数えた結果:
 *
 *   ルール                     湖底の爆破(120f)  宙に浮いた水柱  天井からの滝(300f)
 *   現行「下のどこかに空気」          49（縦縞バグ）     正しい          —
 *   A「直下が空気」                 11              取りこぼす      0
 *   B「直下が満水未満」             865（湖内に縞）    正しい          0
 *   C「自分も直下も満水未満」← これ    0              正しい          0
 */
export function isFallingCell(water, cols, isSolid, r, c) {
    const k = r * cols + c;
    const mass = water[k];
    if (mass < MIN_WATER_MASS || mass >= MAX_WATER_MASS) return false;
    if (isSolid(r + 1, c)) return false;
    return water[k + cols] < MAX_WATER_MASS;
}

/**
 * 1列ぶんの kind を決める。
 * 判定はすべて O(1) なので走査の向きは問わない（上から下へ1回）。
 * @returns {Array<number>} この列で見つかった水面セルの行
 */
export function classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c }) {
    const surfaceRows = [];
    for (let r = 0; r < rows; r++) {
        const k = r * cols + c;
        const mass = water[k];

        if (mass < MIN_WATER_MASS) {
            kind[k] = WATER_NONE;
            surfaceY[k] = -1;
            continue;
        }

        if (isFallingCell(water, cols, isSolid, r, c)) {
            kind[k] = WATER_FALL;
            surfaceY[k] = -1;
            continue;
        }

        // 水面か水中か。直上が岩なら「天井に張り付いた水」で液面ではない。
        // 直上が水でも、その水が落下中（滝）なら、こちらが液面になる
        // ＝滝が水たまりへ落ちてくる境目。旧 isWaterSurface と同じ扱い
        let isSurface;
        if (r === 0) {
            isSurface = true;
        } else if (isSolid(r - 1, c)) {
            isSurface = false;
        } else {
            const above = water[k - cols];
            const aboveIsWater = above >= MIN_WATER_MASS;
            const aboveIsFalling = aboveIsWater && above < MAX_WATER_MASS && mass < MAX_WATER_MASS;
            isSurface = !aboveIsWater || aboveIsFalling;
        }

        if (isSurface) {
            kind[k] = WATER_SURFACE;
            surfaceRows.push(r);
        } else {
            kind[k] = WATER_BODY;
            surfaceY[k] = -1;
        }
    }
    return surfaceRows;
}

/**
 * 水面セル (r, c) を含む行セグメントを左右に伸ばし、平均の液面 Y を全員に書く。
 * 平均にするのは、水量がセルごとにバラついていても液面を水平に見せるため
 * （バラついたまま描くと水面がギザギザになる）。
 * @returns {[number, number]} セグメントの [左端の列, 右端の列]
 */
export function levelSurfaceSegment({ water, kind, surfaceY, cols, r, c }) {
    let c0 = c;
    while (c0 - 1 >= 0 && kind[r * cols + (c0 - 1)] === WATER_SURFACE) c0--;
    let c1 = c;
    while (c1 + 1 < cols && kind[r * cols + (c1 + 1)] === WATER_SURFACE) c1++;

    let total = 0;
    for (let sc = c0; sc <= c1; sc++) {
        total += (r + 1 - water[r * cols + sc] / MAX_WATER_MASS) * TILE_SIZE;
    }
    // 整数に丸めるのは描画（fillRect）と当たり判定を1ドットもずらさないため。
    // 以前は描画側だけが Math.round していて、最大0.5px ずれていた
    const avg = Math.round(total / (c1 - c0 + 1));
    for (let sc = c0; sc <= c1; sc++) surfaceY[r * cols + sc] = avg;

    return [c0, c1];
}

/**
 * dirty な列の kind と surfaceY を作り直す。
 * 液面のセグメントは dirty でない列へはみ出すことがあるが、そちらの kind は
 * 既に正しい（水量が変わっていない）ので、そのまま伸ばして構わない。
 */
export function rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols }) {
    const surfaceCells = [];
    for (const c of dirtyCols) {
        for (const r of classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c })) {
            surfaceCells.push([r, c]);
        }
    }
    // 同じセグメントを何度も平均し直さないよう、片付いた列を覚えておく
    const done = new Set();
    for (const [r, c] of surfaceCells) {
        if (done.has(r * cols + c)) continue;
        const [c0, c1] = levelSurfaceSegment({ water, kind, surfaceY, cols, r, c });
        for (let sc = c0; sc <= c1; sc++) done.add(r * cols + sc);
    }
}
