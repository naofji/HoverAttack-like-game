// ============================================
// plants - 4面の苔とシダ
// ============================================
//
// 絵は**多角形**で描く（葉・羽片・幹・こぶ）。最初は 4px 角の四角で組んだが、ユーザーに
// 「ドットがもう少し細かい方がいい、polygon で描いたほうが植物味が出る」と言われて替えた。
// 町は fillRect だけだが、植物は柔らかい形が要るので多角形にする。縁は本物の canvas がなめらかに塗る。
// 当たり・支え・壊れ方は 4px のかけらの表のまま（chunks.js の rasterizeParts が、多角形が掛かるかけらを全部
// MAT_PLANT の厚い壁にする）。ユーザーの指摘で弾は止まる: すり抜けるのに欠けるのでは壊れることに筋が通らない。
//
// 座標は建物の canvas の px。向きごとの原点（root）:
//   床:   下端 y = 0。下の 4px（根元の段）は地形に埋まる（TOWN_FOUNDATION_SINK）ので、地面は y = -4。上へ y を負に
//   壁:   壁に埋まる根元の列は x が 0〜4。外へ x を正に（右向きで組み、左の壁は mirrorParts で反転）
//   天井: 上端 y = 0。上の 4px が天井に埋まる。下へ y を正に
// 見える高さは床で「高さ - 4」。苔 4〜8px / 低いシダ 24px 未満 / 高いシダ 24px 超
// （自機・アタッカーが 24px なので、機体より低いものと高いものが混ざる）。

import { CHUNK, MAT_PLANT } from './chunks.js';
import { ringPart } from './shapes.js';
import { PLANT_COLORS as COL } from './palette.js';
import { PLANT_TALL_TRUNK } from '../../utils/Constants.js';

const PI = Math.PI;
export const rand = (rng, lo, hi) => lo + rng.next() * (hi - lo);
export const GROUND = -CHUNK;   // 床の地面（根元の段の上端）

/** 色ごとに輪を溜める。finish() で 1 色 1 部品にして、1回の fill で塗れるようにする */
export function newArt() {
    const groups = new Map();
    return {
        groups,
        add(color, ring) {
            if (!groups.has(color)) groups.set(color, []);
            groups.get(color).push(ring);
        },
        /** 別の絵を (dx, dy) ずらして取り込む */
        addArt(other, dx, dy) {
            for (const [color, rings] of other.groups) {
                for (const r of rings) this.add(color, r.map(([x, y]) => [x + dx, y + dy]));
            }
        },
        bounds() {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const rings of groups.values()) {
                for (const r of rings) for (const [x, y] of r) {
                    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                }
            }
            return { x0, y0, x1, y1 };
        },
    };
}

/** 絵の外接矩形を 4px の倍数に広げ、左上を (0, 0) に寄せて部品にする。footX は原点の x（px） */
export function finish(art, kind) {
    const b = art.bounds();
    const x0 = Math.floor(b.x0 / CHUNK) * CHUNK, y0 = Math.floor(b.y0 / CHUNK) * CHUNK;
    const x1 = Math.ceil(b.x1 / CHUNK) * CHUNK, y1 = Math.ceil(b.y1 / CHUNK) * CHUNK;
    const parts = [];
    for (const [color, rings] of art.groups) {
        ringPart(parts, rings.map((r) => r.map(([x, y]) => [x - x0, y - y0])), color, MAT_PLANT, true);
    }
    return { kind, parts, w: x1 - x0, h: y1 - y0, footX: -x0 };
}

/**
 * 1枚の葉（フロンド）。根元 (x0, y0) から angle（ラジアン、画面座標。真上 = -π/2）の向きに進み、
 * 進むほど重力で垂れる（curl が大きいほど急に）。葉軸は先へ細くなる帯、羽片は軸の両脇に
 * 先へ向かって斜めに出る三角形で、先ほど小さい。羽片は根元側ほど暗く、先ほど明るい。
 * 根元は葉軸の太さ分だけ重ねるので、扇状に広げても根元の継ぎ目が出ない。
 */
