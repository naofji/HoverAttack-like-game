// ============================================
// Collision Manager - Centralized projectile/bullet collision
// ============================================

import { Missile } from '../entities/Missile.js';
import { PlayerBullet } from '../entities/PlayerBullet.js';
import { pointInRect, segmentIntersectsRect, closestPointOnSegment } from '../utils/Physics.js';
import { applyKnockback } from '../utils/Knockback.js';
import { applyRecoil } from '../utils/Recoil.js';
import {
    MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX,
    ENEMY_BULLET_DAMAGE, BASE_LASER_DAMAGE, PLAYER_MG_DAMAGE,
    DAMAGE_CRUISE_MISSILE, DAMAGE_HOMING_MISSILE, DAMAGE_PLAYER_MISSILE,
    DAMAGE_ENEMY_MISSILE_PLAYER, DAMAGE_ENEMY_MISSILE_CARRIER,
    HOMING_INTERCEPT_RADIUS_SQ, CRUISE_INTERCEPT_RADIUS_SQ,
    SCORE_HOMING_INTERCEPT, SCORE_CRUISE_DESTROY,
    REFLECT_BEAM_DAMAGE,
    BEAM_SPARK_COLORS, BEAM_SPARK_COUNT,
    BEAM_SPARK_SPEED_MIN, BEAM_SPARK_SPEED_MAX, BEAM_SPARK_LIFETIME,
    BEAM_SPARK_FLASH_RADIUS, COLOR_BEAM_HIT_FLASH_CORE, COLOR_BEAM_HIT_FLASH_RING,
} from '../utils/Constants.js';
import { playBlast } from '../entities/destruction.js';
import { createSparks, ImpactFlash } from '../entities/Particle.js';
import { audioManager } from '../audio/AudioManager.js';
import { recordHit } from '../utils/hitPoint.js';

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

                const playerHit = playerVulnerable ? this._bulletHitPoint(bullet, game.player) : null;
                if (playerHit) {
                    this._applyBulletHit(bullet, game.player, playerHit);
                }

                const carrierHit = (game.carrier && game.carrier.alive && bullet.alive)
                    ? this._bulletHitPoint(bullet, game.carrier) : null;
                if (carrierHit) {
                    this._applyBulletHit(bullet, game.carrier, carrierHit);
                }
            }

            if (!bullet.alive) game.enemyBullets.splice(i, 1);
        }
    }

    /**
     * 弾が対象に触れているか。
     *
     * 反射ビームだけは**帯全体**が当たるので、先端の1点ではなく節ごとの線分で見る。
     * 判定に使う帯は描画と同じ segments() の戻り値で、ここが食い違うと
     * 「見えているのに当たらない／見えていないのに当たる」になる。
     *
     * 判別子は isReflectBeam フラグに揃える（isBaseLaser と同じ作法）。
     * 同じファイル内でここだけ `typeof segments === 'function'` という
     * 別の基準を使っていて、ダメージ側（_applyBulletHit）と食い違っていた。
     */
    _bulletTouches(bullet, target) {
        return this._bulletHitPoint(bullet, target) !== null;
    }

    /**
     * 触れているなら**当たった場所**を、触れていなければ null を返す。
     *
     * 反射ビームは帯の途中でも当たるので、弾の座標（＝帯の先端）は当たった場所とは
     * 限らない。帯は最大80pxあり、先端を被弾点にすると火花も破片の爆心も
     * 見当違いな場所に出てしまう。当たった節から被弾点を取り直す。
     *
     * 点で当たる従来の弾は今までどおり弾の座標をそのまま返す。
     */
    _bulletHitPoint(bullet, target) {
        if (bullet.isReflectBeam) {
            const cx = target.x + target.width / 2;
            const cy = target.y + target.height / 2;
            for (const s of bullet.segments()) {
                if (segmentIntersectsRect(s.x1, s.y1, s.x2, s.y2, target)) {
                    return closestPointOnSegment(s.x1, s.y1, s.x2, s.y2, cx, cy);
                }
            }
            return null;
        }
        return pointInRect(bullet.x, bullet.y, target) ? { x: bullet.x, y: bullet.y } : null;
    }

    /**
     * Apply a bullet hit to a target (player or carrier).
     * Handles special cases for cruise/homing missiles and base lasers.
     */
    _applyBulletHit(bullet, target, hitPoint = null) {
        const game = this.game;
        const hx = hitPoint ? hitPoint.x : bullet.x;
        const hy = hitPoint ? hitPoint.y : bullet.y;
        let damage = ENEMY_BULLET_DAMAGE;

        if (bullet.isBaseLaser) {
            damage = BASE_LASER_DAMAGE;
        } else if (bullet.isReflectBeam) {
            damage = REFLECT_BEAM_DAMAGE;
            // 「当たっても地味で判りづらい」という実機フィードバックへの対応。
            // 紫のスパークを被弾点から全方向へ弾けさせる。
            // 爆発（spawnExplosion）は使わない：playBlast は爆発音まで込みなので、
            // 演出だけ欲しいここでは合わない（音は下で beamHit を選んで鳴らす）。
            //
            // 粒だけでは「まだ地味で見えない」と再度指摘されたので、被弾点に
            // 紫の閃光を1つ足した。粒は散らばって視界の端では拾えないが、
            // 1点で光る閃光は拾える。ImpactFlash は「命中の合図」用の既存の
            // 部品で、色を渡せるようにして使い回している
            game.particles.push(new ImpactFlash(hx, hy, BEAM_SPARK_FLASH_RADIUS, 0, {
                core: COLOR_BEAM_HIT_FLASH_CORE,
                ring: COLOR_BEAM_HIT_FLASH_RING,
            }));
            // 被弾の音。当たるとビーム自体が消える（下で alive = false）ので
            // 1発につき1回しか鳴らない。連射でも 0.4秒(REFLECT_BEAM_BURST_DELAY)
            // 離れた2回までで、鳴り続けることはない
            audioManager.playWeapon('beamHit', hx, hy);
            game.particles.push(...createSparks(hx, hy, {
                colors: BEAM_SPARK_COLORS,
                count: BEAM_SPARK_COUNT,
                radial: true,
                speedMin: BEAM_SPARK_SPEED_MIN,
                speedMax: BEAM_SPARK_SPEED_MAX,
                lifetime: BEAM_SPARK_LIFETIME,
            }));
        } else if (bullet.constructor.name === 'EnemyCruiseMissile') {
            damage = DAMAGE_CRUISE_MISSILE;
            bullet._explode();
        } else if (bullet.constructor.name === 'EnemyHomingMissile') {
            damage = DAMAGE_HOMING_MISSILE;
            playBlast(game, bullet.x, bullet.y, 'homingHit');
        }

        recordHit(target, hx, hy);
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
                    playBlast(game, bullet.x, bullet.y, 'homingHit');
                    game.addScore(SCORE_HOMING_INTERCEPT);
                    return true;
                }
            } else if (bullet.constructor.name === 'EnemyCruiseMissile') {
                if (this._distSq(proj, bullet) < CRUISE_INTERCEPT_RADIUS_SQ) {
                    const damage = proj instanceof Missile ? DAMAGE_PLAYER_MISSILE : PLAYER_MG_DAMAGE;
                    bullet.hp -= damage;
                    proj.alive = false;
                    if (proj instanceof Missile) proj.exploded = true;

                    if (bullet.hp <= 0) {
                        bullet._explode();
                        game.addScore(SCORE_CRUISE_DESTROY);
                    } else {
                        playBlast(game, proj.x, proj.y, 'cruiseSpark');
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
                recordHit(enemy, proj.x, proj.y);
                enemy.takeDamage(DAMAGE_PLAYER_MISSILE);
                // 着弾点から見て外向きへ吹き飛ばす。反動プロファイルを持たない
                // 据え付け物（砲台・基地）には何も起きない。
                applyRecoil(enemy, (enemy.x + enemy.width / 2) - proj.x);
                playBlast(game, proj.x, proj.y, 'missileHit');
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
                recordHit(enemy, proj.x, proj.y);
                if (!enemy.isBase) enemy.takeDamage(PLAYER_MG_DAMAGE);
                playBlast(game, proj.x, proj.y, 'mgHit');
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

        const damageMultiplier = proj.isRival ? 2 : 1;

        if (player && player.alive && !player.docked && player.invincibleTimer <= 0
            && pointInRect(proj.x, proj.y, player)) {
            recordHit(player, proj.x, proj.y);
            player.takeDamage(DAMAGE_ENEMY_MISSILE_PLAYER * damageMultiplier);
            const dx = (player.x + player.width / 2) - proj.x;
            applyKnockback(player, dx, MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX);
            playBlast(game, proj.x, proj.y, 'enemyMissileHit');
            proj.alive = false;
            proj.exploded = true;
            return;
        }

        if (carrier && carrier.alive && pointInRect(proj.x, proj.y, carrier)) {
            recordHit(carrier, proj.x, proj.y);
            carrier.takeDamage(DAMAGE_ENEMY_MISSILE_CARRIER * damageMultiplier);
            playBlast(game, proj.x, proj.y, 'enemyMissileHit');
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
