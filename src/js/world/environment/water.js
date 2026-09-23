// ============================================
// 地底湖（4面）の描画
// ============================================
//
// 水タイルは地形キャッシュと同じ大きさのオフスクリーン canvas に焼き、毎フレームは
// 可視矩形を半透明で1回転送する（機体が水の色をかぶる）。水面の線は区間ごとに
// sin で上下させる。当たり判定は波打たない（水面の行は固定）。
// しぶきが落ちた場所は波紋として一時的に振幅を足し、毎フレーム減衰する。

import { isSubmergedFromAbove } from '../waterQuery.js';
import { collectWaterfallRuns } from './waterfallRuns.js';
import {
    TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
    WATER_FILL, WATER_BEHIND_FILL, WATER_SURFACE_COLOR, WATER_SURFACE_LINE_WIDTH, WATER_WAVE_AMPLITUDE, WATER_WAVE_LENGTH, WATER_WAVE_SPEED,
    WATER_RIPPLE_DECAY, WATER_RIPPLE_MIN, MAX_WATER_MASS,
    WATERFALL_MOUTH_TAPER, WATERFALL_MOUTH_WIDTH, RUNNING_WATER_THICKNESS,
} from '../../utils/Constants.js';

const RIPPLE_WIDTH = 64; // px。波紋が効く横の範囲

/** 水面の x での上下。基本の sin に、近くの波紋の分を足す。 */
export function surfaceOffset(x, t, ripples) {
    let y = Math.sin((x / WATER_WAVE_LENGTH) * Math.PI * 2 + t * WATER_WAVE_SPEED) * WATER_WAVE_AMPLITUDE;
    for (const rp of ripples) {
        const d = Math.abs(x - rp.x);
        if (d > RIPPLE_WIDTH) continue;
        // 波紋の中心（d=0）で最大、RIPPLE_WIDTH で 0 になる余弦の山。
        // sin(d/幅・π) だと中心がちょうど 0 になってしまい、
        // 波紋の真上で最も揺れる、という見た目にならない
        y += Math.cos((d / RIPPLE_WIDTH) * (Math.PI / 2)) * rp.strength * Math.cos(t * 0.4);
    }
    return y;
}

/** 水面の線を x0..x1 に描く。8px 刻みの折れ線。 */
export function drawSurfaceLine(ctx, x0, x1, surfaceY, t, ripples) {
    ctx.strokeStyle = WATER_SURFACE_COLOR;
    ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) {
        const y = surfaceY + surfaceOffset(x, t, ripples);
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

/**
 * 液面を持たない水セル（天井付き＝水中セル、または浮いた岩の真下）の塗りの上端 Y。
 * 水でなければ -1。前景の塗り（paint）と岩の背後（waterTopY）の両方がこれを読む。
 *
 * 満水ならタイル全体。満ちていないなら実際の水量ぶんだけ浅く塗る。常にタイル
 * 全体で塗ると、浅い湖に浮いた岩があるとき、その真下だけ水面より高く塗られて
 * 「水面が岩に吸い付いて」見える（実機の指摘）。
 * ただし**沈んでいる**セル（覆う岩の上にも水がある）はタイル全体が水の中。
 * 水量の量子化で 8 に1つ足りないだけのことが多く、水量ぶんだけ塗ると岩の真下に
 * 細い透明な帯が残る（黒く見える）。
 *
 * 以前はこの判定を paint() と waterTopY() に別々に書いていて、waterTopY のほうに
 * 沈み判定が無かった。沈んだ水量7のセルの隣の岩は、塗りより 2px 低い位置から
 * 背後の水が始まり、面取りの角が黒く抜けていた。
 *
 * 残っている穴: 岩に囲まれた1マスの横穴が湖の深さにあると、水量が 7 で止まった
 * まま「上はずっと岩＝沈んでいない」と判定され、タイルの上に 2px の透明な帯が
 * 残る（実測: 3000フレームで 8px ぶん1か所）。直すには液面を横方向にも塗り広げる
 * 必要があり、列単位の dirty 管理を作り替えることになるので見送った。
 */
function ceiledWaterTopY(map, r, c) {
    if (!map.isWater(r, c)) return -1;
    const mass = map.water[r * map.cols + c];
    const bottomY = (r + 1) * TILE_SIZE;
    if (mass >= MAX_WATER_MASS || isSubmergedFromAbove(map.water, (rr, cc) => map.isSolid(rr, cc), map.cols, r, c)) {
        return r * TILE_SIZE;
    }
    return bottomY - Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
}

/** 水セル (r, c) の塗りの上端 Y（液面がタイルより上にあれば液面そのもの）。水でなければ -1。 */
function waterTopY(map, r, c) {
    if (r < 0 || r >= map.rows || c < 0 || c >= map.cols) return -1;
    if (map.isSolid(r, c)) return -1;
    // 滝は細い帯でしか塗らないので、岩の背後を埋める根拠にはしない
    if (map.isWaterfallCell(r, c)) return -1;
    const level = map.waterSurfaceY[r * map.cols + c];
    if (level >= 0) return level;
    return ceiledWaterTopY(map, r, c);
}

/**
 * 岩ブロック (r, c) の背後に水を敷き始める Y。敷く必要が無ければ -1。
 *
 * 岩は面取り（bevel）で角が削られるので、水に面した角は背景が透けて**黒く抜ける**。
 * そこを埋めるために同じ色の水を岩の下に敷いている。
 *
 * 以前は「隣が満タンの水ブロックなら**タイル全体**に敷く」だった。これだと
 * 水際（液面のある行）や、水量が満たない浅い水の隣の岩には1ドットも敷かれず、
 * 湖のふちに沿って黒い三角の欠けが並ぶ（実測: 4面で面取りが水に面する岩 91個の
 * うち 33個が未処理のまま居座っていた。実機の指摘「黒く抜ける」）。
 *
 * 隣の水の**液面**を見て、そこから下だけ敷くようにする。水際の岩は液面から下だけが
 * 青くなり、液面より上の面取りは背景のまま＝水の外なので、これが正しい見え方になる。
 */
export function waterBackdropTopY(map, r, c) {
    let top = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const y = waterTopY(map, r + dr, c + dc);
            if (y >= 0 && y < top) top = y;
        }
    }
    const bottom = (r + 1) * TILE_SIZE;
    if (top === Infinity || top >= bottom) return -1;   // 隣の水はこのタイルより下
    return Math.max(top, r * TILE_SIZE);
}

