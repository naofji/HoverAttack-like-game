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
 * 水セルに8近傍で隣接する岩ブロックセルを収集する。
 * ブロックの面取り（bevel）によって削られた角の隙間の下地に水を敷き、
 * 水の欠けや背景の露出を防ぐため。
 */
export function collectBorderBlocks(map, waterCells) {
    const border = new Map();
    for (const [r, c] of waterCells) {
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
            // 真上も水なら満水状態（16x16）
            if (r > 0 && map.isWater(r - 1, c)) {
                cctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                // 水面セル: 水量に応じた高さだけ下から塗る
                const h = Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
                const y = (r + 1) * TILE_SIZE - h;
                cctx.fillRect(c * TILE_SIZE, y, TILE_SIZE, h);
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
                    const x = (c + 0.5) * TILE_SIZE;
                    for (let r = sp.r + 1; r < map.rows; r++) {
                        if (map.isSolid && map.isSolid(r, c)) break;
                        if (map.isWater && map.isWater(r, c) && map.isWaterfallAtPixel && !map.isWaterfallAtPixel(x, (r + 0.5) * TILE_SIZE)) {
                            this.addRipple(x, 0.4);
                            break;
                        }
                    }
                }
            }
        },
        addRipple(x, strength) {
            this.ripples.push({ x, strength });
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
            }
            const repaintList = [];
            for (const key of toRepaint) {
                repaintList.push([Math.floor(key / map.cols), key % map.cols]);
            }
            paint(repaintList);
            for (const [r, c] of repaintList) {
                bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
            const border = collectBorderBlocks(map, repaintList);
            paintBehind(border);
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

            // 水面。画面内の各列について、水たまり（地底湖）の「1層の水面」を引く
            ctx.strokeStyle = WATER_SURFACE_COLOR;
            ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;
            ctx.beginPath();

            const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
            const endCol = Math.min(map.cols - 1, Math.ceil((camX + CANVAS_WIDTH) / TILE_SIZE));
            const startRow = Math.max(0, Math.floor((camY - 16) / TILE_SIZE));
            const endRow = Math.min(map.rows - 1, Math.ceil((camY + CANVAS_HEIGHT + 16) / TILE_SIZE));

            let prevX = -999;
            for (let c = startCol; c <= endCol; c++) {
                // 列 c において、画面内で最も上にある「水たまりのトップセル」を探す
                for (let r = startRow; r <= endRow; r++) {
                    if (!map.isWater(r, c)) continue;
                    // 上も水なら水中（内部）なので水面ではない
                    if (r > 0 && map.isWater(r - 1, c)) continue;
                    // 滝（直下が空洞で落下中の水流）なら、それは水面ではなく滝なので水面線は描かない！
                    if (map.isWaterfallAtPixel && map.isWaterfallAtPixel((c + 0.5) * TILE_SIZE, (r + 0.5) * TILE_SIZE)) {
                        continue;
                    }

                    // 水たまりの液面を見つけた！
                    const mass = map.water ? map.water[r * map.cols + c] : MAX_WATER_MASS;
                    const h = Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
                    const baseY = (r + 1) * TILE_SIZE - h;

                    const x0 = c * TILE_SIZE;
                    const x1 = (c + 1) * TILE_SIZE;

                    for (let x = x0; x <= x1; x += 8) {
                        const y = baseY + surfaceOffset(x, this.t, this.ripples);
                        if (x === x0 && Math.abs(x - prevX) > 1) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                        prevX = x;
                    }
                    // この列の水面はこれ1つ（1層）のみ
                    break;
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
        },
        drawOverlay() {},
        drawDemoOverlay() {},
    };
    return renderer;
}
