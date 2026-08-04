// ============================================
// CaveBackdrop - 視差スクロールする遠景の洞窟レイヤー
// ============================================
//
// マップ生成時に遠景を1枚のオフスクリーンcanvasへ描き切り、
// 以後は毎フレーム drawImage 1回で可視矩形を転送するだけにする。
// カメラ可動範囲の FAR_BG_PARALLAX 倍しか流れないため、canvas は
// 前景のタイルキャッシュよりずっと小さくて済む。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    FAR_BG_PARALLAX,
} from '../utils/Constants.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export class CaveBackdrop {
    /**
     * @param {number} mapWidth   マップ全体の幅 (px)
     * @param {number} mapHeight  マップ全体の高さ (px)
     * @param {string} paletteFill ステージパレットの fill 色 (#rrggbb)
     * @param {SeededRNG} rng     マップ生成と共有する乱数源
     */
    constructor(mapWidth, mapHeight, paletteFill, rng) {
        // Camera._clamp() と同一のカメラ可動範囲
        this.camXMin = 0;
        this.camXMax = mapWidth - CANVAS_WIDTH;
        this.camYMin = -HUD_TOP_HEIGHT;
        this.camYMax = mapHeight - CANVAS_HEIGHT + HUD_BOTTOM_HEIGHT;

        // 転送元計算と丸めを揃えるため floor を使う。
        // これで sourceX(camXMax) === width - CANVAS_WIDTH が厳密に成立する。
        this.width = Math.floor((this.camXMax - this.camXMin) * FAR_BG_PARALLAX) + CANVAS_WIDTH;
        this.height = Math.floor((this.camYMax - this.camYMin) * FAR_BG_PARALLAX) + CANVAS_HEIGHT;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    /** カメラX → 転送元X (整数, canvas内に収まるようクランプ) */
    sourceX(camX) {
        const raw = Math.floor((camX - this.camXMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.width - CANVAS_WIDTH);
    }

    /** カメラY → 転送元Y (整数, canvas内に収まるようクランプ) */
    sourceY(camY) {
        const raw = Math.floor((camY - this.camYMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.height - CANVAS_HEIGHT);
    }

    /**
     * 遠景の可視矩形をブロック転送する。
     * ctx は translate(-camX, -camY) 済みのため、転送先はワールド座標を指定する。
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} camX 補間済みカメラX
     * @param {number} camY 補間済みカメラY
     */
    draw(ctx, camX, camY) {
        ctx.drawImage(
            this.canvas,
            this.sourceX(camX), this.sourceY(camY), CANVAS_WIDTH, CANVAS_HEIGHT,
            camX, camY, CANVAS_WIDTH, CANVAS_HEIGHT
        );
    }
}
