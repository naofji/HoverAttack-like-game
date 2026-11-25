// ============================================
// baseParts - 6面の基地（militaryBase.js）と7面の基地（fortressBase.js）が共有する絵の部品
// ============================================
//
// 7面の基地は「6面の基地と同じ積み方を7面の色で」作ったので、継ぎ目・窓の帯・警告の縞・格納庫・
// レーダーの柱と皿・壁の足場・吊り下げ照明・床の建物の組み立てが、色の表だけ違う写しになっていた
// （コメントと空白を除いて 6 行以上続く同じ塊が 18 か所）。片方だけ直して形が食い違わないよう、
// 2026-11-26 にここへまとめた。違いは引数で渡す: 色の表（detail = *_DETAIL_COLORS、色の候補の配列）と、
// 窓を置く確率（6面 0.8 / 7面 0.85）。
//
// **乱数を引く順番は元のまま**（週次の決定性。町の設計図は game.rng の派生で作られ、引く回数が変わると
// 建物の形が週ごとに変わる）。各関数の中の rng.next() / pick / step4 の順番を入れ替えないこと。
// 形の数値は描画専用のパラメータなのでここに置く（Constants.js ではない）。

import { MAT_METAL } from './chunks.js';
import { rectWithLoose, step4, pick, normalizeUp } from './shapes.js';
import { shade } from './palette.js';

// 描くだけの部品も、かけらにするときは鉄として数える（6・7面とも木を使わない。手すり・筋交いが燃えないように）
const rect = rectWithLoose(MAT_METAL);

/** 波板・コンクリート・パネルの継ぎ目（描くだけ）。every px ごとに 1px の影の筋 */
export function seams(parts, x, top, w, h, color, every) {
    for (let px = x + every - 1; px < x + w - 1; px += every) rect(parts, px, top, 1, h, shade(color));
}

/**
 * 窓の帯（描くだけ）。ガラスの 4x3 を 8px ごと、確率 chance で置く。灯りは付けない
 * （弾の黄色と見間違えないよう差し色の範囲で暗く）
 */
export function windowBand(parts, rng, x, y, w, glass, chance) {
    for (let wx = x + 4; wx + 4 <= x + w - 4; wx += 8) {
        if (rng.next() < chance) rect(parts, wx, y, 4, 3, glass);
    }
}

/** 黄黒の警告の縞（描くだけ）。扉の上・機械の縁に */
export function hazardStripe(parts, x, y, w, detail) {
    rect(parts, x, y, w, 2, detail.dark);
    for (let px = x; px < x + w; px += 4) rect(parts, px, y, 2, 2, detail.hazard);
}

/** 格納庫: かまぼこ屋根（4px の段で丸く見せる）と大きな扉。skins は壁と屋根の色の候補 */
export function hangar(parts, rng, x, footW, maxH, skins, detail) {
    const wallH = step4(rng, 12, Math.min(20, maxH - 16));
    const skin = pick(rng, skins);
    rect(parts, x, -wallH, footW, wallH, skin, MAT_METAL, true);
    seams(parts, x, -wallH, footW, wallH, skin, 4);
    // 屋根: 上の段ほど左右を詰める。段の数は幅で決まり、高さの上限で打ち切る
    let top = -wallH;
    for (let i = 1; ; i++) {
        const inset = [2, 4, 8, 14][i - 1];
        if (inset === undefined || footW - inset * 2 < 8 || -(top - 4) > maxH) break;
        rect(parts, x + inset, top - 4, footW - inset * 2, 4, skin, MAT_METAL, true);
        top -= 4;
    }
    // 扉（半分ほどの幅、真ん中）と上の警告の縞
    const dw = step4(rng, 12, Math.max(12, footW - 16));
    const dx = x + Math.floor((footW - dw) / 8) * 4;
    const dh = Math.min(wallH, 16);
    rect(parts, dx, -dh, dw, dh, detail.dark);
    hazardStripe(parts, dx, -dh - 2, dw, detail);
    return { wallH };
}

/**
 * レーダーの柱と皿形のアンテナ（段で斜めに見せる、厚い金属）。柱の高さ standH と柱の色 steel は
 * 呼ぶ側が台の小屋（高さ hutH）より先に引いて、小屋を積んでから呼ぶ（元の乱数の順番）。
 * eave は皿が足元の外へはみ出してよい幅、paints は皿の色の候補
 */
