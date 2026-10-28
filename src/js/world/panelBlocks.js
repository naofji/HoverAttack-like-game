// ============================================
// 7面の要塞のパネル（金属・装甲板）の絵。純関数で、ctx に fillRect しか使わない。
// Map._drawPanelBlock が露出・焼け・ダメージを集めて渡す。tools/render-fortress-scene.mjs が
// PixelCanvas（fillRect しか持たない）で同じ関数を描けるように、clip や stroke は使わない。
//
// 以前の金属は _drawPolishedBlock（装甲の絵）を流用していて、**1タイルごとに4辺すべてへ面取りが付く**ため、
// 並べるとボタンの格子に見えた（床は1枚の板、壁は継ぎ目のある板に見えてほしい）。
// そこで岩（_drawRockyBlock）と同じく**空洞に面した辺だけ**を面取りし、タイル同士の接合部は
// 継ぎ目の線にする。壊れて露出が変わると隣が描き直される（invalidateTileRegion）ので、
// 穴の縁には自然に面取りが付く。
// ============================================

import { METAL_HEAT_GLOSS_LOSS } from '../utils/Constants.js';

// 板の長さ（タイル数）。継ぎ目は横方向だけ、この間隔で段違いに入れる（レンガ積み）。
// 縦方向はタイルの境ごとに必ず入れる。壁が2枚幅でも床が1枚高でも「板の寸法」がタイルより細かくならず、
// 同じ列を上へ辿ったとき継ぎ目が揃わない（＝格子に戻らない）ことが要点
const PLATE_LEN = 2;

/** タイル (r, c) の左辺が板の継ぎ目か（左隣が空洞でないときだけ意味を持つ）。段違い: 行が変わるごとに半枚ずれる */
export function plateBreaksLeft(r, c) {
    return (c + r) % PLATE_LEN === 0;
}

/** タイル座標から決まる決定論的な乱数 i 番目（毎フレーム同一値。_drawRockyBlock と同じ流儀） */
export function tileRng(r, c) {
    const seed = (r * 7919 + c * 104729) | 0;
    return (i) => {
        let h = Math.imul((seed ^ Math.imul(i, 2654435761)) | 0, 0x9e3779b9) >>> 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
        return (h >>> 0) / 0xFFFFFFFF;
    };
}

const a = (alpha) => alpha.toFixed(3);

/**
 * 金属パネル。光る素材なので焼けると艶が飛ぶ（gloss）。ひび割れは描かない。
 * exp: 空洞に面している辺 {t, b, l, r}。seamLeft: 左隣と板が分かれる継ぎ目を引くか
 * （左隣が空洞のときは exp.l の面取りになるので引かない）
 */
export function drawMetalPanel(ctx, x, y, S, { fill, exp, seamLeft, heat, rng }) {
    const gloss = 1 - heat * METAL_HEAT_GLOSS_LOSS;

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, S, S);

    // 板ごとの明るさのむら（同じ板の継ぎ目の内側は同じ値にならないよう、タイルごとに引く）
    const v = rng(1);
    ctx.fillStyle = v < 0.35 ? 'rgba(0,0,0,0.07)' : v > 0.7 ? `rgba(255,255,255,${a(0.06 * gloss)})` : 'rgba(0,0,0,0)';
    ctx.fillRect(x, y, S, S);

    // 圧延の筋（細い横線）。光る素材の質感で、岩のぎざぎざと見分ける決め手
    for (let i = 0; i < 2; i++) {
        const ly = y + 3 + Math.floor(rng(10 + i) * (S - 6));
        ctx.fillStyle = `rgba(255,255,255,${a((0.05 + rng(12 + i) * 0.05) * gloss)})`;
        ctx.fillRect(x + 1, ly, S - 2, 1);
    }

    // 継ぎ目（板と板の溝）。暗い線とその隣の明るい線で、凹んだ溝に見せる
    if (!exp.t) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, S, 1);
        ctx.fillStyle = `rgba(255,255,255,${a(0.14 * gloss)})`; ctx.fillRect(x, y + 1, S, 1);
    }
    if (!exp.l && seamLeft) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, 1, S);
        ctx.fillStyle = `rgba(255,255,255,${a(0.14 * gloss)})`; ctx.fillRect(x + 1, y, 1, S);
    }

    // 空洞に面した辺の面取り（光は左上から）
    if (exp.t) {
        ctx.fillStyle = `rgba(255,255,255,${a(0.55 * gloss)})`; ctx.fillRect(x, y, S, 1);
        ctx.fillStyle = `rgba(255,255,255,${a(0.28 * gloss)})`; ctx.fillRect(x, y + 1, S, 2);
    }
    if (exp.l) {
        ctx.fillStyle = `rgba(255,255,255,${a(0.40 * gloss)})`; ctx.fillRect(x, y, 1, S);
        ctx.fillStyle = `rgba(255,255,255,${a(0.18 * gloss)})`; ctx.fillRect(x + 1, y, 1, S);
    }
    if (exp.b) {
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(x, y + S - 3, S, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(x, y + S - 1, S, 1);
    }
    if (exp.r) {
        ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(x + S - 3, y, 2, S);
        ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fillRect(x + S - 1, y, 1, S);
    }

    // リベット。板の継ぎ目に沿って打つので、継ぎ目の内側（右下寄り）に置く
    const rivetX = x + (exp.r ? S - 5 : S - 4);
    const rivetY = y + (exp.b ? S - 5 : S - 4);
    rivet(ctx, rivetX, rivetY, gloss);
    if (seamLeft && !exp.l) rivet(ctx, x + 3, rivetY, gloss);
}

