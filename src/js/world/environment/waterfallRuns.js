// ============================================
// 滝を「1本の流れ」として組み立てる（純関数。canvas に触らない）
// ============================================
//
// 以前の描画は、滝をセルごとにばらばらに描いていた。帯の左右位置はそのセルの
// 両隣だけを見て決め、描き始めは一律に WATERFALL_HEAD_DROP 下げていた。
// 実機のスクリーンショットで指摘された見え方はどれもそこから来ている:
//   1. 水源の口の下が1タイル空いて、点々だけに見える
//   2. 滝が床の1タイル上で途切れる
//   3. 着水点から次の落ち際まで、床の上を水が流れていない
//   4. 落ち際だけ縁に寄り、すぐ下で中央へずれて段が付く
// 2 と 3 は描画ではなく中身から来ている。シミュレーション（waterSimulation.js の
// ケースA）は床に着いた水を同じフレームのうちに落ち口まで運んでしまうので、
// 着水点のセルも床の上のセルも、描く瞬間にはほとんど空になっている。
//
// そこで、列の中で連続した滝セルを1本の区間（run）にまとめ、
//   - 上端: どこから出たか（岩の口／床の縁からの落ち際／空中）
//   - 下端: どこに着いたか（床／水たまり／まだ空中）
//   - 横位置: 上端で1回だけ決め、区間の全部で同じ x
//   - 床に着いたら、シミュレーションが水を運ぶ先の落ち口まで「床を流れる水」
// を地形と種別から毎回導く。状態は持たない（過去に、状態を持つ見た目の判定が
// 3回続けて回帰を出した。memory: hoverattack-sticky-anchor-propagation-bug）。

import {
    TILE_SIZE, MAX_WATER_MASS, WATERFALL_BAND_WIDTH, RUNNING_WATER_THICKNESS,
} from '../../utils/Constants.js';

/** 帯の左端 x。left/right は壁から1px 離す（岩の面取りと重ならないように） */
export function bandLeftX(c, align) {
    if (align === 'left') return c * TILE_SIZE + 1;
    if (align === 'right') return (c + 1) * TILE_SIZE - WATERFALL_BAND_WIDTH - 1;
    return c * TILE_SIZE + Math.floor((TILE_SIZE - WATERFALL_BAND_WIDTH) / 2);
}

/** (r, c) の上に水が乗れるか（床か、満水の水）。落ち際・着水の判定に使う */
function supports(map, r, c) {
    return map.isSolid(r, c) || map.water[r * map.cols + c] >= MAX_WATER_MASS;
}

/**
 * 行 r で (r, c) にある水を、シミュレーションがどの落ち口へ運ぶか。無ければ -1。
 * waterSimulation.js のケースAと同じ規則: 同じ区間（左右の壁のあいだ）で、直下が岩でも
 * 満水でもない最寄りのセル。等距離なら左。
 */
export function drainColFor(map, r, c) {
    const isDrain = (cc) => !supports(map, r + 1, cc);
    if (isDrain(c)) return c;
    let L = -1;
    for (let cc = c - 1; cc >= 0 && !map.isSolid(r, cc); cc--) {
        if (isDrain(cc)) { L = cc; break; }
    }
    let R = -1;
    for (let cc = c + 1; cc < map.cols && !map.isSolid(r, cc); cc++) {
        if (isDrain(cc)) { R = cc; break; }
    }
    if (L < 0) return R;
    if (R < 0) return L;
    return (c - L <= R - c) ? L : R;
}

/**
 * 行 row の床の上を流れる水（厚み RUNNING_WATER_THICKNESS）を x0..x1 に敷く。
 * キャッシュが既に水を塗っているタイル（水量がある、または液面がかかっている）は
 * 避ける。重ねると半透明の二重塗りでまだらになる。
 */
function makeSheet(map, row, x0, x1, dir) {
    const y = (row + 1) * TILE_SIZE - RUNNING_WATER_THICKNESS;
    const segments = [];
    let segStart = -1;
    for (let c = Math.floor(x0 / TILE_SIZE); c * TILE_SIZE < x1; c++) {
        const a = Math.max(x0, c * TILE_SIZE);
        const b = Math.min(x1, (c + 1) * TILE_SIZE);
        const k = row * map.cols + c;
        const painted = map.water[k] > 0 || map.waterSurfaceY[k] >= 0;
        if (painted) {
            if (segStart >= 0) { segments.push([segStart, a]); segStart = -1; }
        } else if (segStart < 0) {
            segStart = a;
        }
        if (b >= x1 && segStart >= 0) segments.push([segStart, b]);
    }
    return { y, x0, x1, dir, segments };
}