export function radarMastAndDish(parts, rng, x, footW, { hutH, standH, eave, steel, paints, detail }) {
    const mx = x + Math.floor(footW / 8) * 4;
    rect(parts, mx, -hutH - standH, 4, standH, steel, MAT_METAL, false);
    rect(parts, mx + 1, -hutH - standH, 1, standH, detail.rail);
    // 皿: 左右どちらかへ傾いた段。下の段ほど狭い（受け皿の形）
    const dishW = step4(rng, 16, Math.min(28, footW + eave * 2 - 4));
    const top = -hutH - standH;
    const face = rng.next() < 0.5 ? -1 : 1;
    const paint = pick(rng, paints);
    const rows = [dishW, dishW - 4, dishW - 8, Math.max(4, dishW - 16)];
    for (let i = 0; i < rows.length; i++) {
        const rw = rows[i];
        const cx = mx + 2 + face * i * 2;
        let rx = Math.round(cx - rw / 2);
        rx = Math.max(x - eave, Math.min(x + footW + eave - rw, rx));
        rect(parts, rx, top - 16 + i * 4, rw, 4, i === 0 ? shade(paint) : paint, MAT_METAL, true);
    }
    // 受信器の細い腕
    rect(parts, mx + 1, top - 20, 2, 4, detail.rail, MAT_METAL, false);
}

/**
 * 壁に張り付く小屋の足場: 壁に打ち込んだ金具と柱、鉄の床板、壁の下から床板の先への筋交い。
 * x 0〜4 は壁の岩に埋まる。小屋の本体は x（= 8）から幅 footW で、呼ぶ側が床板の上に積む
 */
export function wallBracket(parts, x, footW, legH, steel, detail) {
    rect(parts, 0, -4, 8, legH + 8, steel, MAT_METAL, false);   // 壁に打ち込んだ金具と柱
    rect(parts, 0, 0, x + footW + 2, 4, steel, MAT_METAL, false);   // 鉄の床板
    const n = Math.max(1, Math.floor((x + footW - 8) / 2));
    for (let i = 0; i < n; i++) {   // 筋交い: 壁の下から床板の先へ
        rect(parts, 6 + i * 2, 4 + Math.round((legH - 4) * (1 - (i + 1) / (n + 1))), 2, 1, detail.rail);
    }
}

/** 天井から下がる照明。棒（上端 4px が天井）と傘、暗い琥珀の灯り。棒の長さは maxLen まで */
export function hangingLamp(rng, maxHang, maxLen, shadeColors, detail) {
    const len = step4(rng, 4, Math.max(4, Math.min(maxLen, maxHang - 8)));
    const parts = [];
    rect(parts, 2, 0, 4, len, null, MAT_METAL, false);
    rect(parts, 3, 0, 1, len, detail.rail);
    rect(parts, 0, len, 8, 4, pick(rng, shadeColors), MAT_METAL, false);   // 傘
    rect(parts, 2, len + 3, 4, 1, detail.lamp);
    return { kind: 'lamp', w: 8, h: len + 4, parts };
}

/**
 * 床の建物を1つ作る。kinds（kind ごとの minW / minH / maxW、張り出しの無いものは noEave）の条件を満たす
 * kind から選び、足元の幅を決めて builders[kind] で積む。外接矩形は足元の左右に eave の余白
 * （屋根の張り出し・手すりが本体の外へ出るぶん。noEave の kind＝7面のフェンスは 0）。足りなければ null
 */
export function buildFloor(rng, kinds, builders, eave, { maxW, maxH }) {
    const ok = Object.keys(kinds).filter((k) => kinds[k].minW <= maxW && kinds[k].minH <= maxH);
    if (ok.length === 0) return null;
    const kind = pick(rng, ok);
    const footW = step4(rng, kinds[kind].minW, Math.min(kinds[kind].maxW, maxW));
    const pad = kinds[kind].noEave ? 0 : eave;
    const parts = [];
    builders[kind](parts, rng, pad, footW, maxH);
    const n = normalizeUp(parts);
    return { kind, w: footW + pad * 2, h: n.h, footX: pad, footW, parts: n.parts };
}
