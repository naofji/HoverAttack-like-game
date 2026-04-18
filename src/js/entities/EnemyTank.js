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
import { collidesWithMap, checkHorizontalEntityCollision, checkVerticalEntityCollision } from '../utils/Physics.js';
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
        this.maxHp = this.hp;
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

        // --- Determine if on ground ---
        this.y += 1;
        const grounded = this._collidesWithMap();
        this.y -= 1;

        // --- Predictive Navigation (User Rules) ---
        if (grounded) { // Only decide path when firmly on the ground
            const frontX = this.patrolDir > 0 ? this.x + this.width + 1 : this.x - 1;
            const tx = Math.floor(frontX / TILE_SIZE);
            const ty = Math.floor((this.y + this.height - 1) / TILE_SIZE); // Tank body Y

            const isSolid = (cx, cy) => {
                return map.isSolidAtPixel(cx * TILE_SIZE + TILE_SIZE / 2, cy * TILE_SIZE + TILE_SIZE / 2);
            };

            const blockFront = isSolid(tx, ty);
            const blockDown1 = isSolid(tx, ty + 1);
            const blockDown2 = isSolid(tx, ty + 2);
            const blockUp = isSolid(tx, ty - 1);

            if (!blockFront && (blockDown1 || blockDown2)) {
                // 1) Front empty, and either 1-level down or 2-level down is solid => go straight
            } else if (blockFront && !blockUp) {
                // 2) Front solid, and above it is empty => step up 1 block and go straight
                // The user says "1マス分ジャンプして" (jump 1 block)
                this.y -= TILE_SIZE;

                // Nudge X over the ledge so it doesn't fall back down immediately
                // By placing the right/left edge 1.0 pixel into the new block, it guarantees
                // vertical collision will detect the block under it on this frame.
                if (this.patrolDir > 0) {
                    this.x = (tx * TILE_SIZE) - this.width + 1.0;
                } else {
                    this.x = (tx * TILE_SIZE) + TILE_SIZE - 1.0;
                }
            } else {
                // 3) Otherwise (e.g. wall too high, or cliff too deep) => turn around
                this.patrolDir *= -1;
                this.vx = this.patrolDir * ENEMY_TANK_SPEED;
            }
        }

        // --- Apply Horizontal Movement ---
        this.x += this.vx;

        // Safety Fallback (in case of strange map overlaps)
        if (this._collidesWithMap()) {
            this.x -= this.vx;
            this.vx = 0;
            this.patrolDir *= -1;
        }

        // Horizontal Entity Collision
        this._checkHorizontalEntities();

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

        // Vertical Entity Collision
        if (this.vy > 0) {
            const entities = [...this.game.enemies];
            const player = this.game.player;
            if (player && player.alive && !player.docked) entities.push(player);
            checkVerticalEntityCollision(this, entities);
        }
    }

    _checkHorizontalEntities() {
        const entities = [...this.game.enemies];
        const player = this.game.player;
        if (player && player.alive && !player.docked) entities.push(player);

        checkHorizontalEntityCollision(this, entities, () => {
            this.patrolDir *= -1;
        });
    }

    _collidesWithMap() {
        // EnemyTank uses 5 check points (4 corners + bottom center)
        const points = [
            { x: this.x + 1, y: this.y + 1 },
            { x: this.x + this.width - 1, y: this.y + 1 },
            { x: this.x + 1, y: this.y + this.height - 1 },
            { x: this.x + this.width - 1, y: this.y + this.height - 1 },
            { x: this.x + this.width / 2, y: this.y + this.height - 1 },
        ];
        return collidesWithMap(this, this.game.map, points);
    }

    // ------------------------------------------
    // AI: Shooting
    // ------------------------------------------

    _handleShooting() {
        this.fireTimer--;
        if (this.fireTimer > 0) return;

        const player = this.game.player;
        const carrier = this.game.carrier;
        let target = null;
        let minDist = ENEMY_TANK_SIGHT_RANGE;

        // Check if player is a valid target
        if (player && player.alive && !player.docked) {
            const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
            // Only target if in the front 180-degree arc
            if ((this.patrolDir > 0 && dx >= 0) || (this.patrolDir < 0 && dx <= 0)) {
                const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= minDist) {
                    minDist = dist;
                    target = player;
                }
            }
        }

        // Check if carrier is a valid target (carrier is wide, so use center distance)
        if (carrier && carrier.alive) {
            const dx = (carrier.x + carrier.width / 2) - (this.x + this.width / 2);
            // Only target if in the front 180-degree arc
            if ((this.patrolDir > 0 && dx >= 0) || (this.patrolDir < 0 && dx <= 0)) {
                const dy = (carrier.y + carrier.height / 2) - (this.y + this.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                // If player is docked, we prioritize carrier anyway since player is invalid
                if (dist <= minDist) {
                    minDist = dist;
                    target = carrier;
                }
            }
        }

        if (target) {
            // Fire at target
            const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
            const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
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
        if (!this.alive) return;
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
