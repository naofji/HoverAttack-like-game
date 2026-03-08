// ============================================
// EnemyBullet - Projectile fired by enemy units
// ============================================

import {
    TILE_SIZE,
    ENEMY_BULLET_SPEED, ENEMY_BULLET_RADIUS,
    ENEMY_BULLET_DAMAGE_PLAYER, ENEMY_BULLET_DAMAGE_CARRIER,
    ENEMY_BULLET_LIFETIME
} from '../utils/Constants.js';
import { audioManager } from '../audio/AudioManager.js';

export class EnemyBullet {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * ENEMY_BULLET_SPEED;
        this.vy = Math.sin(angle) * ENEMY_BULLET_SPEED;
        this.radius = ENEMY_BULLET_RADIUS;
        this.alive = true;
        this.lifetime = ENEMY_BULLET_LIFETIME;

        // Play firing sound
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
        if (map.isSolidAtPixel(this.x, this.y)) {
            this.alive = false;
            return;
        }

        // --- Player collision ---
        const player = this.game.player;
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
            if (this.x > player.x && this.x < player.x + player.width &&
                this.y > player.y && this.y < player.y + player.height) {
                player.takeDamage(ENEMY_BULLET_DAMAGE_PLAYER);
                this.alive = false;
                return;
            }
        }

        // --- Carrier collision ---
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) {
            if (this.x > carrier.x && this.x < carrier.x + carrier.width &&
                this.y > carrier.y && this.y < carrier.y + carrier.height) {
                carrier.takeDamage(ENEMY_BULLET_DAMAGE_CARRIER);
                this.alive = false;
                return;
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        // Yellow glowing bullet
        ctx.fillStyle = '#FFCC00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1, 0, Math.PI * 2);
        ctx.fill();
    }
}
