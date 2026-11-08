// ============================================
// fortressBase - 7面の基地の建物（K: 広い所の大きな棟 / H: 狭い所の小屋・設備）
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-08-stage7-base-facilities-design.md（3章）
// 7面の施設エリア（メタルパネルの区画）の中に並ぶ基地。6面の基地（militaryBase.js）と同じ積み方だが、
// **材料はすべて金属**（ユーザー「全体的にメタリック」。6面の倉庫・工場棟のコンクリートの壁は使わない）。
// 爆発物は置かない（ユーザー「工場ではないので爆発物は無いのが良い」）。
// 色は7面の要塞のパネルと同じ灰青の系統（palette.js の FORTRESS_BASE_COLORS）。研究室だけ白っぽい金属。
// 形の数値は描画専用のパラメータなのでここに置く（Constants.js ではない）。
// 床の建物は militaryBase.js と同じく「下端 = y 0、上へ y を負に」積んでから normalizeUp で下げる。

import { MAT_METAL } from './chunks.js';
import { rectWithLoose, step4, pick, normalizeUp } from './shapes.js';
import { FORTRESS_BASE_COLORS as BODY, FORTRESS_BASE_DETAIL_COLORS as DETAIL, shade } from './palette.js';

// 部品を積む。描くだけの部品（窓・金網・筋交い）も、かけらにするときは鉄として数える（燃えない）
const rect = rectWithLoose(MAT_METAL);

// 屋根の張り出し・手すりが本体の外へ出るぶんの余白（外接矩形の左右）
const EAVE = 4;

/** 波板・パネルの継ぎ目（描くだけ）。every px ごとに 1px の影の筋 */
function seams(parts, x, top, w, h, color, every) {
    for (let px = x + every - 1; px < x + w - 1; px += every) rect(parts, px, top, 1, h, shade(color));
}

/** 窓の帯（描くだけ）。4x3 のガラスを 8px ごと */
function windowBand(parts, rng, x, y, w) {
    for (let wx = x + 4; wx + 4 <= x + w - 4; wx += 8) {
        if (rng.next() < 0.85) rect(parts, wx, y, 4, 3, DETAIL.glass);
    }
}

/** 黄黒の警告の縞（描くだけ） */
function hazardStripe(parts, x, y, w) {
    rect(parts, x, y, w, 2, DETAIL.dark);
    for (let px = x; px < x + w; px += 4) rect(parts, px, y, 2, 2, DETAIL.hazard);
}

// --- 床の建物（広い所: K） ---
// 各 kind の「建てられる最小の幅・高さ」。足りなければ候補から外す（step4 は hi < lo で lo を返すので先に弾く）
const KEEP_KINDS = {
    hangar: { minW: 32, minH: 28, maxW: 64 },
    commandTower: { minW: 20, minH: 48, maxW: 32 },
    radarDish: { minW: 16, minH: 44, maxW: 24 },
    lab: { minW: 32, minH: 28, maxW: 56 },
};

/** 格納庫: かまぼこ屋根（4px の段で丸く見せる）と大きな扉。6面の格納庫と同じ形を7面の色で */
function hangar(parts, rng, x, footW, maxH) {
    const wallH = step4(rng, 12, Math.min(20, maxH - 16));
    const skin = pick(rng, BODY.steel);
    rect(parts, x, -wallH, footW, wallH, skin, MAT_METAL, true);
    seams(parts, x, -wallH, footW, wallH, skin, 4);
    let top = -wallH;
    for (let i = 1; ; i++) {
        const inset = [2, 4, 8, 14][i - 1];
        if (inset === undefined || footW - inset * 2 < 8 || -(top - 4) > maxH) break;
        rect(parts, x + inset, top - 4, footW - inset * 2, 4, skin, MAT_METAL, true);
        top -= 4;
    }
    const dw = step4(rng, 12, Math.max(12, footW - 16));
    const dx = x + Math.floor((footW - dw) / 8) * 4;
    const dh = Math.min(wallH, 16);
    rect(parts, dx, -dh, dw, dh, DETAIL.dark);
    hazardStripe(parts, dx, -dh - 2, dw);
}