/**
 * 水たまりからあふれて落ち際 (headR, c) へ流れてくる床の水。
 * 落ち際から水の来る側（side）へ、床の上の乾いたタイルを辿り、水たまり（直下が
 * 床でない水）に行き着いたら、そこから落ち際までが床を流れる水。途中に滝の着水点が
 * あれば、そちらの床の水（着水点から落ち口へ）が既に敷かれるので何もしない。
 * 以前はこれが無く、あふれ出た水が何も無いところから短い四角として湧いて見えた
 * （実機の指摘）
 */
function poolFeedSheet(map, headR, c, align, x) {
    const side = align === 'left' ? -1 : 1;
    for (let cc = c + side; cc >= 0 && cc < map.cols; cc += side) {
        if (map.isSolid(headR, cc)) return null;
        if (map.isWaterfallCell(headR - 1, cc) || map.isWaterfallCell(headR, cc)) return null;
        if (map.isSolid(headR + 1, cc)) continue;
        // 床が切れた先が水なら、水たまりの縁。そこまでを敷く
        if (!map.isWater(headR, cc) && !map.isWater(headR + 1, cc)) return null;
        const edge = side < 0 ? (cc + 1) * TILE_SIZE : cc * TILE_SIZE;
        const spillEdge = side < 0 ? x : x + WATERFALL_BAND_WIDTH;
        if (Math.abs(edge - spillEdge) < 1) return null;
        return makeSheet(map, headR, Math.min(edge, spillEdge), Math.max(edge, spillEdge), -side);
    }
    return null;
}

/**
 * 区間の上端 (headR, c) がどこから出た水か。
 * @returns {{ source: 'mouth'|'spill'|'air', align: 'left'|'right'|'center', topY: number }}
 */
function describeHead(map, headR, c) {
    // 岩の口: 真上が岩。岩の下面から出る（水源、または岩の割れ目から染み出た水）
    if (headR === 0 || map.isSolid(headR - 1, c)) {
        return { source: 'mouth', align: 'center', topY: headR * TILE_SIZE };
    }
    // 床の縁からの落ち際: 横のセルが空いていて、その下が床（か満水）。水はそちらから
    // 床を伝って流れてきて、ここで縁を越える。両側とも縁なら、実際に水を送ってくる
    // 側（その側の床の水の落ち口がここ）を選ぶ
    const ledge = (dc) => {
        const cc = c + dc;
        if (cc < 0 || cc >= map.cols || map.isSolid(headR, cc)) return false;
        return supports(map, headR + 1, cc);
    };
    const feeds = (dc) => {
        for (let cc = c + dc; cc >= 0 && cc < map.cols && !map.isSolid(headR, cc) && supports(map, headR + 1, cc); cc += dc) {
            if (map.water[headR * map.cols + cc] > 0 || map.isWaterfallCell(headR - 1, cc)) {
                return drainColFor(map, headR, cc) === c;
            }
        }
        return false;
    };
    const fromLeft = ledge(-1), fromRight = ledge(1);
    let align = null;
    if (fromLeft && !fromRight) align = 'left';
    else if (fromRight && !fromLeft) align = 'right';
    else if (fromLeft && fromRight) align = feeds(-1) ? 'left' : feeds(1) ? 'right' : 'left';
    if (align) {
        // 床を流れる水の上面から落ち始める。縁の向こうが水たまりなら、その液面から
        const side = align === 'left' ? c - 1 : c + 1;
        const floorY = (headR + 1) * TILE_SIZE - RUNNING_WATER_THICKNESS;
        const level = map.getSurfaceY(headR, side);
        const topY = level >= 0 ? Math.min(level, floorY) : floorY;
        return { source: 'spill', align, topY: Math.max(headR * TILE_SIZE, topY) };
    }
    return { source: 'air', align: 'center', topY: headR * TILE_SIZE };
}

/**
 * 区間の下端 (footR, c) の先がどうなっているか。
 * @returns {{ landing: 'floor'|'pool'|'none', bottomY: number, landR: number }}
 */
function describeFoot(map, footR, c) {
    const r = footR + 1;
    if (r >= map.rows || map.isSolid(r, c)) {
        return { landing: 'floor', bottomY: r * TILE_SIZE, landR: footR };
    }
    const level = map.getSurfaceY(r, c);
    // 真下のセルが床の上: 床に着く。そこに水たまりがあればその液面、無ければ
    // 床を流れる水の上面まで
    if (map.isSolid(r + 1, c)) {
        const floorY = (r + 1) * TILE_SIZE - RUNNING_WATER_THICKNESS;
        return { landing: 'floor', bottomY: level >= 0 ? Math.min(level, floorY) : floorY, landR: r };
    }
    // 水たまりへ落ちる
    if (level >= 0) {
        return { landing: 'pool', bottomY: Math.max(footR * TILE_SIZE, level), landR: r };
    }
    // 真下が1セルだけ空いて、その下が水たまり。細い流れは水量1の塊が並んだもので、
    // 下端の真下がその瞬間だけ空になる。そのまま「まだ空中」にすると湖面の1タイル
    // 上で止まって見えた（実機の指摘）。空いた1セルを越えて液面まで伸ばす
    if (r + 1 < map.rows && !map.isWater(r, c)) {
        const below = map.getSurfaceY(r + 1, c);
        if (below >= 0 && !map.isWaterfallCell(r + 1, c)) {
            return { landing: 'pool', bottomY: below, landR: r + 1 };
        }
    }
    // まだ空中（落ちている水の先頭）
    return { landing: 'none', bottomY: r * TILE_SIZE, landR: r };
}

