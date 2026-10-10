// ============================================
// adobe - 日干し煉瓦の塔の町（A）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 参考: シバーム（下が太く上が細い、上の階ほど窓が多い、上の階を白く塗る、
// 上の階どうしを橋で結ぶ）、クリフ・パレス（崖のくぼみの家、壁から突き出た梁、丸い塔）。
// 形の数値は描画専用のパラメータなのでここに置く（Constants.js ではない）。

import { MAT_ADOBE, MAT_WOOD } from './chunks.js';
import { rect, step4, pick, normalizeUp } from './shapes.js';
import { TOWN_BODY_COLORS as BODY, TOWN_DETAIL_COLORS as DETAIL, shade } from './palette.js';

// 1階の高さ。自機（24px）の半分。これより低いと窓の段が詰まって縞に見える
const FLOOR_H = 12;
// 梁が壁から突き出す長さ。外接矩形の左右にこの余白を取っておく
const VIGA = 4;
const BALCONY_W = 8;
const ROOFS = ['crenel', 'crenel', 'flat', 'dome'];   // 胸壁を多めに（シバームの屋上）
const ROOF_H = { crenel: 4, flat: 0, dome: 8 };

export function buildAdobeTower(rng, { maxW, maxH }) {
    const round = rng.next() < 0.06;   // まれに丸い塔（クリフ・パレス）
    const wMin = round ? 16 : 20;
    const wMax = Math.min(round ? 24 : 56, maxW);
    if (wMax < wMin) return null;
    const roof = round ? 'dome' : pick(rng, ROOFS);
    const roofH = ROOF_H[roof];
    const floorsMax = Math.min(9, Math.floor((maxH - roofH) / FLOOR_H));
    if (floorsMax < 2) return null;
    const footW = step4(rng, wMin, wMax);
    const nFloors = 2 + Math.floor(rng.next() * (floorsMax - 1));
    const bodyH = nFloors * FLOOR_H;
    const H = roofH + bodyH;
    const balcony = (!round && nFloors >= 3 && rng.next() < 0.35) ? (rng.next() < 0.5 ? -1 : 1) : 0;
    const footX = VIGA + (balcony < 0 ? BALCONY_W : 0);
    const W = footW + VIGA * 2 + (balcony ? BALCONY_W : 0);

    const parts = [];
    const body = pick(rng, BODY.adobe);
    const wash = pick(rng, BODY.wash);
    const washRows = rng.next() < 0.6 ? 2 + Math.floor(rng.next() * 4) : 0;

    // 壁: 4px の段を下から積み、幅16pxごとに片側 4px まで細らせる（下が太く上が細い）
    const rows = bodyH / 4;
    const maxSteps = Math.floor(footW / 16);
    const rowsPerStep = Math.ceil(rows / (maxSteps + 1));
    const insets = [];
    for (let k = 0; k < rows; k++) {
        const inset = Math.min(maxSteps, Math.floor(k / rowsPerStep)) * 4;
        insets.push(inset);
        const y = H - (k + 1) * 4;
        const x0 = footX + inset;
        const ww = footW - inset * 2;
        const col = k >= rows - washRows ? wash : body;
        rect(parts, x0, y, ww, 4, col, MAT_ADOBE, true);
        rect(parts, x0 + ww - 4, y, 4, 4, shade(col));   // 影の側
    }
    const insetAt = (y) => insets[Math.min(rows - 1, Math.max(0, Math.floor((H - y - 1) / 4)))];

    // 屋上
    const topInset = insets[rows - 1];
    const tx0 = footX + topInset;
    const tw = footW - topInset * 2;
    const topCol = washRows > 0 ? wash : body;
    if (roof === 'crenel') {
        // 胸壁は細い部品（段2で弾を止めない）。4px おきの凹凸
        for (let px = tx0; px + 4 <= tx0 + tw; px += 8) rect(parts, px, 0, 4, 4, topCol, MAT_ADOBE, false);
    } else if (roof === 'dome') {
        rect(parts, tx0 + 4, 4, tw - 8, 4, topCol, MAT_ADOBE, true);
        rect(parts, tx0 + 8, 0, tw - 16, 4, topCol, MAT_ADOBE, true);
    }

    // 窓と梁。窓は上の階ほど多い（シバームは上の階に窓が集まる）
    const doorX = footX + footW / 2 - 2;
    for (let f = 0; f < nFloors; f++) {
        const wy = H - (f + 1) * FLOOR_H + 4;
        const ins = insetAt(wy);
        // 上の階ほど細く窓の場所が少ないので、確率の傾きで打ち消す。0.25〜0.75 では
        // 上半分/下半分の窓の数が 1.05 倍にしかならなかった（塔300棟の実測）。
        // 0.15〜0.85 で 1.38 倍、窓の総数はほぼ同じ（1,636 → 1,677）
        const p = 0.15 + 0.7 * (f / (nFloors - 1));
        for (let wx = footX + ins + 4; wx + 3 <= footX + footW - ins - 8; wx += 8) {
            if (f === 0 && Math.abs(wx - doorX) < 6) continue;
            if (rng.next() < p) rect(parts, wx, wy, 3, 4, rng.next() < 0.35 ? DETAIL.winLit : DETAIL.winDark);
        }
        if (f >= 1 && rng.next() < 0.35) {
            // 床の高さで壁から突き出た梁の木口（クリフ・パレスのヴィガ）
            const by = H - f * FLOOR_H - 2;
            const bi = insetAt(by);
            rect(parts, footX + bi - VIGA, by, VIGA, 2, DETAIL.beam);
            rect(parts, footX + footW - bi, by, VIGA, 2, DETAIL.beam);
        }
    }
    rect(parts, doorX, H - 8, 4, 8, DETAIL.winDark);

    // バルコニー（木の床板＝細い部品）
    if (balcony) {
        const f = 1 + Math.floor(rng.next() * (nFloors - 2));
        const dy = H - f * FLOOR_H;
        const ins = insetAt(dy - 1);
        const bx = balcony < 0 ? footX + ins - BALCONY_W : footX + footW - ins;
        rect(parts, bx, dy, BALCONY_W, 4, pick(rng, BODY.wood), MAT_WOOD, false);
        rect(parts, bx, dy - 5, BALCONY_W, 1, DETAIL.beam);
        rect(parts, balcony < 0 ? bx : bx + BALCONY_W - 1, dy - 5, 1, 5, DETAIL.beam);
        rect(parts, balcony < 0 ? footX + ins : footX + footW - ins - 4, dy - 8, 4, 8, DETAIL.winDark);
    }

    // 外壁に沿う階段（描くだけ）。1階ぶんを斜めに上る
    if (!round && nFloors >= 3 && rng.next() < 0.25) {
        const sx = footX + insets[0] + 4;
        for (let i = 0; i < FLOOR_H / 2; i++) rect(parts, sx + i * 2, H - 2 - i * 2, 4, 2, shade(body));
    }

    return { kind: round ? 'roundTower' : 'tower', w: W, h: H, footX, footW, insets, parts };
}