function frond(art, x0, y0, angle, len, curl, { width = 2.2, leaf = 4.5, step = 3 } = {}) {
    const n = Math.max(2, Math.round(len / step));
    const pts = [{ x: x0, y: y0, a: angle }];
    let x = x0, y = y0, a = angle;
    for (let k = 1; k <= n; k++) {
        a += curl * (Math.cos(a) >= 0 ? 1 : -1);   // 水平より下へ垂れる向きに回す
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push({ x, y, a });
    }
    // 葉軸（先へ細くなる帯）
    const left = [], right = [];
    pts.forEach((p, k) => {
        const hw = Math.max(0.55, (width / 2) * (1 - k / n));
        left.push([p.x - Math.sin(p.a) * hw, p.y + Math.cos(p.a) * hw]);
        right.push([p.x + Math.sin(p.a) * hw, p.y - Math.cos(p.a) * hw]);
    });
    art.add(COL.leaf[0], [...left, ...right.reverse()]);
    // 羽片（根元に近い 1 点目は軸の太さに埋もれるので飛ばす）
    for (let k = 1; k < n; k++) {
        const p = pts[k], t = k / n;
        const L = leaf * Math.min(1, 0.45 + t * 2) * (1 - t * 0.75);
        const color = COL.leaf[1 + Math.min(2, Math.floor(t * 3))];
        for (const side of [1, -1]) {
            const da = p.a + side * (PI / 2 - 0.55);   // 軸より 62° 開き、先へ斜めに出る
            const tx = Math.cos(p.a), ty = Math.sin(p.a);
            art.add(color, [
                [p.x - tx * step * 0.55, p.y - ty * step * 0.55],
                [p.x + tx * step * 0.45, p.y + ty * step * 0.45],
                [p.x + Math.cos(da) * L, p.y + Math.sin(da) * L + L * 0.25],   // 先は少し垂れる
            ]);
        }
    }
}

/** 根元の埋まる段を満たす多角形。床の植物はこれで「根元の段に根元のかけらがある」を保つ（支えのかけら） */
function floorRoot(art, x0 = -1, x1 = 5) {
    art.add(COL.moss[0], [[x0, 0], [x1, 0], [x1, GROUND + 0.5], [x0, GROUND + 0.5]]);
}

/**
 * 苔のじゅうたん（床）。なだらかなこぶの輪郭に、上の縁の明るい帯と、暗い・明るい斑点。見える高さは 4〜8px
 * @param {{maxW:number}} o 置ける幅（px）
 */
export function buildMoss(rng, { maxW }) {
    const W = Math.floor(Math.min(maxW, 40) / 2) * 2;
    if (W < 8) return null;
    const art = newArt();
    const w = Math.max(8, Math.floor(rand(rng, 8, W + 1) / 2) * 2);
    const peak = rand(rng, 3.5, 8);
    const phase = rng.next() * 6, f1 = rand(rng, 0.25, 0.5), f2 = rand(rng, 0.7, 1.1);
    const top = [];   // 上の縁（地面からの高さ）
    for (let x = 0; x <= w; x += 2) {
        const edge = Math.min(1, Math.min(x, w - x) / 6 + 0.25);   // 端は低く
        const wave = 0.6 + 0.25 * Math.sin(x * f1 + phase) + 0.15 * Math.sin(x * f2 + phase * 2);
        top.push([x, GROUND - peak * wave * edge]);
    }
    art.add(COL.moss[1], [[0, 0], ...top, [w, 0]]);
    // 上の縁の明るい帯（縁を 1.6px 下げた輪郭との間）
    art.add(COL.moss[3], [...top, ...top.map(([x, y]) => [x, Math.min(GROUND, y + 1.6)]).reverse()]);
    // 暗い斑点（影の窪み）と明るい粒
    for (let i = 0; i < Math.floor(w / 6); i++) {
        const x = rand(rng, 2, w - 2), y = GROUND - rand(rng, 0.5, Math.max(0.6, peak * 0.4));
        const r = rand(rng, 0.8, 1.5);
        art.add(i % 2 === 0 ? COL.moss[0] : COL.moss[2], [[x - r, y], [x, y - r], [x + r, y], [x, y + r]]);
    }
    floorRoot(art, 0, Math.min(w, 6));
    art.add(COL.moss[1], [[0, 0], [w, 0], [w, GROUND + 0.5], [0, GROUND + 0.5]]);
    return finish(art, 'moss');
}

/**
 * 低いシダ（床）。根元から 5〜7 枚の葉を扇形に広げ、先を垂らす。見える高さは 20px 以下
 */