/** 司令塔: 低い基部の上に細い塔、上のほうに窓の帯（管制室）、屋上にアンテナ */
function commandTower(parts, rng, x, footW, maxH) {
    const steel = pick(rng, BODY.steel);
    const blue = pick(rng, BODY.blueSteel);
    const baseH = step4(rng, 12, 16);
    rect(parts, x, -baseH, footW, baseH, steel, MAT_METAL, true);
    seams(parts, x, -baseH, footW, baseH, steel, 8);
    rect(parts, x + 4, -8, 8, 8, DETAIL.dark);   // 入口
    const tw = Math.max(12, footW - 8);
    const tx = x + Math.floor((footW - tw) / 8) * 4;
    // 塔の上に屋根 4・アンテナ 4・灯り 1 が載るので、天井から 12px 空ける
    const towerH = step4(rng, 24, Math.min(48, maxH - baseH - 12));
    const top = -baseH - towerH;
    rect(parts, tx, top, tw, towerH, blue, MAT_METAL, true);
    // 管制室: 塔より左右に 2px 張り出した窓の帯
    rect(parts, tx - 2, top, tw + 4, 8, steel, MAT_METAL, true);
    rect(parts, tx, top + 2, tw, 4, DETAIL.glass);
    rect(parts, tx - 2, top - 4, tw + 4, 4, shade(steel), MAT_METAL, true);   // 屋根
    rect(parts, tx + tw - 4, top - 8, 1, 4, DETAIL.rail);                     // アンテナ（描くだけ）
    if (rng.next() < 0.6) rect(parts, tx + tw - 5, top - 9, 3, 1, DETAIL.signal);
}

/** 大型レーダー: 金属の台の小屋＋柱＋皿形のアンテナ（段で斜めに見せる） */
function radarDish(parts, rng, x, footW, maxH) {
    const standH = step4(rng, 12, Math.min(24, maxH - 32));
    const steel = pick(rng, BODY.steel);
    const hutH = 8;
    rect(parts, x, -hutH, footW, hutH, steel, MAT_METAL, true);
    rect(parts, x + 2, -hutH + 2, 4, 3, DETAIL.glass);
    const mx = x + Math.floor(footW / 8) * 4;
    rect(parts, mx, -hutH - standH, 4, standH, steel, MAT_METAL, false);
    rect(parts, mx + 1, -hutH - standH, 1, standH, DETAIL.rail);
    const dishW = step4(rng, 16, Math.min(28, footW + EAVE * 2 - 4));
    const top = -hutH - standH;
    const face = rng.next() < 0.5 ? -1 : 1;
    const paint = pick(rng, BODY.blueSteel);
    const rows = [dishW, dishW - 4, dishW - 8, Math.max(4, dishW - 16)];
    for (let i = 0; i < rows.length; i++) {
        const rw = rows[i];
        const cx = mx + 2 + face * i * 2;
        let rx = Math.round(cx - rw / 2);
        rx = Math.max(x - EAVE, Math.min(x + footW + EAVE - rw, rx));
        rect(parts, rx, top - 16 + i * 4, rw, 4, i === 0 ? shade(paint) : paint, MAT_METAL, true);
    }
    rect(parts, mx + 1, top - 20, 2, 4, DETAIL.rail, MAT_METAL, false);   // 受信器の腕
}

/**
 * 研究室（ユーザーの追加）: 白っぽい金属の箱。施設の中で一番明るい建物にして、ほかの棟と見分ける。
 * 横長の窓（実験室の灯りは緑の信号色）、屋上に排気筒。爆発物ではない（誘爆しない）
 */
