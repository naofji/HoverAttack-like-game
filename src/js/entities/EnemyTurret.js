// ============================================
// EnemyTurret - Stationary gun turret mounted on floor or ceiling
// ============================================

import {
    ENEMY_TURRET_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_TURRET_SIGHT_RANGE, ENEMY_TURRET_SCORE,
    ENEMY_TURRET_BURST_COUNT, ENEMY_TURRET_BURST_DELAY, ENEMY_TURRET_COOLDOWN,
    REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_SCORE,
    REFLECT_BEAM_CHARGE_MIN, REFLECT_BEAM_CHARGE_MAX,
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES, REFLECT_BEAM_SHOT_COUNT, REFLECT_BEAM_BURST_DELAY,
    REFLECT_BEAM_MUZZLE_FLASH_RADIUS, REFLECT_BEAM_SECOND_SHOT_OFFSET,
    REFLECT_BEAM_SECOND_SHOT_JITTER,
    COLOR_BEAM_CANNON_BASE, COLOR_BEAM_CANNON_BARREL, COLOR_BEAM_CANNON_PIVOT,
    COLOR_BEAM_CANNON_FIN,
    COLOR_REFLECT_BEAM_CORE,
    COLOR_BEAM_CANNON_LAMP_DIM, COLOR_BEAM_CANNON_LAMP_BRIGHT, COLOR_BEAM_CANNON_LAMP_BACK,
} from '../utils/Constants.js';
import { hasLineOfSight } from '../utils/Physics.js';
import { EnemyBullet } from './EnemyBullet.js';
import { ReflectBeam } from './ReflectBeam.js';
import { turretBaseParts, turretHeadParts } from './debris/turretParts.js';
import { playDestruction } from './destruction.js';
import { applyDamage } from '../utils/damage.js';
import { lerpColor } from '../utils/color.js';

// 砲身の見た目。描画専用のパラメータなので Constants ではなくここに置く
// （EnemyAttacker.js の LEG_STYLES と同じ扱い）
const BARREL_BASE = 4;    // 砲身が始まる位置（中心から）
const BARREL_LENGTH = 14; // 砲身の長さ

