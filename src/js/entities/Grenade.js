// ============================================
// Grenade - Arc trajectory projectile
// ============================================

import {
    GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_BLAST_RADIUS,
    GRENADE_LIFETIME, GRENADE_EXPLOSION_COUNT
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

        this.vy += GRENADE_GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += 0.15;
        this.lifetime--;

        if (this.lifetime <= 0) {
            this._explode();
            return;
        }

        // --- Map collision ---
        const map = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);

        if (map.isSolid(tile.r, tile.c)) {
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

        const destroyed = map.destroyArea(tile.r, tile.c, GRENADE_BLAST_RADIUS);
        this.game.spawnExplosion(this.x, this.y, GRENADE_EXPLOSION_COUNT);
        this.game.addScore(destroyed.length * 10);
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