function lab(parts, rng, x, footW, maxH) {
    const h = step4(rng, 20, Math.min(36, maxH - 8));
    const wall = pick(rng, BODY.lab);
    rect(parts, x, -h, footW, h, wall, MAT_METAL, true);
    seams(parts, x, -h, footW, h, wall, 16);
    // 横長の窓（1本の帯）と、その中の緑の灯り
    rect(parts, x + 4, -h + 5, footW - 8, 4, DETAIL.glass);
    for (let lx = x + 8; lx + 2 <= x + footW - 8; lx += 12) rect(parts, lx, -h + 6, 2, 2, DETAIL.signal);
    // 入口（自動扉の縦の筋）
    const ex = x + footW - 12;
    rect(parts, ex, -10, 8, 10, DETAIL.dark);
    rect(parts, ex + 4, -10, 1, 10, DETAIL.rail);
    const steel = pick(rng, BODY.steel);
    rect(parts, x - 2, -h - 4, footW + 4, 4, steel, MAT_METAL, true);   // 屋根
    // 排気筒（細い金属）。天井が低ければ付けない
    if (h + 12 <= maxH) {
        rect(parts, x + 6, -h - 8, 4, 4, steel, MAT_METAL, false);
        rect(parts, x + 6, -h - 8, 4, 1, DETAIL.rail);
    }
}

const KEEP_BUILDERS = { hangar, commandTower, radarDish, lab };

/** 広い所の床の建物。足りなければ null */
export function buildFortressBuilding(rng, { maxW, maxH }) {
    return buildFloor(rng, KEEP_KINDS, KEEP_BUILDERS, EAVE, { maxW, maxH });
}

// --- 床の建物（狭い所: H） ---
const HUT_KINDS = {
    barracks: { minW: 24, minH: 16, maxW: 48 },
    commTower: { minW: 12, minH: 48, maxW: 16 },
    generator: { minW: 20, minH: 20, maxW: 32 },
    fence: { minW: 24, minH: 12, maxW: 64 },
};

/** 兵舎: 低い箱形、扉と小窓の並び、平らな屋根 */
function barracks(parts, rng, x, footW, maxH) {
    const h = step4(rng, 12, Math.min(20, maxH - 4));
    const wall = pick(rng, BODY.steel);
    rect(parts, x, -h, footW, h, wall, MAT_METAL, true);
    seams(parts, x, -h, footW, h, wall, 8);
    rect(parts, x + 4, -8, 6, 8, DETAIL.dark);   // 扉
    for (let wx = x + 14; wx + 4 <= x + footW - 2; wx += 8) rect(parts, wx, -h + 3, 4, 3, DETAIL.glass);
    rect(parts, x - 2, -h - 4, footW + 4, 4, shade(wall), MAT_METAL, true);   // 屋根
}

/** 通信アンテナの鉄塔: 細い2本の脚（すり抜ける）と横桟、先端に赤くない信号灯 */
function commTower(parts, rng, x, footW, maxH) {
    const h = step4(rng, 40, Math.min(64, maxH - 8));   // 先端のアンテナ 4 と信号灯 1 が上に載る
    const steel = pick(rng, BODY.steel);
    rect(parts, x, -h, 2, h, steel, MAT_METAL, false);
    rect(parts, x + footW - 2, -h, 2, h, steel, MAT_METAL, false);
    for (let y = -h + 4; y < 0; y += 6) rect(parts, x + 2, y, footW - 4, 1, DETAIL.rail);
    const mx = x + Math.floor(footW / 2) - 1;
    rect(parts, mx, -h - 4, 2, 4, steel, MAT_METAL, false);   // 先端のアンテナ
    rect(parts, mx, -h - 5, 2, 1, DETAIL.signal);
}

/** 発電・変電設備: 金属の箱、放熱の縦の筋、上に配管、警告の縞 */
function generator(parts, rng, x, footW, maxH) {
    const h = step4(rng, 12, Math.min(20, maxH - 8));
    const body = pick(rng, BODY.blueSteel);
    rect(parts, x, -h, footW, h, body, MAT_METAL, true);
    for (let vx = x + 2; vx + 1 <= x + footW - 2; vx += 3) rect(parts, vx, -h + 3, 1, h - 6, DETAIL.dark);
    hazardStripe(parts, x, -2, footW);
    const steel = pick(rng, BODY.steel);
    rect(parts, x + 2, -h - 4, 4, 4, steel, MAT_METAL, false);           // 配管の立ち上がり
    rect(parts, x + 2, -h - 4, footW - 4, 2, steel, MAT_METAL, false);   // 横の配管
}

