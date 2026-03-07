// ============================================
// Grenade - Arc trajectory projectile
// ============================================

import {
    GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_BOUNCE, GRENADE_FRICTION,
    GRENADE_BLAST_RADIUS, GRENADE_DAMAGE_RADIUS, GRENADE_DAMAGE,
    GRENADE_LIFETIME, GRENADE_EXPLOSION_COUNT,
    TILE_SIZE
} from '../utils/Constants.js';

export class Grenade {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * GRENADE_SPEED;
        this.vy = Math.sin(angle) * GRENADE_SPEED;
        this.alive = true;
        this.lifetime = GRENADE_LIFETIME;
        this.rotation = 0;
    }

    update() {
        if (!this.alive) return;

        const map = this.game.map;

        // Apply gravity
        this.vy += GRENADE_GRAVITY;

        // Calculate next position
        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;

        // --- Map collision (2D Bouncing) ---

        // Horizontal Movement & Collision
        if (map.isSolidAtPixel(nextX, this.y)) {
            this.vx *= -GRENADE_BOUNCE;
            nextX = this.x + this.vx;
        }
        this.x = nextX;

        // Vertical Movement & Collision
        if (map.isSolidAtPixel(this.x, nextY)) {
            // Is it ground or ceiling?
            if (Math.abs(this.vy) > 0.5) {
                this.vy *= -GRENADE_BOUNCE;
            } else {
                // Grounded: stop bouncing and apply friction
                this.vy = 0;
                this.vx *= GRENADE_FRICTION;
            }
            nextY = this.y + this.vy;
        }
        this.y = nextY;

        // Rotation based on speed
        this.rotation += this.vx * 0.1;

        this.lifetime--;

        if (this.lifetime <= 0) {
            this._explode();
            return;
        }

        // --- Out of bounds ---
        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    _explode() {
        this.alive = false;
        const map = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);

        // Map destruction
        const destroyed = map.destroyArea(tile.r, tile.c, GRENADE_BLAST_RADIUS);
        this.game.spawnExplosion(this.x, this.y, GRENADE_EXPLOSION_COUNT);

        // Score for map blocks
        if (destroyed.length > 0) {
            this.game.addScore(destroyed.length * 10);
        }

        // --- Entity Area Damage (AoE) ---

        // Damage enemies
        for (const enemy of this.game.enemies) {
            if (!enemy.alive) continue;
            const dx = (enemy.x + enemy.width / 2) - this.x;
            const dy = (enemy.y + enemy.height / 2) - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < GRENADE_DAMAGE_RADIUS) {
                // Linear falloff or flat damage? Flat for now as per simple mechanics
                enemy.takeDamage(GRENADE_DAMAGE);
            }
        }

        // Damage Player
        const player = this.game.player;
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
            const dx = (player.x + player.width / 2) - this.x;
            const dy = (player.y + player.height / 2) - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < GRENADE_DAMAGE_RADIUS) {
                player.takeDamage(GRENADE_DAMAGE / 2); // Less damage to player
            }
        }

        // Damage Carrier
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) {
            const dx = (carrier.x + carrier.width / 2) - this.x;
            const dy = (carrier.y + carrier.height / 2) - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < GRENADE_DAMAGE_RADIUS) {
                carrier.takeDamage(GRENADE_DAMAGE / 4);
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Body
        ctx.fillStyle = '#336633';
        ctx.fillRect(-3, -3, 6, 6);

        // Highlight
        ctx.fillStyle = '#55AA55';
        ctx.fillRect(-2, -2, 3, 3);

        // Pin
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(2, -4, 1, 2);

        ctx.restore();
    }
}
