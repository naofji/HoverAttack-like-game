// ============================================
// Landmine - Floor trap that explodes on contact
// ============================================

import {
    LANDMINE_WIDTH, LANDMINE_HEIGHT,
    LANDMINE_DAMAGE, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX,
    LANDMINE_BLINK_INTERVAL,
    LANDMINE_BLAST_RADIUS
} from '../utils/Constants.js';
import { applyBlastDamage } from '../utils/blastDamage.js';
import { playBlast } from './destruction.js';

export class Landmine {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = LANDMINE_WIDTH;
        this.height = LANDMINE_HEIGHT;
        this.alive = true;
        this.blinkTimer = Math.floor(Math.random() * LANDMINE_BLINK_INTERVAL);
    }

    update() {
        if (!this.alive) return;
        this.blinkTimer++;
    }

    /**
     * Check collision with a rectangular entity (player, carrier, etc.)
     * Returns true if this mine overlaps with the given bounding box.
     */
    collidesWith(entity) {
        if (!this.alive || !entity.alive) return false;
        return (
            this.x < entity.x + entity.width &&
            this.x + this.width > entity.x &&
            this.y < entity.y + entity.height &&
            this.y + this.height > entity.y
        );
    }

    /**
     * Check collision with a point (for projectiles like missiles).
     */
    collidesWithPoint(px, py) {
        if (!this.alive) return false;
        return (
            px >= this.x && px <= this.x + this.width &&
            py >= this.y && py <= this.y + this.height
        );
    }

    /**
     * Detonate the mine: spawn explosion, deal AoE damage, and trigger chain reactions.
     */
    detonate() {
        if (!this.alive) return;
        this.alive = false;

        // Explosion visual
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        playBlast(this.game, cx, cy, 'landmine');

        applyBlastDamage(this.game, cx, cy, {
            radius: LANDMINE_BLAST_RADIUS, damage: LANDMINE_DAMAGE,
            knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX, source: this,
        });
    }

    draw(ctx) {
        if (!this.alive) return;

        const blinkOn = (this.blinkTimer % LANDMINE_BLINK_INTERVAL) < (LANDMINE_BLINK_INTERVAL / 2);

        // --- Base (dark metallic rectangle) ---
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // --- Top highlight ---
        ctx.fillStyle = '#555555';
        ctx.fillRect(this.x + 1, this.y, this.width - 2, 2);

        // --- Blinking LED (red dot) ---
        if (blinkOn) {
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + 2, 2, 0, Math.PI * 2);
            ctx.fill();

            // Glow effect
            ctx.fillStyle = 'rgba(255, 50, 50, 0.3)';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
