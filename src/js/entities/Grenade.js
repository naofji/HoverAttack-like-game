// ============================================
// Grenade - Arc trajectory projectile
// ============================================

import {
    GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_MAX_FALLING_SPEED, GRENADE_BOUNCE, GRENADE_FRICTION,
    GRENADE_BLAST_RADIUS, GRENADE_DAMAGE_RADIUS, GRENADE_DAMAGE,
    GRENADE_BLOCK_DAMAGE, ENEMY_GRENADE_BLOCK_DAMAGE,
    GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX,
    GRENADE_LIFETIME,
} from '../utils/Constants.js';
import { applyKnockback } from '../utils/Knockback.js';
import { playBlast } from './destruction.js';
import { recordHit } from '../utils/hitPoint.js';
import { motionFor } from '../world/StageEnvironment.js';

export class Grenade {
    constructor(game, x, y, angle, speed = GRENADE_SPEED) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alive = true;
        this.lifetime = GRENADE_LIFETIME;
        this.rotation = 0;
        this.isPlayerOwned = true; // Default to player owned
    }

    update() {
        if (!this.alive) return;

        const map = this.game.map;
        const motion = motionFor(this.game, this.x, this.y);

        // Apply gravity
        this.vy += GRENADE_GRAVITY * motion.gravity;
        if (this.vy > GRENADE_MAX_FALLING_SPEED) this.vy = GRENADE_MAX_FALLING_SPEED;

        // Calculate next position
        let nextX = this.x + this.vx * motion.speed;
        let nextY = this.y + this.vy * motion.speed;

        // --- Map collision (2D Bouncing) ---

        // Horizontal Movement & Collision
        if (map.isSolidAtPixel(nextX, this.y)) {
            this.vx *= -GRENADE_BOUNCE;
            nextX = this.x + this.vx * motion.speed;
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
            nextY = this.y + this.vy * motion.speed;
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
        // 半径は持ち主で変えない（変えると敵のグレネードが当たっていないように見える）。
        // 弱めるのはブロックへのダメージだけ。敵は 1 なので通常岩は今までどおり一撃で
        // 消えるが、硬い岩（HP 3）は残る＝足場の骨組みが撃ち崩されない
        const destroyed = map.destroyArea(
            tile.r, tile.c, GRENADE_BLAST_RADIUS,
            this.isPlayerOwned ? GRENADE_BLOCK_DAMAGE : ENEMY_GRENADE_BLOCK_DAMAGE,
        );
        playBlast(this.game, this.x, this.y, 'grenade');

        // Score for map blocks
        // 持ち主を見ずに加点していたので、**敵が壊した地形でプレイヤーに点が入っていた**
        // （敵のグレネードが増える後半ほど勝手に稼げる）。自機が壊した分だけ加点する
        if (this.isPlayerOwned && destroyed.length > 0) {
            this.game.addScore(destroyed.length * 10);
        }

        // --- Entity Area Damage (AoE) ---
        if (this.isPlayerOwned) {
            // Player grenade: Damages enemies only (No friendly fire)
            for (const enemy of this.game.enemies) {
                if (!enemy.alive) continue;
                const dx = (enemy.x + enemy.width / 2) - this.x;
                const dy = (enemy.y + enemy.height / 2) - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < GRENADE_DAMAGE_RADIUS) {
                    recordHit(enemy, this.x, this.y);
                    // 炸裂点のXを渡す。6面以降の基地の周回シールドが左右を見る
                    enemy.takeDamage(GRENADE_DAMAGE, this.x);
                }
            }
        } else {
            // Enemy grenade: Damages player and carrier only (No friendly fire for enemies)
            const player = this.game.player;
            if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
                const dx = (player.x + player.width / 2) - this.x;
                const dy = (player.y + player.height / 2) - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < GRENADE_DAMAGE_RADIUS) {
                    recordHit(player, this.x, this.y);
                    player.takeDamage(GRENADE_DAMAGE / 2); // Less damage to player
                    applyKnockback(player, dx, GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX);
                }
            }

            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                const dx = (carrier.x + carrier.width / 2) - this.x;
                const dy = (carrier.y + carrier.height / 2) - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < GRENADE_DAMAGE_RADIUS) {
                    recordHit(carrier, this.x, this.y);
                    carrier.takeDamage(GRENADE_DAMAGE / 4);
                }
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
