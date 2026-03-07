// ============================================
// Crosshair - Mouse aiming reticle
// ============================================

import { COLOR_CROSSHAIR } from '../utils/Constants.js';

export class Crosshair {
    constructor(game) {
        this.game = game;
    }

    draw(ctx) {
        const input = this.game.input;
        const camera = this.game.camera;

        let mx, my;
        if (input.crosshairLocked) {
            mx = input.lockedWorldX - camera.x;
            my = input.lockedWorldY - camera.y;
        } else {
            mx = input.mouse.x;
            my = input.mouse.y;
        }

        const size = 12;
        const gap = 3;

        // Change color when locked
        ctx.strokeStyle = input.crosshairLocked ? '#FFFF00' : COLOR_CROSSHAIR;
        ctx.lineWidth = input.crosshairLocked ? 2.5 : 1.5;

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
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(mx - 1, my - 1, 2, 2);

        ctx.lineWidth = 1;
    }
}
