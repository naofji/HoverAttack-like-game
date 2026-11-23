import {
    ENEMY_BASE_WIDTH,
    ENEMY_BASE_HEIGHT,
    ENEMY_BASE_SCORE,
    ENEMY_BASE_SHIELDS,
    ENEMY_BASE_HP,
    BASE_LASER_RANGE,
    BASE_LASER_CHARGE_TIME,
    BASE_LASER_COOLDOWN,
    CRUISE_MISSILE_WARNING_TIME,
    CRUISE_MISSILE_MIN_DELAY,
    CRUISE_MISSILE_MAX_DELAY,
    ENEMY_BASE_TURRET_COOLDOWN,
    ENEMY_BASE_TURRET_BURST_COUNT,
    ENEMY_BASE_TURRET_BURST_DELAY,
    ENEMY_BASE_MISSILE_COOLDOWN,
    ENEMY_BASE_HOMING_COOLDOWN,
    CRUISE_MISSILE_ACTIVATION_RANGE,
    FINALE_SHAKE_INTENSITY, FINALE_SHAKE_DURATION,
    BASE_ORBIT_SHIELD_MISSION, BASE_ORBIT_SHIELD_PANELS, BASE_ORBIT_SHIELD_RADIUS,
    BASE_ORBIT_SHIELD_SPEED, BASE_ORBIT_SHIELD_GUARD_HALF,
    BASE_ORBIT_SHIELD_DEPLOY,
    BASE_TURRET_MISSION, BASE_MISSILE_MISSION, BASE_HOMING_MISSION, BASE_CRUISE_MISSION, BASE_EMERGENCY_MISSION,
} from '../utils/Constants.js';
import {
    panelAngles, guardBlocks, deployEase,
} from '../utils/orbitShield.js';
import { withinSight } from '../utils/Physics.js';
import { findCruisePath } from '../utils/cruisePath.js';
import { sightScaleFor } from '../world/StageEnvironment.js';
import { BaseLaser } from './BaseLaser.js';
import { EnemyBullet } from './EnemyBullet.js';
import { Missile } from './Missile.js';
import { EnemyHomingMissile } from './EnemyHomingMissile.js';
import { EnemyCruiseMissile } from './EnemyCruiseMissile.js';
import { audioManager } from '../audio/AudioManager.js';
import { createDestructionFinale } from './DestructionFinale.js';
import { playBlast } from './destruction.js';
import { BaseDraw } from './base/draw.js';

export class EnemyBase {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_BASE_WIDTH;
        this.height = ENEMY_BASE_HEIGHT;

        this.scoreValue = ENEMY_BASE_SCORE;
        this.shields = ENEMY_BASE_SHIELDS;
        this.hp = ENEMY_BASE_HP;
        this.alive = true;
        this.name = 'base';
        this.isBase = true; // Flag for win condition check

