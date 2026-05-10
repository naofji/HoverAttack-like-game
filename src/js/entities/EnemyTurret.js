// ============================================
// EnemyTurret - Stationary gun turret mounted on floor or ceiling
// ============================================

import {
    ENEMY_TURRET_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_TURRET_SIGHT_RANGE, ENEMY_TURRET_SCORE,
    ENEMY_TURRET_BURST_COUNT, ENEMY_TURRET_BURST_DELAY, ENEMY_TURRET_COOLDOWN,
    TILE_SIZE
} from '../utils/Constants.js';
import { hasLineOfSight } from '../utils/Physics.js';
import { EnemyBullet } from './EnemyBullet.js';

export class EnemyTurret {
    constructor(game, x, y, isCeilingMounted = false) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_TURRET_WIDTH;
        this.height = ENEMY_TURRET_HEIGHT;
        this.hp = ENEMY_TURRET_HP;
        this.maxHp = this.hp;
        this.alive = true;
        this.isCeilingMounted = isCeilingMounted;

        // Visual aiming angle
        this.targetAngle = isCeilingMounted ? Math.PI / 2 : -Math.PI / 2;
        this.currentAngle = this.targetAngle;

        // AI State
        this.state = 'idle'; // 'idle', 'bursting', 'cooldown'
        this.cooldownTimer = Math.floor(Math.random() * ENEMY_TURRET_COOLDOWN); // Randomize initial offset

        // Burst scaling: Mission 5 (index 4) and above get 8 rounds
        this.maxBurstCount = (this.game.missionsCompleted >= 4) ? 8 : ENEMY_TURRET_BURST_COUNT;

        this.burstCount = 0;
        this.burstTimer = 0;

        // Visual recoil
        this.recoil = 0;
    }

    update() {
        if (!this.alive) return;

        if (this.recoil > 0) this.recoil *= 0.8;

        const target = this._findTarget();
        this._updateAiming(target);
        this._updateStateMachine(target);
    }

    /** Rotate barrel to track (or return to rest when no target). */
    _updateAiming(target) {
        if (target) {
            const cx = this.x + this.width  / 2;
            const cy = this.y + this.height / 2;
            this.targetAngle  = Math.atan2(
                target.y + target.height / 2 - cy,
                target.x + target.width  / 2 - cx
            );
            this.currentAngle = this.targetAngle; // Instant aim
        } else {
            const rest = this.isCeilingMounted ? Math.PI / 2 : -Math.PI / 2;
            this.currentAngle += (rest - this.currentAngle) * 0.05;
        }
    }

    /** Advance the idle → bursting → cooldown state machine. */
    _updateStateMachine(target) {
        if (this.state === 'idle') {
            if (this.cooldownTimer > 0) {
                this.cooldownTimer--;
            } else if (target) {
                this.state     = 'bursting';
                this.burstCount = this.maxBurstCount;
                this.burstTimer = 0;
            }
        } else if (this.state === 'bursting') {
            if (this.burstTimer <= 0) {
                this._executeAttack();
                this.burstCount--;
                this.burstTimer = ENEMY_TURRET_BURST_DELAY;
                if (this.burstCount <= 0) {
                    this.state         = 'cooldown';
                    this.cooldownTimer = ENEMY_TURRET_COOLDOWN;
                }
            } else {
                this.burstTimer--;
            }
        } else if (this.state === 'cooldown') {
            this.cooldownTimer--;
            if (this.cooldownTimer <= 0) this.state = 'idle';
        }
    }

    _findTarget() {
        const player = this.game.player;
        const target = (player && player.alive && !player.docked) ? player : this.game.carrier;

        if (target && target.alive) {
            const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
            const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ENEMY_TURRET_SIGHT_RANGE && this._hasLineOfSight(target)) {
                return target;
            }
        }
        return null;
    }

    _hasLineOfSight(target) {
        return hasLineOfSight(
            this.x + this.width / 2, this.y + this.height / 2,
            target.x + target.width / 2, target.y + target.height / 2,
            this.game.map
        );
    }

    _executeAttack() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Muzzle position offset by barrel length and recoil
        const barrelLength = 12 - this.recoil;
        const muzzleX = cx + Math.cos(this.currentAngle) * barrelLength;
        const muzzleY = cy + Math.sin(this.currentAngle) * barrelLength;

        // Inaccuracy
        const inaccuracy = (Math.random() - 0.5) * 0.1;
        const finalAngle = this.currentAngle + inaccuracy;

        const bullet = new EnemyBullet(this.game, muzzleX, muzzleY, finalAngle);
        this.game.enemyBullets.push(bullet);

        this.recoil = 4; // Visual recoil kickback
    }

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
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 30);
        this.game.addScore(ENEMY_TURRET_SCORE);
    }

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        const cx = drawX + this.width / 2;
        const cy = drawY + this.height / 2;

        ctx.save();
        ctx.translate(cx, cy);

        // --- Draw Base ---
        ctx.fillStyle = '#555555';
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 2;

        if (this.isCeilingMounted) {
            // Mounted to ceiling (top edge)
            ctx.fillRect(-10, -12, 20, 8);
            ctx.strokeRect(-10, -12, 20, 8);
            // Arm connecting base to pivot
            ctx.fillRect(-4, -4, 8, 4);
        } else {
            // Mounted to floor (bottom edge)
            ctx.fillRect(-10, 4, 20, 8);
            ctx.strokeRect(-10, 4, 20, 8);
            // Arm connecting base to pivot
            ctx.fillRect(-4, 0, 8, 4);
        }

        // --- Draw Rotating Turret Head ---
        ctx.rotate(this.currentAngle);

        // Barrel
        ctx.fillStyle = '#888888';
        const barrelLength = 14 - this.recoil;
        ctx.fillRect(4, -2, barrelLength, 4);
        ctx.strokeRect(4, -2, barrelLength, 4);

        // Main pivot body (Circle)
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#667788';
        ctx.fill();
        ctx.stroke();

        // Warning light
        ctx.fillStyle = (this.state === 'bursting') ? '#FF2222' : '#FFCC00';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
