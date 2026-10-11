// ============================================
// mining - 坑道の町（C）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 木の骨組みの小屋、錆びたトタン屋根、足場と梯子、配管、ランタン。
// 狭い通路・低い天井に多く置く（generate.js の adobeShare）。
// 小屋は「下端 = y 0、上へ y を負に」積んでから normalizeUp で下げる。

import { MAT_WOOD, MAT_METAL, MAT_EXPLOSIVE } from './chunks.js';
import { rect, step4, pick, normalizeUp } from './shapes.js';
import { TOWN_BODY_COLORS as BODY, TOWN_DETAIL_COLORS as DETAIL, TOWN_EXPLOSIVE_COLORS, shade } from './palette.js';

// 軒・看板・ランタンが壁の外へ出るぶんの余白（外接矩形の左右）
const EAVE = 4;
const ROOFS = ['gable', 'shed', 'tin'];

/**
 * 板壁の小屋を1つ積む。屋根は上に最大 8px 足す。
 * @returns {{wallTop:number, top:number}} 壁の上端と屋根の上端の y
 */
function shack(parts, rng, x, bottom, w, h) {
    const wall = pick(rng, BODY.wood);
    const wallTop = bottom - h;
    rect(parts, x, wallTop, w, h, wall, MAT_WOOD, true);
    for (let px = x + 3; px < x + w - 1; px += 4) rect(parts, px, wallTop, 1, h, shade(wall));   // 板の継ぎ目
    const doorX = x + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((w - 12) / 4)));
    rect(parts, doorX, bottom - 8, 4, 8, DETAIL.winDark);
    if (h >= 16) {
        for (let wx = x + 4; wx + 4 <= x + w - 4; wx += 8) {
            if (Math.abs(wx - doorX) < 6) continue;
            if (rng.next() < 0.6) rect(parts, wx, wallTop + 3, 4, 3, rng.next() < 0.5 ? DETAIL.winLit : DETAIL.winDark);
        }
    }
    const roof = pick(rng, ROOFS);
    const col = roof === 'tin' ? BODY.metal[0] : pick(rng, BODY.rust);
    rect(parts, x - 2, wallTop - 4, w + 4, 4, col, MAT_METAL, true);
    if (roof === 'gable') {
        rect(parts, x + 4, wallTop - 8, w - 8, 4, col, MAT_METAL, true);
        return { wallTop, top: wallTop - 8 };
    }
    if (roof === 'shed') {   // 片流れ。段をずらして傾きに見せる
        rect(parts, x - 2, wallTop - 8, Math.floor(w / 8) * 4 + 2, 4, col, MAT_METAL, true);
        return { wallTop, top: wallTop - 8 };
    }
    for (let px = x; px < x + w; px += 3) rect(parts, px, wallTop - 4, 1, 4, shade(col));   // トタンの波
    return { wallTop, top: wallTop - 4 };
}

/** 高床の柱と筋交い（細い部品）。地面 y=0 から上へ sh */
function stilts(parts, rng, x, w, sh) {
    for (const px of [x, x + w - 4]) {
        rect(parts, px, -sh, 4, sh, null, MAT_WOOD, false);
        rect(parts, px + 1, -sh, 2, sh, DETAIL.beam);
    }
    const n = Math.max(1, Math.floor((w - 8) / 2));
    for (let i = 0; i < n; i++) {
        rect(parts, x + 4 + i * 2, -Math.round(sh * (i + 1) / (n + 1)) - 1, 2, 2, DETAIL.beam);
    }
    if (rng.next() < 0.4) {   // 梯子（描くだけ）
        const lx = x + 6;
        rect(parts, lx, -sh, 1, sh, DETAIL.beam);
        rect(parts, lx + 4, -sh, 1, sh, DETAIL.beam);
        for (let ly = -sh + 2; ly < 0; ly += 4) rect(parts, lx, ly, 5, 1, DETAIL.beam);
    }
}