export function buildLowFern(rng, { maxH = Infinity }) {
    if (maxH < 16) return null;
    const art = newArt();
    const n = 6 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const angle = -PI + 0.4 + t * (PI - 0.8) + rand(rng, -0.1, 0.1);   // 左上 → 右上
        const upright = 1 - Math.abs(t - 0.5) * 2;                           // 真ん中ほど立つ
        const len = 11 + upright * 5 + rand(rng, 0, 2);                      // 立つ葉でも 18px 止まり。見える高さは 20px 以下（5000 通りの乱数で実測、tests/plants-build.test.js）
        frond(art, 2, GROUND + 1, angle, len, rand(rng, 0.1, 0.18), { width: 2.2, leaf: 4.8 });
    }
    floorRoot(art);
    const b = finish(art, 'lowFern');
    return b.h <= maxH ? b : null;
}

/**
 * 高いシダ（床）。先へ細くなる幹が少し揺れながら伸び、先に冠のように葉が開く。見える高さは 24px 超
 * @param {{maxH:number}} o 置ける高さ（px。根元の埋まる 4px を含む）
 */
export function buildTallFern(rng, { maxH }) {
    // 置ける高さが 40px に満たなければ作らない（置く側が低いシダに替える）。幹を切り詰めて冠だけにすると
    // 平らな傘に見えた（実物の PNG）ので、冠の高さは必ず取る
    const limit = Math.floor(maxH / CHUNK) * CHUNK;
    if (limit < 40) return null;
    const crown = newArt();
    const n = 7 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        // -145°〜-35° に扇形に開く。真横に近い葉を作ると冠が傘のように平らに見える
        const angle = -PI + 0.6 + t * (PI - 1.2) + rand(rng, -0.08, 0.08);
        const upright = 1 - Math.abs(t - 0.5) * 2;
        frond(crown, 0, 0, angle, 15 + upright * 5 + rand(rng, 0, 4), rand(rng, 0.13, 0.21), { width: 2.4, leaf: 5.5 });
    }
    for (const angle of [-PI + 0.15, -0.15]) {   // 左右に垂れる葉を1枚ずつ（冠をふくらませる）
        frond(crown, 0, 0, angle + rand(rng, -0.05, 0.05), rand(rng, 13, 17), rand(rng, 0.14, 0.2), { width: 2.2, leaf: 4.5 });
    }
    const extent = -crown.bounds().y0;
    const [lo, hi] = PLANT_TALL_TRUNK;
    const trunkH = Math.min(lo + Math.floor(rng.next() * ((hi - lo) / 2 + 1)) * 2, limit - extent);
    if (trunkH < 16 || trunkH + extent < 32) return null;   // 24px を超える見える高さにならない

    const art = newArt();
    // 幹: 先へ細くなり、軸が少し揺れる。4px おきに輪郭を取る
    const m = Math.max(2, Math.round(trunkH / 4));
    const sway = rand(rng, 0.5, 2.5), phase = rng.next() * 6;
    const axis = (k) => 2 + sway * Math.sin(k * 0.55 + phase) * (k / m);
    const half = (k) => 3.4 - 1.5 * (k / m);
    const left = [], right = [];
    for (let k = 0; k <= m; k++) {
        const y = -(trunkH * k) / m;
        left.push([axis(k) - half(k), y]);
        right.push([axis(k) + half(k), y]);
    }
    art.add(COL.trunk[0], [...left, ...right.reverse()]);
    // 輪紋（幹を横切る暗い帯）。根元の広がり
    for (let k = 1; k < m; k += 2) {
        const y = -(trunkH * k) / m;
        art.add(COL.trunk[1], [[axis(k) - half(k), y], [axis(k) + half(k), y], [axis(k) + half(k), y - 1.3], [axis(k) - half(k), y - 1.3]]);
    }
    art.add(COL.trunk[2], [[-3, 0], [7, 0], [5.5, -7], [-1.5, -7]]);
    art.addArt(crown, axis(m), -trunkH);
    return finish(art, 'tallFern');
}

/**
 * 壁の植物（壁に張り付く向き = 右に張り出す形で組む。左の壁は mirrorParts で反転）。
 * 壁に埋まる根元の列は x が 0〜4。壁をおおう苔か、壁から生えて垂れるシダ
 */