/**
 * 画面に見えている範囲の滝を区間にまとめる。区間の上端・下端が範囲の外でも、
 * 本当の上端・下端まで辿る（そうしないと画面の端で描き始めが変わる）。
 *
 * @returns {Array<{
 *   c: number, headR: number, footR: number, x: number, width: number,
 *   source: string, align: string, topY: number, bottomY: number,
 *   landing: string, landR: number,
 *   sheet: null | Sheet,       // 着水点から落ち口までの床の水
 *   feedSheet: null | Sheet,   // 水たまりの縁から、この落ち際までの床の水
 * }>}
 * Sheet = { y, x0, x1, dir, segments: Array<[x0, x1]> }（segments はキャッシュが塗っていない部分）
 */
export function collectWaterfallRuns(map, c0, c1, r0, r1) {
    const runs = [];
    for (let c = Math.max(0, c0); c <= Math.min(map.cols - 1, c1); c++) {
        let r = Math.max(0, r0);
        const rEnd = Math.min(map.rows - 1, r1);
        while (r <= rEnd) {
            if (!map.isWaterfallCell(r, c)) { r++; continue; }
            let headR = r;
            while (headR - 1 >= 0 && map.isWaterfallCell(headR - 1, c)) headR--;
            // 下へ辿る。途中の1セルだけの空き（水量1の塊の継ぎ目）は越えて1本にする
            let footR = r;
            for (;;) {
                if (footR + 1 < map.rows && map.isWaterfallCell(footR + 1, c)) { footR++; continue; }
                if (footR + 2 < map.rows && !map.isWater(footR + 1, c) && !map.isSolid(footR + 1, c)
                    && map.isWaterfallCell(footR + 2, c)) { footR += 2; continue; }
                break;
            }
            r = footR + 1;

            // 細い流れは水量1の塊が並んだもので、落下が4フレームに1回なので、
            // 上端のセル（水源の口・床の縁の落ち口）がその瞬間だけ空になることが
            // ある。そのまま判定すると「空中から始まる滝」になり、口の形・左右の寄せが
            // フレームごとに入れ替わって見えた（実物の4面で、区間の 13% のフレームで
            // 上端が入れ替わっていた）。空いた1セルぶんだけ遡って判定し直す
            let head = describeHead(map, headR, c);
            if (head.source === 'air' && headR - 1 >= 0 && !map.isWater(headR - 1, c)) {
                const above = describeHead(map, headR - 1, c);
                if (above.source !== 'air') {
                    headR -= 1;
                    head = above;
                }
            }
            const foot = describeFoot(map, footR, c);
            const x = bandLeftX(c, head.align);
            const run = {
                c, headR, footR, x, width: WATERFALL_BAND_WIDTH,
                source: head.source, align: head.align, topY: head.topY,
                bottomY: foot.bottomY, landing: foot.landing, landR: foot.landR,
                sheet: null,
                feedSheet: head.source === 'spill' ? poolFeedSheet(map, headR, c, head.align, x) : null,
            };

            // 床に着いたら、シミュレーションが運ぶ先の落ち口まで床を流れる水を敷く。
            // 着水した帯の真下は全幅を覆い、落ち口の側は落ちていく帯の縁で止める。
            // 帯と重ねると半透明の二重塗りで角が明るく浮く（書き出して確認した）。
            // 落ち口の帯は縁の側に寄せて描き（describeHead の spill）、上端は床の水の
            // 上面と同じ高さなので、ちょうど L 字につながる
            if (foot.landing === 'floor' && map.isSolid(foot.landR + 1, c)) {
                const d = drainColFor(map, foot.landR, c);
                if (d >= 0 && d !== c) {
                    const dir = d > c ? 1 : -1;
                    const from = dir > 0 ? x : x + WATERFALL_BAND_WIDTH;
                    const to = dir > 0
                        ? bandLeftX(d, 'left')
                        : bandLeftX(d, 'right') + WATERFALL_BAND_WIDTH;
                    run.sheet = makeSheet(map, foot.landR, Math.min(from, to), Math.max(from, to), dir);
                }
            }
            runs.push(run);
        }
    }
    return runs;
}
