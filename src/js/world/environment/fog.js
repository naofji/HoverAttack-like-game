// ============================================
// 霧（6面）の描画
// ============================================
//
// 粒は出さない。雲の塊を敷き詰めた板を層ごとに1枚作っておき、毎フレームは
// 視差付きでずらして drawImage するだけ。最後に全画面を薄く塗る。
// 砲兵の煙幕はワールド座標で先に描かれているので、この層の下に入って霧に溶ける。
//
// 板の中身は砲兵の煙幕と同じ瘤の並び（SMOKE_SHAPES）を重ねたもの。フラットな円を
// 並べると幾何学的に見える（実機の指摘）ので、瘤ごとの放射グラデーションで
// 有機的な輪郭にし、横に FOG_BLOB_ASPECT 倍潰して雲らしい形にする。
// createRadialGradient は板の生成時（起動時に一度）だけで、毎フレームは使わない。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    FOG_COLOR, FOG_OVERLAY_ALPHA, FOG_SHEET_WIDTH, FOG_SHEET_HEIGHT, FOG_BLOB_COUNT, FOG_LAYERS,
    FOG_BLOB_RADIUS_MIN, FOG_BLOB_RADIUS_RANGE, FOG_BLOB_ASPECT, FOG_BLOB_ALPHA_MIN, FOG_BLOB_ALPHA_RANGE,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';
import { SMOKE_SHAPES } from '../../entities/smokeSprites.js';
import { withAlpha } from '../../utils/color.js';

/**
 * 雲を1つ描く。瘤（SMOKE_SHAPES の1形）を放射グラデーションで重ねる。
 * 横方向だけ ctx.scale で潰すので、瘤の座標は正円のまま扱える。
 */
function drawCloud(ctx, shape, cx, cy, r, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(FOG_BLOB_ASPECT, 1);
    for (const lobe of shape) {
        const lx = lobe.dx * r, ly = lobe.dy * r, lr = lobe.r * r;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        g.addColorStop(0, withAlpha(FOG_COLOR, alpha * lobe.a));
        g.addColorStop(0.6, withAlpha(FOG_COLOR, alpha * lobe.a * 0.5));
        g.addColorStop(1, withAlpha(FOG_COLOR, 0));
        ctx.fillStyle = g;
        ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    ctx.restore();
}

/** 雲の板を1枚描く。端が継ぎ目なく並ぶよう、右端・下端にはみ出す塊は反対側にも描く。 */
function buildSheet(seed) {
    const canvas = document.createElement('canvas');
    canvas.width = FOG_SHEET_WIDTH;
    canvas.height = FOG_SHEET_HEIGHT;
    const ctx = canvas.getContext('2d');
    const rng = new SeededRNG(seed);
    for (let i = 0; i < FOG_BLOB_COUNT; i++) {
        const x = rng.next() * FOG_SHEET_WIDTH;
        const y = rng.next() * FOG_SHEET_HEIGHT;
        const r = FOG_BLOB_RADIUS_MIN + rng.next() * FOG_BLOB_RADIUS_RANGE;
        // 濃さは雲ごとに変え、重なりで濃淡のムラを作る
        const alpha = FOG_BLOB_ALPHA_MIN + rng.next() * FOG_BLOB_ALPHA_RANGE;
        const shape = SMOKE_SHAPES[i % SMOKE_SHAPES.length];
        for (const dx of [0, -FOG_SHEET_WIDTH, FOG_SHEET_WIDTH]) {
            for (const dy of [0, -FOG_SHEET_HEIGHT, FOG_SHEET_HEIGHT]) {
                drawCloud(ctx, shape, x + dx, y + dy, r, alpha);
            }
        }
    }
    return canvas;
}

export function createFogRenderer() {
    const sheets = FOG_LAYERS.map((_, i) => buildSheet(0x0F06 + i * 977));
    let t = 0;
    const renderer = {
        update() { t++; },
        drawBehindTerrain() {},
        drawOverWorld() {},
        drawOverlay(ctx, alphaScale = 1) {
            ctx.save();
            FOG_LAYERS.forEach((layer, i) => {
                const sheet = sheets[i];
                // 横に流れる。層ごとに速度を変えて奥行きを出す
                const ox = ((t * layer.speed) % FOG_SHEET_WIDTH + FOG_SHEET_WIDTH) % FOG_SHEET_WIDTH;
                ctx.globalAlpha = layer.alpha * alphaScale;
                for (let y = 0; y < CANVAS_HEIGHT; y += FOG_SHEET_HEIGHT) {
                    for (let x = -ox; x < CANVAS_WIDTH; x += FOG_SHEET_WIDTH) {
                        ctx.drawImage(sheet, x, y);
                    }
                }
            });
            ctx.globalAlpha = FOG_OVERLAY_ALPHA * alphaScale;
            ctx.fillStyle = FOG_COLOR;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.globalAlpha = 1;
            ctx.restore();
        },
        // デモ画面（面別ランキングなど）でも霧は画面重ねのまま。雪と違い
        // 世界に固定する必要が無いので、本編と同じ描画を使い回す
        drawDemoOverlay(ctx, alphaScale = 1) { renderer.drawOverlay(ctx, alphaScale); },
    };
    return renderer;
}
