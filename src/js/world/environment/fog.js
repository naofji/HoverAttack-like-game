// ============================================
// 霧（6面）の描画
// ============================================
//
// 粒は出さない。雲の塊を敷き詰めた板を層ごとに1枚作っておき、毎フレームは
// 視差付きでずらして drawImage するだけ。最後に全画面を薄く塗る。
// 砲兵の煙幕はワールド座標で先に描かれているので、この層の下に入って霧に溶ける。
//
// 板の中身はフラットな円の重なり。createRadialGradient を毎フレーム作る案は
// 費用が桁で変わるので採らない（板の生成時にも使わない: 遠景と同じ描画言語）。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    FOG_COLOR, FOG_OVERLAY_ALPHA, FOG_SHEET_WIDTH, FOG_SHEET_HEIGHT, FOG_BLOB_COUNT, FOG_LAYERS,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';

/** 雲の板を1枚描く。端が継ぎ目なく並ぶよう、右端・下端にはみ出す塊は反対側にも描く。 */
function buildSheet(seed) {
    const canvas = document.createElement('canvas');
    canvas.width = FOG_SHEET_WIDTH;
    canvas.height = FOG_SHEET_HEIGHT;
    const ctx = canvas.getContext('2d');
    const rng = new SeededRNG(seed);
    ctx.fillStyle = FOG_COLOR;
    for (let i = 0; i < FOG_BLOB_COUNT; i++) {
        const x = rng.next() * FOG_SHEET_WIDTH;
        const y = rng.next() * FOG_SHEET_HEIGHT;
        const r = 40 + rng.next() * 90;
        // 濃さは塊ごとに変え、重なりで雲の濃淡を作る
        ctx.globalAlpha = 0.10 + rng.next() * 0.16;
        for (const dx of [0, -FOG_SHEET_WIDTH, FOG_SHEET_WIDTH]) {
            for (const dy of [0, -FOG_SHEET_HEIGHT, FOG_SHEET_HEIGHT]) {
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.globalAlpha = 1;
    return canvas;
}

export function createFogRenderer() {
    const sheets = FOG_LAYERS.map((_, i) => buildSheet(0x0F06 + i * 977));
    let t = 0;
    return {
        update() { t++; },
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
    };
}
