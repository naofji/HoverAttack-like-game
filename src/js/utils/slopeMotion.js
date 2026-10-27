// ============================================
// 機体を坂から押し出す・坂へ吸着する共通の部品（純関数）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md（決定7・11）
// 計画: docs/superpowers/plans/2026-10-27-tile-shape-2-bodies.md
//
// 自機・敵アタッカー・戦車が同じ手順で坂を扱えるように、「何 px 動かせば岩の外へ出るか」
// 「どこに床・天井があるか」だけを答える。機体の状態は書き換えない（呼んだ側が y を動かす）。
//
// 足・頭の列は、機体ごとの点判定の点そのもの（pointsFn）から取る。戦車は角から1px、
// 自機とアタッカーは2px内側を見ていて、別の列で床を探すと「押し出したのにまだ当たる」になる。

import { collidesWithTerrain, getDefaultCheckPoints } from './Physics.js';

/** 点判定の点のうち、一番下の段（足）と一番上の段（頭） */
function footPoints(points) {
    const maxY = Math.max(...points.map((p) => p.y));
    return points.filter((p) => p.y === maxY);
}
function headPoints(points) {
    const minY = Math.min(...points.map((p) => p.y));
    return points.filter((p) => p.y === minY);
}

/** 体を dy だけ動かした位置で、点判定が岩に当たるか */
function collidesAt(map, entity, dy, pointsFn) {
    const y0 = entity.y;
    entity.y = y0 + dy;
    try {
        return collidesWithTerrain(entity, map, pointsFn(entity));
    } finally {
        entity.y = y0;
    }
}

/**
 * 足が床にめり込んでいる体を、何 px 持ち上げれば岩の外へ出るか（0 < 値 ≦ maxLift）。
 * 体の下端（y + height）を足の列の一番高い床の上面に合わせる量。持ち上げた先でまだ
 * 当たる（頭が天井に入る、横の点が壁に入る）なら null。坂を上る・空中で坂の側面に
 * 当たって上へ逸れる、のどちらもこれで解く。
 */
export function liftOutOfFloor(map, entity, maxLift, pointsFn = getDefaultCheckPoints) {
    const bottom = entity.y + entity.height;
    const yFrom = bottom - maxLift - 1;
    let newBottom = Infinity;
    for (const p of footPoints(pointsFn(entity))) {
        const top = map.terrainTopY(p.x, yFrom, p.y);
        // 上限より高い岩（壁）は top = yFrom になり、下の範囲の確かめで null になる
        if (top !== null) newBottom = Math.min(newBottom, top);
    }
    const lift = bottom - newBottom;
    if (!(lift > 0 && lift <= maxLift)) return null;
    return collidesAt(map, entity, -lift, pointsFn) ? null : lift;
}

/**
 * 頭が天井にめり込んでいる体を、何 px 下ろせば岩の外へ出るか（0 < 値 ≦ maxDrop + 0.01）。
 * 体の上端を頭の列の一番低い天井の下面の 0.01px 下に合わせる（四角い天井へのスナップ
 * `ceil(y/16)*16 + 0.01` と同じ余白）。下ろした先でまだ当たるなら null。
 */
export function dropOutOfCeiling(map, entity, maxDrop, pointsFn = getDefaultCheckPoints) {
    const yFrom = entity.y + maxDrop + 1;
    let ceiling = -Infinity;
    for (const p of headPoints(pointsFn(entity))) {
        const b = map.terrainBottomY(p.x, yFrom, p.y);
        // 上限より深い岩は b = yFrom になり、下の範囲の確かめで null になる
        if (b !== null) ceiling = Math.max(ceiling, b);
    }
    const drop = ceiling + 0.01 - entity.y;
    if (!(drop > 0 && drop <= maxDrop + 0.01)) return null;
    return collidesAt(map, entity, drop, pointsFn) ? null : drop;
}

/**
 * 体の下端の maxUp px 上から maxDown px 下までに、足の列で一番高い床の上面の y。無ければ null。
 * maxUp は、接地中に重力で 1px 未満沈んだ足を斜辺へ戻すときに使う（坂の上ではタイルの
 * 上端へスナップできないため）
 */
export function floorBelow(map, entity, maxDown, pointsFn = getDefaultCheckPoints, maxUp = 0) {
    const bottom = entity.y + entity.height;
    let best = null;
    for (const p of footPoints(pointsFn(entity))) {
        const top = map.terrainTopY(p.x, bottom - maxUp, bottom + maxDown);
        if (top !== null && (best === null || top < best)) best = top;
    }
    return best;
}

/** 体の上端から maxUp px 上までに、頭の列で一番低い天井の下面の y。無ければ null */
export function ceilingAbove(map, entity, maxUp, pointsFn = getDefaultCheckPoints) {
    let best = null;
    for (const p of headPoints(pointsFn(entity))) {
        const b = map.terrainBottomY(p.x, entity.y, entity.y - maxUp);
        if (b !== null && (best === null || b > best)) best = b;
    }
    return best;
}
