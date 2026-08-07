// ============================================
// 被弾位置の記録
// ============================================
// 破壊されたとき、破片は「実際に当たった場所」から散るほうが自然。
// ダメージを与える側がこれを呼んでおくと、buildDebris がその点を爆心にする
// （記録が無ければパーツの面積重心へ落ちる）。
//
// takeDamage の引数を増やす代わりにこの形にした。takeDamage は6機体＋基地に
// あり、呼び出し元も多いため、シグネチャを変えると影響範囲が広すぎる。

/**
 * @param {object} entity ダメージを受ける相手
 * @param {number} x 当たった位置（ワールド座標）
 * @param {number} y
 */
export function recordHit(entity, x, y) {
    if (!entity) return;
    entity.lastHitX = x;
    entity.lastHitY = y;
}
