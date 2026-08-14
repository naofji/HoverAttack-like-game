// ============================================
// EnemyTurret - Stationary gun turret mounted on floor or ceiling
// ============================================

import {
    ENEMY_TURRET_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_TURRET_SIGHT_RANGE, ENEMY_TURRET_SCORE,
    ENEMY_TURRET_BURST_COUNT, ENEMY_TURRET_BURST_DELAY, ENEMY_TURRET_COOLDOWN,
    REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_COOLDOWN, REFLECT_BEAM_CANNON_SCORE,
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES, REFLECT_BEAM_SHOT_COUNT, REFLECT_BEAM_SPREAD,
    REFLECT_BEAM_MUZZLE_FLASH_RADIUS,
    COLOR_BEAM_CANNON_BASE, COLOR_BEAM_CANNON_BARREL, COLOR_BEAM_CANNON_PIVOT,
    COLOR_BEAM_CANNON_FIN,
    COLOR_REFLECT_BEAM_CORE,
} from '../utils/Constants.js';
import { hasLineOfSight } from '../utils/Physics.js';
import { EnemyBullet } from './EnemyBullet.js';
import { ReflectBeam } from './ReflectBeam.js';
import { turretBaseParts, turretHeadParts } from './debris/turretParts.js';
import { playDestruction } from './destruction.js';
import { applyDamage } from '../utils/damage.js';

// 砲身の見た目。描画専用のパラメータなので Constants ではなくここに置く
// （EnemyAttacker.js の LEG_STYLES と同じ扱い）
const BARREL_BASE = 4;    // 砲身が始まる位置（中心から）
const BARREL_LENGTH = 14; // 砲身の長さ

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
        // 遮蔽に隠れても撃つ。反射する武器なので、壁越しに撃って跳ね返らせるのが
        // この砲台の見せ場になる。隠れているだけで安全だと緊張感が出ない
        ignoresLineOfSight: true,
        burst: 1,  // 1回の攻撃。ただし1回で SHOT_COUNT 本を扇型に撃つ
        colors: {
            base: COLOR_BEAM_CANNON_BASE,
            barrel: COLOR_BEAM_CANNON_BARREL,
            pivot: COLOR_BEAM_CANNON_PIVOT,
        },
        // 冷却フィン。砲身に直交する直線を等間隔に引く。型ごとの違いは表の1行に
        // 出す方針なので、draw() に型の分岐を増やさずここから引く（gun は持たない）
        fins: { count: 4, halfHeight: 4, color: COLOR_BEAM_CANNON_FIN },
    },
};

export class EnemyTurret {
    constructor(game, x, y, isCeilingMounted = false, type = 'gun') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_TURRET_WIDTH;
        this.height = ENEMY_TURRET_HEIGHT;
        // `TURRET_TYPES[type]` という真偽判定だと、Object.prototype 由来の
        // キー（'constructor' など）まで「存在する」と誤判定してしまい、
        // gun へのフォールバックが効かない。hasOwn で自前のキーだけを見る
        this.type = Object.hasOwn(TURRET_TYPES, type) ? type : 'gun';
        this.spec = TURRET_TYPES[this.type];
        this.hp = this.spec.hp;
        this.maxHp = this.hp;
        this.alive = true;
        this.isCeilingMounted = isCeilingMounted;
        // 発射時の砲口の放射光。残りフレーム数。**予告ではない**（撃つ前は 0）
        this.muzzleFlash = 0;
        // 放射光を描く位置（中心からの距離）。発射した瞬間に _executeAttack() が
        // 固定する。反動で縮む _muzzleOffset() を毎フレーム引くと光がビームから
        // 離れて見えるため、光だけは発射時点の値に留める
        this.muzzleFlashOffset = 0;

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

