// ============================================
// impactDamage - 落ちてきたものが機体に当たったときのダメージ
// ============================================
//
// 落ちるつらら（world/town/IcicleFall.js）が使う。範囲ダメージ（blastDamage.js）と違い、
// 当たった機体 1 つに、押しは下向きだけ（applyKnockback は vx を上書きするので使わない）。

import { recordHit } from './hitPoint.js';

/**
 * 当てる相手の一覧。自機・母艦・敵（blastDamage.applyBlastDamage と同じ顔ぶれ）。
 * 死んでいるものは除く。ドッキング中の自機も除く: 母艦の中にいて、母艦と二重に当たらないように
 */
export function impactTargets(game) {
    const list = [];
    const add = (e) => { if (e && e.alive && !e.docked) list.push(e); };
    add(game.player);
    add(game.carrier);
    for (const e of game.enemies || []) add(e);
    return list;
}

/**
 * @param {object} entity 当てる相手（takeDamage が無ければ何もしない）
 * @param {number} x 当たった点（破壊時の破片がここから散る。hitPoint.recordHit）
 * @param {number} y
 * @param {number} damage
 * @param {number} knockVy 少なくともこの vy（下向き）にする。すでに速く落ちていれば変えない
 */
export function applyImpact(entity, x, y, damage, knockVy) {
    if (!entity || typeof entity.takeDamage !== 'function') return;
    recordHit(entity, x, y);
    entity.takeDamage(damage);
    if (entity.vy !== undefined && entity.vy < knockVy) entity.vy = knockVy;
}
