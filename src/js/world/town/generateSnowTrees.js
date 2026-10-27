// ============================================
// generateSnowTrees - 5面の雪をかぶった木を床に並べる
// ============================================
//
// 置き場所探し（placement.js の findSites）、群生（villages.js）、「置けるか」の判定（placer.js）は
// 4面の植物（generatePlants.js）と同じ。乱数は呼び出し側が渡す派生ストリームだけを使う
// （game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 木は床だけに立てる（壁・天井は頼まれていない。天井のつららは別の機能として設計する）。
// 返す設計図は Town にそのまま渡せる。soft: true は燃えず崩壊の演出を持たない印、flora: 'snow' は
// 砕けた粒と穴の縁を雪の木の色にする印。
//
// 根元の高さは floorY（列 x の床の上端）で決める。5面の床の端は坂・面取り（utils/tileShape.js）で削れて
// いるので、タイルの上端に立てると根元が最大 12.5px 浮いた（タイル形状つき当たり判定 段5の実測）。
// 既定はタイルの上端（四角い地形の床）。

import {
    TILE_SIZE as T, TOWN_CEILING_CLEARANCE, TOWN_FOUNDATION_SINK,
    SNOWTREE_BARE_SHARE, SNOWTREE_FILL_SCALE, SNOWTREE_GAP, SNOWTREE_MAX_WIDTH,
} from '../../utils/Constants.js';
import { findSites } from './placement.js';
import { placeVillages, villageFill } from './villages.js';
import { makePlacer } from './placer.js';
import { step4 } from './shapes.js';
import { buildFir, buildBareTree } from './snowTrees.js';

export function generateSnowTrees({
    grid, rows, cols, excludeRects = [], rng, villages = placeVillages(rng, rows, cols),
    rockAt = null,
    floorY = (x, r) => r * T,
}) {
    const sites = findSites(grid, rows, cols);
    const { specs, add, freeUp } = makePlacer({ grid, rows, cols, excludeRects, rockAt });
    const fillAt = (c, r) => Math.min(1, villageFill(villages, c, r) * SNOWTREE_FILL_SCALE);

    for (const run of sites.floors) {
        const xEnd = run.c1 * T;
        let x = run.c0 * T;   // 次の木の左端
        while (xEnd - x >= 8) {
            if (rng.next() >= fillAt(x / T, run.r)) { x += step4(rng, 8, 24); continue; }
            // 木の左端から最大幅（SNOWTREE_MAX_WIDTH）ぶんの列の、天井までの空きの最小。枝が横に張るので 1 列では足りない
            let head = Infinity;
            for (let c = Math.floor(x / T); c <= Math.floor((x + SNOWTREE_MAX_WIDTH) / T); c++) head = Math.min(head, freeUp(run.r, c));
            const maxH = (head - TOWN_CEILING_CLEARANCE) * T + TOWN_FOUNDATION_SINK;
            const b = rng.next() < SNOWTREE_BARE_SHARE ? buildBareTree(rng, { maxH }) : buildFir(rng, { maxH });
            // 根元（x + footX から右へ 4px）は床の上に立つ。枝や葉が張り出すのは構わないが、根元が縁の外では浮く
            if (!b || x + b.footX + 4 > xEnd) { x += 8; continue; }
            // 根元の両端の列の床の**低い方**に立てる。高い方に合わせると低い側が浮く。高い側が岩に
            // 埋まるのは、木を地形の奥に描くので見えない
            const groundY = Math.max(floorY(x + b.footX + 0.5, run.r), floorY(x + b.footX + 3.5, run.r)) + TOWN_FOUNDATION_SINK;
            const placed = add({
                site: 'floor', style: 'P', soft: true, flora: 'snow', kind: b.kind, footX: b.footX,
                x, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts,
            }, false);
            x += placed ? b.w + step4(rng, SNOWTREE_GAP[0], SNOWTREE_GAP[1]) : 8;
        }
    }
    return specs;
}