/**
 * 崖の家。壁の右側に張り付く向きで組む（左の壁には generate が反転して付ける）。
 * x 0〜4 は壁の岩に埋まり、そこが支えになる。下に岩棚の梁を張り出す。
 */
export function buildAdobeWallHouse(rng, { maxReach }) {
    const footW = step4(rng, 16, Math.min(28, maxReach - 8));
    if (footW < 16 || maxReach - 8 < 16) return null;
    const parts = [];
    const body = pick(rng, BODY.adobe);
    const h1 = step4(rng, 16, 28);
    const w1 = 4 + footW;
    // 岩棚: 壁から張り出した梁の床（細い部品）と、その木口
    rect(parts, 0, 0, w1 + 4, 4, DETAIL.beam, MAT_WOOD, false);
    for (let bx = 6; bx + 2 <= w1 + 4; bx += 6) rect(parts, bx, 4, 2, 2, DETAIL.beam);
    // 家（厚い壁）
    rect(parts, 0, -h1, w1, h1, body, MAT_ADOBE, true);
    rect(parts, w1 - 4, -h1, 4, h1, shade(body));
    rect(parts, w1 - 8, -8, 4, 8, DETAIL.winDark);   // 岩棚へ出る戸口
    for (let wy = -h1 + 4; wy <= -12; wy += 8) {
        for (let wx = 6; wx + 3 <= w1 - 10; wx += 7) {
            if (rng.next() < 0.5) rect(parts, wx, wy, 3, 4, rng.next() < 0.35 ? DETAIL.winLit : DETAIL.winDark);
        }
    }
    // 崖の住居は積み重なる: 上にもう1つ小さな家
    if (footW >= 20 && rng.next() < 0.5) {
        const h2 = step4(rng, 12, 16);
        const w2 = w1 - 8;
        rect(parts, 0, -h1 - h2, w2, h2, body, MAT_ADOBE, true);
        rect(parts, w2 - 4, -h1 - h2, 4, h2, shade(body));
        if (rng.next() < 0.6) rect(parts, 6, -h1 - h2 + 4, 3, 4, DETAIL.winLit);
    }
    const n = normalizeUp(parts);
    return { kind: 'cliffHouse', w: w1 + 4, h: n.h, parts: n.parts };
}

/**
 * 天井から吊った渡り橋。両端の綱が y 0〜4（天井に埋まる段）に結ばれる。
 * 板と綱だけ＝細い部品なので、段2では弾がすり抜けて欠けるだけ。
 */
export function buildHangingBridge(rng, { span, maxHang }) {
    const n = Math.floor(span / 4);
    if (n < 8) return null;
    // たわみ(〜12) と下がるランタン(8) のぶんを引いておき、h ≤ maxHang を守る
    const dropMax = Math.min(40, maxHang - 20);
    if (dropMax < 16) return null;
    const drop = step4(rng, 16, dropMax);
    const sag = 4 + Math.floor(rng.next() * 9);
    const deck = pick(rng, BODY.wood);
    const parts = [];
    for (const rx of [0, n * 4 - 4]) {
        rect(parts, rx, 0, 4, drop + 4, null, MAT_WOOD, false);
        rect(parts, rx + 1, 0, 1, drop, DETAIL.rope);
    }
    for (let i = 0; i < n; i++) {
        const s = Math.round(Math.sin(Math.PI * (i + 0.5) / n) * sag);
        rect(parts, i * 4, drop + s, 4, 4, null, MAT_WOOD, false);
        rect(parts, i * 4, drop + s, 4, 2, i % 2 ? deck : shade(deck));
        rect(parts, i * 4, drop + s - 4, 4, 1, DETAIL.rope);   // 手すりの綱
    }
    let h = drop + sag + 4;
    if (rng.next() < 0.5) {
        const ly = drop + sag + 2;
        const lx = Math.floor(n / 2) * 4;
        rect(parts, lx + 1, ly, 1, 3, DETAIL.rope);
        rect(parts, lx, ly + 3, 3, 3, DETAIL.lantern);
        h = ly + 6;
    }
    return { kind: 'bridge', w: n * 4, h, parts };
}