export function buildWallPlant(rng, { maxReach, maxH }) {
    const H = Math.min(12 + Math.floor(rng.next() * 7) * 4, Math.floor(maxH / CHUNK) * CHUNK);
    if (H < 8 || maxReach < 12) return null;
    const art = newArt();
    if (rng.next() < 0.6) {
        const reach = Math.min(8, maxReach - 8);
        const out = [];   // 壁から張り出す厚み（根元の列 4px は壁に埋まるので、見える厚みは reach まで）。上下の端は薄く
        const phase = rng.next() * 6;
        for (let y = 0; y <= H; y += 2) {
            const edge = Math.sin((PI * y) / H);
            out.push([4 + reach * Math.pow(edge, 0.6) * (0.6 + 0.4 * Math.sin(y * 0.5 + phase)), y]);
        }
        art.add(COL.moss[1], [[0, 0], [0, H], ...out.slice().reverse()]);
        art.add(COL.moss[3], [...out.map(([x, y]) => [x, y]), ...out.map(([x, y]) => [Math.max(4, x - 1.5), y]).reverse()]);
        for (let i = 0; i < Math.floor(H / 8); i++) {
            const x = rand(rng, 5, 5 + reach * 0.6), y = rand(rng, 3, H - 3), r = rand(rng, 0.8, 1.4);
            art.add(i % 2 === 0 ? COL.moss[0] : COL.moss[2], [[x - r, y], [x, y - r], [x + r, y], [x, y + r]]);
        }
        return finish(art, 'wallMoss');
    }
    // 壁から生えるシダ: 壁の中の根元から外へ、先を垂らす
    const k = 2 + Math.floor(rng.next() * 2);
    const span = Math.min(H, 4 + (k - 1) * 8);
    art.add(COL.moss[0], [[0, 0], [4, 0], [4, span + 2], [0, span + 2]]);
    for (let i = 0; i < k; i++) {
        const len = Math.min(rand(rng, 12, 20), maxReach - 4);
        frond(art, 2, 2 + i * 8, rand(rng, -0.8, 0.1), len, rand(rng, 0.1, 0.18), { width: 2, leaf: 4 });
    }
    return finish(art, 'wallFern');
}

/**
 * 垂れ下がる蔓と苔の房（天井）。上端の 4px は天井に埋まる
 * @param {{maxHang:number}} o 垂らせる長さ（px。上の埋まる 4px を含む）
 */
export function buildHangingVine(rng, { maxHang }) {
    const limit = Math.floor(maxHang / CHUNK) * CHUNK - CHUNK - 4;   // 埋まる 4px と、先の葉の余白
    if (limit < 8) return null;
    const art = newArt();
    const n = 2 + Math.floor(rng.next() * 4);
    const gap = rand(rng, 6, 9);
    const W = (n - 1) * gap + 4;
    // 天井に張る苔の房（ぶら下がる丸いこぶ）
    const tuft = [];
    for (let x = -2; x <= W + 2; x += 2) {
        const edge = Math.min(1, Math.min(x + 2, W + 2 - x) / 5 + 0.2);
        tuft.push([x, CHUNK + rand(rng, 2, 4.5) * edge]);
    }
    art.add(COL.moss[1], [[-2, 0], [W + 2, 0], ...tuft.slice().reverse()]);
    art.add(COL.moss[3], [...tuft, ...tuft.map(([x, y]) => [x, y - 1.4]).reverse()]);
    for (let s = 0; s < n; s++) {
        const x0 = 2 + s * gap + rand(rng, -1, 1);
        const len = Math.min(rand(rng, 10, 36), limit);
        const amp = rand(rng, 1, 2.2), ph = rng.next() * 6;
        const sx = (y) => x0 + amp * Math.sin(y * 0.22 + ph) * Math.min(1, y / 10);
        const left = [], right = [];
        for (let y = 2; y <= CHUNK + len; y += 2) {
            const hw = Math.max(0.5, 1.1 * (1 - (y - 2) / (CHUNK + len)));
            left.push([sx(y) - hw, y]);
            right.push([sx(y) + hw, y]);
        }
        art.add(COL.vine[0], [...left, ...right.reverse()]);
        // 小さな葉（菱形）。片側にまばらに
        let side = rng.next() < 0.5 ? 1 : -1;
        for (let y = CHUNK + 6; y < CHUNK + len - 2; y += rand(rng, 5, 8)) {
            const px = sx(y);
            const L = rand(rng, 3.5, 5);
            art.add(COL.vine[1 + (Math.floor(y) % 2)], [[px, y], [px + side * L * 0.5, y - 1.6], [px + side * L, y + 0.4], [px + side * L * 0.5, y + 1.8]]);
            side = -side;
        }
    }
    return finish(art, 'vine');
}
