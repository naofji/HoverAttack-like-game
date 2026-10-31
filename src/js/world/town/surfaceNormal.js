// ============================================
// surfaceNormal - 町の建物・木の面の向き（法線）を、かけらの並びから推定する
// ============================================
//
// 建物は 4px のかけらの表で、木は円錐を重ねた形（階段状の外形）。当たった軸（縦か横か）だけで
// 反射すると、斜めの面で不自然に跳ねる（ユーザー指摘 2026-10-31）ので、当たった点の周りの岩（厚い壁）の
// 重心の向きから「外向きの法線」を出す。階段の段差（4px）は半径で均す。
// 純ロジック。岩かどうかは呼び出し側の述語で渡す（Town の ignore / exposed の絞り込みを共有するため）。

/** 標本を取る間隔（px）。かけら（CHUNK = 4px）の半分で、段差を取りこぼさない */
const SAMPLE_STEP = 2;

/**
 * (x, y) の周り半径 radius の岩の重心の、反対向きの単位ベクトル（外向き）。
 * @param {(x:number, y:number) => boolean} isSolid 厚い壁か
 * @returns {[number, number] | null} 周りが全部岩・全部空・左右対称などで向きが決まらなければ null
 */
export function surfaceNormal(isSolid, x, y, radius) {
    let sx = 0, sy = 0;
    for (let dy = -radius; dy <= radius; dy += SAMPLE_STEP) {
        for (let dx = -radius; dx <= radius; dx += SAMPLE_STEP) {
            if (dx * dx + dy * dy > radius * radius) continue;
            if (isSolid(x + dx, y + dy)) { sx += dx; sy += dy; }
        }
    }
    const len = Math.hypot(sx, sy);
    // 標本 1 つぶん（SAMPLE_STEP）より小さい偏りは、向きと呼べない（薄い壁・細い枝のまん中）
    if (len < SAMPLE_STEP) return null;
    return [-sx / len, -sy / len];
}
