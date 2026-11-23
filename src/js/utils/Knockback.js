// ============================================
// Explosion knockback helper (shared by Landmine, Grenade, enemy missile hits)
// ============================================

/**
 * Overwrite an entity's velocity so it gets shoved away from a blast center.
 * @param {object} entity - Must have .vx/.vy to be affected (no-op otherwise).
 * @param {number} dx - entityCenter.x - blastCenter.x (sign decides push direction).
 * @param {number} knockbackVy - New vy (typically negative = upward launch).
 * @param {number} knockbackVx - Magnitude of the horizontal push.
 * @param {{recoil?: boolean}} [opts] - recoil: false なら自機に反動の時間を付けない（地雷）
 */
export function applyKnockback(entity, dx, knockbackVy, knockbackVx, { recoil = true } = {}) {
    if (entity.vy !== undefined) entity.vy = knockbackVy;
    if (entity.vx !== undefined) {
        const pushDir = dx > 0 ? 1 : -1;
        entity.vx = pushDir * knockbackVx;
    }
    // 自機は速度を書き換えただけでは次のフレームの左右の入力・摩擦に消されるので、反動の時間を持たせる
    // （Player.onKnockback。敵アタッカーの applyRecoil と同じ考え方。地雷・グレネード・ミサイル・爆風・Orb の全部に効く）
    // recoil: false は速さだけ書き換える（地雷。歩いていて踏むたびに操作を奪われるのはうるさい、とユーザー指定）
    if (recoil && typeof entity.onKnockback === 'function') entity.onKnockback();
}
