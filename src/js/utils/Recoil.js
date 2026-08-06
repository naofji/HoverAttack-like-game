// ============================================
// Enemy Recoil - 被弾時の反動（ノックバック＋移動制御の一時停止）
// ============================================
// applyKnockback だけでは敵に効かない。敵AIの多くは毎tick自分で vx/vy を
// 代入し直すため（例: EnemyTank の `this.vx = patrolDir * SPEED`）、
// 速度を書き換えても次のフレームで消えてしまう。
//
// そこで「反動中」の時間を持たせ、その間だけ敵側の移動制御をスキップさせる。
// 自機の着地スタン（Player.stunTimer）と同じ考え方で、止めるのは移動だけ。
// 射撃は継続するので、撃ち返しは止まらない。
//
// 反動の強さは各機体が `recoilProfile` として持つ。持たない相手（砲台・基地の
// ような据え付け物）は対象外になり、何も起きない。

import { applyKnockback } from './Knockback.js';
import { ENEMY_RECOIL_FRAMES } from './Constants.js';

/**
 * 反動を与える。
 * @param {object} entity `recoilProfile` を持つ相手だけが対象
 * @param {number} dx entityCenter.x - blastCenter.x（正なら右へ押される）
 * @param {number} [frames] 移動制御を止める長さ
 * @returns {boolean} 反動を与えたか
 */
export function applyRecoil(entity, dx, frames = ENEMY_RECOIL_FRAMES) {
    const profile = entity && entity.recoilProfile;
    if (!profile) return false;

    applyKnockback(entity, dx, profile.vy, profile.vx);
    entity.recoilTimer = frames;
    return true;
}

/**
 * 1tick 進める。敵の update() の先頭で呼び、true の間は移動制御を飛ばす。
 * @returns {boolean} このtickが反動中か
 */
export function tickRecoil(entity) {
    if (!entity.recoilTimer) return false;
    entity.recoilTimer--;
    return true;
}

/** 反動中か（数え下げない）。 */
export function isRecoiling(entity) {
    return entity.recoilTimer > 0;
}