// beam 型のパイロットランプ（充填の進み具合を示す脈動）。描画専用のパラメータ
// なので Constants ではなくここに置く。「外周から中心にかけて脈打つ」を、
// 同じ半径から縮んでいく複数の輪を位相をずらして重ねる形で表現する
// （1本が中心に着いたら次の輪が外周に現れる。(t + k/本数) % 1 が肝）
const BEAM_LAMP_RINGS = 3;
const BEAM_LAMP_MAX_RADIUS = 6;    // 胴体(半径8)からはみ出さない範囲で、旧警告灯(半径3)より大きく
const BEAM_LAMP_CYCLE_SLOW = 50;   // 充填直後(進み0)の脈の周期。ゆったり
const BEAM_LAMP_CYCLE_FAST = 14;   // 充填しきった(進み1)ときの周期。速くして「そろそろ撃つ」を伝える
const BEAM_LAMP_RING_LINE_WIDTH = 1.75; // 輪1本1本が独立して見える太さ(1.5〜2の指定内)
const BEAM_LAMP_CORE_RADIUS = 2;   // 中心の塗りつぶし本体。輪(stroke)と別に残す
// 暗い座の半径。ランプ本体・輪(最大半径6)より一回り大きく、ピボットの円(半径8)は
// 超えない範囲で選んだ
const BEAM_LAMP_BACK_RADIUS = 7;

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
        burstDelay: ENEMY_TURRET_BURST_DELAY,   // 従来どおり
        colors: { base: '#555555', barrel: '#888888', pivot: '#667788' },
    },
    beam: {
        hp: REFLECT_BEAM_CANNON_HP,
        score: REFLECT_BEAM_CANNON_SCORE,
        // 冷却は無し。撃ち終わったらすぐ充填に入り、溜まったらまた撃つ。
        // 1発ごとに範囲から選ぶのは、固定だとリズムを読み切られるため
        charge: { min: REFLECT_BEAM_CHARGE_MIN, max: REFLECT_BEAM_CHARGE_MAX },
        // 遮蔽に隠れても撃つ。反射する武器なので、壁越しに撃って跳ね返らせるのが
        // この砲台の見せ場になる。隠れているだけで安全だと緊張感が出ない
        ignoresLineOfSight: true,
        burst: REFLECT_BEAM_SHOT_COUNT,          // 2連弾
        burstDelay: REFLECT_BEAM_BURST_DELAY,    // 発と発の間隔を長めに取る
        colors: {
            base: COLOR_BEAM_CANNON_BASE,
            barrel: COLOR_BEAM_CANNON_BARREL,
            pivot: COLOR_BEAM_CANNON_PIVOT,
        },
        // 冷却フィン。砲身に直交する直線を等間隔に引く。型ごとの違いは表の1行に
        // 出す方針なので、draw() に型の分岐を増やさずここから引く（gun は持たない）
        fins: { count: 4, halfHeight: 4, color: COLOR_BEAM_CANNON_FIN },
        // パイロットランプの色。gun は今までどおり draw() 内の黄／赤決め打ちのまま
        // （このキーが無いことで分岐する。fins と同じ扱い）
        lampColors: { dim: COLOR_BEAM_CANNON_LAMP_DIM, bright: COLOR_BEAM_CANNON_LAMP_BRIGHT },
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
        this.state = 'idle'; // 'idle', 'bursting', 'cooldown'（beam 型は cooldown を通らない）
        if (this.spec.charge) {
            // beam 型: cooldownTimer を「次弾までの充填」として使い回す。
            // 初期化時点でも一度選んでおき、初弾のタイミングにばらつきを持たせる
            // （既存の gun 型の「初期オフセットをランダムにする」意図を踏襲）
            this.chargeTotal = this._rollBeamCharge();
            this.cooldownTimer = Math.floor(Math.random() * this.chargeTotal);
        } else {
            this.chargeTotal = 0; // gun 型では使わない
            this.cooldownTimer = Math.floor(Math.random() * this.spec.cooldown); // Randomize initial offset
        }

        // Burst scaling: Mission 5 (index 4) and above get 8 rounds
        // （既存のタレットだけ。ビームは常に単発 = spec.burst）
        this.maxBurstCount = (this.type === 'gun' && this.game.missionsCompleted >= 4)
            ? 8
            : this.spec.burst;

        this.burstCount = 0;
        this.burstTimer = 0;

        // Visual recoil
        this.recoil = 0;

        // 2連弾の2発目にずらす角度の符号。撃つたびではなく「2発目を撃つたび」に
        // 反転させる（毎回同じ側だと避け方を覚えられ、乱数だと同じ側が続きうる
        // ため使わない）。beam 型以外では参照されない
        this.secondShotSide = 1;
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
                // 連射間隔は型から引く。以前は全型共通の ENEMY_TURRET_BURST_DELAY(10) を
                // 直書きしていたが、beam 型は2連弾の間隔を意図的に長く取る
                // （REFLECT_BEAM_BURST_DELAY=24）ため、型ごとの spec.burstDelay を見る
                this.burstTimer = this.spec.burstDelay;
                if (this.burstCount <= 0) {
                    if (this.spec.charge) {
                        // beam 型: 'cooldown' を経由せず 'idle' に戻り、待機中の
                        // カウントダウンをそのまま「次弾までの充填」として使う。
                        // 1発ごとに範囲から選び直す（固定だとリズムを読み切られる）
                        this.state         = 'idle';
                        this.chargeTotal   = this._rollBeamCharge();
                        this.cooldownTimer = this.chargeTotal;
                    } else {
                        this.state         = 'cooldown';
                        this.cooldownTimer = this.spec.cooldown;
                    }
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

    /**
     * 充填時間を範囲から選ぶ（beam 型専用）。固定値だと連射のリズムを読み切られる
     * ため、1発ごとに選び直す。**`game.rng` は使わない**（マップ生成以外で
     * 消費すると週次シードの決定性が壊れる。既存のタレットも初期タイミングの
     * ばらつきや gun 型の着弾ブレに Math.random() を使っており、それに倣う）
     */
    _rollBeamCharge() {
        const { min, max } = this.spec.charge;
        return Math.floor(min + Math.random() * (max - min));
    }

    /** 充填の進み具合（0=撃った直後 〜 1=充填しきった）。ランプの色と脈の速さに使う。 */
    _beamChargeProgress() {
        if (!this.chargeTotal) return 1;
        const remaining = Math.max(0, Math.min(this.chargeTotal, this.cooldownTimer));
        return 1 - remaining / this.chargeTotal;
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

            // 扇型（±SPREAD で複数本同時）はやめた。2連弾にして、_updateStateMachine()
            // が spec.burstDelay(24) 間隔を空けて _executeAttack() を2回呼ぶことで
            // 「1発撃って、しばらくして2発目」という形にした。角度は _updateAiming() が
            // 毎フレーム currentAngle = targetAngle（即時照準）で自機を追っているので、
            // 間隔を空けて撃つだけで2発目は自動的にその瞬間の自機の位置を向く。
            // 固定の扇を足さなくても「狙い直し」で角度が変わるので、SPREAD は不要になった。
            //
            // ただし自機が止まっていると「狙い直し」が効かず、2発とも同じ線に乗ってしまう
            // （実機で「2連射目は少しずらした方がいい」と指摘された）。1発目はそのまま、
            // 2発目にだけ REFLECT_BEAM_SECOND_SHOT_OFFSET を足す。burstCount は連射開始時に
            // maxBurstCount(=2) が入り撃つたびに1減る（_updateStateMachine 参照）ので、
            // ここではまだ減っていない＝maxBurstCount のままなら1発目、減っていれば2発目
            let angle = this.currentAngle;
            if (this.burstCount < this.maxBurstCount) {
                // 左右交互のずれ(REFLECT_BEAM_SECOND_SHOT_OFFSET)だけだと、反射する
                // 経路が2通りに固定されてしまい、跳ね返り先が読めてしまう（実機で
                // 「2発目のブレを微妙に加えた方が反射角度が変わっていい」と指摘された）。
                // 小さなランダムのブレを追加で足す。ブレは交互のずれ(8度)より必ず
                // 小さく保つ（大きくすると「左右交互」の性質そのものが壊れ、既存の
                // 「ずれの符号が交互になる」テストが意味を失う）。
                // 既存タレットの inaccuracy と同じ (Math.random() - 0.5) * 0.1 の形。
                // game.rng は使わない（週次の決定性が壊れるため厳禁）
                const jitter = (Math.random() - 0.5) * 2 * REFLECT_BEAM_SECOND_SHOT_JITTER;
                angle += REFLECT_BEAM_SECOND_SHOT_OFFSET * this.secondShotSide + jitter;
                this.secondShotSide *= -1; // 次の2発目のために左右を入れ替える
            }
            this.game.enemyBullets.push(
                new ReflectBeam(this.game, muzzleX, muzzleY, angle),
            );
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

    /**
     * beam 型のパイロットランプ。ユーザー指定の「打ち終わると暗紫、充填が高まると
     * 紫に輝く、外周から中心にかけて脈打つ」の実装。
     *
     * - 色: 充填の進み具合（`_beamChargeProgress()`）で暗紫→明るい紫を
     *   `lerpColor()` で補間する（自前で色を混ぜない。既存の共通機構を使う）
     * - 座: ランプ本体・輪を描く**前**に、COLOR_BEAM_CANNON_LAMP_BACK（ほぼ黒の紫）の
     *   円を敷く。COLOR_BEAM_CANNON_BASE/_PIVOT が明るい灰色のため、紫を直接その
     *   上に乗せてもコントラストが出ない（実機で「機体の白と重なってインパクトが
     *   弱め」と指摘された）。半径はピボットの円(半径8)を超えない範囲で、
     *   ランプ本体・輪(最大半径6)より一回り大きい BEAM_LAMP_BACK_RADIUS(7) にした
     * - 本体: 中心の小さな塗りつぶし円（BEAM_LAMP_CORE_RADIUS）。輪と違って
     *   縮まない、常にそこにある「ランプそのもの」
     * - 脈: 半径 BEAM_LAMP_MAX_RADIUS から縮んでいく輪を BEAM_LAMP_RINGS 本、
     *   位相をずらして重ねる。「経過フレーム数」は専用のカウンタを持たず
     *   `chargeTotal - cooldownTimer` から出す（充填の進みそのものが時間の
     *   代わりになる。テストからも cooldownTimer を直接動かすだけで検証できる）。
     *   以前は半透明の円を塗りつぶし(fill)で重ねていたが、それだと輪ではなく
     *   ただの明滅に見える（実機フィードバック）。ctx.stroke() の輪郭線に変え、
     *   「本体＋その外側を内向きに縮んでいく輪」という見え方にした
     * - 充填が進むほど周期を BEAM_LAMP_CYCLE_SLOW→FAST で短くし、脈を速くする。
     *   「そろそろ撃つ」が読めるのが狙い（冷却時間を無くした代わりの手がかり）
     */
    _drawChargeLamp(ctx) {
        const progress = this._beamChargeProgress();
        const { dim, bright } = this.spec.lampColors;
        const color = lerpColor(dim, bright, progress);
        const cycle = BEAM_LAMP_CYCLE_SLOW + (BEAM_LAMP_CYCLE_FAST - BEAM_LAMP_CYCLE_SLOW) * progress;
        const elapsed = Math.max(0, (this.chargeTotal || 1) - this.cooldownTimer);

        // 座（ランプ本体・輪より先に描く。後だと座が上に乗って隠してしまう）
        ctx.fillStyle = COLOR_BEAM_CANNON_LAMP_BACK;
        ctx.beginPath();
        ctx.arc(0, 0, BEAM_LAMP_BACK_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // ランプ本体（塗りつぶしの点。輪と違って縮まない）
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, BEAM_LAMP_CORE_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // 脈動の輪（輪郭線）
        ctx.strokeStyle = color;
        ctx.lineWidth = BEAM_LAMP_RING_LINE_WIDTH;
        for (let k = 0; k < BEAM_LAMP_RINGS; k++) {
            // phase: 0=外周に現れた瞬間 → 1=中心に着いた瞬間（一周したら次の輪が外周に現れる）
            const phase = ((elapsed / cycle) + k / BEAM_LAMP_RINGS) % 1;
            const r = BEAM_LAMP_MAX_RADIUS * (1 - phase);
            // 中心に近づくほど薄くする。線でも同じ考え方で、外周から中心へ
            // 収束していく濃淡に見せる
            ctx.globalAlpha = 0.3 + 0.5 * (1 - phase);
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(0.5, r), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
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

            // フィン描画で strokeStyle/lineWidth を上書きしたままにすると、
            // 直後のピボットの stroke() がフィンの色・太さ（明るい1px）で
            // 描かれてしまい、draw() 冒頭で設定した本来の輪郭（#222222・2px）が
            // 薄い縁に化ける。beam 型だけ砲台の輪郭が弱く見える退行になっていたため、
            // ここで明示的に戻す
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = 2;
        }

        // Main pivot body (Circle)
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = colors.pivot;
        ctx.fill();
        ctx.stroke();

        // Warning light。beam 型は充填の進み具合を見せるランプに差し替わる
        // （lampColors の有無で分岐。fins と同じ「型ごとの違いは表の1行」の扱い）
        if (this.spec.lampColors) {
            this._drawChargeLamp(ctx);
        } else {
            ctx.fillStyle = (this.state === 'bursting') ? '#FF2222' : '#FFCC00';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        }

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
