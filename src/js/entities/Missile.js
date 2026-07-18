// ============================================
// Missile - Straight-line projectile
// ============================================

import { MISSILE_SPEED, MISSILE_LIFETIME, TILE_SIZE, PARTICLE_LIFETIME, EXPLOSION_PARTICLE_COUNT } from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';

export class Missile {
    constructor(game, x, y, angle, isPlayerOwned = true, isRival = false) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * MISSILE_SPEED;
        this.vy = Math.sin(angle) * MISSILE_SPEED;
        this.alive = true;
        this.exploded = false;
        this.isPlayerOwned = isPlayerOwned;
        this.isRival = isRival; // Rival attacker's missile: distinct color, double damage
        this.lifetime = MISSILE_LIFETIME;
        this.frameCounter = 0;
    }

    update() {
        if (!this.alive || this.exploded) return;

        this.frameCounter++;

        // Spawn a trail particle every 2 frames
        if (this.frameCounter % 2 === 0) {
            this.game.particles.push(new TrailParticle(this.x, this.y, PARTICLE_LIFETIME));
        }

        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;

        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        // --- Map collision ---
        const map = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);

        if (map.isSolid(tile.r, tile.c)) {
            map.damageBlock(tile.r, tile.c, 1);
            this.game.spawnExplosion(this.x, this.y, EXPLOSION_PARTICLE_COUNT);
            this.exploded = true;
            this.alive = false;

            if (this.isPlayerOwned) {
                this.game.addScore(10);
            }
            return;
        }

        // --- Out of bounds ---
        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive || this.exploded) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));

        // Body
        ctx.fillStyle = this.isPlayerOwned ? '#FFFF00' : (this.isRival ? '#FF3300' : '#FF4444');
        ctx.fillRect(-4, -1, 8, 2);

        // Tip
        ctx.fillStyle = this.isRival ? '#FFAA00' : '#FFFFFF';
        ctx.fillRect(3, -1, 2, 2);

        ctx.restore();
    }
}
