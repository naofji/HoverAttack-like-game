// ============================================
// militaryBase - 6面の基地（B）
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-07-stage6-factory-design.md（1章）
// 天井の高い広い所に多く建つ系統（themes.js の FACTORY_THEME の wide）。
// 倉庫・格納庫・監視塔・レーダー・工場棟（ユーザーの参考画像4の白い大きな棟）、壁の制御室、天井クレーン、照明。
// 壁はコンクリート（燃えにくい。瓦礫は灰色）、骨組み・屋根・機械は金属（燃えない。撃たれると縁が赤く焼ける）。
// 木は使わない（spec 2章）。形の数値は描画専用のパラメータなのでここに置く（Constants.js ではない）。
// 床の建物は mining.js と同じく「下端 = y 0、上へ y を負に」積んでから normalizeUp で下げる。
// 7面の基地（fortressBase.js）と同じ形の部品（継ぎ目・窓の帯・縞・格納庫・レーダー・壁の足場・照明・床の建物の組み立て）は
// baseParts.js にあり、ここからは6面の色を渡すだけ（形を変えると7面も変わる）。

import { MAT_METAL, MAT_CONCRETE } from './chunks.js';
import { rectWithLoose, step4, pick, normalizeUp } from './shapes.js';
import { FACTORY_COLORS as BODY, FACTORY_DETAIL_COLORS as DETAIL, shade } from './palette.js';
import * as P from './baseParts.js';

// 部品を積む。描くだけの部品は、かけらにするとき木ではなく鉄にする（6面は木を使わない。手すり・筋交いが燃えないように）
const rect = rectWithLoose(MAT_METAL);

// 屋根の張り出し・手すりが本体の外へ出るぶんの余白（外接矩形の左右）
const EAVE = 4;

// 共通の絵の部品（baseParts.js）に6面の色を渡す
const { seams } = P;
const windowBand = (parts, rng, x, y, w) => P.windowBand(parts, rng, x, y, w, DETAIL.glass, 0.8);
const hazardStripe = (parts, x, y, w) => P.hazardStripe(parts, x, y, w, DETAIL);

// --- 床の建物 ---
// 各 kind の「建てられる最小の幅・高さ」。足りなければ候補から外す（step4 は hi < lo で lo を返すので先に弾く）。
// maxW は幅の上限（足元）。工場棟と格納庫は広く、塔は細く
const FLOOR_KINDS = {
    warehouse: { minW: 24, minH: 24, maxW: 56 },
    hangar: { minW: 32, minH: 28, maxW: 64 },
    watchtower: { minW: 16, minH: 48, maxW: 24 },
    radar: { minW: 16, minH: 44, maxW: 24 },   // 小屋 8 + 柱 12〜 + 皿 16 + 腕 4 + 床に埋まる分
    factoryHall: { minW: 32, minH: 40, maxW: 64 },
};

/** 倉庫: 平たいコンクリートの箱、波板の屋根、シャッター、屋上の換気口 */
function warehouse(parts, rng, x, footW, maxH) {
    const h = step4(rng, 16, Math.min(32, maxH - 8));
    const wall = pick(rng, BODY.concrete);
    rect(parts, x, -h, footW, h, wall, MAT_CONCRETE, true);
    seams(parts, x, -h, footW, h, wall, 8);
    // シャッター（1〜2枚）。下端まで届く暗い四角に横の筋
    const nShutter = footW >= 40 && rng.next() < 0.5 ? 2 : 1;
    const sw = step4(rng, 8, Math.min(16, footW / 2 - 4));
    for (let k = 0; k < nShutter; k++) {
        const sx = x + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((footW - sw - 8) / 4) + 1));
        const sh = Math.min(12, h - 4);
        rect(parts, sx, -sh, sw, sh, DETAIL.dark);
        for (let ly = -sh + 2; ly < 0; ly += 3) rect(parts, sx, ly, sw, 1, DETAIL.rail);
    }
    if (h >= 20) windowBand(parts, rng, x, -h + 3, footW);
    const roof = pick(rng, BODY.steel);
    rect(parts, x - 2, -h - 4, footW + 4, 4, roof, MAT_METAL, true);
    if (rng.next() < 0.6 && -(-h - 8) <= maxH) {   // 屋上の換気口（細い金属）
        const vx = x + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((footW - 12) / 4)));
        rect(parts, vx, -h - 8, 8, 4, roof, MAT_METAL, false);
        rect(parts, vx + 1, -h - 7, 6, 1, DETAIL.dark);
    }
}

