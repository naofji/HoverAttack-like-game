// ============================================
// EnemyDrone - Flying aerial enemy unit (Quadcopter)
// ============================================

import {
    ENEMY_DRONE_HP, ENEMY_DRONE_SPEED, ENEMY_DRONE_SPEED_Y_MAX,
    ENEMY_DRONE_SIGHT_RANGE, ENEMY_DRONE_FIRE_INTERVAL, ENEMY_DRONE_SCORE,
    ENEMY_DRONE_BURST_COUNT, ENEMY_DRONE_BURST_INTERVAL,
    ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT,
    ENEMY_DRONE_HOVER_DIST_Y, ENEMY_DRONE_HOVER_DIST_X,
    ENEMY_DRONE_GRENADE_CHANCE, EMERGENCY_DRONE_GRENADE_CHANCE,
    ENEMY_DRONE_KAMIKAZE_CHANCE, ENEMY_DRONE_KAMIKAZE_TRIGGER_RANGE,
    ENEMY_DRONE_KAMIKAZE_SPEED, ENEMY_DRONE_KAMIKAZE_DAMAGE_PLAYER,
    ENEMY_DRONE_KAMIKAZE_DAMAGE_CARRIER,
    EMERGENCY_DEFENSE_BASE_RADIUS, EMERGENCY_DEFENSE_SPEED_MULT,
    EMERGENCY_DEFENSE_SIGHT_RANGE,
    ENEMY_RECOIL_PROFILES,
    DRONE_MOVE_COOLDOWN, DRONE_MOVE_MIN_DISTANCE
} from '../utils/Constants.js';
import { collidesWithMap, hasLineOfSight, withinSight } from '../utils/Physics.js';
import { sightScaleFor } from '../world/StageEnvironment.js';
import { EnemyBullet } from './EnemyBullet.js';
import { Grenade } from './Grenade.js';
import { tickRecoil } from '../utils/Recoil.js';
import { audioManager } from '../audio/AudioManager.js';
import { playDestruction } from './destruction.js';
import { applyDamage } from '../utils/damage.js';

export class EnemyDrone {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_DRONE_WIDTH;
        this.height = ENEMY_DRONE_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.moveSoundTimer = 0;   // 移動音の連続を防ぐ残り時間
        this.recoilProfile = ENEMY_RECOIL_PROFILES.drone;
        this.recoilTimer = 0;
        this.hp = ENEMY_DRONE_HP;
        this.maxHp = this.hp;
        this.alive = true;

        this.fireTimer = Math.floor(Math.random() * ENEMY_DRONE_FIRE_INTERVAL);

        // Erratic movement states: 'patrol', 'dash', 'hover', 'attack'
        this.state = 'patrol';
        this.patrolDir = Math.random() < 0.5 ? 1 : -1;

        this.stateTimer = 0;
        this.targetAngle = 0;
        this.burstShotsRemaining = 0;
        this.burstTimer = 0;
        this.kamikazeTarget = null;

        // Visuals
        this.propellerAngle = 0;
        this.tiltAngle = 0; // Tilts when dashing
        this.blinkTimer = 0;
        this.dashTargetX = 0;
        this.dashTargetY = 0;

