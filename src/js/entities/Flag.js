import {
    FLAG_WIDTH,
    FLAG_HEIGHT,
    FLAG_SCORE
} from '../utils/Constants.js';

export class Flag {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = FLAG_WIDTH;
        this.height = FLAG_HEIGHT;
        this.scoreValue = FLAG_SCORE;
        this.alive = true;
        this.animTimer = 0;
    }

    update() {
        this.animTimer += 0.1;
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Simple waving effect
        const wave = Math.sin(this.animTimer) * 4;

        // Flag pole
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(0, 0, 2, this.height);

        // Flag cloth
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(2 + this.width + wave, this.height / 4);
        ctx.lineTo(2, this.height / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    collidesWith(entity) {
        return (
            this.x < entity.x + entity.width &&
            this.x + this.width > entity.x &&
            this.y < entity.y + entity.height &&
            this.y + this.height > entity.y
        );
    }
}