            if (dist < ENEMY_TURRET_SIGHT_RANGE
                && (this.spec.ignoresLineOfSight || this._hasLineOfSight(target))) {
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

    /**
     * 砲口（砲身の先端）の中心からの距離。
     *
     * **発射位置と砲口の放射光は必ずこれを使う。** 以前は発射が `12 - recoil`、
     * 放射光が `4 + (14 - recoil)` と食い違っていて、ビームが放射光より6px手前
     * ＝砲身の中から湧いていた。そのせいで光がビームの根元に隠れ、実機で
     * 「放射光が全く目立たない・ビームが回転軸の中心から出ている」と指摘された
     */
    _muzzleOffset() {
        return BARREL_BASE + BARREL_LENGTH - this.recoil;
    }

    _executeAttack() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Muzzle position offset by barrel length and recoil
        const off = this._muzzleOffset();
        const muzzleX = cx + Math.cos(this.currentAngle) * off;
        const muzzleY = cy + Math.sin(this.currentAngle) * off;

        if (this.type === 'beam') {
            // 放射光は「弾が出た場所」を示す演出なので、発射した瞬間の砲口の
            // 位置に留める。反動で砲身が縮んだあとの _muzzleOffset() を毎フレーム
            // 引くと、発射直後は 18 だったのに次のフレームには 14 へ動いてしまい、
            // ビーム（発射時点の 18 のまま）から光が離れて見える。撃った位置を
            // ここで固定しておき、draw() はこの値だけを使う
            this.muzzleFlashOffset = off;

            // 照準を中心に左右へ均等に開く。**乱数は使わない**（週次の決定性を
            // 壊さないため。スポーンと違い発射は rng を引かない作りを保つ）
            for (let i = 0; i < REFLECT_BEAM_SHOT_COUNT; i++) {
                const t = REFLECT_BEAM_SHOT_COUNT === 1
                    ? 0
                    : (i / (REFLECT_BEAM_SHOT_COUNT - 1)) * 2 - 1;  // -1..+1
                const angle = this.currentAngle + t * REFLECT_BEAM_SPREAD;
                this.game.enemyBullets.push(
                    new ReflectBeam(this.game, muzzleX, muzzleY, angle),
                );
            }
            this.muzzleFlash = REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
        } else {
            // Inaccuracy
            const inaccuracy = (Math.random() - 0.5) * 0.1;
            const finalAngle = this.currentAngle + inaccuracy;

            const bullet = new EnemyBullet(this.game, muzzleX, muzzleY, finalAngle);
            this.game.enemyBullets.push(bullet);
        }

        this.recoil = 4; // Visual recoil kickback（gun 型の見た目を変えないため、元どおり末尾で立てる）
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
        const barrelLength = BARREL_LENGTH - this.recoil;
        ctx.fillRect(BARREL_BASE, -2, barrelLength, 4);
        ctx.strokeRect(BARREL_BASE, -2, barrelLength, 4);

        // 冷却フィン（beam 型のみ）。砲身に直交する線を等間隔に引き、輪郭に
        // 凹凸を出す。色だけで区別していた既存タレットとの差別化のため
        const fins = this.spec.fins;
        if (fins) {
            ctx.strokeStyle = fins.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < fins.count; i++) {
                // 砲身を count+1 等分した内側の点に引く。両端（付け根と砲口）を
                // 空けることで、砲口の放射光とフィンが重ならない
                const fx = BARREL_BASE + barrelLength * (i + 1) / (fins.count + 1);
                ctx.moveTo(fx, -fins.halfHeight);
                ctx.lineTo(fx, fins.halfHeight);
            }
            ctx.stroke();
        }

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
            const r = REFLECT_BEAM_MUZZLE_FLASH_RADIUS * t;
            // 発射時点で固定した位置を使う（_muzzleOffset() だと反動で縮んだ
            // 砲身に毎フレーム追従してしまい、ビームの発射位置から光が離れる）
            const gx = this.muzzleFlashOffset;
            const grad = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(0.1, r));
            grad.addColorStop(0, COLOR_REFLECT_BEAM_CORE);
            // 外周は透明。不透明な暗紫のままだと「暗い円板の縁」に見えてしまう。
            // グラデーションのストップに rgba を直接書くのは BaseLaser に前例がある
            grad.addColorStop(1, 'rgba(59, 15, 107, 0)');
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
