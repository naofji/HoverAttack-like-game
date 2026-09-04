// ============================================
// 降雪（5面）の描画
// ============================================
//
// 粒を個別に描くと、縮尺（タイル16px）に見合う 1〜2px の粒を数千出すことになる。
// 層ごとに「粒を撒いた板」を1枚作り、画面をタイル状に敷きながら落下と横揺れの分だけ
// ずらす。画面上の粒は数千でも、毎フレームは drawImage が層×敷き枚数だけ。
// 板の端は継ぎ目が出ないよう、はみ出す粒を反対側にも描く。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT, SNOW_SHEET_SIZE, SNOW_LAYERS, SNOW_COLOR,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';

function buildSheet(layer, seed) {
    const canvas = document.createElement('canvas');
    canvas.width = SNOW_SHEET_SIZE;
    canvas.height = SNOW_SHEET_SIZE;
    const ctx = canvas.getContext('2d');
    const rng = new SeededRNG(seed);
    ctx.fillStyle = SNOW_COLOR;
    ctx.globalAlpha = layer.alpha;
    for (let i = 0; i < layer.count; i++) {
        const x = Math.floor(rng.next() * SNOW_SHEET_SIZE);
        const y = Math.floor(rng.next() * SNOW_SHEET_SIZE);
        ctx.fillRect(x, y, layer.size, layer.size);
        // 端の継ぎ目
        if (x + layer.size > SNOW_SHEET_SIZE) ctx.fillRect(x - SNOW_SHEET_SIZE, y, layer.size, layer.size);
        if (y + layer.size > SNOW_SHEET_SIZE) ctx.fillRect(x, y - SNOW_SHEET_SIZE, layer.size, layer.size);
    }
    ctx.globalAlpha = 1;
    return canvas;
}

export function createSnowRenderer() {
    const sheets = SNOW_LAYERS.map((layer, i) => buildSheet(layer, 0x5A0E + i * 7919));
    let t = 0;
    return {
        update() { t++; },
        drawOverWorld() {},
        // 本編では雪は「岩の奥」（drawBehindTerrain）に降らせる。画面重ねの
        // drawOverlay は HUD の直前に呼ばれるので、ここで雪を描くと弾やHPバーより
        // 手前に浮いて見えてしまう（レビュー指摘）。本編用には何もしない
        drawOverlay() {},
        drawBehindTerrain(ctx, camX, camY) {
            // ワールド座標で、カメラの可視矩形に掛かる板だけを敷く。落下と横揺れは
            // 画面版と同じだが、板はワールドに固定されるので歩くと地形と一緒に流れる
            // （空洞の向こうで降っている雪を岩の穴から見る形）
            ctx.save();
            SNOW_LAYERS.forEach((layer, i) => {
                const S = SNOW_SHEET_SIZE;
                const oy = ((t * layer.speed) % S + S) % S;
                const ox = ((Math.sin(t * 0.02 + i) * layer.sway * 40) % S + S) % S;
                const x0 = Math.floor((camX - ox) / S) * S + ox - S;
                const y0 = Math.floor((camY - oy) / S) * S + oy - S;
                for (let y = y0; y < camY + CANVAS_HEIGHT; y += S) {
                    for (let x = x0; x < camX + CANVAS_WIDTH; x += S) {
                        if (x + S <= camX || y + S <= camY) continue;
                        ctx.drawImage(sheets[i], x, y);
                    }
                }
            });
            ctx.restore();
        },
        // デモ画面（面別ランキングなど）用。ワールドに固定する必要が無く、
        // カメラも無いので旧来どおり画面座標でスクロールさせる
        drawDemoOverlay(ctx, alphaScale = 1) {
            ctx.save();
            SNOW_LAYERS.forEach((layer, i) => {
                const S = SNOW_SHEET_SIZE;
                const oy = ((t * layer.speed) % S + S) % S;
                // 横揺れ: 層ごとに位相をずらした sin
                const ox = ((Math.sin(t * 0.02 + i) * layer.sway * 40) % S + S) % S;
                ctx.globalAlpha = alphaScale;
                for (let y = oy - S; y < CANVAS_HEIGHT; y += S) {
                    for (let x = ox - S; x < CANVAS_WIDTH; x += S) {
                        ctx.drawImage(sheets[i], x, y);
                    }
                }
            });
            ctx.globalAlpha = 1;
            ctx.restore();
        },
    };
}
