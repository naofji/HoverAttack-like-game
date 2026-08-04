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
import { lerpColor } from '../utils/color.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

// --- 遠景の生成パラメータ ---
// いずれも「実機で見て濃い/薄い」を1値で調整できるよう定数に切り出してある。
const BASE_DARKEN = 0.92;   // 地色: パレット色を黒へ寄せる割合
const BLOB_DARK_DARKEN = 0.95;
const BLOB_LIGHT_DARKEN = 0.86;
const DOT_DARKEN = 0.78;

const BLOB_AREA_PER_UNIT = 40000; // この面積あたりブロブ1個
const BLOB_RADIUS_MIN = 120;
const BLOB_RADIUS_RANGE = 200;    // 半径 120〜320px
const BLOB_CENTER_ALPHA = 0.5;

const DOT_AREA_PER_UNIT = 350;    // この面積あたり点1個
const DOT_ALPHA_MIN = 0.3;
const DOT_ALPHA_RANGE = 0.5;      // alpha 0.3〜0.8

/** #rrggbb を rgba(r, g, b, a) 文字列にする。 */
function withAlpha(hex, alpha) {
    const s = String(hex).replace('#', '');
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

        this._generate(this.canvas.getContext('2d'), paletteFill, rng);
    }

    /**
     * 遠景を1回だけ描き切る。地色 → 大きなブロブ → 点描 の順に重ねる。
     * 不透明度は globalAlpha ではなく rgba 文字列とカラーストップに畳み込んでいる
     * (状態が残らず、疑似ctxでも記録・比較できるため)。
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} paletteFill ステージパレットの fill 色
     * @param {SeededRNG} rng
     */
    _generate(ctx, paletteFill, rng) {
        const W = this.width;
        const H = this.height;

        const baseColor = lerpColor(paletteFill, '#000000', BASE_DARKEN);
        const blobDark = lerpColor(paletteFill, '#000000', BLOB_DARK_DARKEN);
        const blobLight = lerpColor(paletteFill, '#000000', BLOB_LIGHT_DARKEN);
        const dotColor = lerpColor(paletteFill, '#000000', DOT_DARKEN);

        // 1) 地色
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, W, H);

        // 2) 大きな洞窟空間のうねり。明暗を交互に置いて奥行きのムラを作る。
        const blobCount = Math.floor((W * H) / BLOB_AREA_PER_UNIT);
        for (let i = 0; i < blobCount; i++) {
            const x = rng.next() * W;
            const y = rng.next() * H;
            const radius = BLOB_RADIUS_MIN + rng.next() * BLOB_RADIUS_RANGE;
            const color = (i % 2 === 0) ? blobLight : blobDark;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, withAlpha(color, BLOB_CENTER_ALPHA));
            grad.addColorStop(1, withAlpha(color, 0));
            ctx.fillStyle = grad;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }

        // 3) 点描。粒状感を与えて「ベタ塗りの黒」に見えないようにする。
        const dotCount = Math.floor((W * H) / DOT_AREA_PER_UNIT);
        for (let i = 0; i < dotCount; i++) {
            const x = Math.floor(rng.next() * W);
            const y = Math.floor(rng.next() * H);
            const size = (rng.next() < 0.5) ? 1 : 2;
            const alpha = DOT_ALPHA_MIN + rng.next() * DOT_ALPHA_RANGE;

            ctx.fillStyle = withAlpha(dotColor, alpha);
            ctx.fillRect(x, y, size, size);
        }
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
