// ============================================
// generateIcicles - 5面の天井につららを並べる
// ============================================
//
// 置き場所探し（placement.js の findSites）、群生（villages.js）、「置けるか」の判定（placer.js）は
// 4面の植物・5面の木と同じ。乱数は呼び出し側が渡す派生ストリームだけを使う
// （game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 返す設計図は Town にそのまま渡せる。soft: true は崩壊の演出を持たない印、brittle: true は当たると欠けずに
// 震えて全体が落ちる印、flora: 'ice' は砕けた粒の色を氷にする印。
//
// 根元の高さは ceilingY（列 x の天井の下端）で決める。5面の天井の端は坂・面取り（utils/tileShape.js）で
// 削れているので、タイルの下端に吊るすと根元が最大 15px 浮いた（タイル形状つき当たり判定 段5の実測）。
// 既定はタイルの下端（四角い地形の天井）。

import { TILE_SIZE as T, TOWN_CHUNK as CH, ICICLE_FILL_SCALE, ICICLE_KEEP_BELOW, ICICLE_GAP } from '../../utils/Constants.js';
import { findSites } from './placement.js';
import { placeVillages, villageFill } from './villages.js';
import { makePlacer } from './placer.js';
import { step4 } from './shapes.js';
import { buildIcicle } from './icicles.js';

export function generateIcicles({
    grid, rows, cols, excludeRects = [], rng, villages = placeVillages(rng, rows, cols),
    rockAt = null,
    ceilingY = (x, r) => (r + 1) * T,
}) {
    const sites = findSites(grid, rows, cols);
    const { specs, add } = makePlacer({ grid, rows, cols, excludeRects, rockAt });
    const fillAt = (c, r) => Math.min(1, villageFill(villages, c, r) * ICICLE_FILL_SCALE);

    for (const run of sites.ceilings) {
        // 天井の空き（run.drop）から、床まで残す余白を引いた長さまで吊るせる。足りなければこの区間には置かない
        const maxLength = (run.drop - ICICLE_KEEP_BELOW) * T;
        if (maxLength <= 0) continue;
        const xEnd = run.c1 * T;
        let x = run.c0 * T;               // 次のつららの左端
        while (xEnd - x >= 8) {
            if (rng.next() >= fillAt(x / T, run.r)) { x += step4(rng, 8, 24); continue; }
            const b = buildIcicle(rng, { maxLength });
            if (!b) { x += 8; continue; }
            // 根元（中心 ± 半幅）が天井の区間からはみ出すと、支えのかけらが岩に入らない・片側が宙に浮く
            if (x + b.w > xEnd) { x += 8; continue; }
            // 上端の 1 段（4px）を天井の岩に埋める。根元の左右の縁（輪郭は左右 2px の余白の内側）と中心の
            // 列の天井の**高い方**に合わせる（低い方だと高い側の根元が浮く。低い側が岩に埋まるのは見えない）
            const y = Math.min(ceilingY(x + 2.5, run.r), ceilingY(x + b.footX, run.r), ceilingY(x + b.w - 2.5, run.r)) - CH;
            const placed = add({
                site: 'ceiling', style: 'P', soft: true, brittle: true, flora: 'ice', kind: b.kind,
                footX: b.footX, damage: b.damage, length: b.length,
                x, y, w: b.w, h: b.h, parts: b.parts,
            }, false);
            x += placed ? b.w + step4(rng, ICICLE_GAP[0], ICICLE_GAP[1]) : 8;
        }
    }
    return specs;
}