/** 格納庫: かまぼこ屋根と大きな扉（baseParts.js）。6面だけ入口の灯りが付く */
function hangar(parts, rng, x, footW, maxH) {
    const { wallH } = P.hangar(parts, rng, x, footW, maxH, BODY.steel, DETAIL);
    if (rng.next() < 0.5) rect(parts, x + 2, -wallH + 2, 4, 3, DETAIL.lamp);   // 入口の灯り
}

/** 監視塔: 細い鉄骨の脚（すり抜ける）＋上の見張り小屋（厚い壁）、手すり、梯子 */
function watchtower(parts, rng, x, footW, maxH) {
    const cabinH = step4(rng, 12, 16);
    const legH = step4(rng, 24, Math.min(56, maxH - cabinH - 8));
    const steel = pick(rng, BODY.steel);
    for (const px of [x, x + footW - 4]) {
        rect(parts, px, -legH, 4, legH, steel, MAT_METAL, false);
        rect(parts, px + 1, -legH, 1, legH, DETAIL.rail);
    }
    // 筋交い（X の段）
    for (let y = -legH + 4; y < -4; y += 8) {
        for (let i = 0; i * 2 < footW - 8; i += 1) {
            const t = (i * 2) / Math.max(1, footW - 8);
            rect(parts, x + 4 + i * 2, y + Math.round(t * 6), 2, 1, DETAIL.rail);
        }
    }
    if (rng.next() < 0.6) {   // 梯子（描くだけ）
        const lx = x + Math.floor(footW / 8) * 4;
        rect(parts, lx, -legH, 1, legH, DETAIL.rail);
        rect(parts, lx + 3, -legH, 1, legH, DETAIL.rail);
        for (let ly = -legH + 2; ly < 0; ly += 4) rect(parts, lx, ly, 4, 1, DETAIL.rail);
    }
    // 小屋は脚より左右に 4px 張り出す（EAVE の余白）
    const wall = pick(rng, [...BODY.steel, ...BODY.blueSteel]);
    const cy = -legH - cabinH;
    rect(parts, x - 4, -legH, footW + 8, 4, steel, MAT_METAL, true);           // 床
    rect(parts, x - 2, cy, footW + 4, cabinH - 4, wall, MAT_METAL, true);       // 壁
    rect(parts, x, cy + 3, footW, 4, DETAIL.glass);                             // 見張りの窓
    rect(parts, x - 4, cy - 4, footW + 8, 4, steel, MAT_METAL, true);          // 屋根
    if (rng.next() < 0.5) rect(parts, x + footW / 2 - 2, cy - 8, 4, 4, DETAIL.lamp, MAT_METAL, false);   // 探照灯
}

/** レーダー: 鉄骨の台（すり抜ける）＋皿形のアンテナ（段で斜めに見せる、厚い金属） */
function radar(parts, rng, x, footW, maxH) {
    const standH = step4(rng, 12, Math.min(24, maxH - 32));
    const steel = pick(rng, BODY.steel);
    // 台の小屋（コンクリートの小さな箱）
    const hutH = 8;
    rect(parts, x, -hutH, footW, hutH, pick(rng, BODY.concrete), MAT_CONCRETE, true);
    rect(parts, x + 2, -hutH + 2, 4, 3, DETAIL.glass);
    // 柱と皿（皿は鋼か青い鋼）
    P.radarMastAndDish(parts, rng, x, footW, {
        hutH, standH, eave: EAVE, steel, paints: [...BODY.steel, ...BODY.blueSteel], detail: DETAIL,
    });
}

