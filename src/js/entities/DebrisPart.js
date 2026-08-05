// ============================================
// Debris Part - 破壊された機体のパーツ1個
// ============================================
// 既存の Particle と同じ「update() / draw() / alive」契約に従うので、
// game.particles[] に混ぜるだけでゲームループに乗る。
// 当たり判定は一切持たず、地形も無視して落下し続ける純粋な演出。

import {
    DEBRIS_GRAVITY, DEBRIS_DRAG, DEBRIS_MAX_FALL_SPEED,
    DEBRIS_FLASH_COLOR, DEBRIS_FADE_START,
} from '../utils/Constants.js';

export class DebrisPart {
    /**
     * @param {object} opts
     * @param {number} opts.x パーツ中心のワールド X
     * @param {number} opts.y パーツ中心のワールド Y
     * @param {number} opts.w パーツ幅
     * @param {number} opts.h パーツ高さ
     * @param {string} opts.color
     * @param {number} opts.angle 初期回転（ラジアン）
     * @param {number} opts.vx
     * @param {number} opts.vy
     * @param {number} opts.spin 角速度（ラジアン/フレーム）
     * @param {number} opts.holdFrames 飛散開始までの静止フレーム数
     * @param {number} opts.lifetime 飛散開始後の寿命（フレーム）
     * @param {object} [opts.game] 画面外カリング用。無ければカリングしない
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;
        this.color = opts.color;
        this.angle = opts.angle || 0;
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.spin = opts.spin;
        this.hold = opts.holdFrames || 0;
        this.maxLife = opts.lifetime;
        this.life = opts.lifetime;
        this.game = opts.game || null;
        this.alive = true;
    }

    /** 縮小率。後半ほど強く効くカーブで、消える直前に一気に小さくなる。 */
    get scale() {
        const p = 1 - this.life / this.maxLife;
        return Math.max(0, 1 - p * p);
    }

    /** 不透明度。寿命の終盤 DEBRIS_FADE_START 以降でのみ落ちる。 */
    get alpha() {
        const p = 1 - this.life / this.maxLife;
        if (p < DEBRIS_FADE_START) return 1;
        return Math.max(0, (1 - p) / (1 - DEBRIS_FADE_START));
    }

    update() {
        if (!this.alive) return;

        // 局面1: ホールド。元の位置に静止したまま白熱する。
        // パーツが元の配置のまま並ぶので、これがそのまま発光シルエットになる。
        if (this.hold > 0) {
            this.hold--;
            return;
        }

        // 局面2: 飛散。地形は見ない。
        this.x += this.vx;
        this.y += this.vy;
        this.vy = Math.min(this.vy + DEBRIS_GRAVITY, DEBRIS_MAX_FALL_SPEED);
        this.vx *= DEBRIS_DRAG;
        this.angle += this.spin;

        // 局面3: 消滅
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;
        if (this._isOffscreen()) return;

        const s = this.scale;
        if (s <= 0) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.scale(s, s);
        ctx.fillStyle = (this.hold > 0) ? DEBRIS_FLASH_COLOR : this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }

    /** カメラ矩形から余裕をもって外れていれば描画を省く。 */
    _isOffscreen() {
        const game = this.game;
        if (!game || !game.camera || !game.canvas) return false;
        const margin = Math.max(this.w, this.h) + 8;
        return (
            this.x < game.camera.x - margin ||
            this.y < game.camera.y - margin ||
            this.x > game.camera.x + game.canvas.width + margin ||
            this.y > game.camera.y + game.canvas.height + margin
        );
    }
}
