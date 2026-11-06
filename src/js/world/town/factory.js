// ============================================
// factory - 6面の工場（P）
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-07-stage6-factory-design.md（1章）
// 天井の低い狭い所に多く建つ系統（themes.js の FACTORY_THEME の narrow）。
// 工作機械（ロボットアーム・プレス機・ボール盤・コンベア・コンプレッサー）と化学工場の縦型タンク、
// 壁を這う配管、天井の配管の束、爆発物（化学タンク・ガスボンベの束・ドラム缶）。
// ユーザーの参考画像（工作機械のアイコン集、黄色と灰色の機械、黄色いロボットアームとコンベア）から取った。
// 機械はすべて金属（燃えない。撃たれると縁が赤く焼ける）。本体は厚い壁、腕・脚・配管は細い部品（すり抜ける）。
// 形の数値は描画専用のパラメータなのでここに置く。床のものは「下端 = y 0、上へ y を負に」積んで normalizeUp。

import { MAT_METAL, MAT_EXPLOSIVE } from './chunks.js';
import { rectWithLoose, step4, pick, normalizeUp } from './shapes.js';
import { FACTORY_COLORS as BODY, FACTORY_DETAIL_COLORS as DETAIL, TOWN_EXPLOSIVE_COLORS, shade } from './palette.js';

// 描くだけの部品も鉄として数える（militaryBase.js と同じ理由）
const rect = rectWithLoose(MAT_METAL);
const EAVE = 4;

/** 横の配管 1 本（細い部品）。4px の太さに明るい筋 */
function pipeH(parts, x, y, w, color) {
    rect(parts, x, y, w, 4, color, MAT_METAL, false);
    rect(parts, x, y + 1, w, 1, DETAIL.rail);
}
/** 縦の配管 1 本（細い部品） */
function pipeV(parts, x, y, h, color) {
    rect(parts, x, y, 4, h, color, MAT_METAL, false);
    rect(parts, x + 1, y, 1, h, DETAIL.rail);
}

/** ロボットアーム: 台座＋旋回台＋関節で折れた腕（4px の段で斜め）＋つかみ手 */
function robotArm(parts, rng, x, footW, maxH) {
    const paint = pick(rng, BODY.paint);
    const steel = pick(rng, BODY.steel);
    rect(parts, x, -4, footW, 4, steel, MAT_METAL, true);                 // 台座
    const cx = x + Math.floor((footW - 8) / 8) * 4;
    rect(parts, cx, -12, 8, 8, paint, MAT_METAL, true);                   // 旋回台
    rect(parts, cx + 6, -12, 2, 8, shade(paint));
    // 腕1: 上へ斜めに。腕2: 先へ水平〜下向き。向きは左右どちらか
    const dir = rng.next() < 0.5 ? -1 : 1;
    const up = Math.min(3 + Math.floor(rng.next() * 3), Math.floor((maxH - 20) / 4));
    let ax = cx + 2;
    let ay = -12;
    const xMin = x - EAVE;
    const xMax = x + footW + EAVE - 4;
    for (let i = 0; i < up; i++) {
        ay -= 4;
        ax = Math.max(xMin, Math.min(xMax, ax + dir * 2));
        rect(parts, ax, ay, 4, 4, paint, MAT_METAL, false);
    }
    rect(parts, ax, ay - 4, 4, 4, steel, MAT_METAL, false);               // 肘
    const reach = 1 + Math.floor(rng.next() * 3);
    let fy = ay - 4;
    for (let i = 0; i < reach; i++) {
        ax = Math.max(xMin, Math.min(xMax, ax + dir * 4));
        if (rng.next() < 0.4) fy += 4;
        rect(parts, ax, fy, 4, 4, paint, MAT_METAL, false);
    }
    rect(parts, ax, fy + 4, 1, 4, DETAIL.rail);                           // つかみ手
    rect(parts, ax + 3, fy + 4, 1, 4, DETAIL.rail);
}

