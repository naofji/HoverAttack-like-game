// ============================================
// 地底湖（4面）の描画
// ============================================
//
// 水タイルは地形キャッシュと同じ大きさのオフスクリーン canvas に焼き、毎フレームは
// 可視矩形を半透明で1回転送する（機体が水の色をかぶる）。水面の線は区間ごとに
// sin で上下させる。当たり判定は波打たない（水面の行は固定）。
// しぶきが落ちた場所は波紋として一時的に振幅を足し、毎フレーム減衰する。

import {
    TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
    WATER_FILL, WATER_BEHIND_FILL, WATER_SURFACE_COLOR, WATER_SURFACE_LINE_WIDTH, WATER_WAVE_AMPLITUDE, WATER_WAVE_LENGTH, WATER_WAVE_SPEED,
    WATER_RIPPLE_DECAY, WATER_RIPPLE_MIN, MAX_WATER_MASS,
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
 * セル (r, c) が「満タンの水ブロック」であるかを判定する。
 * 岩ブロックの面取り（bevel）の隙間対策として背後に水を敷くのは、
 * 隣接する水が満タンの場合のみ（水面・落下水流・少量の水・空気の場合は敷かない）。
 */
export function isFullWaterBlock(map, r, c) {
    if (!map.isWater(r, c)) return false;
    const mass = map.water ? map.water[r * map.cols + c] : MAX_WATER_MASS;
    if (mass < MAX_WATER_MASS) return false;
    if (map.isWaterSurface && map.isWaterSurface(r, c)) return false;
    if (map.isWaterfallCell && map.isWaterfallCell(r, c)) return false;
    return true;
}

/**
 * 水セルに8近傍で隣接する岩ブロックセルを収集する。
 * ブロックの面取り（bevel）によって削られた角の隙間の下地に水を敷き、
 * 水の欠けや背景の露出を防ぐため。
 * ※隣接する水が「満タンの水ブロック」である場合のみ対象とする。
 */
export function collectBorderBlocks(map, waterCells) {
    const border = new Map();
    for (const [r, c] of waterCells) {
        if (!isFullWaterBlock(map, r, c)) continue;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= map.rows || nc < 0 || nc >= map.cols) continue;
                if (map.isWater(nr, nc)) continue;
                const isSolid = map.isSolid ? map.isSolid(nr, nc) : (map.grid ? map.grid[nr][nc] !== 0 : true);
                if (isSolid) {
                    border.set(nr * map.cols + nc, [nr, nc]);
                }
            }
        }
    }
    return Array.from(border.values());
}

/**
 * 滝（水流帯）の横位置と幅を決定する。
 * 左から水が供給される（または左が崖）なら左端寄り、右からなら右端寄り、それ以外は中央。
 */
