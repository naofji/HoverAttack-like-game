// ============================================
// plants - 4面の苔とシダ
// ============================================
//
// 絵は 4px 角の「セル」の集まりで組む（地形の一番細かい描き込みと同じ 4px。fillRect だけで描く決まり）。
// セルは全部 MAT_PLANT の厚い壁（弾が止まる）にする。ユーザーの指摘: 弾がすり抜けるのに欠けるのでは
// 壊れることに筋が通らない。細部（縁の影）は色だけの部品で、材料は持たない。
// 座標は「根元の段 = y 0、上へ y を負に」。根元の段は地形に 4px 埋まる（TOWN_FOUNDATION_SINK）ので、
// 見える高さは (段数 - 1) × 4px。苔 4〜8px / 低いシダ 24px 未満 / 高いシダ 24px 超
// （自機・アタッカーが 24px なので、機体より低いものと高いものが混ざる）。
// 床・壁・天井の向きは build* が揃えて返し、置く側（generatePlants.js）が根元の位置に合わせる。

import { CHUNK, MAT_PLANT } from './chunks.js';
import { rect, pick } from './shapes.js';
import { PLANT_COLORS as COL, shade } from './palette.js';
import { PLANT_TALL_TRUNK } from '../../utils/Constants.js';

const key = (x, y) => `${x},${y}`;

/** セルの集まり（Map: "x,y" → 色）に1つ足す。先に足したセルは上書きしない（根元の色を残す） */
function put(cells, x, y, color) {
    if (!cells.has(key(x, y))) cells.set(key(x, y), color);
}

/**
 * 1枚の葉（フロンド）。根元 (x0, y0) から angle（ラジアン、画面座標。真上 = -π/2）の向きに進み、
 * 進むほど重力で垂れる（curl が大きいほど急に）。羽片は進む向きの両脇へ1セルずつ交互に足し、
 * 先へ行くほど短くする（最初は羽片が2つおきの細い線で、棒の虫のように見えた）。
 * maxY を超えた（地面より下）ところで止め、minY より上のセルは足さない（低いシダの背丈の上限）。
 * @param {string[]} colors 根元 → 先の色（先ほど明るい）
 */
function frond(cells, x0, y0, angle, len, curl, colors, { maxY = Infinity, minY = -Infinity } = {}) {
    let x = x0, y = y0, a = angle;
    const add = (cx, cy, color) => { if (cy <= maxY && cy >= minY) put(cells, cx, cy, color); };
    for (let i = 0; i < len; i++) {
        const dx = Math.cos(a), dy = Math.sin(a);
        x += dx; y += dy;
        a += curl * (dx >= 0 ? 1 : -1);   // 水平より下へ垂れる向きに回す
        const rx = Math.round(x), ry = Math.round(y);
        if (ry > maxY) return;
        const color = colors[Math.min(colors.length - 1, Math.floor((i / len) * colors.length))];
        add(rx, ry, color);
        if (i >= 1 && i < len - 1) {   // 羽片: 進む向きの垂線の左右に交互
            const side = i % 2 === 0 ? 1 : -1;
            add(rx + Math.round(-dy) * side, ry + Math.round(dx) * side, color);
        }
    }
}

/** セルの集まりを部品にする。bbox の左上を (0, 0) に寄せ、根元の x（px）を返す */
function toBuild(cells, kind, rootCellX = 0) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of cells.keys()) {
        const [x, y] = k.split(',').map(Number);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const parts = [];
    const has = (x, y) => cells.has(key(x, y));
    for (const [k, color] of cells) {
        const [x, y] = k.split(',').map(Number);
        const px = (x - x0) * CHUNK, py = (y - y0) * CHUNK;
        rect(parts, px, py, CHUNK, CHUNK, color, MAT_PLANT, true);
        // 縁の影（色だけの部品）。下と右が空いているセルに 1px。立体に見せる
        if (!has(x, y + 1)) rect(parts, px, py + CHUNK - 1, CHUNK, 1, shade(color));
        if (!has(x + 1, y)) rect(parts, px + CHUNK - 1, py, 1, CHUNK - (has(x, y + 1) ? 0 : 1), shade(color));
    }
    return {
        kind, parts, w: (x1 - x0 + 1) * CHUNK, h: (y1 - y0 + 1) * CHUNK,
        footX: (rootCellX - x0) * CHUNK,
    };
}