/** プレス機: 門形の枠、上の台（シリンダー）、ラム、下の台 */
function press(parts, rng, x, footW, maxH) {
    const h = step4(rng, 24, Math.min(48, maxH - 4));
    const frame = pick(rng, [...BODY.paint, ...BODY.blueSteel]);
    rect(parts, x, -8, footW, 8, frame, MAT_METAL, true);                 // 下の台
    rect(parts, x, -h, 4, h - 8, frame, MAT_METAL, true);                 // 左右の柱
    rect(parts, x + footW - 4, -h, 4, h - 8, frame, MAT_METAL, true);
    rect(parts, x, -h, footW, 8, frame, MAT_METAL, true);                 // 上の梁
    rect(parts, x + footW - 2, -h, 2, h, shade(frame));
    const rw = Math.max(4, footW - 16);
    const rx = x + Math.floor((footW - rw) / 8) * 4;
    const ramH = step4(rng, 4, Math.max(4, h - 24));
    rect(parts, rx, -h + 8, rw, ramH, pick(rng, BODY.steel), MAT_METAL, false);   // ラム
    rect(parts, rx, -12, rw, 4, DETAIL.rail, MAT_METAL, false);           // 金型
    rect(parts, x + 4, -h - 4, Math.min(8, footW - 8), 4, pick(rng, BODY.steel), MAT_METAL, false);   // シリンダー
    hazardStripe(parts, x + 4, -10, footW - 8);
}

/** ボール盤: 細い柱、上の頭、手前の台、レバー */
function drillPress(parts, rng, x, footW, maxH) {
    const h = step4(rng, 24, Math.min(40, maxH - 4));
    const body = pick(rng, [...BODY.steel, ...BODY.blueSteel]);
    rect(parts, x, -4, footW, 4, body, MAT_METAL, true);                   // 脚の台
    rect(parts, x + 4, -h, 4, h - 4, pick(rng, BODY.steel), MAT_METAL, false);   // 柱
    rect(parts, x, -h, footW, 8, body, MAT_METAL, true);                  // 頭
    rect(parts, x + footW - 4, -h + 2, 4, 1, DETAIL.rail);
    rect(parts, x + footW - 6, -h + 8, 2, 4, DETAIL.rail);                // 主軸
    rect(parts, x + 4, -Math.floor(h / 2), footW - 4, 4, body, MAT_METAL, false);   // 台
    if (rng.next() < 0.6) rect(parts, Math.min(x + footW + 2, x + footW + EAVE - 2), -h + 2, 2, 6, DETAIL.rail);   // レバー
}

/** コンベア: 脚の付いたベルト、上に箱（描くだけ） */
function conveyor(parts, rng, x, footW, maxH) {
    const legH = step4(rng, 8, Math.min(12, maxH - 12));
    const frame = pick(rng, BODY.steel);
    for (let lx = x; lx <= x + footW - 4; lx += Math.max(12, Math.floor(footW / 12) * 4)) {
        rect(parts, lx, -legH, 4, legH, frame, MAT_METAL, false);
    }
    rect(parts, x + footW - 4, -legH, 4, legH, frame, MAT_METAL, false);
    rect(parts, x, -legH - 4, footW, 4, DETAIL.dark, MAT_METAL, true);     // ベルト
    for (let px = x + 1; px < x + footW; px += 3) rect(parts, px, -legH - 4, 1, 1, DETAIL.rail);
    rect(parts, x - 2, -legH - 4, 2, 4, frame);                           // 両端のローラー
    rect(parts, x + footW, -legH - 4, 2, 4, frame);
    const nBox = Math.floor(rng.next() * Math.floor(footW / 12));
    for (let k = 0; k < nBox; k++) {
        const bx = x + 2 + k * 12;
        rect(parts, bx, -legH - 8, 8, 4, pick(rng, BODY.paint));
    }
    if (rng.next() < 0.5) {   // 操作盤
        rect(parts, x + footW - 8, -legH - 4 - 8, 4, 8, frame, MAT_METAL, false);
        rect(parts, x + footW - 7, -legH - 11, 2, 2, DETAIL.gauge);
    }
}

