// ============================================
// EnemySpider: 描画（面の向きへの回転・左右の反転・脚・胴・目）
// ============================================
//
// entities/EnemySpider.js から切り出した（2026-11-25、中身は動かしただけ）。attacker/ と同じく
// **EnemySpider.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` はインスタンス。
// 毎フレームどの順で何を進めるかは EnemySpider.js の update() が唯一の記述。

import { SPIDER_SIZE, SPIDER_THREAD_SHOOT_FRAMES, COLOR_SPIDER_THREAD } from '../../utils/Constants.js';
import {
    SPIDER_LEG_COLOR, SPIDER_BODY_COLOR, SPIDER_PLATE_COLOR, SPIDER_EYE_COLOR,
} from '../debris/spiderParts.js';
import { ROTATION } from './crawl.js';

// 脚の付け根と足先の x（絵の座標、箱の中心が原点）。描画専用のパラメータなのでここに置く
const LEG_HIP_X = [-4, -1.5, 1.5, 4];
const LEG_FOOT_X = [-6, -2.5, 2.5, 6];

export const SpiderDraw = {
    // ------------------------------------------
    // 描画
    // ------------------------------------------
    /** 絵の回転（破片も読む）。空中では最後に張り付いていた面の向きで描く */
    _drawRotation() {
        if (this.mode === 'corner' && this.corner) {
            const c = this.corner;
            const frac = c.kind === 'concave' ? Math.min(1, c.t / c.frames) : this._cornerProgress() / Math.PI;
            return c.rot0 + c.rotSweep * frac;
        }
        return ROTATION[this.surface || this.drawSurface] || 0;
    },

    /** 進む向きが絵の「前」（回した +x）と逆なら左右反転（破片も読む） */
    _drawMirrored() {
        const r = this._drawRotation();
        return this.fwd.x * Math.cos(r) + this.fwd.y * Math.sin(r) < 0;
    },

    draw(ctx) {
        if (!this.alive) return;
        const half = SPIDER_SIZE / 2;
        const cx = this.x + half;
        const cy = this.y + half;

        // 糸は回す前に世界座標で描く（支点から体の中心まで。伸びている途中は途中まで）
        if (this.threadAnchor) {
            const a = this.threadAnchor;
            const k = 1 - this.threadShoot / SPIDER_THREAD_SHOOT_FRAMES;
            ctx.strokeStyle = COLOR_SPIDER_THREAD;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + (a.x - cx) * k, cy + (a.y - cy) * k);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this._drawRotation());
        if (this._drawMirrored()) ctx.scale(-1, 1);

        // 脚。付け根から膝（胴より上へ曲がる）を経て足先へ。歩くと足先が前後に揺れる
        ctx.strokeStyle = SPIDER_LEG_COLOR;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
            const swing = Math.sin(this.walkPhase + i * Math.PI / 2) * 1.2;
            const hx = LEG_HIP_X[i];
            const fx = LEG_FOOT_X[i] + swing;
            ctx.beginPath();
            ctx.moveTo(hx, -2);
            ctx.lineTo((hx + fx) / 2 + Math.sign(hx) * 1.5, -6);
            ctx.lineTo(fx, half);
            ctx.stroke();
        }

        // 胴・背の装甲板・目（破片パーツ spiderParts.js と同じ矩形）
        ctx.fillStyle = SPIDER_BODY_COLOR;
        ctx.fillRect(-5, -6, 10, 6);
        ctx.fillStyle = SPIDER_PLATE_COLOR;
        ctx.fillRect(-4, -7, 8, 2);
        ctx.fillStyle = SPIDER_EYE_COLOR;
        ctx.fillRect(2, -4, 3, 2);

        ctx.restore();
    },
};
