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
