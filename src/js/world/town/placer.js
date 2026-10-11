// ============================================
// placer - 植物を置くときの共通の道具（4面の苔とシダ、5面の雪の木）
// ============================================
//
// 「置けるか」（盤面の中・除外の矩形の外・岩に埋まりすぎない・既に置いたものと重ならない）の判定と、
// 置いたものを溜める入れ物。生成の手順（どこにどの種類を置くか）は generatePlants.js / generateSnowTrees.js が持つ。
// 4面で書いたものを、5面でも同じ規則で使うために切り出した（片方だけ規則が変わると、同じ「植物」なのに
// 面ごとに埋まり方や重なり方が違ってしまう）。

import { TILE_SIZE as T, BLOCK_EMPTY, TOWN_CHUNK as CH } from '../../utils/Constants.js';
import { touchesRect, overlaps } from './generate.js';
import { rasterizeParts } from './chunks.js';

// 見える部分の半分以上が岩の中に入る植物は置かない（岩の奥に隠れて、絵も当たりも無いのと同じ）
const MAX_BURIED_SHARE = 0.35;

export function makePlacer({ grid, rows, cols, excludeRects = [] }) {
    const solid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== BLOCK_EMPTY;
    const specs = [];
    const fits = (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= cols * T && s.y + s.h <= rows * T
        && !excludeRects.some((rc) => touchesRect(s, rc));

    // 絵（多角形）が掛かるかけらのうち、岩のタイルに入っている割合。かけらは Town と同じ規則で求める。
    // 根元の段（床は一番下、天井は一番上、壁は壁の列 wallCol）は岩に埋めるものなので数えない
    const buriedShare = (s, wallCol = -1) => {
        const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
        let all = 0, buried = 0;
        for (let j = 0; j < ch; j++) {
            if ((s.site === 'floor' && j === ch - 1) || (s.site === 'ceiling' && j === 0)) continue;
            for (let i = 0; i < cw; i++) {
                if (!cells[j * cw + i]) continue;
                const tc = Math.floor((s.x + i * CH + CH / 2) / T);
                if (tc === wallCol) continue;   // 壁の植物の根元の列は、壁に埋めるもの
                all++;
                if (solid(Math.floor((s.y + j * CH + CH / 2) / T), tc)) buried++;
            }
        }
        return all === 0 ? 0 : buried / all;
    };
    const add = (s, overlapOk, wallCol = -1) => {
        if (!fits(s) || buriedShare(s, wallCol) > MAX_BURIED_SHARE) return false;
        if (!overlapOk && specs.some((o) => overlaps(o, s))) return false;
        specs.push(s);
        return true;
    };
    /** (r, c) の真上に続く空きのタイル数 */
    const freeUp = (r, c) => { let n = 0; while (!solid(r - 1 - n, c)) n++; return n; };

    return { specs, add, freeUp };
}