/**
 * フェンス（ユーザーの追加）: 低く横に長い金網。支柱と上下の枠が鉄のかけら（細い部品＝弾は欠かして抜ける）、
 * 金網は描くだけ。外接矩形 = 足元（屋根の張り出しが無いので余白を取らない）
 */
function fence(parts, rng, x, footW, maxH) {
    // 高さ 16 は足元 32px 以上のときだけ（短いフェンスが縦長の柵に見えないよう、幅は高さの2倍以上）
    const h = Math.min(maxH - 4, footW >= 32 && rng.next() < 0.5 ? 16 : 12);
    const steel = pick(rng, BODY.steel);
    for (let px = x; px <= x + footW - 2; px += 8) rect(parts, px, -h, 2, h, steel, MAT_METAL, false);   // 支柱
    rect(parts, x, -h, footW, 1, steel, MAT_METAL, false);   // 上の枠
    rect(parts, x, -2, footW, 1, steel, MAT_METAL, false);   // 下の枠
    for (let my = -h + 3; my < -2; my += 3) rect(parts, x, my, footW, 1, DETAIL.mesh);   // 金網（横）
    for (let mx = x + 3; mx < x + footW; mx += 3) rect(parts, mx, -h + 1, 1, h - 3, DETAIL.mesh);   // 金網（縦）
}

const HUT_BUILDERS = { barracks, commTower, generator, fence };

/** 狭い所の床の建物。足りなければ null */
export function buildFortressHut(rng, { maxW, maxH }) {
    return buildFloor(rng, HUT_KINDS, HUT_BUILDERS, EAVE, { maxW, maxH });
}

/**
 * 床の建物を1つ作る。条件を満たす kind から選び、足元の幅を決めて積む。
 * フェンスは張り出しが無いので余白 0（外接矩形 = 足元）
 */
function buildFloor(rng, kinds, builders, eave, { maxW, maxH }) {
    const ok = Object.keys(kinds).filter((k) => kinds[k].minW <= maxW && kinds[k].minH <= maxH);
    if (ok.length === 0) return null;
    const kind = pick(rng, ok);
    const footW = step4(rng, kinds[kind].minW, Math.min(kinds[kind].maxW, maxW));
    const pad = kind === 'fence' ? 0 : eave;
    const parts = [];
    builders[kind](parts, rng, pad, footW, maxH);
    const n = normalizeUp(parts);
    return { kind, w: footW + pad * 2, h: n.h, footX: pad, footW, parts: n.parts };
}

// --- 壁 ---

/**
 * 壁の建物。壁の右側に張り付く向き（左の壁には generate が反転して付ける）。x 0〜4 が壁の岩に埋まる。
 * K: 監視所（壁から張り出した窓つきの箱）、H: 壁沿いの配管とケーブル
 */
export function buildFortressWall(style, rng, { maxReach }) {
    return style === 'K' ? watchPost(rng, maxReach) : wallPipes(rng, maxReach);
}

function watchPost(rng, maxReach) {
    if (maxReach - 12 < 16) return null;
    const footW = step4(rng, 16, Math.min(28, maxReach - 12));
    const parts = [];
    const x = 8;
    const legH = step4(rng, 8, 16);
    const steel = pick(rng, BODY.steel);
    rect(parts, 0, -4, 8, legH + 8, steel, MAT_METAL, false);   // 壁に打ち込んだ金具と柱
    rect(parts, 0, 0, x + footW + 2, 4, steel, MAT_METAL, false);   // 鉄の床板
    const n = Math.max(1, Math.floor((x + footW - 8) / 2));
    for (let i = 0; i < n; i++) rect(parts, 6 + i * 2, 4 + Math.round((legH - 4) * (1 - (i + 1) / (n + 1))), 2, 1, DETAIL.rail);
    const h = step4(rng, 12, 16);
    const wall = pick(rng, BODY.blueSteel);
    rect(parts, x, -h, footW, h, wall, MAT_METAL, true);
    rect(parts, x + 2, -h + 3, footW - 4, 4, DETAIL.glass);
    rect(parts, x - 2, -h - 4, footW + 4, 4, steel, MAT_METAL, true);   // 屋根
    if (rng.next() < 0.5) rect(parts, x + footW - 4, -h - 6, 3, 2, DETAIL.signal);
    const nn = normalizeUp(parts);
    return { kind: 'watchPost', w: x + footW + EAVE, h: nn.h, parts: nn.parts };
}

