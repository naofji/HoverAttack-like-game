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
import { stairDirection } from './slope.js';
import {
    TILE_SIZE,
    HOVER_WATER_MIST_MIN_ALT,
    HOVER_WATER_MIST_MAX_ALT,
    HOVER_WATER_MIST_MIN_COUNT,
    HOVER_WATER_MIST_MAX_COUNT,
} from './Constants.js';

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

/** 探索の刻み幅(px)。着地判定ほどの精度は要らないので粗く見る（探索回数を抑える）。 */
const GROUND_CLEARANCE_STEP = 4;

/**
 * 足元の中心から下方向に地面を探し、見つかるまでの距離(px)を返す。副作用なし。
 * ホバー中の「地表から何px上か」を知りたいだけの用途（例: 雪煙）向け。
 * `maxPx` 以内に地面が無ければ null（=「近くない」）。
 *
 * @param {object} entity x, y, width, height を持つ
 * @param {object} game map を持つ（無ければ null）
 * @param {number} maxPx 探索する最大距離
 * @returns {number|null}
 */
export function groundClearance(entity, game, maxPx) {
    const map = game && game.map;
    if (!map || !map.isSolidAtPixel) return null;
    const cx = entity.x + entity.width / 2;
    const feetY = entity.y + entity.height;
    for (let d = 0; d <= maxPx; d += GROUND_CLEARANCE_STEP) {
        if (map.isSolidAtPixel(cx, feetY + d)) return d;
    }
    return null;
}

/**
 * `groundClearance` が見つけた地面が階段(斜面)かどうか。0=平地、±1=階段
 * （stairDirection と同じ符号）。ホバー中の雪煙を、平地では横に・斜面では
 * 斜辺に沿わせて舞わせるために使う。地面が見つかっていない(clearance が
 * null)、または map が無ければ平地扱い(0)。
 *
 * @param {object} entity x, width, height を持つ
 * @param {object} game map を持つ（無ければ 0）
 * @param {number|null} clearance groundClearance の戻り値
 * @returns {-1|0|1}
 */
export function groundSlopeDirection(entity, game, clearance) {
    const map = game && game.map;
    if (!map || clearance === null || clearance === undefined) return 0;
    const groundY = entity.y + entity.height + clearance;
    const r = Math.floor(groundY / TILE_SIZE);
    const c = Math.floor((entity.x + entity.width / 2) / TILE_SIZE);
    return stairDirection(map, r, c);
}

/**
 * 足元の中心から下方向に水面を探し、見つかるまでの距離(px)を返す。副作用なし。
 * `groundClearance` の水面版（ホバー中の水滴ミスト用）。
 *
 * 足元がすでに水に触れている（水中）場合は null を返す ── その場面は
 * `spawnSplash`（水面をまたいだ瞬間のしぶき）の領分なので、ここでは扱わない。
 *
 * @param {object} entity x, y, width, height を持つ
 * @param {object} game map を持つ（無ければ null）
 * @param {number} maxPx 探索する最大距離
 * @returns {number|null}
 */
export function waterClearance(entity, game, maxPx) {
    const map = game && game.map;
    if (!map || !map.isWaterAtPixel) return null;
    const cx = entity.x + entity.width / 2;
    const feetY = entity.y + entity.height;
    // 機体自体が水中にいる（水没中）、あるいは足元がすでに水に触れている場合は null
    if (entity.inWater || map.isWaterAtPixel(cx, entity.y + entity.height * 0.5) || map.isWaterAtPixel(cx, feetY)) {
        return null;
    }
    for (let d = 0; d <= maxPx; d += GROUND_CLEARANCE_STEP) {
        const py = feetY + d;
        // 地形（岩や床）に遮られたら、その先にある水面にはスラスターの風が届かない
        if (map.isSolidAtPixel && map.isSolidAtPixel(cx, py)) return null;
        if (map.isWaterAtPixel(cx, py)) return d;
    }
    return null;
}

/**
 * 水面までの距離(clearance)に対する近さの度合い（0: 最遠〜1: 至近）。
 * @param {number} clearance
 * @returns {number} 0.0〜1.0
 */
export function hoverWaterMistCloseness(clearance) {
    if (clearance === null || clearance === undefined) return 0;
    const minAlt = HOVER_WATER_MIST_MIN_ALT;
    const maxAlt = HOVER_WATER_MIST_MAX_ALT;
    const range = maxAlt - minAlt;
    if (range <= 0) return 0.5;
    return Math.max(0, Math.min(1, (maxAlt - clearance) / range));
}

/**
 * 水面までの距離(clearance)に応じて水煙の粒子数を計算する。
 * スラスターが水面に近いほど風圧が強く多くの水滴が舞い、遠ざかるほど少なくなる。
 *
 * @param {number} clearance waterClearance で得られた距離(px)
 * @returns {number}
 */
export function hoverWaterMistCount(clearance) {
    const closeness = hoverWaterMistCloseness(clearance);
    return Math.round(HOVER_WATER_MIST_MIN_COUNT + (HOVER_WATER_MIST_MAX_COUNT - HOVER_WATER_MIST_MIN_COUNT) * closeness);
}