/** 工場棟: 大きなコンクリートの棟、窓の帯、屋上の煙突・ダクト、脇の鉄骨の塔 */
function factoryHall(parts, rng, x, footW, maxH) {
    const stackRoom = 12;
    const h = step4(rng, 24, Math.min(56, maxH - stackRoom));
    const wall = pick(rng, BODY.concrete);
    rect(parts, x, -h, footW, h, wall, MAT_CONCRETE, true);
    seams(parts, x, -h, footW, h, wall, 16);
    for (let y = -h + 4; y < -8; y += 12) windowBand(parts, rng, x, y, footW);
    // 入口（庇つき）
    const ex = x + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((footW - 16) / 4)));
    rect(parts, ex, -8, 8, 8, DETAIL.dark);
    rect(parts, ex - 2, -10, 12, 2, pick(rng, BODY.steel), MAT_METAL, false);
    // 屋上の段（機械室）と煙突
    const steel = pick(rng, BODY.steel);
    if (footW >= 40 && rng.next() < 0.6) {
        const rw = step4(rng, 12, footW / 2);
        rect(parts, x + footW - rw - 4, -h - 4, rw, 4, wall, MAT_CONCRETE, true);
    }
    const nStack = 1 + Math.floor(rng.next() * Math.min(3, footW / 16));
    for (let k = 0; k < nStack; k++) {
        const sx = x + 4 + k * 12;
        if (sx + 4 > x + footW) break;
        const sh = step4(rng, 8, Math.min(12, maxH - h));
        rect(parts, sx, -h - sh, 4, sh, steel, MAT_METAL, false);
        rect(parts, sx, -h - sh, 4, 1, DETAIL.rail);
    }
    // 脇の鉄骨の塔（本体の端の内側。すり抜ける）
    if (rng.next() < 0.4) {
        const tx = x + footW - 8;
        const th = Math.min(h + 8, maxH);
        rect(parts, tx, -th, 4, th, steel, MAT_METAL, false);
        for (let y = -th + 2; y < 0; y += 6) rect(parts, tx, y, 4, 1, DETAIL.rail);
    }
}

const FLOOR_BUILDERS = { warehouse, hangar, watchtower, radar, factoryHall };

export function buildBaseBuilding(rng, { maxW, maxH }) {
    return P.buildFloor(rng, FLOOR_KINDS, FLOOR_BUILDERS, EAVE, { maxW, maxH });
}

/**
 * 壁の足場に載った制御室。壁の右側に張り付く向き（左の壁には generate が反転して付ける）。
 * x 0〜4 は壁の岩に埋まる（3面の buildScaffoldShack と同じ形の金属版）
 */
export function buildControlRoom(rng, { maxReach }) {
    if (maxReach - 12 < 16) return null;
    const footW = step4(rng, 16, Math.min(28, maxReach - 12));
    const parts = [];
    const x = 8;
    const legH = step4(rng, 8, 20);
    const steel = pick(rng, BODY.steel);
    P.wallBracket(parts, x, footW, legH, steel, DETAIL);
    const h = step4(rng, 12, 16);
    const wall = pick(rng, [...BODY.steel, ...BODY.blueSteel, ...BODY.concrete]);
    const mat = BODY.concrete.includes(wall) ? MAT_CONCRETE : MAT_METAL;
    rect(parts, x, -h, footW, h, wall, mat, true);
    rect(parts, x + 2, -h + 3, footW - 4, 4, DETAIL.glass);   // 横長の窓
    rect(parts, x - 2, -h - 4, footW + 4, 4, steel, MAT_METAL, true);   // 屋根
    rect(parts, x + footW + 1, -h - 8, 1, 4, DETAIL.rail);   // アンテナ
    if (rng.next() < 0.5) rect(parts, x + footW - 4, -h - 7, 3, 3, DETAIL.lamp);
    const nn = normalizeUp(parts);
    return { kind: 'controlRoom', w: x + footW + EAVE, h: nn.h, parts: nn.parts };
}

/**
 * 天井クレーン。天井に埋めた桁（幅 = span）から、台車・ワイヤー・フックが下がる。荷を吊ったものもある。
 * 桁の上端 4px が天井の岩に埋まる（支えのかけら）。
 * 最初は桁 8px（見えるのは 4px）・ワイヤー 4px〜で作ったが、PNG で見ると天井の縁の細い線と小さな点にしか見えず
 * クレーンと読めなかった。桁を 12px（見える 8px）にして両端に車輪の箱、ワイヤーは 12px〜、荷は大きめに
 */
