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
 * その足元の**床**の滑り具合。0 なら滑らない床（陸上・甲板・敵の頭・空中）。
 *
 * 「床が滑るか」と「その機体が滑るか」は別物なので分けてある。戦車は履帯なので
 * 雪の上でも滑らない（slideScale 0）が、**雪煙は上げてほしい** ── 雪煙は
 * 機体ではなく床の性質なので、こちらを見る。
 *
 * @param {object} entity onTerrain を持つ
 * @param {object} game env と map を持つ（無ければ 0）
 * @returns {number} 0〜1
 */
export function floorSlide(entity, game) {
    if (!entity || !entity.onTerrain) return 0;
    const motion = motionFor(game, entity.x + entity.width / 2, entity.y + entity.height / 2);
    return motion.slide || 0;
}

/**
 * その機体に実際に効く滑り。床の滑りに、機体ごとの滑りやすさ
 * （`slideScale`。既定 1、戦車は 0）を掛けたもの。
 *
 * 接地していることを条件にしているのが要点。**空中のフレームでは滑りを
 * 切ってはいけない** ── 雪の階段の吸着（Player._probeGroundBelowFeet）が
 * 「滑る面かどうか」を空中で見ているので、そこを 0 にすると段を跳ねる
 * 以前の動きに戻る。あちらは面の性質（motion.slide）を直接見たままにしてある。
 *
 * 見るのは `onTerrain` **ひとつだけ**。これは「地形に接地している」という意味の
 * フラグなので、`onGround` と AND を取ると同じことを2系統で判定することになり、
 * 食い違ったときに片方だけ falseになる。実際それで踏んだ: ホバー戦車は床の
 * 0.3px 上を上下していて `grounded` が1フレームおきに途切れるため、途切れた
 * フレームだけ陸上の摩擦に落ちて、氷の上でも即座に反転していた。
 * 各エンティティは「地形に乗っている」と言える条件で onTerrain を立てること。
 *
 * @param {object} entity onTerrain と、任意で slideScale を持つ
 * @param {object} game env と map を持つ（無ければ 0）
 * @returns {number} 0〜1
 */
export function groundSlide(entity, game) {
    if (!entity) return 0;
    return floorSlide(entity, game) * (entity.slideScale ?? 1);
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
