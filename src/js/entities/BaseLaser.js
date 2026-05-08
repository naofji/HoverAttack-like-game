import {
    BASE_LASER_SPEED,
    COLOR_LASER
} from '../utils/Constants.js';

export class BaseLaser {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.dx = Math.cos(angle) * BASE_LASER_SPEED;
        this.dy = Math.sin(angle) * BASE_LASER_SPEED;
        this.angle = angle;
        this.width = 100;  // Increased from 16
        this.height = 6;  // Increased from 4
        this.alive = true;
        this.life = 120; // Maximum life in frames
        this.isBaseLaser = true;
    }

    update() {
        if (!this.alive) return;

        this.x += this.dx;
        this.y += this.dy;

        // Laser passes through blocks, so no map collision check here

        this.life--;
        if (this.life <= 0) {
            this.alive = false;
        }

        // Screen boundary check
        if (this.x < 0 || this.x > this.game.map.width * 16 ||
            this.y < 0 || this.y > this.game.map.height * 16) {
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Draw laser beam (Emerald Green glow)
        const gradient = ctx.createLinearGradient(-this.width / 2, 0, this.width / 2, 0);
        gradient.addColorStop(0, 'rgba(0, 255, 170, 0)');
        gradient.addColorStop(0.5, '#00FFAA');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');

        ctx.fillStyle = gradient;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Core bright center
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 2, this.width - 8, this.height - 4);

        ctx.restore();
    }
}
