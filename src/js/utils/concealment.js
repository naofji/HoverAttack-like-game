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
    SMOKE_PUFF_RISE_RATIO, SMOKE_PUFF_DECAY_EXPONENT, SMOKE_CONCEAL_THRESHOLD,
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
 * 時間の包絡。u = 0 と u = 1 で厳密に 0 になる。
 *
 * 立ち上がり（最初の5%）を入れているのは、生まれた瞬間に濃いパフが出現するのを
 * 避けるため。撒きの分散と合わせて「湧き上がる」動きになる。
 * 減衰の指数 1.3 は 1.0（直線）だと後半までしぶとく見え、2.0 だと発煙直後に
 * 急に薄くなって隠れる時間が足りなかったので、その間を取った値。
 * @param {number} u 正規化年齢（age / SMOKE_PUFF_LIFETIME）
 * @returns {number} 0〜1
 */
export function envelope(u) {
    if (u <= 0 || u >= 1) return 0;
    const rise = Math.min(1, u / SMOKE_PUFF_RISE_RATIO);
    return rise * Math.pow(1 - u, SMOKE_PUFF_DECAY_EXPONENT);
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
