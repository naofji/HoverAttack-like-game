// ============================================
// concealment - 煙幕の濃度と隠蔽判定
// ============================================
//
// 煙の見た目と「隠れているか」の判定を、同じ数式から出すための置き場。
//
// coverageAt() の合成は 1 - Π(1 - aᵢ) で、これは canvas の source-over が
// アルファを重ねるときの式（透過率の積、Beer-Lambert）そのもの。だから
// パフを素直に重ね描きすれば、画面に出る濃さとこの関数の返り値が一致する。
// canvas のピクセルを読む必要がなく、node でそのままテストできる。
//
// 注意: falloff（形）はスプライトに焼き込み、envelope（時間）は drawImage の
// globalAlpha として渡す。どちらか片方だけ式を書き直すと「濃く見えるのに
// 隠れない」「消えたのに判定が残る」がすぐ起きる。weaponSounds の
// renderWeaponSound / renderWeaponProfile と同じく、対で直すこと。

import {
    SMOKE_FALLOFF_EXPONENT, SMOKE_PUFF_ALPHA_MAX, SMOKE_PUFF_LIFETIME,
    SMOKE_PUFF_RISE_RATIO, SMOKE_PUFF_HOLD_RATIO, SMOKE_PUFF_DECAY_EXPONENT,
    SMOKE_CONCEAL_THRESHOLD,
} from './Constants.js';

/**
 * 空間の減衰。中心で1、半径で0。
 * 指数 2.5 は「半径の半ばまではほぼ濃度を保ち、そこから外で一気に落ちる」形。
 * 境界がはっきりするので、自機側が「どこから先が見えないか」を読める。
 * @param {number} d 中心からの距離
 * @param {number} r パフの現在半径
 * @returns {number} 0〜1
 */
export function falloff(d, r) {
    if (r <= 0) return 0;
    const t = 1 - d / r;
    if (t <= 0) return 0;
    return Math.pow(t, SMOKE_FALLOFF_EXPONENT);
}

/**
 * 時間の包絡。台形（立ち上がり → 停滞 → 消滅）で、u = 0 と u = 1 で厳密に 0 になる。
 *
 *   1 |    ______________________
 *     |   /                      \
 *   0 |__/________________________\__
 *      0  ↑                    ↑    1
 *      RISE_RATIO         HOLD_RATIO
 *
 * **直線的に薄れ続ける形（以前の `(1-u)^1.3`）ではなく、停滞させてから
 * 最後に落とす。** 前者だと煙が出た直後から弱まり続けて「張った」感じが出ず、
 * いつ消えたのかも曖昧になる。濃さを保ってから短い時間で引く方が、
 * 煙幕としても「効いている間」と「切れた」がはっきりする。
 *
 * - 立ち上がり（最初の1%＝12 tick）は、生まれた瞬間に濃いパフが出現するのを
 *   避けるため。撒きの分散と合わせて「湧き上がる」動きになる。寿命を延ばしても
 *   ここは短いままにする（長いと発煙してから隠れるまで待たされる）
 * - 消滅は残り10%（120 tick = 2秒）で。指数 1.6 は 1.0（直線）だと最後まで
 *   一定速度で消えて素っ気ないため、落ち始めを緩く・終わりを速くしてある
 * @param {number} u 正規化年齢（age / SMOKE_PUFF_LIFETIME）
 * @returns {number} 0〜1
 */
export function envelope(u) {
    if (u <= 0 || u >= 1) return 0;
    const rise = Math.min(1, u / SMOKE_PUFF_RISE_RATIO);
    if (u <= SMOKE_PUFF_HOLD_RATIO) return rise;
    // 停滞の終わりで 1、寿命の終わりで 0。境目で連続なので段差が出ない
    const fade = (1 - u) / (1 - SMOKE_PUFF_HOLD_RATIO);
    return rise * Math.pow(fade, SMOKE_PUFF_DECAY_EXPONENT);
}

/**
 * パフ1枚が、その点に置く不透明度。
 * @param {number} d 中心からの距離
 * @param {number} r 現在半径
 * @param {number} u 正規化年齢
 */
export function puffAlphaAt(d, r, u) {
    return SMOKE_PUFF_ALPHA_MAX * envelope(u) * falloff(d, r);
}

/**
 * その点の煙の濃さ。
 * @param {number} x ワールド座標
 * @param {number} y
 * @param {Array<{puffs: Array<{x:number,y:number,radius:number,age:number}>}>} screens
 * @returns {number} 0〜1
 */
export function coverageAt(x, y, screens) {
    let transmission = 1; // 透過率。遮るほど 0 に近づく
    for (const screen of screens) {
        for (const p of screen.puffs) {
            const d = Math.hypot(x - p.x, y - p.y);
            const a = puffAlphaAt(d, p.radius, p.age / SMOKE_PUFF_LIFETIME);
            if (a > 0) transmission *= (1 - a);
        }
    }
    return 1 - transmission;
}

/** その点が煙で隠れているか。 */
export function isConcealed(x, y, screens) {
    return coverageAt(x, y, screens) > SMOKE_CONCEAL_THRESHOLD;
}

/**
 * 敵が煙で隠れているか。判定点は中心。
 * 中心だけを見るのは、端が少し出ているだけでロックできてしまうと
 * 「隠れている」という見た目と食い違うため。
 * @param {{x:number,y:number,width?:number,height?:number}} enemy
 * @param {Array} screens
 */
export function isEnemyConcealed(enemy, screens) {
    const cx = enemy.x + (enemy.width || 0) / 2;
    const cy = enemy.y + (enemy.height || 0) / 2;
    return isConcealed(cx, cy, screens);
}