function wallPipes(rng, maxReach) {
    if (maxReach < 12) return null;
    const parts = [];
    const h = step4(rng, 16, 40);
    const steel = pick(rng, BODY.steel);
    // 壁から出る支持金具（埋まる 4px）と、縦の配管2本・ケーブルの束
    for (let y = 0; y < h; y += 12) rect(parts, 0, y, 8, 2, steel, MAT_METAL, false);
    rect(parts, 4, 0, 4, h, steel, MAT_METAL, true);
    rect(parts, 5, 0, 1, h, DETAIL.rail);
    rect(parts, 9, 0, 3, h, pick(rng, BODY.blueSteel), MAT_METAL, true);
    rect(parts, 4, Math.floor(h / 2 / 4) * 4, 8, 2, DETAIL.hazard);   // 配管の帯（識別の色）
    return { kind: 'wallPipes', w: 12, h, parts };
}

// --- 天井 ---

/**
 * 天井から下がるもの。上端 4px が天井の岩に埋まる。
 * 照明（暗い琥珀）、監視カメラ（棒の先の箱とレンズ）、ダクト（横に長い角管）
 */
export function buildFortressCeiling(style, rng, { room, maxHang }) {
    const roll = rng.next();
    // ダクトは吊り金具 4〜8 ＋ 角管 6 ＋ 埋まる 4。天井が低い所は照明かカメラにする
    if (roll < 0.35 && room >= 24 && maxHang >= 14) return duct(rng, { room, maxHang });
    if (roll < 0.7 && maxHang >= 16) return camera(rng, { maxHang });
    return lamp(rng, { maxHang });
}

function lamp(rng, { maxHang }) {
    const len = step4(rng, 4, Math.max(4, Math.min(24, maxHang - 8)));
    const parts = [];
    rect(parts, 2, 0, 4, len, null, MAT_METAL, false);
    rect(parts, 3, 0, 1, len, DETAIL.rail);
    rect(parts, 0, len, 8, 4, pick(rng, BODY.steel), MAT_METAL, false);   // 傘
    rect(parts, 2, len + 3, 4, 1, DETAIL.lamp);
    return { kind: 'lamp', w: 8, h: len + 4, parts };
}

function camera(rng, { maxHang }) {
    const len = step4(rng, 4, Math.max(4, Math.min(16, maxHang - 12)));
    const parts = [];
    const steel = pick(rng, BODY.steel);
    rect(parts, 4, 0, 2, len + 4, steel, MAT_METAL, false);   // 支柱（上 4px は天井の中）
    rect(parts, 0, len + 4, 10, 6, steel, MAT_METAL, true);   // カメラの箱
    const face = rng.next() < 0.5;
    rect(parts, face ? 0 : 8, len + 6, 2, 2, DETAIL.glass);   // レンズ
    rect(parts, face ? 8 : 0, len + 5, 1, 1, DETAIL.signal);  // 作動灯
    return { kind: 'camera', w: 10, h: len + 10, parts };
}

function duct(rng, { room, maxHang }) {
    const w = step4(rng, 24, Math.min(64, room));
    const drop = step4(rng, 4, Math.max(4, Math.min(8, maxHang - 10)));   // 角管 6 と埋まる 4 を引いた残り
    const parts = [];
    const steel = pick(rng, BODY.steel);
    for (const hx of [2, w - 4]) rect(parts, hx, 0, 2, drop + 4, steel, MAT_METAL, false);   // 吊り金具
    rect(parts, 0, drop + 4, w, 6, steel, MAT_METAL, true);   // 角管
    rect(parts, 0, drop + 4, w, 1, DETAIL.rail);
    for (let jx = 8; jx < w - 2; jx += 12) rect(parts, jx, drop + 4, 1, 6, shade(steel));   // 継ぎ目
    return { kind: 'duct', w, h: drop + 10, parts };
}
