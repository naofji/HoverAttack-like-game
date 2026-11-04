// ============================================
// 砲台の砲身の回し方（純粋関数）
// ============================================
//
// 以前の砲台は毎フレーム currentAngle = targetAngle で、自機を見つけた瞬間に砲身が
// 自機の方へ跳んでいた。今は一定の角速度で回してから撃つ（ユーザー指定 2026-11-05）。
//
// **角度は「休みの向き」（床の砲台なら真上、天井なら真下）からのずれで測って回す。**
// 普通の「最短の向き」で回すと、自機が真横を越えて反対側へ回り込んだとき、砲身が台座の中
// （床の砲台なら真下＝床の中）を通って回ることがある。休みの向きからのずれは台座の側
// （±π）で切れているので、そこを越えずに空いている側だけを通る。

/** -π〜π に畳む */
export function wrapAngle(a) {
    let r = (a + Math.PI) % (2 * Math.PI);
    if (r < 0) r += 2 * Math.PI;
    return r - Math.PI;
}

/**
 * 砲身を1フレームぶん目標の向きへ回す。
 * @param {number} current 今の砲身の角度
 * @param {number} target 向けたい角度
 * @param {number} rest 休みの向き（台座から真っすぐ伸びる向き）
 * @param {number} speed 1フレームに回せる角度（ラジアン）
 * @returns {number} 回した後の角度（rest からのずれ ±π の範囲で表す）
 */
export function stepBarrelAngle(current, target, rest, speed) {
    const cur = wrapAngle(current - rest);
    const tgt = wrapAngle(target - rest);
    const diff = tgt - cur;
    const step = Math.abs(diff) <= speed ? diff : Math.sign(diff) * speed;
    return rest + cur + step;
}

/** 砲身が目標を向いているか（撃ってよいか）。ずれは休みの向きから測った値で比べる */
export function isBarrelAimed(current, target, rest, tolerance) {
    return Math.abs(wrapAngle(target - rest) - wrapAngle(current - rest)) <= tolerance;
}
