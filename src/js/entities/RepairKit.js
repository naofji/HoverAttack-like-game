import { TILE_SIZE, GRAVITY, ITEM_PICKUP_SCORE } from '../utils/Constants.js';

const SIZE = TILE_SIZE;
const CORNER_RADIUS = 4;
export const REPAIR_KIT_HEAL = 50; // carrier HP restored per kit

export class RepairKit {
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
                player.repairKits++;
                this.game.addScore(ITEM_PICKUP_SCORE);
                this.alive = false;
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const pulse = 0.5 + 0.5 * Math.sin(this.frameCounter * 0.1);

        ctx.save();

        // 外側のグロー
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.shadowColor = '#00FF66';

        // 本体（やや丸い緑の四角）
        const green = Math.floor(200 + pulse * 55);
        ctx.fillStyle = `rgb(0, ${green}, 60)`;
        ctx.beginPath();
        const r = CORNER_RADIUS;
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

        // 十字マーク（修理シンボル）
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255,255,255,${0.8 + pulse * 0.2})`;
        ctx.fillRect(x + 6, y + 3, 4, 10);
        ctx.fillRect(x + 3, y + 6, 10, 4);

        ctx.restore();
    }
}
