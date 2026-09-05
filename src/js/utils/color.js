// ============================================
// color - small hex color interpolation helper
// ============================================

function _parseHex(h) {
    const s = String(h).replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function _toHex(n) {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

/** Linear-interpolate two #rrggbb colors. t is clamped to [0,1]. Returns #rrggbb. */
export function lerpColor(a, b, t) {
    const x = Math.max(0, Math.min(1, t));
    const pa = _parseHex(a);
    const pb = _parseHex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * x);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * x);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * x);
    return '#' + _toHex(r) + _toHex(g) + _toHex(bl);
}

/** #rrggbb を rgba(r, g, b, a) 文字列にする。 */
export function withAlpha(hex, alpha) {
    const [r, g, b] = _parseHex(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 知覚輝度（0..255）。ITU-R BT.601 の係数。地形の色の明暗を比べるのに使う。 */
export function luminance(hex) {
    const [r, g, b] = _parseHex(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 色味（RGB の比）を保ったまま、輝度だけを target に合わせる。
 *
 * 「暗くする」を係数の掛け算ではなく到達点で書けるようにするためのもの。
 * 元が暗い色に一律の係数を掛けると黒へ潰れてしまうが、他の色に対する**比**で
 * 目標輝度を決めれば、明るい色も暗い色も同じだけ離れた位置に置ける
 * （硬い岩の色を面のパレットから作るときに要る。面6の Cafe Noir が黒に潰れた）。
 *
 * 真っ黒は比を保ったまま明るくできない（0 を何倍しても 0）ので、無彩色として返す。
 */
export function withLuminance(hex, target) {
    const [r, g, b] = _parseHex(hex);
    const l = luminance(hex);
    if (l <= 0) {
        const v = _toHex(Math.round(target));
        return '#' + v + v + v;
    }
    const k = target / l;
    return '#' + _toHex(Math.round(r * k)) + _toHex(Math.round(g * k)) + _toHex(Math.round(b * k));
}