/** 1画素の頭に、右下へ落ちる影を付けたリベット */
function rivet(ctx, rx, ry, gloss) {
    ctx.fillStyle = `rgba(255,255,255,${a(0.42 * gloss)})`; ctx.fillRect(rx, ry, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(rx + 1, ry + 1, 1, 1);
}

/**
 * 装甲板（要塞の右壁＝弱点の硬い岩）。金属と見分けがつくよう**艶を出さず**、板の中央を凹ませ、
 * 四隅にボルトを打つ。被弾はひび割れ（光沢の無い鋳造・コンクリートの装甲はひびで割れる）。
 * damage: 受けたダメージ（0 = 無傷）。ひびは1回につき2本、最大4本
 */
export function drawArmorPanel(ctx, x, y, S, { fill, exp, damage, rng }) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, S, S);

    const v = rng(1);
    ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, S, S);

    // 中央の凹み（板の面）。縁の1px は明暗で段差に見せる
    const I = 3;
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(x + I, y + I, S - 2 * I, S - 2 * I);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x + I, y + I, S - 2 * I, 1);
    ctx.fillRect(x + I, y + I, 1, S - 2 * I);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + I, y + S - I - 1, S - 2 * I, 1);
    ctx.fillRect(x + S - I - 1, y + I, 1, S - 2 * I);

    // 四隅のボルト
    for (const [bx, by] of [[x + 1, y + 1], [x + S - 3, y + 1], [x + 1, y + S - 3], [x + S - 3, y + S - 3]]) {
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(bx, by, 2, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(bx + 1, by + 1, 1, 1);
    }

    // 空洞に面した辺の縁（金属ほどの面取りは付けず、暗い縁取りで厚みだけ見せる）
    if (exp.t) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, S, 1); }
    if (exp.l) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, 1, S); }
    if (exp.b) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + S - 2, S, 2); }
    if (exp.r) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + S - 2, y, 2, S); }

    // ひび（折れ線ではなく fillRect の段々。PixelCanvas でも同じ絵になるよう矩形だけで引く）
    const cracks = Math.min(damage * 2, 4);
    for (let i = 0; i < cracks; i++) {
        const base = 100 + i * 4;
        let cx = x + 2 + Math.floor(rng(base) * (S - 4));
        let cy = y + 2 + Math.floor(rng(base + 1) * (S - 4));
        const dx = rng(base + 2) < 0.5 ? -1 : 1;
        ctx.fillStyle = `rgba(255,255,255,${a(0.40 + 0.08 * i)})`;
        for (let s = 0; s < 6; s++) {
            if (cx < x || cx >= x + S || cy < y || cy >= y + S) break;
            ctx.fillRect(cx, cy, 1, 1);
            cy += 1;
            if (s % 2 === 0) cx += dx;
        }
    }
}