/** コンプレッサー／発電機: 横長の箱（または横置きタンク）、モーター、圧力計、排気管 */
function compressor(parts, rng, x, footW, maxH) {
    const h = step4(rng, 12, Math.min(20, maxH - 8));
    const body = pick(rng, [...BODY.blueSteel, ...BODY.paint]);
    const tank = rng.next() < 0.5;
    if (tank) {   // 横置きタンク（肩を詰めて丸く）と車輪
        rect(parts, x + 2, -h, footW - 4, 4, body, MAT_METAL, true);
        rect(parts, x, -h + 4, footW, h - 8, body, MAT_METAL, true);
        rect(parts, x + 2, -4, footW - 4, 4, body, MAT_METAL, true);
        rect(parts, x + 4, -h + 5, footW - 8, 1, shade(body));
    } else {      // 発電機の箱。通気口の筋
        rect(parts, x, -h, footW, h, body, MAT_METAL, true);
        for (let px = x + 4; px < x + footW - 8; px += 3) rect(parts, px, -h + 4, 1, h - 8, shade(body));
    }
    const mw = 8;
    rect(parts, x + footW - mw - 2, -h - 8, mw, 8, pick(rng, BODY.steel), MAT_METAL, true);   // モーター
    rect(parts, x + 2, -h - 4, 4, 4, DETAIL.gauge, MAT_METAL, false);   // 圧力計
    rect(parts, x + 3, -h - 3, 2, 2, DETAIL.dark);
    if (rng.next() < 0.5 && h + 12 <= maxH) pipeV(parts, x + 8, -h - 12, 12, pick(rng, BODY.steel));   // 排気管
}

/** 縦型タンク（化学工場）: 脚の上の円筒（肩を細くして丸く）、上の口から絡み合う配管 */
function chemTank(parts, rng, x, footW, maxH) {
    const legH = step4(rng, 4, 8);
    const pipeRoom = 8;
    const bodyH = step4(rng, 16, Math.min(40, maxH - legH - pipeRoom - 4));
    const steel = pick(rng, BODY.steel);
    for (const lx of [x, x + footW - 4]) rect(parts, lx, -legH, 4, legH, steel, MAT_METAL, false);
    const top = -legH - bodyH;
    rect(parts, x + 2, top, footW - 4, 4, steel, MAT_METAL, true);
    rect(parts, x, top + 4, footW, bodyH - 8, steel, MAT_METAL, true);
    rect(parts, x + 2, -legH - 4, footW - 4, 4, steel, MAT_METAL, true);
    rect(parts, x + footW - 4, top + 4, 2, bodyH - 8, shade(steel));
    for (let y = top + 8; y < -legH - 8; y += 8) rect(parts, x, y, footW, 1, DETAIL.rail);   // 帯
    rect(parts, x + 4, top + 6, 4, 4, DETAIL.gauge);                        // のぞき窓
    // 配管: 上の口から上へ出て、左右へ折れ、外接矩形の端で下りる（隣のタンクへつながって見える）
    const pc = pick(rng, [...BODY.steel, ...BODY.paint]);
    const px = x + Math.floor(footW / 8) * 4;
    pipeV(parts, px, top - pipeRoom, pipeRoom, pc);
    const right = rng.next() < 0.5;
    const ex = right ? x + footW + EAVE - 4 : x - EAVE;
    const hx = Math.min(px, ex);
    pipeH(parts, hx, top - pipeRoom, Math.abs(ex - px) + 4, pc);
    const downH = Math.min(-top + pipeRoom - 4, step4(rng, 12, bodyH));
    pipeV(parts, ex, top - pipeRoom + 4, downH, pc);
    rect(parts, ex, top - pipeRoom + 4 + Math.floor(downH / 8) * 4, 4, 2, DETAIL.hazard);   // バルブ（配管の太さの中。外接矩形の端に配管がある）
}

