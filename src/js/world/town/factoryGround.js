// ============================================
// factoryGround - 6面の工場が建つ地面をメタルにする
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-07-stage6-factory-design.md（追記「足元の地面」）
// ユーザーの指定（2026-11-07）:「工場が岩場に建っているのはおかしい。立地している地面はできるだけメタル（7面で使用）に」。
// 7面の施設エリアと同じ BLOCK_METAL（METAL_BLOCK_HP = 6発）に置き換える。絵（パネル・被弾で焼ける色）は
// mapRender の _drawPanelBlock が面を問わず描く。
// 置き換えるのは「空き / 岩」の区別を変えないので、町の設計図（generateTown は空きか岩かしか見ない）も
// 湧き位置も変わらない。乱数は使わない（週の決定性）。

import {
    TILE_SIZE as T, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, METAL_BLOCK_HP, TOWN_FOUNDATION_SINK,
    FACTORY_GROUND_MARGIN, FACTORY_GROUND_DEPTH, FACTORY_GROUND_GAP,
} from '../../utils/Constants.js';

/**
 * 床の建物（爆発物も）の足元の地面をメタルにする。
 * 1. 外接矩形の列 ±FACTORY_GROUND_MARGIN で、建物の地面の行の1段下〜3段上から「上が空いた岩」（床の上面）を探す。
 *    3段上まで見るのは、奥の列が高い岩に埋まった建物があるため（3面の standsWell は見える高さが足りれば段差を許す。
 *    地面の行だけ見ていたら、6面3シードで足元の 1% がそういう列で岩のまま残った）
 * 2. 上面から FACTORY_GROUND_DEPTH 段、かつ建物の地面の行まではメタルに（壊れない枠の岩と空きはそのまま）
 * 3. 同じ行の上面どうしが FACTORY_GROUND_GAP タイル以内なら、あいだの床の上面もつなぐ（建物の並ぶ所を1枚の床に）
 * @returns {number} メタルにしたタイルの数
 */
export function metalizeFactoryGround(grid, blockHP, specs, rows, cols) {
    const solid = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== BLOCK_EMPTY;
    const isTop = (r, c) => solid(r, c) && !solid(r - 1, c);
    let n = 0;
    const metalize = (r, c, ground = r) => {
        for (let d = 0; d < Math.max(FACTORY_GROUND_DEPTH, ground - r + 1); d++) {
            const rr = r + d;
            if (!solid(rr, c)) break;   // 浮いた板の下の空洞までは伸ばさない
            if (grid[rr][c] === BLOCK_INDESTRUCTIBLE || grid[rr][c] === BLOCK_METAL) continue;
            grid[rr][c] = BLOCK_METAL;
            blockHP[rr][c] = METAL_BLOCK_HP;
            n++;
        }
    };
    const tops = new Map();   // 行 → 上面の列の集合
    const groundOf = new Map();   // 'r,c' → その上面の列に建つ建物の地面の行（いちばん深いもの）
    for (const s of specs) {
        if (s.site !== 'floor') continue;
        const g = Math.round((s.y + s.h - TOWN_FOUNDATION_SINK) / T);
        const c0 = Math.floor(s.x / T) - FACTORY_GROUND_MARGIN;
        const c1 = Math.floor((s.x + s.w - 1) / T) + FACTORY_GROUND_MARGIN;
        for (let c = c0; c <= c1; c++) {
            const r = [g, g - 1, g + 1, g - 2, g - 3].find((rr) => isTop(rr, c));
            if (r === undefined) continue;
            groundOf.set(`${r},${c}`, Math.max(g, groundOf.get(`${r},${c}`) ?? g));
            if (!tops.has(r)) tops.set(r, new Set());
            tops.get(r).add(c);
        }
    }
    for (const [r, set] of tops) {
        const list = [...set].sort((a, b) => a - b);
        for (let i = 0; i < list.length; i++) {
            metalize(r, list[i], groundOf.get(`${r},${list[i]}`));
            const next = list[i + 1];
            if (next === undefined || next - list[i] - 1 > FACTORY_GROUND_GAP) continue;
            // すき間の列もすべて同じ行の床の上面のときだけつなぐ（段差や穴をまたがない）
            let flat = true;
            for (let c = list[i] + 1; c < next; c++) if (!isTop(r, c)) flat = false;
            if (flat) for (let c = list[i] + 1; c < next; c++) metalize(r, c);
        }
    }
    return n;
}
