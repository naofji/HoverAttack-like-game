// ============================================
// snowTrees - 5面の雪をかぶった木（針葉樹・枯れ木）
// ============================================
//
// 4面の植物（plants.js）と同じ作り: 絵は多角形で、当たり・支え・壊れ方は 4px のかけらの表のまま
// （chunks.js の rasterizeParts が、多角形が掛かるかけらを全部 MAT_PLANT の厚い壁にする）。
// 座標は建物の canvas の px。床だけに立つので、下端 y = 0 で、下の 4px（根元の段）は地形に埋まる。
// 地面は y = GROUND（-4）、木の中心は x = 0。見える高さは「高さ - 4」で、20〜72px（機体 24px の 8割〜3倍。ユーザー指定）。
//
// 色ごとに 1 回の fill で塗るので、描く順は「色を足した順」になる。木では下から
// 幹 → 針葉の本体 → 針葉の下側の影 → 雪の影 → 雪 → 雪の明るい面、の順に並べておく（雪が必ず針葉の上）。

import { CHUNK } from './chunks.js';
import { SNOWTREE_COLORS as COL } from './palette.js';
import { SNOWTREE_HEIGHT } from '../../utils/Constants.js';
import { newArt, finish, rand, GROUND } from './plants.js';

const PI = Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 描く順に色を並べた絵。足した順 = 塗る順なので、空の組を先に作って順を決める */
function newTreeArt() {
    const art = newArt();
    for (const c of [COL.trunk[0], COL.needle[1], COL.needle[0], COL.snow[0], COL.snow[1], COL.snow[2], COL.snow[3]]) art.groups.set(c, []);
    return art;
}

/** 見える高さを引く。置ける高さ（根元の埋まる 4px を含む）に収まらなければ null。4px 刻み（かけらの大きさに揃える） */
function pickHeight(rng, kind, maxH) {
    const [lo, hi0] = SNOWTREE_HEIGHT[kind];
    const hi = Math.min(hi0, Math.floor((maxH - CHUNK) / CHUNK) * CHUNK);
    if (hi < lo) return null;
    return lo + CHUNK * Math.floor(rng.next() * ((hi - lo) / CHUNK + 1));
}

/**
 * 根元の段を満たす多角形（支えのかけら）。幹の色で、地形に埋まるので見えない。
 * 右端を 4 ちょうどにしない: 4px のかけらの境目（x = 4）に触れると、その右隣のかけらまで根元の段に入り、
 * 床の縁に立てたとき右の 1 かけらが穴の上に浮く（実測: 足場の端で根元の下が空きになった）
 */
function treeRoot(art) {
    art.add(COL.trunk[0], [[-2, 0], [3.5, 0], [3.5, GROUND + 0.5], [-2, GROUND + 0.5]]);
}

/**
 * 針葉樹。幹の上に枝の段が重なり（背が高いほど段が多い）、段ごとに上の斜面へ雪が載って、縁が波打つ。
 * 下の段ほど広い円錐。雪は段の上側 6 割と頂だけで、段の下側は針葉の暗い影が見える
 * @param {{maxH:number}} o 置ける高さ（px。根元の埋まる 4px を含む）
 */
