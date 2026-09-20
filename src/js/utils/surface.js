// ============================================
// surface - 床の性質（滑るか、どれだけ滑るか）
// ============================================
//
// 「雪の上で滑る」のは自機だけの話ではないので、自機・敵アタッカー・敵戦車が
// 同じ関数を読む形にしてある。AI と入力は「どう動きたいか」(desiredVx) だけを
// 書き、床の性質はここが持つ。
//
// **滑るのは例外的な条件**という整理。環境が雪でも、立っているのが母艦の甲板や
// 敵の頭なら滑らない（鉄板の上で滑るのはおかしい、という実機の指摘が出発点）。
//
// DOM もマップの中身も要らない純関数なので、単体で試せる。

import { motionFor } from '../world/StageEnvironment.js';

/**
 * その足元の床の滑り具合。0 なら滑らない（＝陸上と同じ即時停止）。
 *
 * 接地していることを条件にしているのが要点。**空中のフレームでは滑りを
 * 切ってはいけない** ── 雪の階段の吸着（Player._probeGroundBelowFeet）が
 * 「滑る面かどうか」を空中で見ているので、そこを 0 にすると段を跳ねる
 * 以前の動きに戻る。あちらは面の性質（motion.slide）を直接見たままにしてある。
 *
 * @param {object} entity onGround か grounded、および onTerrain を持つ
 * @param {object} game env と map を持つ（無ければ 0）
 * @returns {number} 0〜1
 */
export function groundSlide(entity, game) {
    if (!entity) return 0;
    const onGround = entity.onGround ?? entity.grounded ?? false;
    // onTerrain が未定義の相手（まだ対応していないエンティティ）は、
    // 従来どおり「地形の上」とみなす。黙って滑らなくなるより分かりやすい
    const onTerrain = entity.onTerrain ?? true;
    if (!onGround || !onTerrain) return 0;
    const motion = motionFor(game, entity.x + entity.width / 2, entity.y + entity.height / 2);
    return motion.slide || 0;
}

/**
 * 滑る床での速度追従。滑らない床では目標速度がそのまま出る（現行の陸上と
 * 完全に同じ）ので、呼ぶ側に分岐は要らない。
 *
 * 前フレームの速度を slide の割合だけ残す。自機が入力を離したときの
 * `vx *= slide` と同じ式で、目標速度 0 を与えた場合に一致する。
 *
 * @param {number} currentVx 前フレームの速度
 * @param {number} desiredVx そのフレームに出したい速度
 * @param {number} slide groundSlide の戻り値
 * @returns {number}
 */
export function approachVx(currentVx, desiredVx, slide) {
    if (!slide) return desiredVx;
    const v = currentVx * slide + desiredVx * (1 - slide);
    // ごく小さい速度は 0 に落とす。残すと、止まっているのに歩行アニメや
    // 雪煙の条件（|vx| のしきい値）を跨ぎ続けてちらつく
    return Math.abs(v) < 0.05 ? 0 : v;
}
