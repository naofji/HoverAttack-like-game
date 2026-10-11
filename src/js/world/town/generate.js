// ============================================
// generate - 置き場所に町を並べる
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 床 → 壁 → 天井の順に並べる。乱数は呼び出し側が渡す派生ストリームだけを使う
// （Map の game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 床の建物どうしは重なってよい（張り出したバルコニーや梁が隣に掛かるのは町らしい）。
// 壁と天井のものは、先に置いたものと重なるなら置かない（塔の上に吊るしものが刺さる）。

import {
    TILE_SIZE as T, BLOCK_EMPTY,
    TOWN_MIN_HEADROOM, TOWN_CEILING_CLEARANCE, TOWN_FOUNDATION_SINK, TOWN_FLOOR_STEP_MAX, TOWN_VILLAGE_DENSE_FILL,
    TOWN_ADOBE_HEADROOM_WIDE, TOWN_ADOBE_SHARE_WIDE, TOWN_ADOBE_HEADROOM_NARROW, TOWN_ADOBE_SHARE_NARROW,
    TOWN_TOWER_BRIDGE_CHANCE,
    TOWN_WALL_MIN_RUN, TOWN_WALL_MIN_REACH, TOWN_WALL_SPACING, TOWN_WALL_HOUSE_CHANCE,
    TOWN_CEIL_MIN_RUN, TOWN_CEIL_MIN_DROP, TOWN_CEIL_KEEP_BELOW, TOWN_EXPLOSIVE_EVERY,
} from '../../utils/Constants.js';
import { findSites, chainFloors } from './placement.js';
import { placeVillages, villageFill, quietFactor } from './villages.js';
import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge, buildOilJarStore } from './adobe.js';
import { buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack, buildMiningExplosive } from './mining.js';
import { mirrorParts, rect, pick, step4 } from './shapes.js';
import { MAT_WOOD } from './chunks.js';
import { TOWN_BODY_COLORS, TOWN_DETAIL_COLORS } from './palette.js';

/** 天井までの空き（タイル）から、日干し煉瓦（A）を選ぶ確率 */
export function adobeShare(headroom) {
    const span = TOWN_ADOBE_HEADROOM_WIDE - TOWN_ADOBE_HEADROOM_NARROW;
    const t = Math.max(0, Math.min(1, (headroom - TOWN_ADOBE_HEADROOM_NARROW) / span));
    return TOWN_ADOBE_SHARE_NARROW + (TOWN_ADOBE_SHARE_WIDE - TOWN_ADOBE_SHARE_NARROW) * t;
}

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function touchesRect(s, rc) {
    const r0 = Math.floor(s.y / T), r1 = Math.floor((s.y + s.h - 1) / T);
    const c0 = Math.floor(s.x / T), c1 = Math.floor((s.x + s.w - 1) / T);
    return r0 <= rc.r1 && r1 >= rc.r0 && c0 <= rc.c1 && c1 >= rc.c0;
}

/**
 * 同じ床の区間で隣り合う塔の上の階を、木の橋でつなぐ（シバーム）。
 * 橋は左の塔の部品として足す。段2で左の塔が崩れれば橋も一緒に落ちる
 * （右の塔には支えられない。支えは岩だけ、という規則を崩さないため）。
 */
function bridgeTowers(runSpecs, rng) {
    const bodyTop = (s) => s.y + s.h - s.insets.length * 4;
    const rowAt = (s, y) => Math.min(s.insets.length - 1, Math.max(0, Math.floor((s.y + s.h - y - 1) / 4)));
    for (let i = 0; i + 1 < runSpecs.length; i++) {
        const a = runSpecs[i];
        const b = runSpecs[i + 1];
        if (!a.insets || !b.insets) continue;
        const gap = (b.x + b.footX) - (a.x + a.footX + a.footW);
        // 16px 未満の隙間に架けると、橋ではなく塔がくっついて見える
        if (gap < 16 || gap > 48) continue;
        if (rng.next() >= TOWN_TOWER_BRIDGE_CHANCE) continue;
        const by = Math.max(bodyTop(a), bodyTop(b)) + 12;   // 低いほうの塔の最上階の床
        if (a.y + a.h - by < 24) continue;                   // 2階より下には架けない
        const x0 = a.x + a.footX + a.footW - a.insets[rowAt(a, by)];
        const x1 = b.x + b.footX + b.insets[rowAt(b, by)];
        const lx = x0 - a.x;
        const ly = by - a.y;
        rect(a.parts, lx, ly, x1 - x0, 4, pick(rng, TOWN_BODY_COLORS.wood), MAT_WOOD, false);
        rect(a.parts, lx, ly - 5, x1 - x0, 1, TOWN_DETAIL_COLORS.rope);
        a.w = Math.max(a.w, lx + (x1 - x0));
    }
}

