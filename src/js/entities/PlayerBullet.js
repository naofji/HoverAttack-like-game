// ============================================
// PlayerBullet - Projectile fired by Machine Gun
// ============================================

import {
    TILE_SIZE,
    PLAYER_MG_SPEED, PLAYER_MG_RADIUS,
    PLAYER_MG_LIFETIME
} from '../utils/Constants.js';
import { audioManager } from '../audio/AudioManager.js';

export class PlayerBullet {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * PLAYER_MG_SPEED;
        this.vy = Math.sin(angle) * PLAYER_MG_SPEED;
        this.radius = PLAYER_MG_RADIUS;
        this.alive = true;
        this.lifetime = PLAYER_MG_LIFETIME;

        // Play turret-like firing sound (as requested)
        audioManager.playEnemyFire(); 
    }

    update() {
        if (!this.alive) return;

        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;

        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        // --- Map collision ---
        const map = this.game.map;
        // Check if hitting a solid block. Bullets do NOT damage blocks.
        if (map.isSolidAtPixel(this.x, this.y)) {
            this.alive = false;
            return;
        }

        // Collision with enemies is handled by CollisionManager
    }

    draw(ctx) {
        if (!this.alive) return;

        // Bright yellow/white bullet similar to turret bullets
        ctx.fillStyle = '#FFDD33'; // Slightly brighter than enemy bullets
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // White core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1, 0, Math.PI * 2);
        ctx.fill();
    }
}