const CRANE_TOP = 16;   // 桁 12 + 台車 4
const CRANE_HOOK = 6;   // フックの台 4 + 爪 2
export function buildCrane(rng, { span, maxHang }) {
    if (maxHang < CRANE_TOP + 12 + CRANE_HOOK) return null;
    const parts = [];
    const paint = pick(rng, BODY.paint);
    const steel = pick(rng, BODY.steel);
    rect(parts, 0, 0, span, 12, paint, MAT_METAL, true);   // 桁（上 4px は天井の中）
    rect(parts, 0, 4, span, 1, shade(paint));
    hazardStripe(parts, 0, 10, span);
    rect(parts, 0, 4, 4, 8, steel, MAT_METAL, true);          // 両端の車輪の箱
    rect(parts, span - 4, 4, 4, 8, steel, MAT_METAL, true);
    const tx = step4(rng, 8, span - 20);                       // 台車
    rect(parts, tx, 12, 12, 4, steel, MAT_METAL, true);
    // 荷はコンテナ 12 / 鉄骨 4 / 無し。天井が低ければ収まる荷だけにする
    const loadRoll = rng.next();
    let loadH = loadRoll < 0.5 ? 12 : loadRoll < 0.75 ? 4 : 0;
    if (CRANE_TOP + 12 + CRANE_HOOK + loadH > maxHang) loadH = CRANE_TOP + 12 + CRANE_HOOK + 4 <= maxHang ? 4 : 0;
    const wire = step4(rng, 12, Math.max(12, Math.min(56, maxHang - CRANE_TOP - CRANE_HOOK - loadH)));
    const wx = tx + 4;
    rect(parts, wx, CRANE_TOP, 4, wire, null, MAT_METAL, false);   // ワイヤー（細い部品。かけらだけ）
    rect(parts, wx + 1, CRANE_TOP, 1, wire, DETAIL.rail);
    rect(parts, wx + 2, CRANE_TOP, 1, wire, DETAIL.rail);
    const hy = CRANE_TOP + wire;
    rect(parts, wx - 2, hy, 8, 4, paint, MAT_METAL, false);   // フックの台
    rect(parts, wx + 1, hy + 4, 2, 2, DETAIL.rail);            // 爪
    // 荷の矩形（heavy）。落ちて機体に当たるとダメージ（Town の _detach が、落ちる塊に荷のかけらが入っているかで見る）
    let heavy;
    if (loadH === 12) {   // コンテナ（波板の筋）
        const cw = Math.min(32, span - 8);
        const cx = Math.max(0, Math.min(span - cw, wx + 2 - cw / 2));
        const col = pick(rng, [...BODY.blueSteel, ...BODY.paint, ...BODY.steel]);
        rect(parts, cx, hy + CRANE_HOOK, cw, 12, col, MAT_METAL, true);
        seams(parts, cx, hy + CRANE_HOOK, cw, 12, col, 4);
        heavy = { kind: 'container', x: cx, y: hy + CRANE_HOOK, w: cw, h: 12 };
    } else if (loadH === 4) {   // 鉄骨（H 形の筋）
        const bw = Math.min(40, span - 8);
        const bx = Math.max(0, Math.min(span - bw, wx + 2 - bw / 2));
        rect(parts, bx, hy + CRANE_HOOK, bw, 4, steel, MAT_METAL, true);
        rect(parts, bx, hy + CRANE_HOOK + 1, bw, 2, DETAIL.dark);
        heavy = { kind: 'beam', x: bx, y: hy + CRANE_HOOK, w: bw, h: 4 };
    }
    return { kind: 'crane', w: span, h: hy + CRANE_HOOK + loadH, parts, ...(heavy ? { heavy } : {}) };
}

/** 工場の照明。天井から下がる棒（上端 4px が天井）と傘、暗い琥珀の灯り */
export function buildFactoryLamp(rng, { maxHang }) {
    return P.hangingLamp(rng, maxHang, 32, BODY.steel, DETAIL);
}
