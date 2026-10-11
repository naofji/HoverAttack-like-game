// ============================================
// chunks - 建物を 4px 角の「かけら」の表として持つ
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章）
// 建物の絵は部品（四角）の一覧から描き、壊れ方はこの表で扱う。
// 段2の欠け・支えの崩れ、段3の火はこの表だけを読み書きする。
// 1バイトに「材料（下位3ビット）」「厚い壁＝弾を止める」「焦げ」を詰める。

import { TOWN_CHUNK, TILE_SIZE } from '../../utils/Constants.js';

export const CHUNK = TOWN_CHUNK;
const HALF = CHUNK / 2;

export const MAT_NONE = 0;
export const MAT_ADOBE = 1;     // 日干し煉瓦の壁（燃えにくい）
export const MAT_WOOD = 2;      // 板・梁・綱（燃えやすい）
export const MAT_METAL = 3;     // トタン・配管・ランタンの枠（燃えない）
export const MAT_EXPLOSIVE = 4; // ドラム缶・ダイナマイト箱（段3b）
export const MAT_MASK = 0x07;
export const SOLID = 0x10;      // 厚い壁。段2で弾を止める（細い部品は止めない）
export const CHARRED = 0x20;    // 焦げ（段3）

/**
 * 部品の一覧からかけらの表を作る。かけらの中心が部品の中に入っていれば埋まる。
 * 後の部品が前の部品を上書きする（描く順と同じ）。材料の無い部品は描くだけ。
 * @param {Array<{x:number,y:number,w:number,h:number,mat:number,solid:boolean}>} parts
 * @param {number} w 建物の幅(px)
 * @param {number} h 建物の高さ(px)
 * @returns {{cells: Uint8Array, cw: number, ch: number}}
 */
export function rasterizeParts(parts, w, h) {
    const cw = Math.ceil(w / CHUNK);
    const ch = Math.ceil(h / CHUNK);
    const cells = new Uint8Array(cw * ch);
    for (const p of parts) {
        if (!p.mat) continue;
        const v = p.mat | (p.solid ? SOLID : 0);
        // 中心 i*4+2 が [p.x, p.x+p.w) に入る i の範囲
        const i0 = Math.max(0, Math.ceil((p.x - HALF) / CHUNK));
        const i1 = Math.min(cw, Math.ceil((p.x + p.w - HALF) / CHUNK));
        const j0 = Math.max(0, Math.ceil((p.y - HALF) / CHUNK));
        const j1 = Math.min(ch, Math.ceil((p.y + p.h - HALF) / CHUNK));
        for (let j = j0; j < j1; j++) {
            for (let i = i0; i < i1; i++) cells[j * cw + i] = v;
        }
    }
    // 色のある部品が1画素でも掛かっているのに空のかけらは、その部品の材料の細い部品で埋める。
    // 中心の規則だけだと梁・梯子・ランタン・軒・橋の手すりの画素の 3% がどのかけらにも入らず、
    // かけらを抜いて clearRect しても宙に残った（段1のレビュー指摘）。厚い壁の印は付けない
    // （弾を止めるのは中心の規則で埋まった面だけ）。描くだけの部品（mat 0）は木にする
    for (const p of parts) {
        if (!p.color) continue;
        const v = p.mat || MAT_WOOD;
        const i0 = Math.max(0, Math.floor(p.x / CHUNK));
        const i1 = Math.min(cw, Math.ceil((p.x + p.w) / CHUNK));
        const j0 = Math.max(0, Math.floor(p.y / CHUNK));
        const j1 = Math.min(ch, Math.ceil((p.y + p.h) / CHUNK));
        for (let j = j0; j < j1; j++) {
            for (let i = i0; i < i1; i++) if (!cells[j * cw + i]) cells[j * cw + i] = v;
        }
    }
    return { cells, cw, ch };
}

/**
 * 支えのかけら。中心が岩のタイルに入っているかけらは、そのタイルに支えられている。
 * 床に埋めた土台・壁に打ち込んだ梁・天井に結んだ綱が、どれもこの1つの規則で拾える。
 * 段2はこのタイルが壊れたときに支えを外す。
 * @returns {Array<{i:number, r:number, c:number}>} i はかけらの番号（j*cw+i）
 */
export function computeAnchors(cells, cw, ch, x, y, isSolidTile) {
    const anchors = [];
    for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
            const k = j * cw + i;
            if (!cells[k]) continue;
            const r = Math.floor((y + j * CHUNK + HALF) / TILE_SIZE);
            const c = Math.floor((x + i * CHUNK + HALF) / TILE_SIZE);
            if (isSolidTile(r, c)) anchors.push({ i: k, r, c });
        }
    }
    return anchors;
}

/**
 * 建物の番号とかけらの位置から決まる 0〜1 の値。穴の縁のぎざぎざや、落ちる破片の向きに使う。
 * Math.random にしないのは、遮蔽の形が遊びに関わるため（同じ所に撃てば同じ穴が開く）。
 * game.rng も使わない（消費すると敵の構成が変わる）
 */
export function chunkHash(id, i, j) {
    let h = Math.imul(id + 1, 0x9E3779B1) ^ Math.imul(i + 1, 0x85EBCA77) ^ Math.imul(j + 1, 0xC2B2AE3D);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2C1B3C6D);
    h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
}
