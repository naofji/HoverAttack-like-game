// ============================================
// EnemyTank - Hovering ground patrol enemy
// ============================================

import {
    TILE_SIZE, GRAVITY, FRICTION,
    ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT, ENEMY_TANK_HP,
    ENEMY_TANK_SPEED, ENEMY_TANK_SIGHT_RANGE,
    ENEMY_TANK_FIRE_INTERVAL, ENEMY_TANK_SCORE,
    ENEMY_TANK_MAX_FALLING_SPEED,
    EXPLOSION_PARTICLE_COUNT
} from '../utils/Constants.js';
import { EnemyBullet } from './EnemyBullet.js';

export class EnemyTank {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_TANK_WIDTH;
        this.height = ENEMY_TANK_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;

        this.hp = ENEMY_TANK_HP;
        this.score = ENEMY_TANK_SCORE;
        this.facingRight = Math.random() < 0.5;

        // AI state
        this.fireTimer = Math.floor(Math.random() * ENEMY_TANK_FIRE_INTERVAL);
        this.patrolDir = this.facingRight ? 1 : -1;

        // Hover engine exhaust animation
        this.exhaustTimer = 0;
    }

    update() {
        if (!this.alive) return;

        this.exhaustTimer++;

        // --- Patrol Movement ---
        this.vx = this.patrolDir * ENEMY_TANK_SPEED;

        // --- Gravity (hover tanks float but are affected by gravity) ---
        this.vy += GRAVITY;
        if (this.vy > ENEMY_TANK_MAX_FALLING_SPEED) this.vy = ENEMY_TANK_MAX_FALLING_SPEED;

        // --- Friction ---
        this.vx *= FRICTION;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;

        // --- Movement with collision (carrier-style) ---
        this._moveAndCollide();

        // --- Facing direction ---
        this.facingRight = this.patrolDir > 0;

        // --- AI: Detect and shoot at player ---
        this._handleShooting();
    }

    // ------------------------------------------
    // Physics (similar to Carrier)
    // ------------------------------------------

    _moveAndCollide() {
        const map = this.game.map;

        // --- Horizontal ---
        this.x += this.vx;
        if (this._collidesWithMap()) {
            // Try to climb a 1-tile step
            this.y -= TILE_SIZE;
            const canClimb = !this._collidesWithMap();
            this.y += TILE_SIZE;

            if (canClimb) {
                this.y -= 3; // Smooth step up
                this.vy = 0;
            } else {
                // Can't climb — reverse patrol direction
                this.x -= this.vx;
                this.vx = 0;
                this.patrolDir *= -1;
            }
        }

        // --- Check for cliffs (don't walk off edges) ---
        const frontX = this.patrolDir > 0
            ? this.x + this.width + 2
            : this.x - 2;
        const feetY = this.y + this.height + 4;
        if (!map.isSolidAtPixel(frontX, feetY)) {
            // No ground ahead — reverse
            this.patrolDir *= -1;
        }

        // --- Vertical ---
        this.y += this.vy;
        if (this._collidesWithMap()) {
            if (this.vy > 0) {
                // Landing
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height - 0.01;
            } else if (this.vy < 0) {
                // Hit ceiling
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
            }
            this.vy = 0;
        }
    }

    _collidesWithMap() {
        const map = this.game.map;
        // Check 4 corners + 2 bottom-center points
        const points = [
            { x: this.x + 1, y: this.y + 1 },
            { x: this.x + this.width - 1, y: this.y + 1 },
            { x: this.x + 1, y: this.y + this.height - 1 },
            { x: this.x + this.width - 1, y: this.y + this.height - 1 },
            { x: this.x + this.width / 2, y: this.y + this.height - 1 },
        ];
        return points.some(p => map.isSolidAtPixel(p.x, p.y));
    }

    // ------------------------------------------
    // AI: Shooting
    // ------------------------------------------

    _handleShooting() {
        this.fireTimer--;
        if (this.fireTimer > 0) return;

        const player = this.game.player;
        if (!player || !player.alive) return;

        // Calculate distance to player
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= ENEMY_TANK_SIGHT_RANGE) {
            // Fire at player
            const angle = Math.atan2(dy, dx);
            const bulletX = this.x + this.width / 2 + Math.cos(angle) * 8;
            const bulletY = this.y + this.height / 2 + Math.sin(angle) * 4;
            this.game.enemyBullets.push(new EnemyBullet(this.game, bulletX, bulletY, angle));

            // Face the player
            this.facingRight = dx > 0;
        }

        this.fireTimer = ENEMY_TANK_FIRE_INTERVAL;
    }

    // ------------------------------------------
    // Damage
    // ------------------------------------------

    takeDamage(amount) {
        this.hp -= amount;
        this.game.spawnSparks(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        // Explosion effect
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.game.spawnExplosion(cx, cy, EXPLOSION_PARTICLE_COUNT);
        this.game.addScore(this.score);
    }

    // ------------------------------------------
    // Drawing
    // ------------------------------------------

    draw(ctx) {
        if (!this.alive) return;

        const x = this.x;
        const y = this.y;
        const dir = this.facingRight ? 1 : -1;

        ctx.save();
        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
            ctx.translate(0, 0);
        } else {
            ctx.translate(x, y);
        }

        // --- Hull (yellow body) ---
        ctx.fillStyle = '#CCAA00';
        ctx.fillRect(1, 2, 14, 7);

        // --- Hull highlight ---
        ctx.fillStyle = '#DDBB22';
        ctx.fillRect(2, 2, 12, 3);

        // --- Turret (blue) ---
        ctx.fillStyle = '#2266AA';
        ctx.fillRect(8, 0, 6, 4);

        // --- Gun barrel ---
        ctx.fillStyle = '#445566';
        ctx.fillRect(14, 1, 4, 2);

        // --- Track/hover skirt ---
        ctx.fillStyle = '#334455';
        ctx.fillRect(0, 9, 16, 3);

        // --- Hover exhaust (pulsing glow beneath) ---
        const glowAlpha = 0.3 + 0.2 * Math.sin(this.exhaustTimer * 0.15);
        ctx.fillStyle = `rgba(100, 200, 255, ${glowAlpha})`;
        ctx.fillRect(2, 11, 12, 2);

        ctx.restore();
    }
}
