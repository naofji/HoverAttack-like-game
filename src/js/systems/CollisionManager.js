// ============================================
// Collision Manager - Centralized projectile/bullet collision
// ============================================

import { Missile } from '../entities/Missile.js';
import { PlayerBullet } from '../entities/PlayerBullet.js';
import { pointInRect } from '../utils/Physics.js';

// Damage values
const DAMAGE_DEFAULT_BULLET = 10;
const DAMAGE_BASE_LASER = 50;
const DAMAGE_CRUISE_MISSILE = 40;
const DAMAGE_HOMING_MISSILE = 20;
const DAMAGE_PLAYER_MISSILE = 15;
const DAMAGE_PLAYER_MG = 3;
const DAMAGE_ENEMY_MISSILE = 15;
const DAMAGE_ENEMY_MISSILE_CARRIER = 10;

// Explosion sizes
const EXPLOSION_CRUISE_HIT = 40;
const EXPLOSION_HOMING_HIT = 12;
const EXPLOSION_CRUISE_KILL = 40;
const EXPLOSION_HOMING_KILL = 12;
const EXPLOSION_CRUISE_SPARK = 5;
const EXPLOSION_PLAYER_MISSILE = 12;
const EXPLOSION_PLAYER_MG = 4;
const EXPLOSION_ENEMY_MISSILE = 8;

// Score bonuses for interceptions
const SCORE_HOMING_INTERCEPT = 20;
const SCORE_CRUISE_DESTROY = 100;

// Intercept collision radii (squared)
const HOMING_INTERCEPT_RADIUS_SQ = 144; // 12px radius
const CRUISE_INTERCEPT_RADIUS_SQ = 400; // 20px radius

export class CollisionManager {
    constructor(game) {
        this.game = game;
    }

    /** Process all projectile and enemy bullet collisions for the current frame. */
    update() {
        this._updateEnemyBullets();
        this._updateProjectiles();
    }