/** 軒から下がるランタン（描くだけ）。x - 4 から描くので EAVE の余白に収まる */
function eaveLantern(parts, x, wallTop) {
    rect(parts, x - 3, wallTop, 1, 3, DETAIL.rope);
    rect(parts, x - 4, wallTop + 3, 3, 3, DETAIL.lantern);
}

export function buildMiningShack(rng, { maxW, maxH }) {
    const footMax = Math.min(36, maxW);
    if (footMax < 16 || maxH < 24) return null;
    const footW = step4(rng, 16, footMax);
    const parts = [];
    const x = EAVE;
    const h1 = step4(rng, 12, Math.min(20, maxH - 8));
    const roll = rng.next();
    let bottom = 0;
    let kind = 'shack';
    if (roll < 0.35 && maxH - h1 - 8 >= 16) {
        const sh = step4(rng, 16, Math.min(48, maxH - h1 - 8));
        stilts(parts, rng, x, footW, sh);
        bottom = -sh;
        kind = 'stiltShack';
    }
    const base = shack(parts, rng, x, bottom, footW, h1);
    let top = base;
    let topX = x;
    let topW = footW;
    if (kind === 'shack' && roll < 0.6 && footW >= 20) {
        const h2 = step4(rng, 12, 16);
        if (-base.top + h2 + 8 <= maxH) {
            top = shack(parts, rng, x + 4, base.top, footW - 8, h2);
            topX = x + 4;
            topW = footW - 8;
            kind = 'stackShack';
        }
    }
    if (rng.next() < 0.3 && -top.top + 8 <= maxH) {   // 煙突（金属の細い部品）
        const cx = topX + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((topW - 12) / 4)));
        rect(parts, cx, top.top - 8, 4, 8, BODY.metal[1], MAT_METAL, false);
        rect(parts, cx + 3, top.top - 8, 1, 8, shade(BODY.metal[1]));
    }
    if (rng.next() < 0.25) {   // 看板（板壁に打ち付けた板）
        rect(parts, x + 2, base.wallTop + 1, 8, 4, pick(rng, BODY.rust), MAT_WOOD, false);
        rect(parts, x + 3, base.wallTop + 2, 6, 1, DETAIL.beam);
    }
    if (rng.next() < 0.3) eaveLantern(parts, x, base.wallTop);
    if (rng.next() < 0.2) {   // 配管（金属の細い部品）
        rect(parts, x - 4, bottom - 6, footW + 8, 4, null, MAT_METAL, false);
        rect(parts, x - 4, bottom - 5, footW + 8, 2, BODY.metal[0]);
    }
    const n = normalizeUp(parts);
    return { kind, w: footW + EAVE * 2, h: n.h, footX: EAVE, footW, parts: n.parts };
}

/**
 * 壁の足場に載った小屋。壁の右側に張り付く向き（左の壁には generate が反転して付ける）。
 * x 0〜4 は壁の岩に埋まり、4〜8 が壁際の柱。
 */
export function buildScaffoldShack(rng, { maxReach }) {
    // step4 は hi < lo で lo を返すので、狭い壁は先に弾く（はみ出して建たないように）
    if (maxReach - 12 < 16) return null;
    const footW = step4(rng, 16, Math.min(28, maxReach - 12));
    const parts = [];
    const x = 8;
    const legH = step4(rng, 12, 28);
    rect(parts, 0, -4, 8, legH + 8, null, MAT_WOOD, false);   // 壁に打ち込んだ梁と柱
    rect(parts, 5, 0, 2, legH, DETAIL.beam);
    rect(parts, 0, 0, x + footW + 2, 4, pick(rng, BODY.wood), MAT_WOOD, false);   // 床板
    const n = Math.max(1, Math.floor((x + footW - 8) / 2));
    for (let i = 0; i < n; i++) {   // 筋交い: 壁の下から床板の先へ
        rect(parts, 6 + i * 2, 4 + Math.round((legH - 4) * (1 - (i + 1) / (n + 1))), 2, 2, DETAIL.beam);
    }
    const s = shack(parts, rng, x, 0, footW, step4(rng, 12, 16));
    if (rng.next() < 0.3) eaveLantern(parts, x, s.wallTop);
    const nn = normalizeUp(parts);
    return { kind: 'scaffoldShack', w: x + footW + EAVE, h: nn.h, parts: nn.parts };
}

