// ============================================
// Crosshair - Mouse aiming reticle
// ============================================

import { COLOR_CROSSHAIR, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from '../utils/Constants.js';

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

        // Apply clamping so crosshair doesn't visually overlap the HUD
        const minY = HUD_TOP_HEIGHT;
        const maxY = this.game.canvas.height - HUD_BOTTOM_HEIGHT;
        
        if (my < minY) my = minY;
        if (my > maxY) my = maxY;

        const size = 12;
        const gap = 3;

        // Change color when locked
        ctx.strokeStyle = input.crosshairLocked ? '#FFFF00' : COLOR_CROSSHAIR;
        ctx.lineWidth = input.crosshairLocked ? 2.5 : 1.5;

        ctx.beginPath();
        if (input.crosshairLocked) {
            const r = 14; // corner radius
            const l = 6; // length of the L segment

            // Top-Left
            ctx.moveTo(mx - r, my - r + l);
            ctx.lineTo(mx - r, my - r);
            ctx.lineTo(mx - r + l, my - r);
            
            // Top-Right
            ctx.moveTo(mx + r - l, my - r);
            ctx.lineTo(mx + r, my - r);
            ctx.lineTo(mx + r, my - r + l);
            
            // Bottom-Right
            ctx.moveTo(mx + r, my + r - l);
            ctx.lineTo(mx + r, my + r);
            ctx.lineTo(mx + r - l, my + r);
            
            // Bottom-Left
            ctx.moveTo(mx - r + l, my + r);
            ctx.lineTo(mx - r, my + r);
            ctx.lineTo(mx - r, my + r - l);
        } else {
            // Horizontal lines
            ctx.moveTo(mx - size, my);
            ctx.lineTo(mx - gap, my);
            ctx.moveTo(mx + gap, my);
            ctx.lineTo(mx + size, my);
            // Vertical lines
            ctx.moveTo(mx, my - size);
            ctx.lineTo(mx, my - gap);
            ctx.moveTo(mx, my + gap);
            ctx.lineTo(mx, my + size);
        }
        ctx.stroke();

        // Center dot
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(mx - 1, my - 1, 2, 2);

        ctx.lineWidth = 1;
    }
}