/**
 * 水セルに8近傍で隣接する岩ブロックセルを収集する。
 * 実際に敷くかどうか（と、どの高さから敷くか）は waterBackdropTopY が決めるので、
 * ここは候補を漏れなく集めるだけ。
 */
export function collectBorderBlocks(map, waterCells) {
    const border = new Map();
    for (const [r, c] of waterCells) {
        if (!map.isWater(r, c)) continue;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= map.rows || nc < 0 || nc >= map.cols) continue;
                if (map.isWater(nr, nc)) continue;
                if (map.isSolid(nr, nc) && waterBackdropTopY(map, nr, nc) >= 0) {
                    border.set(nr * map.cols + nc, [nr, nc]);
                }
            }
        }
    }
    return Array.from(border.values());
}

export function createWaterRenderer(env) {
    const map = env.game.map;

    // 前景水用キャッシュ（水セルのみ。エンティティの上に重ねる）
    const cache = document.createElement('canvas');
    cache.width = map.width;
    cache.height = map.height;
    const cctx = cache.getContext('2d');

    // 下層水用キャッシュ（水セル＋境界ブロックセル。地形ブロックの下に敷く）
    const behindCache = document.createElement('canvas');
    behindCache.width = map.width;
    behindCache.height = map.height;
    const bctx = behindCache.getContext('2d');

    // invalidate は同じセルで何度も呼ばれ得る（クレーターの再通知）ので、
    // 塗る前に矩形をクリアしてから塗り直す。そうしないと半透明の水が
    // 重ね塗りで濃くなってしまう
    const paint = (cells) => {
        cctx.fillStyle = WATER_FILL;
        for (const [r, c] of cells) {
            cctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            const bottomY = (r + 1) * TILE_SIZE;
            // 滝はここでは焼かない。1本の流れとして上端・下端・横位置が決まるので
            // （waterfallRuns.js）、区間の遠くのセルが変わるだけで見た目が変わる。
            // セル単位で塗り直すキャッシュには向かないので、drawOverWorld で毎フレーム描く
            if (map.isWaterfallCell(r, c)) continue;

            // 液面（水塊にひとつ）が分かっているセルは、必ずその液面から下を塗る。
            // タイルの中で切り取るのは clamp だけ。こうしないと、ひとつの水塊
            // なのに列ごとに塗りの上端がタイルの上辺で頭打ちになり、線は平らなのに
            // 塗りが段々になる（実機の指摘。線 73px に対し塗り 80px だった）。
            // 水量が 0 のセルでも液面がかかっていれば塗る（量子化のせいで水量が
            // 届いていないだけで、水面はそこにある）
            const level = map.waterSurfaceY[r * map.cols + c];
            if (level >= 0) {
                const topY = Math.max(r * TILE_SIZE, Math.min(bottomY, Math.round(level)));
                if (bottomY - topY > 0) {
                    cctx.fillRect(c * TILE_SIZE, topY, TILE_SIZE, bottomY - topY);
                }
                // 滝が落ちてくる水たまりでは、タイルの上辺から液面までの隙間を滝の帯が
                // 埋める（滝の下端を液面まで伸ばす。waterfallRuns.js の describeFoot）
                continue;
            }

            // 液面を持たない水＝天井付き（水中セル、または浮いた岩の真下）
            const topY = ceiledWaterTopY(map, r, c);
            if (topY >= 0 && bottomY - topY > 0) {
                cctx.fillRect(c * TILE_SIZE, topY, TILE_SIZE, bottomY - topY);
            }
        }
    };

    const paintBehind = (cells) => {
        bctx.fillStyle = WATER_BEHIND_FILL;
        for (const [r, c] of cells) {
            bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // 隣の水の液面から下だけ敷く（水際の岩で液面より上まで青くしない）
            const topY = waterBackdropTopY(map, r, c);
            if (topY < 0) continue;
            bctx.fillRect(c * TILE_SIZE, topY, TILE_SIZE, (r + 1) * TILE_SIZE - topY);
        }
    };

    // 水セルに加えて、その真上のセルも塗る対象にする。液面が水量の届いていない
    // タイルまで上がっていることがあり（水塊の液面はひとつ）、そこを塗らないと
    // 塗りの上端が線に届かない
    const withCellsAbove = (cells) => {
        const keys = new Set();
        const out = [];
        for (const [r, c] of cells) {
            for (const nr of [r - 1, r]) {
                if (nr < 0 || nr >= map.rows) continue;
                const k = nr * map.cols + c;
                if (keys.has(k)) continue;
                keys.add(k);
                out.push([nr, c]);
            }
        }
        return out;
    };

    paint(withCellsAbove(map.waterCells));
    const initialBorder = collectBorderBlocks(map, map.waterCells);
    paintBehind(initialBorder);

    const renderer = {
        t: 0,
        ripples: [],
        update() {
            this.t++;
            for (const rp of this.ripples) rp.strength *= WATER_RIPPLE_DECAY;
            this.ripples = this.ripples.filter((rp) => rp.strength >= WATER_RIPPLE_MIN);

            // 滝の着水波紋（12フレームごとに小さな波紋を励起）。
            // 着水点＝滝のセルの真下が滝でない水。以前は水源の列を下へ辿って最初の
            // 水で起こしていたが、水は棚を伝って横へずれながら落ちるので、着水して
            // いない列で波が立っていた
            if (this.t % 12 === 0) {
                for (const c of map.waterfallLandingCols()) this.addRipple((c + 0.5) * TILE_SIZE, 0.4);
            }
        },
        addRipple(x, strength) {
            this.ripples.push({ x, strength });
        },
        onBlockDestroyed(r, c) {
            // ブロックが破壊されて空間になったので、下層水および前景水キャッシュを必ず消去する
            bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            cctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        },
        invalidate(cells) {
            // 対象セルおよびその上下セルを漏れなく再描画（境目の高さ変化に対応）
            const toRepaint = new Set();
            for (const [r, c] of cells) {
                for (let dr = -1; dr <= 1; dr++) {
                    const nr = r + dr;
                    if (nr >= 0 && nr < map.rows) {
                        toRepaint.add(nr * map.cols + c);
                    }
                }
                // 水面セルなら、同じ行の水面が続く範囲も塗り直す。液面はセグメント
                // 全体の平均なので、1セルの水量が変わると仲間全員の見た目が変わる
                for (const nr of [r - 1, r, r + 1]) {
                    if (nr < 0 || nr >= map.rows) continue;
                    if (!map.isWaterSurface(nr, c)) continue;
                    toRepaint.add(nr * map.cols + c);
                    for (let cc = c - 1; cc >= 0 && map.isWaterSurface(nr, cc); cc--) {
                        toRepaint.add(nr * map.cols + cc);
                    }
                    for (let cc = c + 1; cc < map.cols && map.isWaterSurface(nr, cc); cc++) {
                        toRepaint.add(nr * map.cols + cc);
                    }
                }
            }
            const repaintList = [];
            for (const key of toRepaint) {
                repaintList.push([Math.floor(key / map.cols), key % map.cols]);
            }
            paint(repaintList);

            // 下層水キャッシュ（behindCache）の更新:
            // 1. repaintList 自体（水・空間セル）をクリア
            for (const [r, c] of repaintList) {
                bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }

            // 2. repaintList の周囲8マスにある岩ブロック（境界候補）を収集
            const borderCandidateKeys = new Set();
            for (const [r, c] of repaintList) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= map.rows || nc < 0 || nc >= map.cols) continue;
                        if (map.isWater(nr, nc)) continue;
                        if (map.isSolid(nr, nc)) {
                            borderCandidateKeys.add(nr * map.cols + nc);
                        }
                    }
                }
            }

            // 3. 影響範囲の岩ブロックを塗り直す。paintBehind が自分でクリアしてから
            //    液面より下だけを敷くので、ここは候補をそのまま渡せばよい
            //    （敷く必要が無いものは waterBackdropTopY が -1 を返してクリアだけで終わる）
            const borderToRepaint = [];
            for (const key of borderCandidateKeys) {
                borderToRepaint.push([Math.floor(key / map.cols), key % map.cols]);
            }
            paintBehind(borderToRepaint);
        },
        drawBehindTerrain(ctx, camX, camY) {
            const sx = Math.max(0, Math.floor(camX));
            const sy = Math.max(0, Math.floor(camY));
            const sw = Math.min(CANVAS_WIDTH, map.width - sx);
            const sh = Math.min(CANVAS_HEIGHT, map.height - sy);
            if (sw > 0 && sh > 0) ctx.drawImage(behindCache, sx, sy, sw, sh, sx, sy, sw, sh);
        },
        drawOverWorld(ctx, camX, camY) {
            const sx = Math.max(0, Math.floor(camX));
            const sy = Math.max(0, Math.floor(camY));
            const sw = Math.min(CANVAS_WIDTH, map.width - sx);
            const sh = Math.min(CANVAS_HEIGHT, map.height - sy);
            if (sw > 0 && sh > 0) ctx.drawImage(cache, sx, sy, sw, sh, sx, sy, sw, sh);

            // 画面内の水面セグメントを集める。waterKind が水面のあいだ横へ伸ばすだけ。
            // 液面（平均水位）は waterSurfaceY に焼いてあるので計算し直さない
            const startCol = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
            const endCol = Math.min(map.cols - 1, Math.ceil((camX + CANVAS_WIDTH) / TILE_SIZE) + 1);
            const startRow = Math.max(0, Math.floor((camY - 16) / TILE_SIZE));
            const endRow = Math.min(map.rows - 1, Math.ceil((camY + CANVAS_HEIGHT + 16) / TILE_SIZE));

            const segments = [];
            const visited = new Set();
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    if (visited.has(r * map.cols + c)) continue;
                    if (!map.isWaterSurface(r, c)) continue;
                    let c0 = c;
                    while (c0 - 1 >= 0 && map.isWaterSurface(r, c0 - 1)) c0--;
                    let c1 = c;
                    while (c1 + 1 < map.cols && map.isWaterSurface(r, c1 + 1)) c1++;
                    for (let cc = c0; cc <= c1; cc++) visited.add(r * map.cols + cc);
                    segments.push({ r, c0, c1 });
                }
            }

            // 各セグメントを平均水位で水平に描く
            ctx.strokeStyle = WATER_SURFACE_COLOR;
            ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;
            ctx.beginPath();
            for (const seg of segments) {
                const avgY = map.getSurfaceY(seg.r, seg.c0);
                const x0 = seg.c0 * TILE_SIZE;
                const x1 = (seg.c1 + 1) * TILE_SIZE;
                for (let x = x0; x <= x1; x += 8) {
                    const y = avgY + surfaceOffset(x, this.t, this.ripples);
                    if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            this._drawWaterfalls(ctx, startCol, endCol, startRow, endRow);
        },
        /**
         * 滝と床を流れる水を描く。帯・床の水は前景の水と同じ色と濃さ（WATER_FILL）で、
         * 筋としぶきは明るい色で上に重ねる。
         */
        _drawWaterfalls(ctx, startCol, endCol, startRow, endRow) {
            const runs = collectWaterfallRuns(map, startCol, endCol, startRow, endRow);
            const t = this.t;

            ctx.fillStyle = WATER_FILL;
            for (const run of runs) {
                let top = run.topY;
                // 岩の口から出る水は、口の真下で細く、WATERFALL_MOUTH_TAPER をかけて
                // 帯の幅まで広がる。以前は口の下を1タイル空けて滴りの点を描いていた
                if (run.source === 'mouth') {
                    const cx = run.x + run.width / 2;
                    const taper = Math.min(WATERFALL_MOUTH_TAPER, run.bottomY - top);
                    for (let i = 0; i < taper; i++) {
                        const w = WATERFALL_MOUTH_WIDTH + (run.width - WATERFALL_MOUTH_WIDTH) * (i + 1) / taper;
                        ctx.fillRect(cx - w / 2, top + i, w, 1);
                    }
                    top += taper;
                }
                if (run.bottomY > top) ctx.fillRect(run.x, top, run.width, run.bottomY - top);
                for (const sheet of [run.sheet, run.feedSheet]) {
                    if (!sheet) continue;
                    for (const [a, b] of sheet.segments) ctx.fillRect(a, sheet.y, b - a, RUNNING_WATER_THICKNESS);
                }
            }

            ctx.fillStyle = 'rgba(220, 245, 255, 0.65)';
            const streakLen = 6;
            for (const run of runs) {
                // 流下する短い筋。タイルごとに2本、区間の中だけ
                for (let r = Math.max(run.headR, startRow); r <= Math.min(run.footR + 1, endRow); r++) {
                    for (let k = 0; k < 2; k++) {
                        const py = r * TILE_SIZE + ((t + k * 8 + run.c * 5 + r * 3) % TILE_SIZE);
                        if (py < run.topY || py + streakLen > run.bottomY) continue;
                        ctx.fillRect(run.x + 1.5 + k * (run.width - 4), py, 1.5, streakLen);
                    }
                }
                // 床を流れる水の筋。流れる向きに動く
                // 筋は帯を敷いたところ（segments）の中だけ。全長に描くと、水たまりや湖の
                // 上を横切る区間で水面に破線が乗って見えた
                for (const sheet of [run.sheet, run.feedSheet]) {
                    if (!sheet) continue;
                    const len = sheet.x1 - sheet.x0;
                    for (let s = 0; s < len; s += 10) {
                        const off = ((s + t * 1.5 * sheet.dir) % len + len) % len;
                        const a = sheet.x0 + off;
                        const seg = sheet.segments.find(([x0, x1]) => a >= x0 && a < x1);
                        if (!seg) continue;
                        const w = Math.min(4, seg[1] - a);
                        if (w > 0) ctx.fillRect(a, sheet.y + 1, w, 1);
                    }
                }
                // 着水のしぶき。床（を流れる水の上面）か水たまりの液面で跳ねる。
                // 当たったところに帯より少し広い泡の線を引き、その上で粒を跳ねさせる
                if (run.landing !== 'none') {
                    ctx.fillStyle = 'rgba(220, 245, 255, 0.35)';
                    ctx.fillRect(run.x - 2, Math.round(run.bottomY) - 1, run.width + 4, 1);
                    ctx.fillStyle = 'rgba(220, 245, 255, 0.65)';
                    const splashY = Math.round(run.bottomY) - 2;
                    for (let s = 0; s < 3; s++) {
                        const sx = run.x - 2 + ((t * 2 + s * 5 + run.c * 3) % (run.width + 4));
                        const sy = splashY - Math.abs(Math.sin(t * 0.35 + s * 2 + run.c) * 3);
                        ctx.fillRect(sx, sy, 1.5, 1.5);
                    }
                }
            }
            // 岩の口の縁の明るい線（水が岩から出てくるところ）
            ctx.fillStyle = WATER_SURFACE_COLOR;
            for (const run of runs) {
                if (run.source !== 'mouth') continue;
                ctx.fillRect(run.x + run.width / 2 - 2, run.topY, 4, 1);
            }
        },
        drawOverlay() {},
        drawDemoOverlay() {},
    };
    return renderer;
}
