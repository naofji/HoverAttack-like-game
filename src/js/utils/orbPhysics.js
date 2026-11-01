// ============================================
// Orb（2面の転がる鉱物）の幾何（純関数）
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-01-stage2-orb-design.md。
// 判定の形は円（絵はいびつな多角形だが、判定まで多角形にすると坂の上で引っかかって転がらない）。
// 地形の形（坂・面取り）は map.isSolidPoint がそのまま答えるので、円周の点で見れば形つきの地形に乗る。

/** 円周を見る点の数。r=8 で約 3px、r=12 で約 4.7px 間隔。面取りの 8px の角が点のすき間を抜けない密度 */
const SAMPLES = 16;
/** 押し出しの刻み（px）。粗いと止まった Orb が床の上で浮いて見える */
const PUSH_STEP = 0.25;
/**
 * めり込みを見る円はこれだけ小さくする（px）。床の上面は岩に含まれる（半開区間）ので、ちょうど接している
 * だけの円も「入った」と読まれ、床に置いた Orb が最初のフレームに 0.25px 押し上げられた
 */
export const ORB_CONTACT_EPS = 0.01;

/**
 * 半径 r の円周の点のうち岩に入っているものから、外向きの単位法線（岩に入った点から中心への向きの和）。
 * どの点も岩でなければ null
 */
export function circleTerrainNormal(map, cx, cy, r) {
    let sx = 0, sy = 0, hit = false;
    for (let k = 0; k < SAMPLES; k++) {
        const a = (k / SAMPLES) * Math.PI * 2;
        const ox = Math.cos(a), oy = Math.sin(a);
        if (!map.isSolidPoint(cx + ox * r, cy + oy * r)) continue;
        sx -= ox; sy -= oy; hit = true;
    }
    if (!hit) return null;
    const len = Math.hypot(sx, sy);
    // 向きが打ち消し合う（狭い穴に挟まった）ときは真上へ逃がす
    return len < 1e-9 ? { nx: 0, ny: -1 } : { nx: sx / len, ny: sy / len };
}

/**
 * 円が岩に入っていたら、法線の向きへ刻んで押し出した中心と単位法線。入っていなければ null。
 * 押し出しきれない（r 動かしても岩の中）ときは、押し出した分だけ動かして返す（次のフレームに続きを押す）
 * @returns {{cx:number, cy:number, nx:number, ny:number} | null}
 */
export function resolveCircleTerrain(map, cx, cy, r) {
    const rr = r - ORB_CONTACT_EPS;
    const n = circleTerrainNormal(map, cx, cy, rr);
    if (!n) return null;
    let x = cx, y = cy;
    for (let d = PUSH_STEP; d <= r; d += PUSH_STEP) {
        x = cx + n.nx * d; y = cy + n.ny * d;
        if (!circleTerrainNormal(map, x, y, rr)) break;
    }
    return { cx: x, cy: y, nx: n.nx, ny: n.ny };
}

/** 法線成分を -e 倍にする（離れていく向き vn ≥ 0 なら変えない）。接線成分はそのまま */
export function reflectVelocity(vx, vy, nx, ny, e) {
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return { vx, vy };
    return { vx: vx - (1 + e) * vn * nx, vy: vy - (1 + e) * vn * ny };
}
