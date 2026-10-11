// ============================================
// fireFx - 町の炎・煙の粒（町の層＝岩の縁より奥に描く）
// ============================================
//
// game.particles（地形より手前）には足さない。spec 2章「炎と煙も同じ層に描き、岩の縁より手前に出さない」。
// 炎は角ばった四角（fillRect）で、生まれたての黄から昇りながら橙・赤へ冷える。ちらつきは描くときの大きさの揺れ。
// 煙は smokeSprites（SmokeScreen と同じ焼いたパフ）を小さく薄くして使う。

import { TOWN_FLAME_COLORS } from './palette.js';
import { TOWN_SMOKE_ALPHA } from '../../utils/Constants.js';

export class FlameParticle {
    constructor(x, y, vx, vy, size, life) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.size = size; this.life = life; this.maxLife = life;
        this.alive = true;
    }

    /** 0=黄（生まれたて）→ 最後の色（冷えた赤）。寿命の割合で決める */
    get colorIndex() {
        const t = 1 - this.life / this.maxLife;
        return Math.min(TOWN_FLAME_COLORS.length - 1, Math.floor(t * TOWN_FLAME_COLORS.length));
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.92;          // 横の揺れは収まり、まっすぐ昇る
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    /** flicker は 0〜1。大きさを揺らしてちらつかせる（描くたびに呼び手が乱数を渡す） */
    draw(ctx, flicker) {
        const s = Math.max(1, Math.round(this.size * (0.6 + 0.4 * flicker) * (this.life / this.maxLife + 0.3)));
        ctx.fillStyle = TOWN_FLAME_COLORS[this.colorIndex];
        ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    }
}

export class SmokePuff {
    constructor(x, y, size, life, shape) {
        this.x = x; this.y = y; this.size = size; this.life = life; this.maxLife = life;
        this.shape = shape; this.alive = true;
    }

    update() {
        this.y -= 0.35;
        this.size += 0.08;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    /** sprites は getSmokeSprites() の [形][色段]。無ければ（node の道具）描かない */
    draw(ctx, sprites) {
        if (!sprites) return;
        const t = 1 - this.life / this.maxLife;
        const tints = sprites[this.shape % sprites.length];
        const img = tints[Math.min(tints.length - 1, Math.floor(t * tints.length))];
        ctx.globalAlpha = TOWN_SMOKE_ALPHA * (this.life / this.maxLife);
        ctx.drawImage(img, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}
