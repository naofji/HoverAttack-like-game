// ============================================
// Collision Manager - Centralized projectile/bullet collision
// ============================================

import { Missile } from '../entities/Missile.js';
import { PlayerBullet } from '../entities/PlayerBullet.js';
import { pointInRect } from '../utils/Physics.js';

export class CollisionManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * Process all projectile and enemy bullet collisions for the current frame.
     */
    update() {
        this._updateEnemyBullets();
        this._updateProjectiles();
    }

    // ------------------------------------------
    // Enemy Bullets vs Player/Carrier
    // ------------------------------------------
    _updateEnemyBullets() {
        const game = this.game;

        for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = game.enemyBullets[i];
            bullet.update();

            if (bullet.alive) {
                // Check collision with player
                if (game.player && game.player.alive && !game.player.docked && game.player.invincibleTimer <= 0) {
                    if (pointInRect(bullet.x, bullet.y, game.player)) {
                        const damage = bullet.isBaseLaser ? 50 : 10;
                        game.player.takeDamage(damage);
                        if (!bullet.isBaseLaser) bullet.alive = false;
                    }
                }
                // Check collision with carrier
                if (game.carrier && game.carrier.alive) {
                    if (pointInRect(bullet.x, bullet.y, game.carrier)) {
                        const damage = bullet.isBaseLaser ? 50 : 10;
                        game.carrier.takeDamage(damage);
                        if (!bullet.isBaseLaser) bullet.alive = false;
                    }
                }
            }

            if (!bullet.alive) {
                game.enemyBullets.splice(i, 1);
            }
        }
    }

    // ------------------------------------------
    // Projectiles (Missiles/Grenades) vs Entities
    // ------------------------------------------
    _updateProjectiles() {
        const game = this.game;

        for (const proj of game.projectiles) {
            if (!proj.alive || proj.exploded) continue;

            if (proj instanceof Missile && proj.isPlayerOwned) {
                // Player missiles vs enemies
                for (const enemy of game.enemies) {
                    if (!enemy.alive) continue;
                    if (pointInRect(proj.x, proj.y, enemy)) {
                        enemy.takeDamage(15);
                        game.spawnExplosion(proj.x, proj.y, 12);
                        proj.alive = false;
                        proj.exploded = true;
                        break;
                    }
                }
            } else if (proj instanceof PlayerBullet) {
                // Player machine gun bullets vs enemies
                for (const enemy of game.enemies) {
                    if (!enemy.alive) continue;
                    if (pointInRect(proj.x, proj.y, enemy)) {
                        enemy.takeDamage(3); // Machine gun damage
                        game.spawnExplosion(proj.x, proj.y, 4); // Smaller hit spark
                        proj.alive = false;
                        break;
                    }
                }
            } else if (proj instanceof Missile && !proj.isPlayerOwned) {
                // Enemy missiles vs player
                const player = game.player;
                if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
                    if (pointInRect(proj.x, proj.y, player)) {
                        player.takeDamage(15);
                        game.spawnExplosion(proj.x, proj.y, 8);
                        proj.alive = false;
                        proj.exploded = true;
                        continue;
                    }
                }
                // Enemy missiles vs carrier
                const carrier = game.carrier;
                if (carrier && carrier.alive) {
                    if (pointInRect(proj.x, proj.y, carrier)) {
                        carrier.takeDamage(10);
                        game.spawnExplosion(proj.x, proj.y, 8);
                        proj.alive = false;
                        proj.exploded = true;
                    }
                }
            }
        }
    }
}