export function buildFir(rng, { maxH }) {
    const Hv = pickHeight(rng, 'fir', maxH);
    if (Hv === null) return null;
    const art = newTreeArt();
    const hw0 = clamp(Hv * 0.3 + 1.5, 6, 22) * rand(rng, 0.92, 1.08);
    const trunkH = Math.max(4, Math.round(Hv * 0.12));
    const thw = Hv >= 40 ? 2 : 1.5;
    art.add(COL.trunk[0], [[-thw - 0.5, 0], [thw + 0.5, 0], [thw, GROUND - trunkH - 2], [-thw, GROUND - trunkH - 2]]);
    treeRoot(art);

    const yTop = GROUND - Hv;
    const yBase = GROUND - trunkH * 0.55;
    const n = clamp(Math.round(Hv / 13), 2, 5);
    const th = (yBase - yTop) / (0.7 * (n - 1) + 1);   // 段は上の段の下 3 割に潜り込む
    let prevHwb = 0;
    for (let i = 0; i < n; i++) {
        const yt = yTop + i * 0.7 * th, yb = yt + th;
        const hwb = hw0 * (0.42 + 0.58 * (i + 1) / n) * rand(rng, 0.95, 1.05);
        const hwt = i === 0 ? 0.5 : prevHwb * 0.5;   // 2段目からの上辺は上の段に隠れる
        const top = yt + (i === 0 ? 2 : 0);          // 頂の針葉は雪の頂より 2px 下から（雪が頂になる）
        const w = (y) => hwt + (hwb - hwt) * clamp((y - yt) / th, 0, 1);
        prevHwb = hwb;
        // 針葉の本体。下の縁は枝先が垂れて、真ん中が上がる
        const bottom = [[hwb, yb + 1], [hwb * 0.55, yb - 1.2], [0, yb - 0.2], [-hwb * 0.55, yb - 1.2], [-hwb, yb + 1]];
        art.add(COL.needle[1], [[-hwt, top], [hwt, top], ...bottom]);
        // 下側の影の帯（段の下 3 割弱）
        const yu = yb - th * 0.28;
        art.add(COL.needle[0], [[-w(yu), yu], [w(yu), yu], ...bottom]);

        // 雪: 段の上側。頂の段は頂から、それ以外は上の段の下から見える所の 6 割まで
        const ys0 = i === 0 ? yTop : yt + 0.3 * th;
        const ys1 = yt + th * (i === 0 ? 0.62 : 0.55);
        const W = (y) => (i === 0 && y <= yTop + 0.01 ? 0.4 : w(Math.max(y, yt + 0.3 * th)) - 0.5);   // 雪は枝より 0.5px 内側（縁に針葉の緑が見える）
        const teeth = Math.max(2, Math.round(W(ys1) / 3));
        const lip = [];   // 縁の波（右 → 左）。端は枝先に雪が垂れ、間は波打つ
        for (let j = 0; j <= teeth; j++) {
            const x = W(ys1) * (1 - 2 * j / teeth);
            lip.push([x, ys1 + (j === 0 || j === teeth ? 1.4 : j % 2 === 0 ? 1.8 : 0)]);
        }
        const snowRing = [[-W(ys0), ys0], [W(ys0), ys0], ...lip];
        art.add(COL.snow[0], snowRing.map(([x, y]) => [x, y + 1.6]));   // 縁の下に覗く影
        art.add(COL.snow[1], snowRing);
        // 左上の明るい面
        const ya = ys0 + (i === 0 ? 1.5 : 0.5), yb2 = ys1 - 1.5;
        if (yb2 - ya >= 2) {
            art.add(COL.snow[2], [[-W(ya), ya], [-W(ya) * 0.35, ya], [-W(yb2) * 0.35, yb2], [-W(yb2), yb2]]);
        }
        if (i === 0) art.add(COL.snow[3], [[0, yTop], [-1.6, yTop + 3.4], [1.6, yTop + 3.4]]);   // 頂の光
    }
    return finish(art, 'fir');
}

/**
 * 1本の枝（先へ細くなる帯）。(x0, y0) から angle（画面座標。真上 = -π/2）の向きに 3px ずつ進み、少しうねる。
 * limitY より上へは出ない（木の頂を決めた高さに収める）。上を向いた区間の上側に雪を載せる
 * （ほぼ縦の所と、下へ向かう所には載らない）。depth が浅いうちは途中から小枝を出す。
 * 返り値は通った点の列（幹の枝分かれの根元に使う）
 */