        // Emergency base-defense (activated by EnemyBase when it takes damage).
        // Drones have no fixed "home", so defence is modelled as a persistent
        // per-unit anchor point on a ring around the base, with a leash back to it.
        this.emergencyDefense = false;
        this.emergencyTargetBase = null;
        this.emergencyAnchorX = null;
        this.emergencyAnchorY = null;
        this.dashingToAnchor = false; // true only during the rush-to-anchor dash
    }

    /**
     * Toggle emergency base-defense mode.
     * On activate: pick a persistent, per-unit anchor on a ring around the base
     * and immediately rush there. On deactivate: clear state; normal patrol/dash/
     * hover/kamikaze behaviour resumes untouched (drones never had a fixed home).
     */
    setEmergencyDefense(active, targetBase = null) {
        if (active && targetBase) {
            this.emergencyDefense = true;
            this.emergencyTargetBase = targetBase;

            const cx = targetBase.x + targetBase.width / 2;
            const cy = targetBase.y + targetBase.height / 2;
            // Own random angle, computed once here (not per-frame), so multiple
            // defenders spread around the base instead of stacking on one point.
            const angle = Math.random() * Math.PI * 2;
            this.emergencyAnchorX = cx + Math.cos(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;
            this.emergencyAnchorY = cy + Math.sin(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;

            this._startDashToAnchor(); // rush toward the base on the very next frame
        } else {
            this.emergencyDefense = false;
            this.emergencyTargetBase = null;
            this.emergencyAnchorX = null;
            this.emergencyAnchorY = null;
            this.dashingToAnchor = false;
        }
    }

    /** Dash straight to the defence anchor (boosted speed via dashingToAnchor). */
    _startDashToAnchor() {
        this.state = 'dash';
        this.stateTimer = 30 + Math.random() * 30;
        this.dashTargetX = this.emergencyAnchorX - this.width / 2;
        this.dashTargetY = this.emergencyAnchorY - this.height / 2;
        this.dashingToAnchor = true;
        this._playMoveSound();
    }

    update() {
        if (!this.alive) return;

        this.blinkTimer++;
        if (this.moveSoundTimer > 0) this.moveSoundTimer--;

        // Spin propellers fast
        this.propellerAngle += (this.state === 'dash' || this.state === 'patrol') ? 1.0 : 0.4;

        // 反動中は状態機械ごと飛ばす。ドローンは各状態が vx/vy を直接
        // 決めるので、呼んでしまうと反動が1tickで消える。
        if (!tickRecoil(this)) {
            // State Machine
            if (this.state === 'kamikaze') {
                this._updateKamikazeState();
            } else if (this.state === 'attack') {
                this._updateAttackState();
            } else if (this.state === 'hover') {
                this._updateHoverState();
            } else if (this.state === 'dash') {
                this._updateDashState();
            } else {
                this._updatePatrolState();
            }
        }

        // --- Move & Collide ---
        this._moveAndCollide();
    }

    _updatePatrolState() {
        this.vx = this.patrolDir * ENEMY_DRONE_SPEED * 0.3; // Slower patrol
        this.vy = Math.sin(Date.now() / 500) * 0.3; // Bobbing
        this.tiltAngle = this.patrolDir * 0.1;

        const target = this._findTarget();
        if (target) {
            this._startDash(target);
            return;
        }

        // While defending, don't drift away: leash back to the anchor near the base.
        if (this.emergencyDefense && this.emergencyAnchorX !== null) {
            const ax = this.emergencyAnchorX - (this.x + this.width / 2);
            const ay = this.emergencyAnchorY - (this.y + this.height / 2);
            if (Math.hypot(ax, ay) > EMERGENCY_DEFENSE_BASE_RADIUS) {
                this._startDashToAnchor();
            }
        }
    }

    _updateDashState() {
        this.stateTimer--;

        // The rush-to-base leg specifically gets an urgency speed boost.
        const speedMult = this.dashingToAnchor ? EMERGENCY_DEFENSE_SPEED_MULT : 1;

        // Move aggressively towards dash target
        const dx = this.dashTargetX - this.x;
        const dy = this.dashTargetY - this.y;

        if (Math.abs(dx) > 10) {
            this.vx = Math.sign(dx) * ENEMY_DRONE_SPEED * speedMult;
            this.tiltAngle = Math.sign(dx) * 0.3; // Tilt in direction of movement
            this.patrolDir = dx >= 0 ? 1 : -1;
        } else {
            this.vx *= 0.8; // Dampen
        }

        if (Math.abs(dy) > 10) {
            this.vy = Math.sign(dy) * ENEMY_DRONE_SPEED_Y_MAX * speedMult;
        } else {
            this.vy *= 0.8;
        }

        if (this.stateTimer <= 0 || (Math.abs(dx) < 20 && Math.abs(dy) < 20)) {
            this._startHover();
        }
    }

    _updateHoverState() {
        this.stateTimer--;

        // Stabilize
        this.vx *= 0.8;
        this.vy = Math.sin(Date.now() / 200) * 0.5; // Fast jitter
        this.tiltAngle *= 0.8; // Return to level

        // Check weapon cooldown
        this.fireTimer--;

        if (this.stateTimer <= 0) {
            const target = this._findTarget();
            if (target && this.fireTimer <= 0) {
                const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
                const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < ENEMY_DRONE_KAMIKAZE_TRIGGER_RANGE && Math.random() < ENEMY_DRONE_KAMIKAZE_CHANCE) {
                    this._startKamikaze(target);
                } else {
                    this._prepareAttack(target);
                }
            } else if (target) {
                // Dash to a new position around the target
                this._startDash(target);
            } else {
                this.state = 'patrol';
            }
        }
    }

    _updateAttackState() {
        this.vx *= 0.8;
        this.vy *= 0.8;
        this.tiltAngle = 0; // Perfectly level to shoot

        if (this.stateTimer > 0) {
            this.stateTimer--;
            return;
        }

        // Aiming finished - fire a burst of shots
        if (this.burstShotsRemaining > 0) {
            if (this.burstTimer <= 0) {
                this._executeAttack();
                this.burstShotsRemaining--;
                this.burstTimer = ENEMY_DRONE_BURST_INTERVAL;
            } else {
                this.burstTimer--;
            }
        } else {
            this._startDash(this._findTarget()); // Immediately dash away
            this.fireTimer = ENEMY_DRONE_FIRE_INTERVAL;
        }
    }

    _findTarget() {
        const player = this.game.player;
        const target = (player && player.alive && !player.docked) ? player : this.game.carrier;

        if (target && target.alive) {
            const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
            const dy = (target.y + target.height / 2) - (this.y + this.height / 2);

            // 通常の索敵は楕円（横だけ画面幅に比例する）。総攻撃中の緊急索敵
            // 250px は画面比と無関係な「至近距離の反応」なので、楕円に混ぜず
            // 真円のまま OR で足す。Math.max で楕円の横半径ごと広げてしまうと、
            // 16:9 では縦が 250 * SIGHT_ASPECT = 187 に縮んでしまい、
            // 意図しないバランス変更になる。
            // 4:3 では楕円が真円に退化するので、この OR は元の
            // Math.max(sightRange, 250) と完全に同じ結果になる。
            //
            // 現状、この OR は実質的に効いていない。索敵の縦半径が一番小さい
            // standard/tank でも sightRange = CANVAS_WIDTH*0.4 ≈ 546.4、
            // その縦半径は 546.4 * SIGHT_ASPECT ≈ 409.6px あり、緊急索敵の
            // 250px は実在するどの敵の楕円にも収まってしまう（250/409.6 ≈ 0.61）。
            // それでも残してあるのは、将来どこかの索敵係数を下げて楕円の縦半径が
            // 250px を割り込んだときに、この OR が保険として即座に効くようにするため。
            // 霧では索敵半径が縮む（sightScaleFor、陸上/env無しは1倍）。
            // 緊急防衛用の EMERGENCY_DEFENSE_SIGHT_RANGE は保険の即応距離なので対象外。
            const inSight = withinSight(dx, dy, ENEMY_DRONE_SIGHT_RANGE * sightScaleFor(this.game))
                || (this.emergencyDefense
                    && dx * dx + dy * dy < EMERGENCY_DEFENSE_SIGHT_RANGE ** 2);
            if (inSight && this._hasLineOfSight(target)) {
                return target;
            }
        }
        return null;
    }

    _startDash(target) {
        this.dashingToAnchor = false; // any real-target dash is a normal (unboosted) engage
        if (!target) {
            this.state = 'patrol';
            return;
        }
        this.state = 'dash';
        this.stateTimer = 30 + Math.random() * 30; // Dash for 0.5s - 1s

        // Pick a random spot near the optimal hover distance
        const dx = (target.x + target.width / 2) - (this.x + this.width / 2);

        const desiredX = target.x + target.width / 2 - Math.sign(dx) * ENEMY_DRONE_HOVER_DIST_X - this.width / 2 + (Math.random() - 0.5) * 100;
        const desiredY = target.y + target.height / 2 - ENEMY_DRONE_HOVER_DIST_Y - this.height / 2 + (Math.random() - 0.5) * 50;

        this.dashTargetX = desiredX;
        this.dashTargetY = desiredY;
        this._playMoveSound();
    }

    /**
     * 動き出しの「ポーーン」。ホバリング中は鳴らさないので、呼ぶのは
     * 突進を始める瞬間だけ。
     *
     * さらに、大きく動くときに限る。少し位置を直す程度の突進でも鳴ると
     * 耳につくため。行き先が決まってから呼ぶこと。
     * 立て続けに状態が切り替わっても音が重ならないよう間隔も空ける。
     *
     * @param {number} [dx] 移動量。省略時は dashTarget までの距離を使う
     * @param {number} [dy]
     */
    _playMoveSound(dx, dy) {
        if (this.moveSoundTimer > 0) return;
        const mx = (dx !== undefined) ? dx : this.dashTargetX - this.x;
        const my = (dy !== undefined) ? dy : this.dashTargetY - this.y;
        if (Math.hypot(mx, my) < DRONE_MOVE_MIN_DISTANCE) return;

        this.moveSoundTimer = DRONE_MOVE_COOLDOWN;
        audioManager.playDroneMove(this.x + this.width / 2, this.y + this.height / 2);
    }

    _startHover() {
        this.state = 'hover';
        this.stateTimer = 20 + Math.random() * 40; // Hover for 0.3s - 1s
    }

    _prepareAttack(target) {
        this.state = 'attack';
        this.stateTimer = 25; // Stop for ~0.4s to aim
        this.burstShotsRemaining = ENEMY_DRONE_BURST_COUNT;
        this.burstTimer = 0;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;

        let inaccuracy = (Math.random() - 0.5) * 0.15;
        this.targetAngle = Math.atan2(ty - cy, tx - cx) + inaccuracy;
        this.patrolDir = (tx - cx) >= 0 ? 1 : -1; // Face target
    }

    _executeAttack() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // 総攻撃中の率は今のところ通常時と同じ。上空から壁を開ける役をやらせて
        // みたが、面で地形が消えるので足場まで無くなった（定数側のコメント参照）。
        // 分岐だけ残してあるので、調整するなら定数を動かす
        const grenadeChance = this.emergencyDefense
            ? EMERGENCY_DRONE_GRENADE_CHANCE
            : ENEMY_DRONE_GRENADE_CHANCE;
        if (Math.random() < grenadeChance) {
            // Drop grenade
            const grenade = new Grenade(this.game, cx, cy, Math.PI / 2);
            audioManager.playWeapon('grenade', cx, cy);
            grenade.isPlayerOwned = false;
            this.game.projectiles.push(grenade);
        } else {
            // Shoot bullet - slight per-shot spread within the burst
            const spread = (Math.random() - 0.5) * 0.1;
            const bullet = new EnemyBullet(this.game, cx, cy, this.targetAngle + spread);
            this.game.enemyBullets.push(bullet);
        }
    }

    _startKamikaze(target) {
        this.state = 'kamikaze';
        this.kamikazeTarget = target;
        this.fireTimer = ENEMY_DRONE_FIRE_INTERVAL;
        if (target) {
            this._playMoveSound(
                target.x + target.width / 2 - (this.x + this.width / 2),
                target.y + target.height / 2 - (this.y + this.height / 2),
            );
        }
    }

    _updateKamikazeState() {
        const target = this.kamikazeTarget;

        if (!target || !target.alive) {
            this.state = 'patrol';
            return;
        }

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Charge straight at the target
        const angle = Math.atan2(dy, dx);
        this.vx = Math.cos(angle) * ENEMY_DRONE_KAMIKAZE_SPEED;
        this.vy = Math.sin(angle) * ENEMY_DRONE_KAMIKAZE_SPEED;
        this.tiltAngle = angle * 0.3;
        this.patrolDir = dx >= 0 ? 1 : -1;

        const hitRadius = (this.width + target.width) / 4 + 4;
        if (dist < hitRadius) {
            this._executeKamikaze(target);
        }
    }

    _executeKamikaze(target) {
        if (!this.alive) return;

        if (target === this.game.player) {
            if (target.invincibleTimer <= 0) {
                target.takeDamage(ENEMY_DRONE_KAMIKAZE_DAMAGE_PLAYER);
            }
        } else if (target === this.game.carrier) {
            target.takeDamage(ENEMY_DRONE_KAMIKAZE_DAMAGE_CARRIER);
        }

        this.die();
    }

    _moveAndCollide() {
        const map = this.game.map;

        // Horizonal
        this.x += this.vx;
        if (this._collidesWithMap()) {
            this.x -= this.vx;
            this.vx = 0;
            if (this.state === 'kamikaze') {
                this.die(); // Crash into terrain
                return;
            } else if (this.state === 'dash') {
                this._startHover(); // Stop dashing if hit wall
            } else if (this.state === 'patrol') {
                this.patrolDir *= -1;
            }
        }

        // Vertical
        this.y += this.vy;
        if (this._collidesWithMap()) {
            this.y -= this.vy;
            this.vy = 0;
            if (this.state === 'kamikaze') {
                this.die(); // Crash into terrain
                return;
            } else if (this.state === 'dash') {
                this._startHover();
            }
        }
    }

    _collidesWithMap() {
        const points = [
            { x: this.x + 2, y: this.y + 2 },
            { x: this.x + this.width - 2, y: this.y + 2 },
            { x: this.x + 2, y: this.y + this.height - 2 },
            { x: this.x + this.width - 2, y: this.y + this.height - 2 },
        ];
        return collidesWithMap(this, this.game.map, points);
    }

    _hasLineOfSight(target) {
        return hasLineOfSight(
            this.x + this.width / 2, this.y + this.height / 2,
            target.x + target.width / 2, target.y + target.height / 2,
            this.game.map
        );
    }

    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'drone');
        this.game.addScore(ENEMY_DRONE_SCORE);
    }

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);

        ctx.save();
        ctx.translate(drawX + this.width / 2, drawY + this.height / 2);

        ctx.rotate(this.tiltAngle);

        if (this.patrolDir < 0) {
            ctx.scale(-1, 1);
        }

        // --- Quadcopter Side-View ---

        // 1. Central Core
        ctx.fillStyle = '#445566'; // Dark blue-gray core
        ctx.fillRect(-6, -4, 12, 8);
        ctx.strokeStyle = '#223344';
        ctx.lineWidth = 1;
        ctx.strokeRect(-6, -4, 12, 8);

        // 2. Front and Back Arms (extending outwards)
        ctx.fillStyle = '#8899AA';
        // Front arm
        ctx.fillRect(6, -2, 8, 3);
        // Back arm
        ctx.fillRect(-14, -2, 8, 3);

        // 3. Motor Pods at end of arms
        ctx.fillStyle = '#334455';
        ctx.fillRect(12, -4, 4, 6); // Front pod
        ctx.fillRect(-16, -4, 4, 6); // Back pod

        // 4. Attack Indicator / Eye
        // Blinks red when attacking, yellow otherwise
        const isAlerted = (this.state === 'attack' || this.state === 'kamikaze');
        ctx.fillStyle = (isAlerted && this.blinkTimer % 8 < 4) ? '#FF2222' : '#FFCC00';
        ctx.beginPath();
        // Positioned on the lower front side of the core
        ctx.arc(4, 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 5. Underside Gun/Payload bay
        ctx.fillStyle = '#222222';
        ctx.fillRect(-2, 4, 6, 3);
        ctx.fillStyle = '#555555';
        ctx.fillRect(4, 5, 3, 1); // Barrel pointing forward

        // 6. Spinning Propellers (Above pods)
        ctx.save();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)'; // Semi-transparent bright blue/white

        // Front prop
        // Simulate flat spinning disk from side
        ctx.translate(14, -5);
        ctx.scale(Math.cos(this.propellerAngle), 1);
        ctx.fillRect(-8, 0, 16, 1);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
        // Back prop (spins slightly offset or opposite for visual variety)
        ctx.translate(-14, -5);
        ctx.scale(Math.cos(this.propellerAngle + Math.PI / 2), 1);
        ctx.fillRect(-8, 0, 16, 1);
        ctx.restore();

        ctx.restore();
    }
}
