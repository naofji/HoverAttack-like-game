// ============================================
// shapes - 建物の部品（四角）を積む小道具
// ============================================
//
// 建物は fillRect で描ける四角だけで組む。地形の一番細かい描き込み（4px）と
// 揃うこと、node で PNG に書き出せること（tools/render-town-scene.mjs）が理由。

import { MAT_NONE } from './chunks.js';
import { orient, signedArea } from './polygons.js';

export const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length)];

/** lo〜hi（両端を含む）の 4 の倍数。hi < lo なら lo。lo は 4 の倍数で渡す */
export function step4(rng, lo, hi) {
    if (hi < lo) return lo;
    return lo + 4 * Math.floor(rng.next() * (Math.floor((hi - lo) / 4) + 1));
}

/** 部品を1つ積む。color が null なら描かない（かけらだけ）。mat が 0 なら描くだけ */
export function rect(parts, x, y, w, h, color, mat = MAT_NONE, solid = false) {
    if (w > 0 && h > 0) parts.push({ x, y, w, h, color, mat, solid });
}

/**
 * 多角形の部品（4面の植物）を積む。rings は頂点列 [[x, y], ...] の配列で、同じ色の輪を1回の fill にまとめる
 * （1枚ずつ塗ると、葉が数十枚ある植物 500 本で面の読み込みが重くなる）。
 * 面積のほぼ無い輪は捨てる。向きは時計回りに揃える（polygons.js の orient）
 */
export function ringPart(parts, rings, color, mat = MAT_NONE, solid = false) {
    const kept = rings.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-6).map(orient);
    if (kept.length > 0) parts.push({ rings: kept, color, mat, solid });
}

/** 左右反転。壁の右側に張り付く形で組んだ家を、左側の壁に付けるときに使う */
export function mirrorParts(parts, w) {
    return parts.map((p) => (p.rings
        ? { ...p, rings: p.rings.map((r) => orient(r.map(([x, y]) => [w - x, y]))) }
        : { ...p, x: w - p.x - p.w }));
}

/**
 * 下端を y=0 として上へ（y を負に）積んだ部品を、上端が 0 になるよう下げる。
 * 小屋は「地面から上へ」組むほうが素直に書けるため
 */
export function normalizeUp(parts) {
    let minY = 0;
    let maxY = 0;
    for (const p of parts) {
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + p.h);
    }
    return { parts: parts.map((p) => ({ ...p, y: p.y - minY })), h: maxY - minY };
}

/** 部品を順に塗る */
export function paintParts(ctx, parts) {
    for (const p of parts) {
        if (!p.color) continue;
        ctx.fillStyle = p.color;
        if (p.rings) {   // 多角形: 同じ色の輪を1つの経路にして1回で塗る
            ctx.beginPath();
            for (const ring of p.rings) {
                ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
                ctx.closePath();
            }
            ctx.fill();
            continue;
        }
        ctx.fillRect(p.x, p.y, p.w, p.h);
    }
}