const PI = Math.PI;
// 低いシダの背丈の上限（根元の段から上へ 5 段 = 見える高さ 20px）。24px の機体より低くする
const LOW_FERN_MIN_Y = -5;
const rand = (rng, lo, hi) => lo + rng.next() * (hi - lo);

/**
 * 苔のじゅうたん（床）。根元の段 + 1〜2 段の凸凹。見える高さは 4〜8px
 * @param {{maxW:number}} o 置ける幅（px）
 */
export function buildMoss(rng, { maxW }) {
    const w = Math.floor(Math.min(maxW, 40) / CHUNK);
    if (w < 2) return null;
    const n = Math.max(2, Math.min(w, 2 + Math.floor(rng.next() * 8)));
    const cells = new Map();
    let h = 1;
    for (let i = 0; i < n; i++) {
        // 隣の高さから 1 段以内で揺らす（なだらかなこぶ）
        h = Math.max(1, Math.min(2, h + (rng.next() < 0.4 ? (rng.next() < 0.5 ? -1 : 1) : 0)));
        for (let j = 0; j <= h; j++) put(cells, i, -j, j === h ? COL.moss[3] : pick(rng, COL.moss.slice(0, 3)));
    }
    return toBuild(cells, 'moss');
}

/**
 * 低いシダ（床）。根元から 4〜6 枚の葉を扇形に広げ、先を垂らす。見える高さは 24px 未満
 */
export function buildLowFern(rng, { maxH = Infinity }) {
    if (maxH < 16) return null;
    const cells = new Map();
    const n = 4 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const angle = -PI + 0.35 + t * (PI - 0.7) + rand(rng, -0.12, 0.12);   // 左上 → 右上
        const upright = 1 - Math.abs(t - 0.5) * 2;                              // 真ん中ほど立つ
        const len = Math.round(4 + upright * 2 + rand(rng, 0, 1.5));
        frond(cells, 0, 0, angle, len, rand(rng, 0.08, 0.16), COL.leaf, { maxY: 0, minY: LOW_FERN_MIN_Y });
    }
    put(cells, 0, 0, COL.leaf[0]);
    return capHeight(toBuild(cells, 'lowFern'), maxH);
}

/**
 * 高いシダ（床）。太さ1〜2セルの幹が少し揺れながら伸び、先に冠のように葉が開く。見える高さは 24px 超
 * @param {{maxH:number}} o 置ける高さ（px。根元の埋まる 4px を含む）
 */
export function buildTallFern(rng, { maxH }) {
    // 冠の葉が幹の先から上に乗る段数。3 段だと、天井が近い所で冠が平らに切られて傘に見えた（実物の PNG）。
    // 5 段は取るので、置ける高さが 40px に満たなければ作らない（置く側が低いシダに替える）。
    // これを超える羽は minY で切る（置ける高さを守る）
    const crown = 5;
    const [lo, hi] = PLANT_TALL_TRUNK;
    const rows = Math.min(lo + Math.floor(rng.next() * (hi - lo + 1)), Math.floor(maxH / CHUNK) - crown);
    // 見える高さ (rows + crown) × 4 - 4 が 24px を超えること
    if (rows < 5) return null;
    const cells = new Map();
    let x = 0;
    for (let j = 0; j <= rows; j++) {
        const trunk = j < 2 ? 2 : 1;   // 根元は太い
        for (let t = 0; t < trunk; t++) put(cells, x + t, -j, COL.trunk[(j + t) % 2]);
        if (j >= 2 && rng.next() < 0.08) {   // 幹の揺れ。横に1セル足してつなげる
            const dx = rng.next() < 0.5 ? -1 : 1;
            x += dx;
            put(cells, x, -j, COL.trunk[2]);
        }
    }
    const top = -rows;
    const n = 6 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        // 真横に近い葉を作らない（冠が傘のように平らに見えた）。-145°〜-35° に扇形に開いて、先で垂れる
        const angle = -PI + 0.6 + t * (PI - 1.2) + rand(rng, -0.08, 0.08);
        const upright = 1 - Math.abs(t - 0.5) * 2;
        frond(cells, x, top, angle, Math.round(5 + upright * 2 + rand(rng, 0, 1.5)), rand(rng, 0.12, 0.2), COL.leaf, { maxY: 0, minY: -(Math.floor(maxH / CHUNK) - 1) });
    }
    return toBuild(cells, 'tallFern');
}

