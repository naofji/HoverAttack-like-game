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

    // 水面の区間: 「水で、上が水でない」タイルの水面線。生成時に集めて、流入で足す
    const surfaces = new Map(); // key r*cols+c → {x0, x1, y}
    const collect = (cells) => {
        for (const [r, c] of cells) {
            const key = r * map.cols + c;
            if (!map.isWater(r, c) || (r > 0 && map.isWater(r - 1, c))) {
                surfaces.delete(key);
                continue;
            }
            const mass = map.water ? map.water[key] : MAX_WATER_MASS;
            const h = Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
            const y = (r + 1) * TILE_SIZE - h;
            surfaces.set(key, { x0: c * TILE_SIZE, x1: (c + 1) * TILE_SIZE, y });
        }
    };
    collect(map.waterCells);

    const renderer = {
        t: 0,
        ripples: [],
        update() {
            this.t++;
            for (const rp of this.ripples) rp.strength *= WATER_RIPPLE_DECAY;
            this.ripples = this.ripples.filter((rp) => rp.strength >= WATER_RIPPLE_MIN);
        },
        addRipple(x, strength) {
            this.ripples.push({ x, strength });
        },
        invalidate(cells) {
            paint(cells);
            // 新たに水になったセルは下層水をクリア（前景の単一塗りに統一し、2重塗りを防止）
            for (const [r, c] of cells) {
                bctx.clearRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
            const border = collectBorderBlocks(map, cells);
            paintBehind(border);
            collect(cells);
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

            // 水面。画面内の区間だけを1本のパスにまとめる（区間ごとに stroke しない）
            ctx.strokeStyle = WATER_SURFACE_COLOR;
            ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;
            ctx.beginPath();
            for (const s of surfaces.values()) {
                // 波紋(最大2.5)+波(1.5px)で水面は最大4px動くので、カリング余白は十分に広げてある
                if (s.x1 < camX || s.x0 > camX + CANVAS_WIDTH || s.y < camY - 12 || s.y > camY + CANVAS_HEIGHT + 12) continue;
                for (let x = s.x0; x <= s.x1; x += 8) {
                    const y = s.y + surfaceOffset(x, this.t, this.ripples);
                    if (x === s.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        },
        drawOverlay() {},
        drawDemoOverlay() {},
    };
    return renderer;
}