export function getWaterfallPlacement(map, r, c) {
    const streamWidth = 8;
    const checkWater = (row, col) => {
        if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return false;
        return map.isWater ? map.isWater(row, col) : false;
    };
    const checkSolid = (row, col) => {
        if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return false;
        return map.isSolid ? map.isSolid(row, col) : (map.grid ? map.grid[row][col] !== 0 : false);
    };

    // 左側に崖（固体）がある、または左上/左から水が流出
    const leftSource = (c > 0 && checkWater(r, c - 1)) ||
                       (r > 0 && c > 0 && checkWater(r - 1, c - 1)) ||
                       (c > 0 && checkSolid(r, c - 1) && !checkSolid(r, c + 1));

    // 右側に崖（固体）がある、または右上/右から水が流出
    const rightSource = (c + 1 < map.cols && checkWater(r, c + 1)) ||
                        (r > 0 && c + 1 < map.cols && checkWater(r - 1, c + 1)) ||
                        (c + 1 < map.cols && checkSolid(r, c + 1) && !checkSolid(r, c - 1));

    let offsetX = Math.floor((TILE_SIZE - streamWidth) / 2); // デフォルト中央
    let align = 'center';
    if (leftSource && !rightSource) {
        offsetX = 1; // 左端寄り（壁沿い）
        align = 'left';
    } else if (rightSource && !leftSource) {
        offsetX = TILE_SIZE - streamWidth - 1; // 右端寄り（壁沿い）
        align = 'right';
    }

    return {
        x: c * TILE_SIZE + offsetX,
        width: streamWidth,
        align,
    };
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
            if (!map.isWater(r, c)) continue;
            const mass = map.water ? map.water[r * map.cols + c] : MAX_WATER_MASS;
            if (mass === 0) continue;

            const isWaterfall = map.isWaterfallCell ? map.isWaterfallCell(r, c) : false;

            if (isWaterfall) {
                // 滝（落下中の水流）: 16x16 のブロックで空間を埋めず、供給元に応じた左右配置の帯として描画
                const placement = getWaterfallPlacement(map, r, c);
                cctx.fillRect(placement.x, r * TILE_SIZE, placement.width, TILE_SIZE);
            } else if (map.isWaterSurface && map.isWaterSurface(r, c)) {
                // 水面セル: 共通の getSurfaceY(r, c) で水面高さを完全に一致させる
                const surfaceY = map.getSurfaceY ? map.getSurfaceY(r, c) : ((r + 1 - mass / MAX_WATER_MASS) * TILE_SIZE);
                const bottomY = (r + 1) * TILE_SIZE;
                const topY = Math.max(r * TILE_SIZE, Math.min(bottomY, Math.round(surfaceY)));
                const h = bottomY - topY;
                if (h > 0) {
                    cctx.fillRect(c * TILE_SIZE, topY, TILE_SIZE, h);
                }
            } else if (r > 0 && map.isWater(r - 1, c)) {
                // 水中セル（上下とも水で完全水没しているセル）のみ、タイル全体（16x16）を満水として塗る
                cctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else if (r > 0 && map.isSolid && map.isSolid(r - 1, c)) {
                // 天井に張り付いた満水セル
                cctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                // 水面判定に入らなかった場合の安全策（水位に応じた高さのみ塗る。決して16x16で埋めない）
                const h = Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
                const y = (r + 1) * TILE_SIZE - h;
                if (h > 0) {
                    cctx.fillRect(c * TILE_SIZE, y, TILE_SIZE, h);
                }
            }
        }
    };

    const paintBehind = (cells) => {
        bctx.fillStyle = WATER_BEHIND_FILL;
        for (const [r, c] of cells) {
            bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            bctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    };

    paint(map.waterCells);
    const initialBorder = collectBorderBlocks(map, map.waterCells);
    paintBehind(initialBorder);

    const renderer = {
        t: 0,
        ripples: [],
        update() {
            this.t++;
            for (const rp of this.ripples) rp.strength *= WATER_RIPPLE_DECAY;
            this.ripples = this.ripples.filter((rp) => rp.strength >= WATER_RIPPLE_MIN);

            // 滝の着水波紋（12フレームごとに小さな波紋を励起）
            if (this.t % 12 === 0 && map.waterSprings) {
                for (const sp of map.waterSprings) {
                    const c = sp.c;
                    for (let r = sp.r; r < map.rows; r++) {
                        if (map.isWater(r, c) && (!map.isWaterfallAtPixel || !map.isWaterfallAtPixel((c + 0.5) * TILE_SIZE, (r + 0.5) * TILE_SIZE))) {
                            this.addRipple((c + 0.5) * TILE_SIZE, 0.4);
                            break;
                        }
                    }
                }
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
                        const isSolid = map.isSolid ? map.isSolid(nr, nc) : (map.grid ? map.grid[nr][nc] !== 0 : true);
                        if (isSolid) {
                            borderCandidateKeys.add(nr * map.cols + nc);
                        }
                    }
                }
            }

            // 3. 影響範囲の岩ブロックの behindCache をいったんクリアし、
            //    現在も周囲8マスに「満タンの水ブロック」が存在するものだけ再描画する
            const borderToRepaint = [];
            for (const key of borderCandidateKeys) {
                const r = Math.floor(key / map.cols);
                const c = key % map.cols;
                bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                let hasFullWaterNeighbor = false;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= map.rows || nc < 0 || nc >= map.cols) continue;
                        if (isFullWaterBlock(map, nr, nc)) {
                            hasFullWaterNeighbor = true;
                            break;
                        }
                    }
                    if (hasFullWaterNeighbor) break;
                }

                if (hasFullWaterNeighbor) {
                    borderToRepaint.push([r, c]);
                }
            }

            // 4. 現在も満タンの水ブロックに隣接している岩ブロックのみ背後に水を塗る
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

            // 水源（湧水）の口の滴り・飛沫演出
            if (map.waterSprings) {
                ctx.fillStyle = WATER_SURFACE_COLOR;
                for (const sp of map.waterSprings) {
                    const bx = sp.c * TILE_SIZE;
                    const by = sp.r * TILE_SIZE;
                    if (bx + TILE_SIZE < camX || bx > camX + CANVAS_WIDTH ||
                        by + TILE_SIZE < camY || by > camY + CANVAS_HEIGHT) continue;
                    const dropOffset = (this.t * 1.5) % TILE_SIZE;
                    ctx.fillRect(bx + 6, by, 4, 2);
                    ctx.fillRect(bx + 7, by + dropOffset, 2, 3);
                }
            }

            // 滝（落下水流）の流下線状パーティクルおよび着水飛沫の描画
            ctx.fillStyle = 'rgba(220, 245, 255, 0.65)';
            const streakLen = 6;
            for (let c = startCol; c <= endCol; c++) {
                for (let r = startRow; r <= endRow; r++) {
                    if (!map.isWaterfallCell || !map.isWaterfallCell(r, c)) continue;
                    const placement = getWaterfallPlacement(map, r, c);
                    const flowX = placement.x;
                    const flowW = placement.width;

                    // 1セルあたり2本の流下する短い筋
                    for (let k = 0; k < 2; k++) {
                        const px = flowX + 1.5 + k * (flowW - 4);
                        const phase = (this.t * 1.0 + k * 8 + c * 5 + r * 3) % TILE_SIZE;
                        const py = r * TILE_SIZE + phase;
                        ctx.fillRect(px, py, 1.5, streakLen);
                    }

                    // 着水地点（直下が水底またはPoolingWater水面）なら微小な白い飛沫を跳ねさせる
                    const isSplashCell = (r + 1 >= map.rows) ||
                                         (map.isSolid && map.isSolid(r + 1, c)) ||
                                         (!map.isWaterfallCell(r + 1, c));
                    if (isSplashCell) {
                        const splashY = (r + 1) * TILE_SIZE - 2;
                        for (let s = 0; s < 2; s++) {
                            const sx = flowX + 1 + ((this.t * 2 + s * 4 + c * 3) % (flowW - 2));
                            const sy = splashY - Math.abs(Math.sin(this.t * 0.35 + s * 2 + c) * 3);
                            ctx.fillRect(sx, sy, 1.5, 1.5);
                        }
                    }
                }
            }
        },
        drawOverlay() {},
        drawDemoOverlay() {},
    };
    return renderer;
}