// 床の建物の空きを測る列の数。一番広い塔の足元 56px は、4の倍数の位置から始めると最大 5 列に掛かる
const LOOKAHEAD_COLS = 5;

/**
 * 建てた床の建物が、地形とちぐはぐにならないか。3つとも満たすときだけ置く。
 * 1. 足元のどの列でも、最下段が岩の中にある（浮いた足場の列で根元が空洞にはみ出さない。
 *    下の床と1段高い浮いた板が段差1でつながると起きた。レビュー指摘、1マップ約11棟）
 * 2. 1段高い列でも、平らな床と同じだけ（16px まで）岩の上に見える（段の岩に埋もれない）
 * 3. 上端が見えている列では、その上 TOWN_CEILING_CLEARANCE タイルが空いている
 *    （軒・張り出し・バルコニーまで含めて外接矩形の全列で見る）
 */
function standsWell(s, run, solid) {
    const fc0 = Math.floor((s.x + s.footX) / T);
    const fc1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
    for (let c = fc0; c <= fc1; c++) if (!solid(run.r, c)) return false;
    const highest = Math.min(...run.floorRows.slice(fc0 - run.c0, fc1 - run.c0 + 1));
    const visible = s.h - TOWN_FOUNDATION_SINK - (run.r - highest) * T;
    if (visible < Math.min(16, s.h - TOWN_FOUNDATION_SINK)) return false;
    const rTop = Math.floor(s.y / T);
    for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + s.w - 1) / T); c++) {
        if (solid(rTop, c)) continue;   // 上端が岩の奥に隠れている列は見えない
        for (let r = rTop - TOWN_CEILING_CLEARANCE; r < rTop; r++) if (solid(r, c)) return false;
    }
    return true;
}

/** 下端の 4px（TOWN_FOUNDATION_SINK）が床の岩に入り、その上は全部空いている（段の岩に埋もれない・宙に浮かない） */
function onBareFloor(e, solid) {
    const ground = (e.y + e.h - TOWN_FOUNDATION_SINK) / T;
    for (let c = Math.floor(e.x / T); c <= Math.floor((e.x + e.w - 1) / T); c++) {
        if (!solid(ground, c)) return false;
        for (let r = Math.floor(e.y / T); r < ground; r++) if (solid(r, c)) return false;
    }
    return true;
}

/**
 * 段3b: 床の建物の脇に爆発物を置く（建物 TOWN_EXPLOSIVE_EVERY 棟に1つくらい。spec 3b章）。
 * 乱数は建物と別の派生ストリーム。建物を並べる rng を使うと、実機で見て決めた町並みが
 * 週ごとに全部入れ替わる（村の比率をユーザーが手で詰めた直後）。
 * 支えは岩だけなので、床の岩の上にしか置かない（足場の上の爆発物は、面に入った瞬間に落ちる）
 */
function placeExplosives(specs, rng, { solid, fits }) {
    // 床の建物の足元（本体の幅 × 高さ）。爆発物はここに重ねない。重ねると壁に埋もれて見え、
    // 弾は手前に描いた爆発物ではなく奥の壁で止まる（最終レビュー指摘: 6割近くが隣の建物に重なり、
    // 4割は半分以上が隣の壁の上だった）。軒・バルコニーなど足元の外の張り出しには重なってよい
    const feet = specs.filter((s) => s.site === 'floor')
        .map((s) => ({ x: s.x + s.footX, y: s.y, w: s.footW, h: s.h }));
    const placed = [];
    for (const s of specs) {
        if (s.site !== 'floor' || rng.next() >= 1 / TOWN_EXPLOSIVE_EVERY) continue;
        const b = s.style === 'A' ? buildOilJarStore(rng) : buildMiningExplosive(rng);
        const right = rng.next() < 0.5;
        const gap = step4(rng, 0, 4);
        const foot0 = s.x + s.footX;
        const foot1 = foot0 + s.footW;
        // 引いた側が隣の建物で塞がっていれば、反対側を試す（建物が詰まった村で数が減りすぎないように）
        for (const side of [right, !right]) {
            const e = {
                site: 'floor', style: s.style, kind: b.kind,
                x: side ? foot1 + gap : foot0 - gap - b.w, y: s.y + s.h - b.h, w: b.w, h: b.h, parts: b.parts,
            };
            if (!fits(e) || placed.some((o) => overlaps(o, e)) || feet.some((f) => overlaps(f, e))
                || !onBareFloor(e, solid)) continue;
            placed.push(e);
            break;
        }
    }
    return placed;
}

