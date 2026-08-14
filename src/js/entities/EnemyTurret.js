// ============================================
// EnemyTurret - Stationary gun turret mounted on floor or ceiling
// ============================================

import {
    ENEMY_TURRET_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_TURRET_SIGHT_RANGE, ENEMY_TURRET_SCORE,
    ENEMY_TURRET_BURST_COUNT, ENEMY_TURRET_BURST_DELAY, ENEMY_TURRET_COOLDOWN,
    REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_COOLDOWN, REFLECT_BEAM_CANNON_SCORE,
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES,
    COLOR_BEAM_CANNON_BASE, COLOR_BEAM_CANNON_BARREL, COLOR_BEAM_CANNON_PIVOT,
    COLOR_REFLECT_BEAM_CORE, COLOR_REFLECT_BEAM_EDGE,
} from '../utils/Constants.js';
import { hasLineOfSight } from '../utils/Physics.js';
import { EnemyBullet } from './EnemyBullet.js';
import { ReflectBeam } from './ReflectBeam.js';
import { turretBaseParts, turretHeadParts } from './debris/turretParts.js';
import { playDestruction } from './destruction.js';
import { applyDamage } from '../utils/damage.js';

// 型ごとの違いは**この表の1行**に出る。新しいクラスを作ると、照準・視線判定・
// 被弾・破片・スコアの5つを写すことになる。EnemyAttacker が4型を1クラス＋
// 型別 config で持っているのと同じ形にした。
//
// 色は描画専用のパラメータなので、Constants ではなくここから引く（EnemyAttacker の
// LEG_STYLES と同じ扱い）。値そのものは Constants にある。
const TURRET_TYPES = {
    gun: {
        hp: ENEMY_TURRET_HP,
        score: ENEMY_TURRET_SCORE,
        cooldown: ENEMY_TURRET_COOLDOWN,
        burst: ENEMY_TURRET_BURST_COUNT,
        colors: { base: '#555555', barrel: '#888888', pivot: '#667788' },
    },
    beam: {
        hp: REFLECT_BEAM_CANNON_HP,
        score: REFLECT_BEAM_CANNON_SCORE,
        cooldown: REFLECT_BEAM_CANNON_COOLDOWN,
        burst: 1,  // 単発。連射すると帯が重なって逃げ場が無くなる
        colors: {
            base: COLOR_BEAM_CANNON_BASE,
            barrel: COLOR_BEAM_CANNON_BARREL,
            pivot: COLOR_BEAM_CANNON_PIVOT,
        },
    },
};

export class EnemyTurret {
    constructor(game, x, y, isCeilingMounted = false, type = 'gun') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_TURRET_WIDTH;
        this.height = ENEMY_TURRET_HEIGHT;
        this.type = TURRET_TYPES[type] ? type : 'gun';
        this.spec = TURRET_TYPES[this.type];
        this.hp = this.spec.hp;
        this.maxHp = this.hp;
        this.alive = true;
        this.isCeilingMounted = isCeilingMounted;
        // 発射時の砲口の放射光。残りフレーム数。**予告ではない**（撃つ前は 0）
        this.muzzleFlash = 0;

        // Visual aiming angle
        this.targetAngle = isCeilingMounted ? Math.PI / 2 : -Math.PI / 2;
        this.currentAngle = this.targetAngle;

        // AI State
        this.state = 'idle'; // 'idle', 'bursting', 'cooldown'
        this.cooldownTimer = Math.floor(Math.random() * this.spec.cooldown); // Randomize initial offset

        // Burst scaling: Mission 5 (index 4) and above get 8 rounds
        // （既存のタレットだけ。ビームは常に単発 = spec.burst）
        this.maxBurstCount = (this.type === 'gun' && this.game.missionsCompleted >= 4)
            ? 8
            : this.spec.burst;

        this.burstCount = 0;
        this.burstTimer = 0;

        // Visual recoil
        this.recoil = 0;
    }

    update() {
        if (!this.alive) return;

        if (this.muzzleFlash > 0) this.muzzleFlash--;
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
                    this.cooldownTimer = this.spec.cooldown;
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

        if (this.type === 'beam') {
            // ビームはばらつかせない。反射先が読めることが遊びの中身なので、
            // 撃つたびに散らすとその読みが成立しない
            this.game.enemyBullets.push(
                new ReflectBeam(this.game, muzzleX, muzzleY, this.currentAngle),
            );
            this.muzzleFlash = REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
        } else {
            // Inaccuracy
            const inaccuracy = (Math.random() - 0.5) * 0.1;
            const finalAngle = this.currentAngle + inaccuracy;

            const bullet = new EnemyBullet(this.game, muzzleX, muzzleY, finalAngle);
            this.game.enemyBullets.push(bullet);
        }

        this.recoil = 4; // Visual recoil kickback
    }

    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'turret');
        this.game.addScore(this.spec.score);
    }

    /** 破壊時の破片パーツ。設置向きと死亡時の砲塔角度を反映する。 */
    getDebrisParts() {
        return [...turretBaseParts(this), ...turretHeadParts(this)];
    }

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        const cx = drawX + this.width / 2;
        const cy = drawY + this.height / 2;

        ctx.save();
        ctx.translate(cx, cy);

        const colors = this.spec.colors;

        // --- Draw Base ---
        ctx.fillStyle = colors.base;
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
        ctx.fillStyle = colors.barrel;
        const barrelLength = 14 - this.recoil;
        ctx.fillRect(4, -2, barrelLength, 4);
        ctx.strokeRect(4, -2, barrelLength, 4);

        // Main pivot body (Circle)
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = colors.pivot;
        ctx.fill();
        ctx.stroke();

        // Warning light
        ctx.fillStyle = (this.state === 'bursting') ? '#FF2222' : '#FFCC00';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        // 発射直後の砲口の放射光。撃ったことを伝えるための演出で、遅いビームの
        // 出どころを見失わないようにする役目。**予告ではない**
        if (this.muzzleFlash > 0) {
            const t = this.muzzleFlash / REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
            const r = 14 * t;
            const gx = 4 + barrelLength;
            const grad = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(0.1, r));
            grad.addColorStop(0, COLOR_REFLECT_BEAM_CORE);
            grad.addColorStop(1, COLOR_REFLECT_BEAM_EDGE);
            ctx.globalAlpha = t;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, 0, Math.max(0.1, r), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }
}
