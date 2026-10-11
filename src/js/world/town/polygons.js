// ============================================
// polygons - 多角形（頂点列）の小さな幾何
// ============================================
//
// 4面の植物は絵を多角形で描く（plants.js）。当たり・支え・壊れ方は 4px のかけらの表のままなので、
// 「多角形がどのかけらに掛かるか」だけをここで求める。頂点は [x, y] の配列（建物の canvas の座標、px、小数可）。

/** 符号つきの面積（画面座標で時計回りが正） */
export function signedArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[(i + 1) % ring.length];
        a += x0 * y1 - x1 * y0;
    }
    return a / 2;
}

/**
 * 向きを時計回りに揃える。1回の fill に複数の輪を入れると、本物の canvas は nonzero の規則で塗るので、
 * 重なった輪の向きが逆だと重なりが抜ける（穴になる）。全部同じ向きにしておけば重なりは塗りつぶされる
 */
export function orient(ring) {
    return signedArea(ring) < 0 ? ring.slice().reverse() : ring;
}

export function ringBounds(ring) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
}

/** 点が輪の中か（偶奇の規則。1つの輪だけを見るので nonzero と同じ） */
export function pointInRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** 線分 (ax, ay)-(bx, by) が矩形 [x0, x1] × [y0, y1] に触れるか（Liang–Barsky） */
function segmentHitsRect(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
        if (p === 0) {
            if (q < 0) return false;
        } else {
            const r = q / p;
            if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
            else { if (r < t0) return false; if (r < t1) t1 = r; }
        }
    }
    return true;
}

/**
 * 輪が矩形 [x0, x1] × [y0, y1] に少しでも掛かるか。
 * 頂点が矩形の中、辺が矩形に触れる、矩形が輪の中に丸ごと入る、のどれか
 */
export function ringTouchesRect(ring, x0, y0, x1, y1) {
    for (const [x, y] of ring) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
    for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        if (segmentHitsRect(ax, ay, bx, by, x0, y0, x1, y1)) return true;
    }
    return pointInRing(ring, (x0 + x1) / 2, (y0 + y1) / 2);
}
