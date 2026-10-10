// ============================================
// placement - 町を置ける場所を地形から探す
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 床・壁・天井の3種類を、1タイル刻みの連続区間として返す純関数。
// 空きは区間内の**最小**で測る。天井が途中で下がる区間で、建物が天井から
// TOWN_CEILING_CLEARANCE を割らないようにするため（平均だと低い所で突き抜ける）。

import { BLOCK_EMPTY } from '../../utils/Constants.js';

// 壁の前の空きはこれ以上数えない。張り付く家は高々 6 タイルしか使わないので、
// 広い部屋の端から端まで数えても意味が無い
const REACH_CAP = 32;

export function findSites(grid, rows, cols) {
    const inside = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
    const empty = (r, c) => inside(r, c) && grid[r][c] === BLOCK_EMPTY;
    const solid = (r, c) => inside(r, c) && grid[r][c] !== BLOCK_EMPTY;
    const freeUp = (r, c) => { let n = 0; while (empty(r - 1 - n, c)) n++; return n; };
    const freeDown = (r, c) => { let n = 0; while (empty(r + 1 + n, c)) n++; return n; };
    const freeSide = (r, c, dc) => {
        let n = 0;
        while (n < REACH_CAP && empty(r, c + dc * (n + 1))) n++;
        return n;
    };

    // 横に続く区間（床と天井）を1行ずつ拾う
    const scanRows = (isEdge, measure) => {
        const runs = [];
        for (let r = 0; r < rows; r++) {
            let c = 0;
            while (c < cols) {
                if (!isEdge(r, c)) { c++; continue; }
                const c0 = c;
                let m = Infinity;
                while (c < cols && isEdge(r, c)) { m = Math.min(m, measure(r, c)); c++; }
                runs.push({ r, c0, c1: c, m });
            }
        }
        return runs;
    };

    const floors = scanRows((r, c) => solid(r, c) && empty(r - 1, c), freeUp)
        .map(({ r, c0, c1, m }) => ({ r, c0, c1, headroom: m }));
    const ceilings = scanRows((r, c) => solid(r, c) && empty(r + 1, c), freeDown)
        .map(({ r, c0, c1, m }) => ({ r, c0, c1, drop: m }));

    const walls = [];
    for (const [side, dc] of [['right', 1], ['left', -1]]) {
        for (let c = 0; c < cols; c++) {
            let r = 0;
            while (r < rows) {
                if (!(solid(r, c) && empty(r, c + dc))) { r++; continue; }
                const r0 = r;
                let reach = Infinity;
                while (r < rows && solid(r, c) && empty(r, c + dc)) {
                    reach = Math.min(reach, freeSide(r, c, dc));
                    r++;
                }
                walls.push({ c, r0, r1: r, side, reach });
            }
        }
    }
    return { floors, ceilings, walls };
}

/**
 * 段差が maxStep タイル以内でつながる床の区間を、1本の「でこぼこの床」にまとめる。
 *
 * 洞窟の床は平滑化（Map._smoothStep）で細かい段になっていて、3面5週の実測では
 * 天井まで 12 タイル以上ある床の区間 233 本のうち 193 本が幅1タイルだった。区間ごとに
 * 建てると幅 20px 以上の塔が入らず、広い部屋まで小屋ばかりになる（A が 47%）。
 * まとめた区間は**一番低い床を地面**にし、高い段の上では土台が岩の奥に隠れる
 * （町は地形の奥に描くので、岩に重なった部分は見えない）。天井は一番低いものを取る。
 *
 * @param {Array<{r:number,c0:number,c1:number,headroom:number}>} floors findSites().floors
 * @param {number} maxStep つなぐ段差の上限（タイル）
 * @returns {Array<{r:number, c0:number, c1:number, ceil:number, floorRows:number[]}>}
 *   r: 地面の行（一番低い床）、ceil: 一番低い天井の真下の空きの行（建物の上端はここより下）、
 *   floorRows: 列 c0〜c1-1 それぞれの床の行
 */
export function chainFloors(floors, maxStep) {
    const byStart = new Map();
    for (const f of floors) {
        if (!byStart.has(f.c0)) byStart.set(f.c0, []);
        byStart.get(f.c0).push(f);
    }
    // 左から順に鎖をたどる。前の区間が先に処理されるので、途中の区間から鎖が始まらない
    const sorted = [...floors].sort((a, b) => a.c0 - b.c0 || a.r - b.r);
    const used = new Set();
    const chains = [];
    for (const f of sorted) {
        if (used.has(f)) continue;
        used.add(f);
        let r = f.r;
        let top = f.r;   // 一番高い床の行。隣どうしの段差だけ見ると、階段状に積み上がって
                         // 全体で maxStep を超え、低い床の建物が高い段の岩に埋もれる
        let ceil = f.r - f.headroom;
        const floorRows = new Array(f.c1 - f.c0).fill(f.r);   // 列ごとの床の行（段差の上の建物の高さ判定に使う）
        let cur = f;
        for (;;) {
            const next = (byStart.get(cur.c1) || []).find((g) => !used.has(g)
                && Math.max(r, g.r) - Math.min(top, g.r) <= maxStep);
            if (!next) break;
            used.add(next);
            r = Math.max(r, next.r);
            top = Math.min(top, next.r);
            for (let c = next.c0; c < next.c1; c++) floorRows.push(next.r);
            ceil = Math.max(ceil, next.r - next.headroom);
            cur = next;
        }
        chains.push({ r, c0: f.c0, c1: cur.c1, ceil, floorRows });
    }
    return chains;
}