function branch(art, rng, x0, y0, angle, len, w0, { depth = 0, limitY, topY, wander = 0.1, w1 = 0.5, snow = true }) {
    const step = 3;
    const pts = [{ x: x0, y: y0, a: angle }];
    let x = x0, y = y0, a = angle;
    const n = Math.max(2, Math.round(len / step));
    for (let k = 1; k <= n; k++) {
        a += rand(rng, -wander, wander);
        let nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        if (ny < limitY) {   // 頂の高さで止める（手前まで進んだ分だけ、頂に届く点を足す）
            const t = (y - limitY) / (y - ny);
            if (t > 0.05) pts.push({ x: x + (nx - x) * t, y: limitY, a });
            break;
        }
        x = nx; y = ny;
        pts.push({ x, y, a });
    }
    const m = pts.length - 1;
    if (m < 1) return pts;
    const hw = (k) => (w0 + (w1 - w0) * (k / m)) / 2;
    const left = [], right = [];
    pts.forEach((p, k) => {
        left.push([p.x - Math.sin(p.a) * hw(k), p.y + Math.cos(p.a) * hw(k)]);
        right.push([p.x + Math.sin(p.a) * hw(k), p.y - Math.cos(p.a) * hw(k)]);
    });
    art.add(COL.trunk[0], [...left, ...right.reverse()]);

    if (snow) {
        // 上を向く法線。雪の厚みは、横に寝た枝ほど厚い
        const up = pts.map((p) => { const nx = Math.sin(p.a), ny = -Math.cos(p.a); return ny <= 0 ? [nx, ny] : [-nx, -ny]; });
        const thick = pts.map((p) => (Math.abs(Math.cos(p.a)) < 0.3 || Math.sin(p.a) > 0.45 ? 0 : 0.3 + 1.0 * Math.abs(Math.cos(p.a))));
        for (let k = 0; k < pts.length;) {
            if (thick[k] === 0) { k++; continue; }
            const k0 = k;
            while (k < pts.length && thick[k] > 0) k++;
            if (k - k0 < 2) continue;
            const outer = [], inner = [], light = [];
            for (let j = k0; j < k; j++) {
                const p = pts[j], [ux, uy] = up[j];
                outer.push([p.x + ux * (hw(j) + thick[j]), Math.max(topY, p.y + uy * (hw(j) + thick[j]))]);
                inner.push([p.x + ux * hw(j) * 0.55, p.y + uy * hw(j) * 0.55]);
                light.push([p.x + ux * (hw(j) + thick[j] * 0.45), Math.max(topY, p.y + uy * (hw(j) + thick[j] * 0.45))]);
            }
            art.add(COL.snow[1], [...outer, ...inner.reverse()]);
            if (thick[k0] > 0.9) art.add(COL.snow[2], [...outer, ...light.reverse()]);
        }
    }

    if (depth < 2 && len > 8) {
        const subs = depth === 0 ? 1 + Math.floor(rng.next() * 2) : Math.floor(rng.next() * 2);
        for (let s = 0; s < subs; s++) {
            const at = Math.max(1, Math.min(m - 1, Math.round(m * rand(rng, 0.45, 0.75))));
            const side = rng.next() < 0.5 ? 1 : -1;
            branch(art, rng, pts[at].x, pts[at].y, pts[at].a + side * rand(rng, 0.5, 0.95), len * 0.55,
                Math.max(1.0, w0 * 0.6), { depth: depth + 1, limitY, topY, wander, w1: 0.4, snow });
        }
    }
    return pts;
}

/**
 * 枯れ木。細い幹が頂まで伸び、左右の枝が斜め上へ広がって小枝を出す。葉が無いので、
 * 雪は枝と小枝の上側に細く積もり、幹の頂に小さな雪帽子が載る
 * @param {{maxH:number}} o 置ける高さ（px。根元の埋まる 4px を含む）
 */
export function buildBareTree(rng, { maxH }) {
    const Hv = pickHeight(rng, 'bare', maxH);
    if (Hv === null) return null;
    const art = newTreeArt();
    treeRoot(art);
    const topY = GROUND - Hv;
    // 幹: 頂（雪帽子の下 2px）まで届くまで進む。枝は頂より 1px 下で止める（雪が頂を越えないように）
    const trunk = branch(art, rng, 0, GROUND + 2, -PI / 2, Hv * 1.6, Hv >= 40 ? 5 : 4, {
        depth: 9, limitY: topY + 2, topY, wander: 0.05, w1: 0.9, snow: false,
    });
    const nb = clamp(Math.round(Hv / 8), 2, 6);
    let side = rng.next() < 0.5 ? 1 : -1;
    for (let b = 0; b < nb; b++) {
        const t = 0.3 + 0.6 * (b + rng.next() * 0.8) / nb;   // 下から上へ。上の枝ほど短い
        const idx = clamp(Math.floor(t * (trunk.length - 1)), 1, trunk.length - 2);
        const len = Math.max(6, Hv * rand(rng, 0.22, 0.42) * (1 - 0.45 * t));
        branch(art, rng, trunk[idx].x, trunk[idx].y, -PI / 2 + side * rand(rng, 0.55, 1.15), len, 2.2, {
            limitY: topY + 3, topY,
        });
        side = rng.next() < 0.8 ? -side : side;
    }
    // 幹の頂の雪帽子
    const tip = trunk[trunk.length - 1];
    art.add(COL.snow[2], [[tip.x - 2.4, topY + 4.5], [tip.x - 1.4, topY + 1.2], [tip.x, topY], [tip.x + 1.4, topY + 1.2], [tip.x + 2.4, topY + 4.5], [tip.x, topY + 3.2]]);
    art.add(COL.snow[1], [[tip.x - 3, topY + 6], [tip.x - 2.4, topY + 3.6], [tip.x, topY + 2.4], [tip.x + 2.4, topY + 3.6], [tip.x + 3, topY + 6], [tip.x, topY + 5]]);
    return finish(art, 'bareTree');
}
