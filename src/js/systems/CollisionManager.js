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
                        let damage = 10;
                        if (bullet.isBaseLaser) damage = 50;
                        
                        if (bullet.constructor.name === 'EnemyCruiseMissile') {
                            damage = 30; // Medium damage
                            game.spawnExplosion(bullet.x, bullet.y, 40); // Large explosion
                        }

                        game.player.takeDamage(damage);
                        if (!bullet.isBaseLaser) bullet.alive = false;
                    }
                }
                // Check collision with carrier
                if (game.carrier && game.carrier.alive) {
                    if (pointInRect(bullet.x, bullet.y, game.carrier)) {
                        let damage = 10;
                        if (bullet.isBaseLaser) damage = 50;

                        if (bullet.constructor.name === 'EnemyCruiseMissile') {
                            damage = 30; // Medium damage
                            game.spawnExplosion(bullet.x, bullet.y, 40); // Large explosion
                        }

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

            // --- Intercept Homing & Cruise Missiles ---
            const isPlayerProj = (proj instanceof Missile && proj.isPlayerOwned) || (proj instanceof PlayerBullet);
            if (isPlayerProj) {
                for (const bullet of game.enemyBullets) {
                    if (!bullet.alive) continue;

                    if (bullet.constructor.name === 'EnemyHomingMissile') {
                        const dx = proj.x - bullet.x;
                        const dy = proj.y - bullet.y;
                        if (dx * dx + dy * dy < 144) { // ~12px radius collision
                            bullet.alive = false;
                            bullet.exploded = true;
                            proj.alive = false;
                            if (proj instanceof Missile) proj.exploded = true;
                            game.spawnExplosion(bullet.x, bullet.y, 8);
                            game.addScore(20); // Bonus for interception
                            break; // Proj destroyed, move to next proj
                        }
                    } else if (bullet.constructor.name === 'EnemyCruiseMissile') {
                        const dx = proj.x - bullet.x;
                        const dy = proj.y - bullet.y;
                        if (dx * dx + dy * dy < 400) { // ~20px radius collision (bigger target)
                            const damage = proj instanceof Missile ? 15 : 3; // MG damage is 3
                            bullet.hp -= damage;
                            
                            proj.alive = false;
                            if (proj instanceof Missile) proj.exploded = true;
                            
                            if (bullet.hp <= 0) {
                                bullet.alive = false;
                                bullet.exploded = true;
                                game.spawnExplosion(bullet.x, bullet.y, 40); // Large explosion when shot down
                                game.addScore(100); // Bonus for destroying cruise missile
                            } else {
                                game.spawnExplosion(proj.x, proj.y, 5); // Hit spark
                            }
                            break;
                        }
                    }
                }
            }
            if (!proj.alive) continue; // Skip further checks if intercepted

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
                        // Boss (EnemyBase) is immune to machine gun bullets
                        if (!enemy.isBase) {
                            enemy.takeDamage(3); // Machine gun damage
                        }
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
