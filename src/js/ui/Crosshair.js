// ============================================
// Crosshair - Mouse aiming reticle
// ============================================

import { COLOR_CROSSHAIR } from '../utils/Constants.js';

export class Crosshair {
    constructor(game) {
        this.game = game;
    }

    draw(ctx) {
        const mx = this.game.input.mouse.x;
        const my = this.game.input.mouse.y;
        const size = 12;
        const gap = 3;

        ctx.strokeStyle = COLOR_CROSSHAIR;
        ctx.lineWidth = 1.5;

        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(mx - size, my);
        ctx.lineTo(mx - gap, my);
        ctx.moveTo(mx + gap, my);
        ctx.lineTo(mx + size, my);
        // Vertical lines
        ctx.moveTo(mx, my - size);
        ctx.lineTo(mx, my - gap);
        ctx.moveTo(mx, my + gap);
        ctx.lineTo(mx, my + size);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = COLOR_CROSSHAIR;
        ctx.fillRect(mx - 1, my - 1, 2, 2);

        ctx.lineWidth = 1;
    }
}