/** 黄黒の警告の縞（描くだけ） */
function hazardStripe(parts, x, y, w) {
    rect(parts, x, y, w, 2, DETAIL.dark);
    for (let px = x; px < x + w; px += 4) rect(parts, px, y, 2, 2, DETAIL.hazard);
}

// 各 kind の足元の幅の範囲と、建てられる最小の高さ
const MACHINES = {
    robotArm: { minW: 16, maxW: 28, minH: 32, build: robotArm },
    press: { minW: 20, maxW: 36, minH: 28, build: press },
    drillPress: { minW: 16, maxW: 20, minH: 28, build: drillPress },
    conveyor: { minW: 32, maxW: 48, minH: 24, build: conveyor },
    compressor: { minW: 24, maxW: 40, minH: 28, build: compressor },
    chemTank: { minW: 16, maxW: 28, minH: 40, build: chemTank },
};

export function buildMachine(rng, { maxW, maxH }) {
    const ok = Object.keys(MACHINES).filter((k) => MACHINES[k].minW <= maxW && MACHINES[k].minH <= maxH);
    if (ok.length === 0) return null;
    const kind = pick(rng, ok);
    const m = MACHINES[kind];
    const footW = step4(rng, m.minW, Math.min(m.maxW, maxW));
    const parts = [];
    m.build(parts, rng, EAVE, footW, maxH);
    const n = normalizeUp(parts);
    return { kind, w: footW + EAVE * 2, h: n.h, footX: EAVE, footW, parts: n.parts };
}

/**
 * 壁を這う配管とバルブ。壁の右側に張り付く向き（左の壁には generate が反転して付ける）。
 * x 0〜4 が壁の岩に埋まる金具。全部細い部品（弾はすり抜けて欠けるだけ）
 */
export function buildWallPipes(rng, { maxReach }) {
    if (maxReach < 16) return null;
    const parts = [];
    const reach = step4(rng, 12, Math.min(32, maxReach - 4));
    const pc = pick(rng, [...BODY.steel, ...BODY.blueSteel, ...BODY.paint]);
    const runs = 1 + Math.floor(rng.next() * 3);
    let y = 0;
    let bottom = 0;
    for (let k = 0; k < runs; k++) {
        rect(parts, 0, y, 8, 4, pick(rng, BODY.steel), MAT_METAL, false);   // 壁の金具
        const len = step4(rng, 8, reach);
        pipeH(parts, 4, y, len, pc);
        // 先で下へ折れる配管（ときどき）
        if (rng.next() < 0.5) {
            const drop = step4(rng, 8, 20);
            pipeV(parts, len, y, drop, pc);
            rect(parts, len, y + Math.floor(drop / 8) * 4, 4, 2, DETAIL.hazard);   // バルブ（下りる配管の中ほど）
            bottom = Math.max(bottom, y + drop);
        }
        bottom = Math.max(bottom, y + 4);
        y += step4(rng, 8, 12);
    }
    let w = 0;
    for (const p of parts) w = Math.max(w, p.x + p.w);
    return { kind: 'wallPipes', w, h: bottom, parts };
}

/**
 * 天井の配管の束。吊り金具（上端 4px が天井）から横の配管が何本も下がり、ところどころで上下に折れて絡み合う。
 * room は右の天井の残り（px）
 */
