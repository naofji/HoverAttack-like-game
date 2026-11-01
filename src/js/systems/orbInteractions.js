// ============================================
// Orb（2面の転がる鉱物）と、機体・弾・地雷・爆風との当たり
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-01-stage2-orb-design.md
// Orb 本体（entities/Orb.js）は地形との物理だけを持つ。ほかの物との当たりはここに集める
// （機体・弾ごとのファイルに散らすと、Orb の規則が何か所にも書かれて食い違うため）。
// game を受け取る関数にしているのは utils/blastDamage.js と同じ作法（Game の mixin ではない）。

/**
 * 1ティックぶん。敵の更新の直後、弾と敵の当たり（collisionManager）の前に呼ぶ（main.js の _simulationTick）。
 * @param {object} game orbs を持つ
 */
export function updateOrbs(game) {
    const orbs = game.orbs || [];
    for (const orb of orbs) orb.update();
}
