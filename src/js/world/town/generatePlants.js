// ============================================
// generatePlants - 4面の苔とシダを床・壁・天井に並べる
// ============================================
//
// 町（generate.js）と同じ置き場所探し（placement.js の findSites）と、同じ村（villages.js）で
// 「群生する所としない所」を作る。乱数は呼び出し側が渡す派生ストリームだけを使う
// （game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 返す設計図は Town にそのまま渡せる。soft: true の建物は燃えず、崩壊の演出（爆発・地鳴り）を持たない。

import {
    TILE_SIZE as T, BLOCK_EMPTY, TOWN_CHUNK as CH,
    TOWN_CEILING_CLEARANCE, TOWN_FOUNDATION_SINK, TOWN_VILLAGE_DENSE_FILL,
    PLANT_FLOOR_MIX, PLANT_FILL_SCALE, PLANT_WALL_SPACING, PLANT_WALL_CHANCE, PLANT_CEIL_CHANCE,
    PLANT_WALL_MIN_RUN, PLANT_WALL_MIN_REACH, PLANT_CEIL_MIN_RUN, PLANT_CEIL_MIN_DROP, PLANT_CEIL_KEEP_BELOW,
} from '../../utils/Constants.js';
import { findSites } from './placement.js';
import { placeVillages, villageFill } from './villages.js';
import { overlaps, touchesRect } from './generate.js';
import { mirrorParts, step4 } from './shapes.js';
import { buildMoss, buildLowFern, buildTallFern, buildWallPlant, buildHangingVine } from './plants.js';

// 見える部分の半分以上が岩の中に入る植物は置かない（岩の奥に隠れて、絵も当たりも無いのと同じ）
const MAX_BURIED_SHARE = 0.35;

export function generatePlants({
    grid, rows, cols, excludeRects = [], rng, villages = placeVillages(rng, rows, cols),
}) {
    const sites = findSites(grid, rows, cols);
    const solid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== BLOCK_EMPTY;
    const fillAt = (c, r) => Math.min(1, villageFill(villages, c, r) * PLANT_FILL_SCALE);
    const specs = [];
    const fits = (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= cols * T && s.y + s.h <= rows * T
        && !excludeRects.some((rc) => touchesRect(s, rc));

    // 根元の段より上のセルのうち、岩のタイルに入っている割合
    const buriedShare = (s) => {
        let all = 0, buried = 0;
        const bottom = s.y + s.h - CH;
        for (const p of s.parts) {
            if (!p.mat) continue;
            all++;
            if (p.y + s.y >= bottom && s.site === 'floor') continue;   // 根元の段は岩に埋めるもの
            if (solid(Math.floor((s.y + p.y + CH / 2) / T), Math.floor((s.x + p.x + CH / 2) / T))) buried++;
        }
        return all === 0 ? 1 : buried / all;
    };
    const add = (s, overlapOk) => {
        if (!fits(s) || buriedShare(s) > MAX_BURIED_SHARE) return false;
        if (!overlapOk && specs.some((o) => overlaps(o, s))) return false;
        specs.push(s);
        return true;
    };
    const freeUp = (r, c) => { let n = 0; while (!solid(r - 1 - n, c)) n++; return n; };

    // --- 床 ---
    for (const run of sites.floors) {
        const groundY = run.r * T + TOWN_FOUNDATION_SINK;
        const xEnd = run.c1 * T;
        let x = run.c0 * T;
        while (xEnd - x >= 8) {
            if (rng.next() >= fillAt(x / T, run.r)) { x += step4(rng, 8, 24); continue; }
            // 根元の前後 2 タイルの天井までの空き。葉が横に広がるので 1 列では足りない
            let head = Infinity;
            for (let c = Math.floor(x / T) - 1; c <= Math.floor(x / T) + 2; c++) head = Math.min(head, freeUp(run.r, c));
            const maxH = (head - TOWN_CEILING_CLEARANCE) * T + TOWN_FOUNDATION_SINK;
            const u = rng.next();
            let b;
            if (u < PLANT_FLOOR_MIX.tall) b = buildTallFern(rng, { maxH }) || buildLowFern(rng, { maxH });   // 天井が近ければ低いシダ
            else if (u < PLANT_FLOOR_MIX.tall + PLANT_FLOOR_MIX.low) b = buildLowFern(rng, { maxH });
            else b = buildMoss(rng, { maxW: xEnd - x });
            if (!b) { x += 8; continue; }
            const spec = {
                site: 'floor', style: 'P', soft: true, kind: b.kind,
                x: x - b.footX, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts,
            };
            // 苔は幅いっぱいが根元。シダは 1 点が根元で、葉は段差や穴の上に張り出してよい
            if (b.kind === 'moss' && x + b.w > xEnd) { x += 8; continue; }
            add(spec, true);
            x += (b.kind === 'moss' ? b.w : step4(rng, 8, 16)) + step4(rng, 0, 12);
        }
    }

    // --- 壁 ---
    for (const run of sites.walls) {
        const len = run.r1 - run.r0;
        if (len < PLANT_WALL_MIN_RUN || run.reach < PLANT_WALL_MIN_REACH) continue;
        const tries = Math.max(1, Math.floor(len / PLANT_WALL_SPACING));
        for (let k = 0; k < tries; k++) {
            if (rng.next() > PLANT_WALL_CHANCE) continue;
            const r = run.r0 + Math.floor(rng.next() * Math.max(1, len - 1));
            if (rng.next() > fillAt(run.c, r)) continue;
            const b = buildWallPlant(rng, { maxReach: Math.min(run.reach, 4) * T, maxH: (run.r1 - r) * T });
            if (!b) continue;
            // 組み立ては「壁の右側に張り付く」向き。根元の列（footX）の 4px が壁のタイルに入る位置に置く
            const right = run.side === 'right';
            add({
                site: 'wall', style: 'P', soft: true, kind: b.kind,
                x: right ? (run.c + 1) * T - CH - b.footX : run.c * T - (b.w - b.footX - CH),
                y: r * T, w: b.w, h: b.h,
                parts: right ? b.parts : mirrorParts(b.parts, b.w),
            }, false);
        }
    }

    // --- 天井 ---
    for (const run of sites.ceilings) {
        if (run.c1 - run.c0 < PLANT_CEIL_MIN_RUN || run.drop < PLANT_CEIL_MIN_DROP) continue;
        const maxHang = (run.drop - PLANT_CEIL_KEEP_BELOW) * T;
        const y = (run.r + 1) * T - CH;   // 上端の 1 段を天井の岩に埋める
        for (let c = run.c0 + 1; c < run.c1 - 1;) {
            if (rng.next() > PLANT_CEIL_CHANCE * fillAt(c, run.r) / TOWN_VILLAGE_DENSE_FILL) { c++; continue; }
            const b = buildHangingVine(rng, { maxHang });
            if (!b) { c++; continue; }
            add({ site: 'ceiling', style: 'P', soft: true, kind: b.kind, x: c * T + step4(rng, 0, 8) - b.footX, y, w: b.w, h: b.h, parts: b.parts }, false);
            c += Math.max(2, Math.ceil(b.w / T)) + Math.floor(rng.next() * 3);
        }
    }
    return specs;
}