export function buildPipeBundle(rng, { room, maxHang }) {
    if (maxHang < 16 || room < 16) return null;
    const parts = [];
    const w = step4(rng, 16, Math.min(96, room));
    const hangers = [];
    for (let hx = 0; hx + 4 <= w; hx += Math.max(16, Math.floor(w / 3 / 4) * 4)) hangers.push(hx);
    const nPipes = 1 + Math.floor(rng.next() * Math.min(3, Math.floor((maxHang - 8) / 6)));
    const colors = [...BODY.steel, ...BODY.blueSteel, ...BODY.paint];
    let y = 8;
    let bottom = 8;
    for (let k = 0; k < nPipes; k++) {
        const pc = pick(rng, colors);
        // 1 本の配管は途中で 4px 上下に折れる（絡み合って見える）
        const bend = w >= 32 && rng.next() < 0.6 ? step4(rng, 8, w - 12) : -1;
        const dy = rng.next() < 0.5 ? 4 : -4;
        if (bend < 0 || y + dy < 4 || y + dy + 4 > maxHang) {
            pipeH(parts, 0, y, w, pc);
        } else {
            pipeH(parts, 0, y, bend + 4, pc);
            pipeV(parts, bend, Math.min(y, y + dy), 8, pc);
            pipeH(parts, bend, y + dy, w - bend, pc);
            bottom = Math.max(bottom, y + dy + 4);
        }
        bottom = Math.max(bottom, y + 4);
        y += 6;
        if (y + 4 > maxHang) break;
    }
    const steel = pick(rng, BODY.steel);
    for (const hx of hangers) rect(parts, hx, 0, 2, bottom, steel, MAT_METAL, false);   // 吊り金具（天井に埋まる）
    return { kind: 'pipeBundle', w, h: bottom, parts };
}

// 爆発物。どの部品も材料は爆発物・厚い壁（3面と同じく「1棟まるごと爆発物」で、建物単位で爆発を決める）。
// 下の 4px は床の岩に埋まる（TOWN_FOUNDATION_SINK）。先に外接矩形ぜんぶを爆発物で埋めてから描き込む
// （描き込みが空のかけらに掛かって鉄のかけらになると、爆発物の建物に爆発しない部分が残る）
const EXPLOSIVE_KINDS = ['chemTank', 'gasRack', 'drum'];

export function buildFactoryExplosive(rng) {
    const C = TOWN_EXPLOSIVE_COLORS;
    const kind = pick(rng, EXPLOSIVE_KINDS);
    const parts = [];
    if (kind === 'chemTank') {   // 横置きの小型化学タンク 16x16（見えるのは 16x12）。肩を詰めて丸く、警告の帯
        rect(parts, 0, 0, 16, 16, null, MAT_EXPLOSIVE, true);
        rect(parts, 2, 0, 12, 2, C.chemTank);
        rect(parts, 0, 2, 16, 10, C.chemTank);
        rect(parts, 2, 12, 12, 4, DETAIL.dark);   // 台
        rect(parts, 0, 6, 16, 2, C.chemBand);
        rect(parts, 12, 2, 2, 10, shade(C.chemTank));
        return { kind, w: 16, h: 16, parts };
    }
    if (kind === 'gasRack') {   // ガスボンベ3本の束 12x20（見えるのは 12x16）。白い帯
        rect(parts, 0, 0, 12, 20, null, MAT_EXPLOSIVE, true);
        for (const x of [0, 4, 8]) {
            rect(parts, x + 1, 0, 2, 2, C.gasCap);
            rect(parts, x, 2, 3, 18, C.gas);
            rect(parts, x, 7, 3, 1, C.gasBand);
        }
        rect(parts, 0, 12, 12, 1, DETAIL.rail);   // 束ねる鎖
        return { kind, w: 12, h: 20, parts };
    }
    // 燃料のドラム缶（3面と同じ絵。工場にも置く）8x16
    rect(parts, 0, 0, 8, 16, C.drum, MAT_EXPLOSIVE, true);
    rect(parts, 0, 0, 8, 1, C.drumRim);
    rect(parts, 0, 4, 8, 1, C.drumBand);
    rect(parts, 0, 9, 8, 1, C.drumBand);
    rect(parts, 6, 1, 2, 11, shade(C.drum));
    return { kind, w: 8, h: 16, parts };
}