/**
 * 壁の苔（壁に張り付く向き = 右に張り出す形で組む。左の壁は mirrorParts で反転）。
 * 壁側の 1 列は壁に埋まる（支え）。薄い苔の張り付きか、壁から生えて垂れるシダ
 */
export function buildWallPlant(rng, { maxReach, maxH }) {
    const rows = Math.min(3 + Math.floor(rng.next() * 7), Math.floor(maxH / CHUNK));
    if (rows < 2 || maxReach < 8) return null;
    const cells = new Map();
    if (rng.next() < 0.6) {
        for (let j = 0; j < rows; j++) {
            const thick = 1 + (rng.next() < 0.7 ? 1 : 0) + (rng.next() < 0.25 ? 1 : 0);
            for (let i = 0; i <= Math.min(thick, Math.floor(maxReach / CHUNK) - 1); i++) {
                put(cells, i, j, i === thick ? COL.moss[3] : pick(rng, COL.moss.slice(0, 3)));
            }
        }
        return toBuild(cells, 'wallMoss');
    }
    // 壁から生えるシダ: 壁の中の根元から外へ、先を垂らす
    const n = 2 + Math.floor(rng.next() * 2);
    for (let i = 0; i < n; i++) {
        frond(cells, 0, i * 2, rand(rng, -0.7, 0.2), 4 + Math.floor(rng.next() * 3), rand(rng, 0.14, 0.24), COL.leaf);
    }
    for (let j = 0; j <= (n - 1) * 2; j++) put(cells, 0, j, COL.moss[1]);   // 壁に埋まる根元の列
    return toBuild(cells, 'wallFern');
}

/**
 * 垂れ下がる蔓と苔の房（天井）。上端の段は天井に埋まる（支え）
 * @param {{maxHang:number}} o 垂らせる長さ（px。上の埋まる 4px を含む）
 */
export function buildHangingVine(rng, { maxHang }) {
    const maxRows = Math.floor(maxHang / CHUNK);
    if (maxRows < 3) return null;
    const cells = new Map();
    const n = 2 + Math.floor(rng.next() * 4);
    let x = 0;
    for (let s = 0; s < n; s++) {
        const len = Math.min(maxRows - 1, 2 + Math.floor(rng.next() * 7));
        for (let j = 0; j <= len; j++) {
            put(cells, x, j, j === len ? COL.vine[2] : pick(rng, COL.vine.slice(0, 2)));
            // 葉。両側に規則正しく付けると梯子に見えた（実物の PNG）ので、片側にまばらに付ける
            if (j >= 2 && j < len && rng.next() < 0.45) put(cells, x + (rng.next() < 0.5 ? 1 : -1), j, COL.vine[2]);
        }
        x += 2 + Math.floor(rng.next() * 2);
    }
    for (let i = 0; i <= x; i++) put(cells, i, 0, COL.moss[0]);   // 天井に張る房の根元
    return toBuild(cells, 'vine');
}

/** 高さが maxH を超えたら諦める（置けない）。見える高さの上限は置く側が maxH で渡す */
function capHeight(b, maxH) {
    return b.h <= maxH ? b : null;
}