/**
 * villages を渡さなければ rng で村を置く（Map はこちら）。テストは村を指定して効き方を見る。
 * quietZones（[{c, r, inner, outer}]、タイル）は町を建てない区域。inner 以内に掛かる建物は置かず、
 * outer までは建てる確率を下げて、区域の縁で町が急に途切れないようにする。
 * explosiveRng を渡せば、床の建物の脇に爆発物を足す（設計図の後ろに。前の建物は変わらない）
 */
export function generateTown({
    grid, rows, cols, excludeRects = [], rng, villages = placeVillages(rng, rows, cols), quietZones = [], explosiveRng = null,
}) {
    const sites = findSites(grid, rows, cols);
    const fillAt = (c, r) => villageFill(villages, c, r) * quietFactor(quietZones, c, r);
    // 村の濃さ 0〜1（密集した村の中心で 1）。壁の家と吊るすものの数にも掛けて、村の外の
    // 岩壁や天井にだけぽつぽつ家が付く、ということにならないようにする
    const villageness = (c, r) => fillAt(c, r) / TOWN_VILLAGE_DENSE_FILL;
    // 建物の外接矩形のうち区域の中心に一番近い点が inner より内なら置かない（確率は建てる位置の
    // 左端で引くので、幅の広い塔は右側が区域に入り込みうる）
    const inQuiet = (s) => quietZones.some((z) => {
        const nx = Math.max(s.x, Math.min((z.c + 0.5) * T, s.x + s.w));
        const ny = Math.max(s.y, Math.min((z.r + 0.5) * T, s.y + s.h));
        return Math.hypot(nx / T - (z.c + 0.5), ny / T - (z.r + 0.5)) < z.inner;
    });
    const specs = [];
    const fits = (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= cols * T && s.y + s.h <= rows * T
        && !excludeRects.some((rc) => touchesRect(s, rc)) && !inQuiet(s);
    const add = (s) => {
        if (!fits(s)) return false;
        if (s.site !== 'floor' && specs.some((o) => overlaps(o, s))) return false;
        specs.push(s);
        return true;
    };

    // --- 床 ---
    // 1タイルの段差でつながる床は1本にまとめる（chainFloors のコメント）。地面は一番低い床。
    // 天井までの空きは区間全体の最小ではなく、**建てる位置の列ごとに地形から測る**。
    // 区間全体の最小で測っていたときは、端の1列で天井が下がるだけで部屋全体が狭い扱いになり、
    // 広い所の A が実測 35〜37% しかなかった（レビュー指摘。spec は 8割）
    const solid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== BLOCK_EMPTY;
    // 地面の行 ground から測った、列 c の天井までの空き（タイル）。段の上面まで上がってから数える
    const headroomAt = (ground, c) => {
        let r = ground;
        while (r > 0 && solid(r - 1, c)) r--;
        let n = 0;
        while (!solid(r - 1 - n, c)) n++;
        return ground - r + n;
    };
    for (const run of chainFloors(sites.floors, TOWN_FLOOR_STEP_MAX)) {
        // 土台は床の岩に埋める
        const groundY = run.r * T + TOWN_FOUNDATION_SINK;
        const colHead = [];
        for (let c = run.c0; c < run.c1; c++) colHead.push(headroomAt(run.r, c));
        const runSpecs = [];
        const xEnd = run.c1 * T;
        let x = run.c0 * T;
        while (xEnd - x >= 16) {
            // 足元になりうる列（一番広い塔 56px が掛かる 5 列）で一番狭い空き
            const ci = Math.floor(x / T) - run.c0;
            const headroom = Math.min(...colHead.slice(ci, ci + LOOKAHEAD_COLS));
            if (headroom < TOWN_MIN_HEADROOM) { x += T; continue; }
            if (rng.next() > fillAt(x / T, run.r)) { x += step4(rng, 8, 32); continue; }   // 空き地
            // 高さの上限は「天井から CLEARANCE タイル下」まで
            const maxH = (headroom - TOWN_CEILING_CLEARANCE) * T + TOWN_FOUNDATION_SINK;
            // A と C の割合は、建てる位置の2列（32px）の空きで決める。5列の最小で決めると、
            // 塔の幅ぶん先の低い天井に引っぱられて広い所が狭い扱いになる（広い所の A 64%）。
            // 高さの上限は5列の最小のまま（standsWell が最後に確かめる）
            const here = Math.min(...colHead.slice(ci, ci + 2));
            const style = rng.next() < adobeShare(here) ? 'A' : 'C';
            const b = style === 'A'
                ? buildAdobeTower(rng, { maxW: xEnd - x, maxH })
                : buildMiningShack(rng, { maxW: xEnd - x, maxH });
            if (!b) { x += 8; continue; }
            const spec = {
                site: 'floor', style, kind: b.kind,
                x: x - b.footX, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts,
                footX: b.footX, footW: b.footW, headroom,
            };
            if (!standsWell(spec, run, solid)) { x += 8; continue; }
            if (b.insets) spec.insets = b.insets;
            if (add(spec)) runSpecs.push(spec);
            x += b.footW + step4(rng, 0, 8);
        }
        bridgeTowers(runSpecs, rng);
    }

    // --- 壁 ---
    for (const run of sites.walls) {
        const len = run.r1 - run.r0;
        if (len < TOWN_WALL_MIN_RUN || run.reach < TOWN_WALL_MIN_REACH) continue;
        const share = adobeShare(run.reach);
        const maxReach = Math.min(run.reach, 6) * T;
        const tries = Math.max(1, Math.floor(len / TOWN_WALL_SPACING));
        for (let k = 0; k < tries; k++) {
            if (rng.next() > TOWN_WALL_HOUSE_CHANCE) continue;
            const r = run.r0 + 1 + Math.floor(rng.next() * Math.max(1, len - 2));
            if (rng.next() > villageness(run.c, r)) continue;
            const style = rng.next() < share ? 'A' : 'C';
            const b = style === 'A' ? buildAdobeWallHouse(rng, { maxReach }) : buildScaffoldShack(rng, { maxReach });
            if (!b) continue;
            // 組み立ては「壁の右側に張り付く」向き。壁の左側（side: 'left'）なら反転する。
            // どちらも壁側の 4px が壁のタイルに入る位置に置く（そこが支え）
            const right = run.side === 'right';
            add({
                site: 'wall', style, kind: b.kind,
                x: right ? (run.c + 1) * T - 4 : run.c * T + 4 - b.w,
                y: r * T, w: b.w, h: b.h,
                parts: right ? b.parts : mirrorParts(b.parts, b.w),
            });
        }
    }

    // --- 天井 ---
    for (const run of sites.ceilings) {
        if (run.c1 - run.c0 < TOWN_CEIL_MIN_RUN || run.drop < TOWN_CEIL_MIN_DROP) continue;
        const maxHang = (run.drop - TOWN_CEIL_KEEP_BELOW) * T;
        const share = adobeShare(run.drop);
        const y = (run.r + 1) * T - 4;   // 綱の上端 4px を天井の岩に埋める
        let c = run.c0 + 1;
        while (c < run.c1 - 1) {
            if (rng.next() > villageness(c, run.r)) { c += 3 + Math.floor(rng.next() * 4); continue; }
            const style = rng.next() < share ? 'A' : 'C';
            const room = (run.c1 - 1 - c) * T;
            let b;
            if (style === 'A' && room >= 64 && rng.next() < 0.5) {
                b = buildHangingBridge(rng, { span: step4(rng, 64, Math.min(160, room)), maxHang });
            } else if (style === 'C' && rng.next() < 0.4) {
                b = buildHangingShack(rng, { maxHang });
            } else {
                b = buildLantern(rng, { maxHang });
            }
            if (b) {
                add({ site: 'ceiling', style, kind: b.kind, x: c * T + step4(rng, 0, 8), y, w: b.w, h: b.h, parts: b.parts });
            }
            c += Math.max(3, Math.ceil((b ? b.w : 16) / T)) + Math.floor(rng.next() * 4);
        }
    }
    // --- 爆発物（段3b）。建物の後ろに足すので、描く順でも建物より手前に出る（狙って撃てるように）
    if (explosiveRng) specs.push(...placeExplosives(specs, explosiveRng, { solid, fits }));
    return specs;
}