        // Bounding box for collision
        this.bounds = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };

        // Animation state
        this.coreAnimTimer = 0;

        // Laser Attack State
        this.attackState = 'idle'; // 'idle', 'charging', 'cooldown'
        this.chargeTimer = 0;
        this.cooldownTimer = 0;
        this.chargeParticles = [];

        // Additional Weapons State
        this.turretState = 'idle'; // 'idle', 'bursting', 'cooldown'
        this.turretCooldownTimer = Math.floor(Math.random() * ENEMY_BASE_TURRET_COOLDOWN);
        this.turretBurstCount = 0;
        this.turretBurstTimer = 0;

        this.missileTimer = ENEMY_BASE_MISSILE_COOLDOWN;
        this.homingTimer = ENEMY_BASE_HOMING_COOLDOWN;

        // Cruise Missile State
        this._resetCruiseMissileTimer();
        this.cruiseWarning = false;

        // Destruction Sequence State
        this.dying = false;
        this.dyingTimer = 0;

        // Emergency Defense Alert pulse (visual only, one-shot)
        this.emergencyPulseTimer = 0;
        this.emergencyPulseDuration = 45; // ~0.75s of expanding ring

        // 周回シールド（6面以降）。リングが全部割れるまでは存在しない
        this.orbitShieldActive = false;
        this.orbitPhase = 0;
        this.orbitDeployTimer = 0;
    }

    // ------------------------------------------
    // 周回シールド（6面以降。むき出しのコアだけを守る）
    // ------------------------------------------

    /** この基地に周回シールドがあるか（面で決まる）。 */
    _hasOrbitShield() {
        return (this.game.missionsCompleted || 0) >= BASE_ORBIT_SHIELD_MISSION;
    }

    /** 最後のリングが割れたときに呼ぶ。コアの中心から羽根がせり出し始める。 */
    startOrbitShield() {
        if (this.orbitShieldActive) return;
        this.orbitShieldActive = true;
        this.orbitDeployTimer = 0;
        this.orbitPhase = 0;
        // 展開そのものには専用の音を付けていない。展開中の被弾はすべて
        // 弾かれて shieldDeflect が鳴るので、撃っていれば音の手がかりは出る
    }

    /** 展開の進み具合 0..1（イージング後）。1 で出きった状態。 */
    _orbitDeploy() {
        return deployEase(this.orbitDeployTimer / BASE_ORBIT_SHIELD_DEPLOY);
    }

    /** 今の軌道半径。展開中は 0 から所定の半径へ伸びる。 */
    orbitRadius() {
        if (!this.orbitShieldActive) return 0;
        return BASE_ORBIT_SHIELD_RADIUS * this._orbitDeploy();
    }

    /** 全ての羽根の位相。描画と判定で同じものを使う。 */
    orbitAngles() {
        return panelAngles(this.orbitPhase, BASE_ORBIT_SHIELD_PANELS);
    }

    /**
     * 1 tick ぶん回す。半径と同じイージングで回転も立ち上げるので、
     * せり出しながら加速していくように見える。
     */
    _updateOrbitShield() {
        if (!this.orbitShieldActive) return;
        if (this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY) this.orbitDeployTimer++;
        this.orbitPhase += BASE_ORBIT_SHIELD_SPEED * this._orbitDeploy();
    }

    /**
     * その被弾点がガードされているか。
     * 展開中は角度に関係なく true（＝完全無敵）。MG の跳弾演出も同じ答えを使う。
     * @param {number} hitX 被弾点のX。省略時は判定しない
     */
    isOrbitGuarded(hitX) {
        if (!this.orbitShieldActive || hitX === undefined) return false;
        if (this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY) return true;
        const dx = hitX - (this.x + this.width / 2);
        return guardBlocks(this.orbitAngles(), dx, BASE_ORBIT_SHIELD_GUARD_HALF);
    }

    _resetCruiseMissileTimer() {
        const range = CRUISE_MISSILE_MAX_DELAY - CRUISE_MISSILE_MIN_DELAY;
        this.cruiseMissileTimer = CRUISE_MISSILE_MIN_DELAY + Math.floor(Math.random() * range);
    }

    update() {
        if (!this.alive) return;

        if (this.dying) {
            this._updateDyingSequence();
            return;
        }

        this.coreAnimTimer += 1;
        if (this.emergencyPulseTimer > 0) this.emergencyPulseTimer--;
        this._updateLaser();
        this._updateBaseTurret();
        this._updateBaseMissile();
        this._updateBaseHoming();
        this._updateCruiseMissile();
        this._updateOrbitShield();

        // Keep bounds in sync with position
        this.bounds.x = this.x;
        this.bounds.y = this.y;
    }

    /** Tick the cinematic destruction sequence. */
    _updateDyingSequence() {
        this.dyingTimer--;

        if (this.dyingTimer % 6 === 0) {
            const rx = this.x + Math.random() * this.width;
            const ry = this.y + Math.random() * this.height;
            const size = 20 + Math.random() * 30;
            playBlast(this.game, rx, ry, 'baseDying', size);
            audioManager.playExplosion(size > 35, rx);
            if (this.game.camera) this.game.camera.shake(8, 3);
        }

        if (this.dyingTimer <= 0) this._finishDestruction();
    }

    _updateLaser() {
        const target = this._findTarget(BASE_LASER_RANGE);

        if (this.attackState === 'idle') {
            if (target) {
                this.attackState = 'charging';
                this.chargeTimer = 0;
                audioManager.playLaserCharge();
            }
        } else if (this.attackState === 'charging') {
            this.chargeTimer++;

            // Spawn random intake particles
            if (this.chargeTimer % 2 === 0) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 60 + Math.random() * 40;
                this.chargeParticles.push({
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    life: 30
                });
            }

            // Update charge particles
            for (let i = this.chargeParticles.length - 1; i >= 0; i--) {
                const p = this.chargeParticles[i];
                p.x *= 0.9; // move towards center (0,0 relative to core)
                p.y *= 0.9;
                p.life--;
                if (p.life <= 0) this.chargeParticles.splice(i, 1);
            }

            if (this.chargeTimer >= BASE_LASER_CHARGE_TIME) {
                this._fireLaser(target);
                this.attackState = 'cooldown';
                this.cooldownTimer = 0;
                this.chargeParticles = [];
            }
        } else if (this.attackState === 'cooldown') {
            this.cooldownTimer++;
            if (this.cooldownTimer >= BASE_LASER_COOLDOWN) {
                this.attackState = 'idle';
            }
        }
    }

    _updateBaseTurret() {
        if (this.game.missionsCompleted < BASE_TURRET_MISSION) return;

        const target = this._findTarget(BASE_LASER_RANGE);

        if (this.turretState === 'idle') {
            if (this.turretCooldownTimer > 0) {
                this.turretCooldownTimer--;
            } else if (target) {
                this.turretState = 'bursting';
                this.turretBurstCount = ENEMY_BASE_TURRET_BURST_COUNT;
                this.turretBurstTimer = 0;
            }
        } else if (this.turretState === 'bursting') {
            if (this.turretBurstTimer <= 0) {
                this._fireTurretBullet(target);
                this.turretBurstCount--;
                this.turretBurstTimer = ENEMY_BASE_TURRET_BURST_DELAY;
                if (this.turretBurstCount <= 0) {
                    this.turretState = 'cooldown';
                    this.turretCooldownTimer = ENEMY_BASE_TURRET_COOLDOWN;
                }
            } else {
                this.turretBurstTimer--;
            }
        } else if (this.turretState === 'cooldown') {
            this.turretCooldownTimer--;
            if (this.turretCooldownTimer <= 0) this.turretState = 'idle';
        }
    }

    _fireTurretBullet(target) {
        if (!target) return;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);
        const inaccuracy = (Math.random() - 0.5) * 0.15;

        const bullet = new EnemyBullet(this.game, centerX, centerY, angle + inaccuracy);
        this.game.enemyBullets.push(bullet);
        // 発射音は EnemyBullet のコンストラクタが鳴らす。ここで足すと二重になる
    }

    _updateBaseMissile() {
        if (this.game.missionsCompleted < BASE_MISSILE_MISSION) return;

        this.missileTimer--;
        if (this.missileTimer <= 0) {
            const target = this._findTarget(BASE_LASER_RANGE);
            if (target) {
                this._fireBaseMissile(target);
                this.missileTimer = ENEMY_BASE_MISSILE_COOLDOWN;
            } else {
                this.missileTimer = 30; // Check again soon
            }
        }
    }

    _fireBaseMissile(target) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        const missile = new Missile(this.game, centerX, centerY, angle, false); // isPlayerOwned = false
        this.game.enemyBullets.push(missile);
        audioManager.playWeapon('enemyMissile', centerX, centerY);
    }

    _updateBaseHoming() {
        if (this.game.missionsCompleted < BASE_HOMING_MISSION) return;

        this.homingTimer--;
        if (this.homingTimer <= 0) {
            const target = this._findTarget(BASE_LASER_RANGE);
            if (target) {
                this._fireBaseHomingVolley(target);
                this.homingTimer = ENEMY_BASE_HOMING_COOLDOWN;
            } else {
                this.homingTimer = 30; // Check again soon
            }
        }
    }

    _fireBaseHomingVolley(target) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const baseAngle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        // Fire 4 homing missiles in a spread
        const spread = 0.6;
        for (let i = 0; i < 4; i++) {
            const offset = (i - 1.5) * spread;
            const missile = new EnemyHomingMissile(this.game, centerX, centerY, baseAngle + offset);
            this.game.enemyBullets.push(missile);
        }
        audioManager.playWeapon('homing', centerX, centerY);
    }

    _findTarget(maxRange = Infinity) {
        // Find closest between player and carrier
        const candidates = [];
        if (this.game.player && this.game.player.alive && !this.game.player.docked) candidates.push(this.game.player);
        if (this.game.carrier && this.game.carrier.alive) candidates.push(this.game.carrier);

        let bestTarget = null;
        let minDist = Infinity;

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        for (const c of candidates) {
            const dx = c.x + c.width / 2 - centerX;
            const dy = c.y + c.height / 2 - centerY;
            // タンクと同じく、索敵の内外は楕円で、順位付けはユークリッド距離で。
            // maxRange の既定は Infinity で、Infinity * 0.5 も Infinity のまま
            // なので withinSight は常に true を返す（既定の「無制限」は霧でも保たれる）。
            if (!withinSight(dx, dy, maxRange * sightScaleFor(this.game))) continue;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                bestTarget = c;
            }
        }
        return bestTarget;
    }

    _fireLaser(target) {
        if (!target) return;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        const laser = new BaseLaser(this.game, centerX, centerY, angle);
        this.game.enemyBullets.push(laser); // Put in enemyBullets so it gets updated and drawn
        audioManager.playLaserFire();
    }

    _updateCruiseMissile() {
        if (this.game.missionsCompleted >= BASE_CRUISE_MISSION) {
            const target = this._findCruiseTarget();
            if (!target) return;

            // Only check activation range BEFORE the warning starts.
            // Once the warning is active, the missile is committed to launching.
            if (!this.cruiseWarning) {
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > CRUISE_MISSILE_ACTIVATION_RANGE * CRUISE_MISSILE_ACTIVATION_RANGE) {
                    return;
                }
            }

            this.cruiseMissileTimer--;

            if (this.cruiseMissileTimer <= CRUISE_MISSILE_WARNING_TIME) {
                // When warning starts
                if (!this.cruiseWarning) {
                    this.cruiseWarning = true;
                }

                // If we don't have a path yet, try to find one, but throttle the attempts to avoid lag
                if (!this.preLaunchPath) {
                    // Only try every 30 frames (twice a second) to avoid freezing the game
                    if (this.cruiseMissileTimer % 30 === 0) {
                        const target = this._findCruiseTarget();
                        if (target) {
                            this.preLaunchPath = this._findPathToTarget(target);
                        }
                    }
                }
            }

            if (this.cruiseMissileTimer <= 0) {
                this._fireCruiseMissile();
                this._resetCruiseMissileTimer();
                this.cruiseWarning = false;
                this.preLaunchPath = null;
            }
        }
    }

    _fireCruiseMissile() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // Always launch diagonally up-left to simulate a natural silo ejection
        let angle = -Math.PI * 0.6;
        let path = this.preLaunchPath;

        // Try to find an A* path to the target for the initial launch direction if not already found
        if (!path) {
            const target = this._findCruiseTarget();
            if (target) {
                path = this._findPathToTarget(target);
            }
        }

        console.log("BOSS BASE: FIRING CRUISE MISSILE!");
        const missile = new EnemyCruiseMissile(this.game, centerX, centerY, angle, path);
        this.game.enemyBullets.push(missile);

        audioManager.playWeapon('cruise', centerX, centerY);
    }

    _findCruiseTarget() {
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) return carrier;
        const player = this.game.player;
        if (player && player.alive && !player.docked) return player;
        return null;
    }

    /** 巡航ミサイルの経路。探し方は utils/cruisePath.js（基地からは出発点の座標だけを渡す） */
    _findPathToTarget(target) {
        if (!target) return null;
        return findCruisePath(
            this.game.map,
            this.x + this.width / 2, this.y + this.height / 2,
            target.x + target.width / 2, target.y + target.height / 2
        );
    }

    /**
     * @param {number} amount
     * @param {number} [hitX] 被弾点のX。周回シールド（6面以降）の左右判定に使う。
     *   省略した呼び出しは今までどおり素通しするので、他の敵と共通の
     *   takeDamage(amount) を呼んでいる箇所の挙動は変わらない
     */
    takeDamage(amount, hitX) {
        if (!this.alive) return;

        // むき出しのコアへの一撃だけが周回シールドの対象。リングが残っている間は
        // 今までどおり削れる（全部にタイミングを要求すると難しくなりすぎる）
        if (this.shields <= 0 && this.isOrbitGuarded(hitX)) {
            this._deflect(hitX);
            return; // 緊急防衛アラートも立てない。弾いた攻撃は「当たっていない」扱い
        }

        // BASE_EMERGENCY_MISSION から: being hit calls in emergency reinforcements,
        // but not while the destruction sequence is already underway (dying window).
        if (this.game.missionsCompleted >= BASE_EMERGENCY_MISSION && !this.dying) {
            const alreadyAlerted = !!this.game.baseEmergencyAlert;
            this.game.triggerBaseEmergencyAlert(this);
            // Only spawn the one-shot visual pulse the moment the alert first goes live,
            // not on every subsequent hit while it's already latched.
            if (!alreadyAlerted) this._spawnEmergencyPulse();
        }

        // Damage the shield first
        if (this.shields > 0) {
            this.shields--;
            this.game.score += 50; // Small score for breaking a shield
            this._spawnSparks();
            // 最後のリングが割れてコアが露出した瞬間に周回シールドがせり出す
            if (this.shields <= 0 && this._hasOrbitShield()) this.startOrbitShield();
        } else {
            // If shields are gone, damage the core
            this.hp--;
            if (this.hp <= 0) {
                this._die();
            } else {
                this._spawnSparks();
            }
        }
    }

    _spawnSparks() {
        this.game.spawnSparks(this.x + this.width / 2, this.y + this.height / 2);
    }

    /**
     * 周回シールドが弾いたときの手応え。
     * 無敵なのに何の反応も無いと弾を飲み込まれたように見えるので、
     * 弾かれた場所に火花と金属音を出す。ダメージもスコアも動かさない。
     */
    _deflect(hitX) {
        const cy = this.y + this.height / 2;
        const x = hitX === undefined ? this.x + this.width / 2 : hitX;
        if (this.game.spawnSparks) this.game.spawnSparks(x, cy);
        audioManager.playWeapon('shieldDeflect', x, cy);
    }

    /** One-shot expanding red "rescue pulse" ring shown when the emergency alert first fires. */
    _spawnEmergencyPulse() {
        this.emergencyPulseTimer = this.emergencyPulseDuration;
    }

    _die() {
        if (this.dying) return;
        this.dying = true;
        this.dyingTimer = 90; // 1.5 seconds of explosions
        this.game.score += this.scoreValue;
        audioManager.playBaseDestroyed();
    }

    _finishDestruction() {
        this.alive = false;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Final massive explosion
        playBlast(this.game, cx, cy, 'baseFinal');

        // フィナーレ（閃光→集中線→衝撃波リング）。爆発より後に push することで
        // パーティクルの描画順で手前に出る。
        this.game.particles.push(...createDestructionFinale(cx, cy));
        if (this.game.camera) {
            this.game.camera.shake(FINALE_SHAKE_INTENSITY, FINALE_SHAKE_DURATION);
        }

        // Emergency defense alert stays active even after base destruction so remaining
        // defenders continue their high-alert attack until stage clear / mission transition.
    }

}

// 描画は base/draw.js（自機の player/draw.js と同じ作り。名前の重なりは tests/base-mixins.test.js が縛る）
Object.assign(EnemyBase.prototype, BaseDraw);