/** 天井から下がるランタン。綱（細い部品）の上端 y 0〜4 が天井に埋まる */
export function buildLantern(rng, { maxHang }) {
    const len = step4(rng, 8, Math.max(8, Math.min(40, maxHang - 8)));
    const parts = [];
    rect(parts, 0, 0, 4, len, null, MAT_WOOD, false);
    rect(parts, 1, 0, 1, len, DETAIL.rope);
    rect(parts, 0, len, 4, 5, DETAIL.beam, MAT_METAL, false);   // 枠
    rect(parts, 1, len + 1, 2, 3, DETAIL.lantern);              // 灯り
    return { kind: 'lantern', w: 4, h: len + 5, parts };
}

/** 天井から2本の綱で吊った小屋 */
export function buildHangingShack(rng, { maxHang }) {
    const footW = step4(rng, 16, 24);
    const rope = step4(rng, 8, 20);
    const h1 = step4(rng, 12, 16);
    const bottom = 4 + rope + 8 + h1;   // 天井の段 4 + 綱 + 屋根 8 + 壁
    if (bottom > maxHang) return null;
    const parts = [];
    const x = EAVE;
    for (const rx of [x, x + footW - 4]) {
        // 綱は屋根の下まで伸ばす（トタンの平屋根は 4px 低いので、届かず浮いて見えないように）
        rect(parts, rx, 0, 4, 4 + rope + 8, null, MAT_WOOD, false);
        rect(parts, rx + 1, 0, 1, 4 + rope + 8, DETAIL.rope);
    }
    shack(parts, rng, x, bottom, footW, h1);
    return { kind: 'hangingShack', w: footW + EAVE * 2, h: bottom, parts };
}

// 段3b: 坑道の町の爆発物（spec 3b章）。どの部品も材料は爆発物・厚い壁（1棟まるごと爆発物。
// 建物単位で「爆発した」を決めるため）。下の 4px は床の岩に埋まる（TOWN_FOUNDATION_SINK。支えのかけら）
const EXPLOSIVE_KINDS = ['drum', 'crate', 'gas'];

export function buildMiningExplosive(rng) {
    const C = TOWN_EXPLOSIVE_COLORS;
    const kind = pick(rng, EXPLOSIVE_KINDS);
    const parts = [];
    if (kind === 'drum') {   // 燃料のドラム缶 8x16（見えるのは 8x12）
        rect(parts, 0, 0, 8, 16, C.drum, MAT_EXPLOSIVE, true);
        rect(parts, 0, 0, 8, 1, C.drumRim);
        rect(parts, 0, 4, 8, 1, C.drumBand);
        rect(parts, 0, 9, 8, 1, C.drumBand);
        rect(parts, 6, 1, 2, 11, shade(C.drum));
        return { kind, w: 8, h: 16, parts };
    }
    if (kind === 'crate') {   // ダイナマイトの木箱 12x12（見えるのは 12x8）。赤い印に白
        const wood = pick(rng, BODY.wood);
        rect(parts, 0, 0, 12, 12, wood, MAT_EXPLOSIVE, true);
        rect(parts, 0, 0, 12, 1, DETAIL.beam);
        rect(parts, 0, 7, 12, 1, DETAIL.beam);
        rect(parts, 3, 2, 6, 4, C.crateMark);
        rect(parts, 5, 3, 2, 2, C.crateMarkInner);
        return { kind, w: 12, h: 12, parts };
    }
    // ガスボンベ2本 8x16（見えるのは 8x12）。肩を 1px 細くして丸く見せる
    rect(parts, 0, 0, 8, 16, null, MAT_EXPLOSIVE, true);
    for (const x of [0, 5]) {
        rect(parts, x + 1, 0, 1, 2, C.gasCap);
        rect(parts, x, 2, 3, 14, C.gas);
        rect(parts, x, 6, 3, 1, C.gasBand);
    }
    return { kind, w: 8, h: 16, parts };
}
