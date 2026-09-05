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

/**
 * 区画の中を格子にする。
 *
 * 手順: 内側を全部「掘れる通常岩」で埋める → 縦横の廊下を空洞で刻む →
 * 交点を室に広げる → 室の四隅に装甲の柱を立てる。
 *
 * 中の壁を掘れる BLOCK_NORMAL にしているのは、外壁で経路を規定しておいて
 * 中まで掘れないと格子がただの迷路になって窮屈だから。掘れば近道はできるが
 * 外壁は抜けられない、という二段構えにする。
 *
 * @returns {{corridorRows:number[], corridorCols:number[]}} 各廊下の先頭の行／列
 */
export function buildZoneInterior(grid, blockHP, zone, { thickness, corridorW, pitch, roomSize }) {
    const T = thickness;
    const r0 = zone.r0 + T, r1 = zone.r1 - T;
    const c0 = zone.c0 + T, c1 = zone.c1 - T;

    fillRect(grid, blockHP, { r0, r1, c0, c1 }, BLOCK_NORMAL, 1);

    const corridorRows = [];
    for (let rr = r0; rr + corridorW - 1 <= r1; rr += pitch) corridorRows.push(rr);
    const corridorCols = [];
    for (let cc = c0; cc + corridorW - 1 <= c1; cc += pitch) corridorCols.push(cc);

    for (const rr of corridorRows) {
        fillRect(grid, blockHP, { r0: rr, r1: rr + corridorW - 1, c0, c1 }, BLOCK_EMPTY, 0);
    }
    for (const cc of corridorCols) {
        fillRect(grid, blockHP, { r0, r1, c0: cc, c1: cc + corridorW - 1 }, BLOCK_EMPTY, 0);
    }

    // 交点の室。廊下の中心から roomSize/2 だけ広げる（区画の内側からはみ出さない）
    const half = Math.floor(roomSize / 2);
    const mid = Math.floor(corridorW / 2);
    for (const rr of corridorRows) {
        for (const cc of corridorCols) {
            const room = {
                r0: Math.max(r0, rr + mid - half), r1: Math.min(r1, rr + mid + half),
                c0: Math.max(c0, cc + mid - half), c1: Math.min(c1, cc + mid + half),
            };
            fillRect(grid, blockHP, room, BLOCK_EMPTY, 0);
            // 柱: 室の四隅。廊下の中心線からは外れるので通行を塞がない
            for (const [pr, pc] of [[room.r0, room.c0], [room.r0, room.c1], [room.r1, room.c0], [room.r1, room.c1]]) {
                if (pr === rr + mid || pc === cc + mid) continue; // 念のため中心線は避ける
                grid[pr][pc] = BLOCK_INDESTRUCTIBLE;
                blockHP[pr][pc] = -1;
            }
        }
    }
    return { corridorRows, corridorCols };
}

/**
 * 装甲の2辺（上・左）に開口を開け、区画の外の空洞へつなぐ。
 *
 * 開口は必ず**廊下の延長線上**に取る。適当な位置に開けると入った先が壁になり、
 * 「入り口に見えるのに入れない」ことが起きる。
 */
export function openZoneGates(grid, blockHP, zone, {
    thickness, corridorW, corridorRows, corridorCols, rng, tunnelMax, rows, cols,
}) {
    const T = thickness;
    const gates = [];

    // 左辺: 横の廊下から1本選び、その行の帯を空ける
    if (corridorRows.length > 0) {
        const rr = corridorRows[Math.floor(rng.next() * corridorRows.length)];
        fillRect(grid, blockHP, { r0: rr, r1: rr + corridorW - 1, c0: zone.c0, c1: zone.c0 + T - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: rr, c: zone.c0, side: 'left', w: corridorW });
    }
    // 上辺: 縦の廊下から1本選ぶ
    if (corridorCols.length > 0) {
        const cc = corridorCols[Math.floor(rng.next() * corridorCols.length)];
        fillRect(grid, blockHP, { r0: zone.r0, r1: zone.r0 + T - 1, c0: cc, c1: cc + corridorW - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: zone.r0, c: cc, side: 'top', w: corridorW });
    }

    for (const gate of gates) digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols);
    return gates;
}

/** 開口から外向きに、最初の空洞に当たるまで幅 gate.w のトンネルを掘る。 */
function digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols) {
    const horizontal = gate.side === 'left';
    for (let i = 1; i <= tunnelMax; i++) {
        const r = horizontal ? gate.r : zone.r0 - i;
        const c = horizontal ? zone.c0 - i : gate.c;
        if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) return;
        let hitEmpty = false;
        for (let k = 0; k < gate.w; k++) {
            const rr = horizontal ? r + k : r;
            const cc = horizontal ? c : c + k;
            if (rr < 1 || cc < 1 || rr >= rows - 1 || cc >= cols - 1) continue;
            if (grid[rr][cc] === BLOCK_EMPTY) hitEmpty = true;
            grid[rr][cc] = BLOCK_EMPTY;
            blockHP[rr][cc] = 0;
        }
        if (hitEmpty) return;
    }
}

/**
 * 区画を選び、外壁・格子・開口を書き、印を返す。Map から呼ばれる唯一の入口。
 */
export function carveFortressZones({
    grid, blockHP, rows, cols, rooms, excludeRects, rng,
    count, wMin, wRange, hMin, hRange, margin,
    thickness, corridorW, pitch, roomSize, tunnelMax,
}) {
    const picked = pickFortressZones({
        rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin,
    });
    const marks = new Uint8Array(rows * cols);
    const zones = [];
    for (const zone of picked) {
        buildZoneWalls(grid, blockHP, zone, thickness);
        const { corridorRows, corridorCols } = buildZoneInterior(
            grid, blockHP, zone, { thickness, corridorW, pitch, roomSize },
        );
        const openings = openZoneGates(grid, blockHP, zone, {
            thickness, corridorW, corridorRows, corridorCols, rng, tunnelMax, rows, cols,
        });
        // 印は区画の中の「空でない」タイルだけ。空洞には描くものが無い
        for (let r = zone.r0; r <= zone.r1; r++) {
            for (let c = zone.c0; c <= zone.c1; c++) {
                if (grid[r][c] !== BLOCK_EMPTY) marks[r * cols + c] = 1;
            }
        }
        zones.push({ ...zone, openings });
    }
    return { zones, marks };
}
