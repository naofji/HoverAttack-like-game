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
