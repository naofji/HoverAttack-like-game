import { TILE_SIZE, GRAVITY, AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION, ITEM_PICKUP_SCORE } from '../utils/Constants.js';

const SIZE = TILE_SIZE;
const CORNER_RADIUS = 4;

export class AutoAimUnit {
    constructor(game, x, y) {
        this.game = game;
        this.x = x - SIZE / 2;
        this.y = y;
        this.width = SIZE;
        this.height = SIZE;
        this.vy = 0;
        this.alive = true;
        this.frameCounter = 0;
        this.onGround = false;
    }

    update() {
        if (!this.alive) return;

        this.frameCounter++;

        if (!this.onGround) {
            this.vy += GRAVITY;
            if (this.vy > 10) this.vy = 10;
            this.y += this.vy;

            const map = this.game.map;
            if (map.isSolidAtPixel(this.x + 3, this.y + this.height) ||
                map.isSolidAtPixel(this.x + this.width - 3, this.y + this.height)) {
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                this.vy = 0;
                this.onGround = true;
            }
        }

        // Player pickup
        const player = this.game.player;
        if (player && player.alive && !player.docked) {
            if (this.x < player.x + player.width &&
                this.x + this.width > player.x &&
                this.y < player.y + player.height &&
                this.y + this.height > player.y) {
                player.autoAimTimer = Math.min(player.autoAimTimer + AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION);
                player.autoAimMaxTimer = AUTO_AIM_MAX_DURATION;
                this.game.addScore(ITEM_PICKUP_SCORE);
                this.alive = false;
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const pulse = 0.5 + 0.5 * Math.sin(this.frameCounter * 0.12);

        ctx.save();

        // 外側グロー（オレンジ）
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.shadowColor = '#FF8800';

        // 本体（角丸オレンジ四角）
        const r = CORNER_RADIUS;
        const orange = Math.floor(160 + pulse * 80);
        ctx.fillStyle = `rgb(${orange}, 80, 0)`;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + SIZE - r, y);
        ctx.arcTo(x + SIZE, y, x + SIZE, y + r, r);
        ctx.lineTo(x + SIZE, y + SIZE - r);
        ctx.arcTo(x + SIZE, y + SIZE, x + SIZE - r, y + SIZE, r);
        ctx.lineTo(x + r, y + SIZE);
        ctx.arcTo(x, y + SIZE, x, y + SIZE - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();

        // ターゲットサークル記号
        ctx.shadowBlur = 0;
        const cx = x + SIZE / 2;
        const cy = y + SIZE / 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.8 + pulse * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.stroke();
        // 外リング
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.stroke();
        // 十字線（短め）
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy); ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 6);
        ctx.stroke();

        ctx.restore();
    }
}
