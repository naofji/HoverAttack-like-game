// ============================================
// blastDamage - 爆心からの範囲ダメージ
// ============================================
//
// 地雷（Landmine.detonate）にあったものを切り出した。3面の町の爆発物も同じ処理で
// 敵・自機・母艦の全員にダメージを与える（spec 2026-10-11-stage3-town-design.md 3b章
// 「地雷と同じ扱い」）。当たる順・距離の測り方（相手の中心まで）・ノックバックは地雷のまま。

import { applyKnockback } from './Knockback.js';
import { recordHit } from './hitPoint.js';

/**
 * @param {object} game player / carrier / enemies / landmines を持つ（無いものは飛ばす）
 * @param {number} cx 爆心
 * @param {number} cy
 * @param {{radius:number, damage:number, knockVy:number, knockVx:number, source?:object}} opts
 *   source は爆発したもの自身（地雷が自分を誘爆させないように）
 */
export function applyBlastDamage(game, cx, cy, { radius, damage, knockVy, knockVx, source = null }) {
    const hit = (entity) => {
        if (!entity || !entity.alive || entity === source) return;
        const dx = entity.x + entity.width / 2 - cx;
        const dy = entity.y + entity.height / 2 - cy;
        if (Math.sqrt(dx * dx + dy * dy) > radius) return;
        if (typeof entity.takeDamage === 'function') {
            recordHit(entity, cx, cy);
            entity.takeDamage(damage);
            applyKnockback(entity, dx, knockVy, knockVx);
        } else if (typeof entity.detonate === 'function') {
            entity.detonate();   // 地雷の誘爆
        }
    };
    hit(game.player);
    hit(game.carrier);
    for (const e of game.enemies || []) hit(e);
    for (const m of game.landmines || []) hit(m);
}
