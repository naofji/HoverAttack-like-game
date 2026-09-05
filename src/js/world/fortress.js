// ============================================
// 7面の要塞区画（純関数。grid を書き換える）
// ============================================
//
// 洞窟を掘り終えたあとに矩形の区画を選び、その中を人工物の規則で書き潰す。
// 「洞窟を改造して作った要塞」なので、区画の外は洞窟のまま残す。
// 乱数は派生ストリーム（game.rng を消費しない＝週の決定性を壊さない）。
//
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md

import {
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, HARD_BLOCK_HP,
} from '../utils/Constants.js';

/** 閉区間の矩形 { r0, r1, c0, c1 } 同士が重なるか。水・雪の除外矩形と同じ形。 */
export function rectsOverlap(a, b) {
    return !(a.r1 < b.r0 || a.r0 > b.r1 || a.c1 < b.c0 || a.c0 > b.c1);
}

function insideRect(rect, r, c) {
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
}

/**
 * 区画の矩形を選ぶ。部屋の中心を中心に取り、盤面からはみ出すもの・除外矩形と
 * 重なるもの・既に置いた区画と重なるものを弾く。
 *
 * count は**上限**であって下限ではない。候補が尽きたら置けた数で終わる
 * （水のプールと同じ扱い。無理に詰めると重なりを許すことになる）。
 */
export function pickFortressZones({
    rows, cols, rooms, excludeRects = [], rng,
    count, wMin, wRange, hMin, hRange, margin,
}) {
    const candidates = rooms.filter(
        (room) => !excludeRects.some((rect) => insideRect(rect, room.centerR, room.centerC)),
    );
    const zones = [];
    let tries = 0;
    while (zones.length < count && tries < count * 20) {
        tries++;
        if (candidates.length === 0) break;
        const room = candidates[Math.floor(rng.next() * candidates.length)];
        const w = wMin + Math.floor(rng.next() * (wRange + 1));
        const h = hMin + Math.floor(rng.next() * (hRange + 1));
        const c0 = room.centerC - Math.floor(w / 2);
        const r0 = room.centerR - Math.floor(h / 2);
        const zone = { r0, r1: r0 + h - 1, c0, c1: c0 + w - 1 };
        if (zone.r0 < margin || zone.c0 < margin) continue;
        if (zone.r1 >= rows - margin || zone.c1 >= cols - margin) continue;
        if (excludeRects.some((rect) => rectsOverlap(zone, rect))) continue;
        if (zones.some((z) => rectsOverlap(zone, z))) continue;
        zones.push(zone);
    }
    return zones;
}

/**
 * 外壁の4つの帯。**互いに重ならないように排他的に定義する。**
 * 角の扱いをここ1箇所で決めておかないと、「背面に装甲が無い」が言えなくなる。
 * 角は 左上・右上＝上帯（装甲）、左下＝左帯（装甲）、右下＝下帯（硬い岩）。
 */
export function zoneBands(zone, thickness) {
    const T = thickness;
    return {
        top:    { r0: zone.r0,         r1: zone.r0 + T - 1, c0: zone.c0,         c1: zone.c1 },
        left:   { r0: zone.r0 + T,     r1: zone.r1,         c0: zone.c0,         c1: zone.c0 + T - 1 },
        bottom: { r0: zone.r1 - T + 1, r1: zone.r1,         c0: zone.c0 + T,     c1: zone.c1 },
        right:  { r0: zone.r0 + T,     r1: zone.r1 - T,     c0: zone.c1 - T + 1, c1: zone.c1 },
    };
}

function fillRect(grid, blockHP, rect, block, hp) {
    for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
            grid[r][c] = block;
            blockHP[r][c] = hp;
        }
    }
}

/** 外壁を書く。正面（上・左）は装甲、背面（下・右）は硬い岩。 */
export function buildZoneWalls(grid, blockHP, zone, thickness) {
    const bands = zoneBands(zone, thickness);
    fillRect(grid, blockHP, bands.top, BLOCK_INDESTRUCTIBLE, -1);
    fillRect(grid, blockHP, bands.left, BLOCK_INDESTRUCTIBLE, -1);
    fillRect(grid, blockHP, bands.bottom, BLOCK_HARD, HARD_BLOCK_HP);
    fillRect(grid, blockHP, bands.right, BLOCK_HARD, HARD_BLOCK_HP);
}