    // ------------------------------------------
    // Enemy Bullets vs Player / Carrier
    // ------------------------------------------
    _updateEnemyBullets() {
        const game = this.game;

        for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = game.enemyBullets[i];
            bullet.update();

            if (bullet.alive) {
                const playerVulnerable = game.player && game.player.alive
                    && !game.player.docked && game.player.invincibleTimer <= 0;

                if (playerVulnerable && pointInRect(bullet.x, bullet.y, game.player)) {
                    this._applyBulletHit(bullet, game.player);
                }

                if (game.carrier && game.carrier.alive && bullet.alive
                    && pointInRect(bullet.x, bullet.y, game.carrier)) {
                    this._applyBulletHit(bullet, game.carrier);
                }
            }

            if (!bullet.alive) game.enemyBullets.splice(i, 1);
        }
    }

    /**
     * Apply a bullet hit to a target (player or carrier).
     * Handles special cases for cruise/homing missiles and base lasers.
     */
    _applyBulletHit(bullet, target) {
        const game = this.game;
        let damage = DAMAGE_DEFAULT_BULLET;

        if (bullet.isBaseLaser) {
            damage = DAMAGE_BASE_LASER;
        } else if (bullet.constructor.name === 'EnemyCruiseMissile') {
            damage = DAMAGE_CRUISE_MISSILE;
            bullet._explode();
        } else if (bullet.constructor.name === 'EnemyHomingMissile') {
            damage = DAMAGE_HOMING_MISSILE;
            game.spawnExplosion(bullet.x, bullet.y, EXPLOSION_HOMING_HIT);
        }

        target.takeDamage(damage);
        if (!bullet.isBaseLaser) bullet.alive = false;
    }

    // ------------------------------------------
    // Player Projectiles vs Enemy Bullets (Interception)
    // ------------------------------------------
    /**
     * Check if a player projectile intercepts an in-flight homing or cruise missile.
     * @returns {boolean} true if the projectile was consumed by an interception.
     */
    _checkInterception(proj) {
        const game = this.game;

        for (const bullet of game.enemyBullets) {
            if (!bullet.alive) continue;

            if (bullet.constructor.name === 'EnemyHomingMissile') {
                if (this._distSq(proj, bullet) < HOMING_INTERCEPT_RADIUS_SQ) {
                    bullet.alive = false;
                    bullet.exploded = true;
                    proj.alive = false;
                    if (proj instanceof Missile) proj.exploded = true;
                    game.spawnExplosion(bullet.x, bullet.y, EXPLOSION_HOMING_KILL);
                    game.addScore(SCORE_HOMING_INTERCEPT);
                    return true;
                }
            } else if (bullet.constructor.name === 'EnemyCruiseMissile') {
                if (this._distSq(proj, bullet) < CRUISE_INTERCEPT_RADIUS_SQ) {
                    const damage = proj instanceof Missile ? DAMAGE_PLAYER_MISSILE : DAMAGE_PLAYER_MG;
                    bullet.hp -= damage;
                    proj.alive = false;
                    if (proj instanceof Missile) proj.exploded = true;

                    if (bullet.hp <= 0) {
                        bullet._explode();
                        game.addScore(SCORE_CRUISE_DESTROY);
                    } else {
                        game.spawnExplosion(proj.x, proj.y, EXPLOSION_CRUISE_SPARK);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    // ------------------------------------------
    // Projectiles (Missiles/Grenades) vs Entities
    // ------------------------------------------
    _updateProjectiles() {
        const game = this.game;

        for (const proj of game.projectiles) {
            if (!proj.alive || proj.exploded) continue;

            const isPlayerProj = (proj instanceof Missile && proj.isPlayerOwned) || (proj instanceof PlayerBullet);

            // Player projectiles may intercept airborne enemy missiles
            if (isPlayerProj && this._checkInterception(proj)) continue;

            if (proj instanceof Missile && proj.isPlayerOwned) {
                this._playerMissileVsEnemies(proj);
            } else if (proj instanceof PlayerBullet) {
                this._playerBulletVsEnemies(proj);
            } else if (proj instanceof Missile && !proj.isPlayerOwned) {
                this._enemyMissileVsTargets(proj);
            }
        }
    }

    /** Player missile hits the first enemy it touches */
    _playerMissileVsEnemies(proj) {
        const game = this.game;
        for (const enemy of game.enemies) {
            if (!enemy.alive) continue;
            if (pointInRect(proj.x, proj.y, enemy)) {
                enemy.takeDamage(DAMAGE_PLAYER_MISSILE);
                game.spawnExplosion(proj.x, proj.y, EXPLOSION_PLAYER_MISSILE);
                proj.alive = false;
                proj.exploded = true;
                break;
            }
        }
    }

    /** Machine-gun bullet hits the first enemy it touches (boss is immune) */
    _playerBulletVsEnemies(proj) {
        const game = this.game;
        for (const enemy of game.enemies) {
            if (!enemy.alive) continue;
            if (pointInRect(proj.x, proj.y, enemy)) {
                if (!enemy.isBase) enemy.takeDamage(DAMAGE_PLAYER_MG);
                game.spawnExplosion(proj.x, proj.y, EXPLOSION_PLAYER_MG);
                proj.alive = false;
                break;
            }
        }
    }

    /** Enemy missile hits player then carrier */
    _enemyMissileVsTargets(proj) {
        const game = this.game;
        const player = game.player;
        const carrier = game.carrier;

        if (player && player.alive && !player.docked && player.invincibleTimer <= 0
            && pointInRect(proj.x, proj.y, player)) {
            player.takeDamage(DAMAGE_ENEMY_MISSILE);
            game.spawnExplosion(proj.x, proj.y, EXPLOSION_ENEMY_MISSILE);
            proj.alive = false;
            proj.exploded = true;
            return;
        }

        if (carrier && carrier.alive && pointInRect(proj.x, proj.y, carrier)) {
            carrier.takeDamage(DAMAGE_ENEMY_MISSILE_CARRIER);
            game.spawnExplosion(proj.x, proj.y, EXPLOSION_ENEMY_MISSILE);
            proj.alive = false;
            proj.exploded = true;
        }
    }

    // ------------------------------------------
    // Utility
    // ------------------------------------------
    /** Squared distance between two objects with .x/.y */
    _distSq(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }
}
