// ============================================
// EnemyTurret - Stationary gun turret mounted on floor or ceiling
// ============================================

import {
    ENEMY_TURRET_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT, ENEMY_TURRET_SIGHT_RANGE, ENEMY_TURRET_SCORE,
    ENEMY_TURRET_BURST_COUNT, ENEMY_TURRET_BURST_DELAY, ENEMY_TURRET_COOLDOWN, REFLECT_BEAM_CANNON_HP,
    REFLECT_BEAM_CANNON_SCORE, REFLECT_BEAM_CHARGE_MIN, REFLECT_BEAM_CHARGE_MAX,
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES, REFLECT_BEAM_SHOT_COUNT, REFLECT_BEAM_BURST_DELAY,
    REFLECT_BEAM_SECOND_SHOT_OFFSET, REFLECT_BEAM_SECOND_SHOT_JITTER, COLOR_BEAM_CANNON_BASE,
    COLOR_BEAM_CANNON_BARREL, COLOR_BEAM_CANNON_PIVOT, COLOR_BEAM_CANNON_FIN, COLOR_BEAM_CANNON_LAMP_DIM,
    COLOR_BEAM_CANNON_LAMP_BRIGHT, ENEMY_TURRET_LATE_BURST_MISSION, ENEMY_TURRET_LATE_BURST_COUNT,
    ENEMY_TURRET_TURN_SPEED, REFLECT_BEAM_TURN_SPEED, ENEMY_TURRET_AIM_TOLERANCE,
} from '../utils/Constants.js';
import { stepBarrelAngle, isBarrelAimed } from '../utils/turretAim.js';
import { hasLineOfSightBetween, withinSight } from '../utils/Physics.js';
import { sightScaleFor } from '../world/StageEnvironment.js';
import { EnemyBullet } from './EnemyBullet.js';
import { ReflectBeam } from './ReflectBeam.js';
import { turretBaseParts, turretHeadParts } from './debris/turretParts.js';
import { playDestruction } from './destruction.js';
import { applyDamage } from '../utils/damage.js';
import { TurretDraw, BARREL_BASE, BARREL_LENGTH } from './turret/draw.js';

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
        turnSpeed: ENEMY_TURRET_TURN_SPEED,     // 砲身を回す速さ（ラジアン／フレーム）
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
        turnSpeed: REFLECT_BEAM_TURN_SPEED,
        colors: {
            base: COLOR_BEAM_CANNON_BASE,
            barrel: COLOR_BEAM_CANNON_BARREL,
            pivot: COLOR_BEAM_CANNON_PIVOT,
        },
        // 砲身を2px 厚くする（gun は ±2）。ビーム砲としての「太い導波管」を出す。
        // 形はあくまでタレットが原型なので、長さも付け根の位置も変えない。
        // ±3 では「砲身が見づらい」と実機で指摘された。長さ14pxの砲身に対して
        // フィン3枚(幅2＋輪郭)とエミッタ(長さ3)が乗ると、残る素の砲身は
        // 数pxずつの切れ端になり、棒ではなく塊の連なりに見えていた。
        // 太くすると1枚あたりのフィンに食われる割合が下がる
        barrelHalfHeight: 4,
        // 砲口の放射器（エミッタ）。砲身の先に付く塊で、ここからビームが出ることを
        // 形で示す。放射光（muzzleFlash）もこの塊の位置に出る。
        // 砲身より太くないと「塊」に見えないので、砲身を太くしたぶん上げる
        emitter: { length: 3, halfHeight: 6 },
        // 冷却フィン。**塗りのある小さな板**として砲身にまたがらせる。
        // 以前は線を4本引いていたが、砲身(高さ4px)の倍の高さの縦線が宙に浮いて
        // 見え、「櫛」のようで形が破綻していた（実機フィードバック）。板にして
        // 砲身に接続し、本数も 4→3→2 と減らして間隔を空けた。2枚にしたのは
        // 「砲身が見づらい」への対応で、3枚だと砲身の素の面がほとんど残らない。
        // halfHeight は砲身(±4)から必ずはみ出させる（はみ出さないとフィンが
        // 砲身に埋もれて、輪郭の凹凸という役割を失う）
        // 型ごとの違いは表の1行に出す方針なので、draw() に型の分岐を増やさず
        // ここから引く（gun は持たない）
        fins: { count: 2, halfHeight: 6, width: 2, color: COLOR_BEAM_CANNON_FIN },
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

        // 5面からは機関砲の砲台だけ連射数が増える（ビームは常に単発 = spec.burst）
        this.maxBurstCount = (this.type === 'gun' && this.game.missionsCompleted >= ENEMY_TURRET_LATE_BURST_MISSION)
            ? ENEMY_TURRET_LATE_BURST_COUNT
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

    /** 休みの向き（台座から真っすぐ伸びる向き）。床の砲台は真上、天井の砲台は真下 */
    _restAngle() {
        return this.isCeilingMounted ? Math.PI / 2 : -Math.PI / 2;
    }

    /**
     * 砲身を一定の速さ（spec.turnSpeed）で回す。目標がいればそちらへ、いなければ休みの向きへ。
     * 以前は目標がいると currentAngle = targetAngle（即時照準）で、自機を見つけた瞬間に砲身が
     * 跳んでいた（ユーザー指定で一定速度の旋回に変更、2026-11-05）。回し方は utils/turretAim.js
     */
    _updateAiming(target) {
        const rest = this._restAngle();
        if (target) {
            const cx = this.x + this.width  / 2;
            const cy = this.y + this.height / 2;
            this.targetAngle  = Math.atan2(
                target.y + target.height / 2 - cy,
                target.x + target.width  / 2 - cx
            );
        } else {
            this.targetAngle = rest;
        }
        this.currentAngle = stepBarrelAngle(this.currentAngle, this.targetAngle, rest, this.spec.turnSpeed);
    }

    /** 砲身が目標を向いているか。向くまでは撃ち始めない（回してから撃つ） */
    _isAimed() {
        return isBarrelAimed(this.currentAngle, this.targetAngle, this._restAngle(), ENEMY_TURRET_AIM_TOLERANCE);
    }

    /** Advance the idle → bursting → cooldown state machine. */
    _updateStateMachine(target) {
        if (this.state === 'idle') {
            if (this.cooldownTimer > 0) {
                this.cooldownTimer--;
            } else if (target && this._isAimed()) {
                // 撃ち始めるのは砲身が向いてから。下の bursting の枝でも各弾が向くまで待つので、撃つ時刻は
                // こちらを外しても変わらない。ここで待つのは、回している間も状態を 'idle' のまま保つため
                // （ビーム砲は 'idle' の間の cooldownTimer を充填のランプに使っている）
                this.state     = 'bursting';
                this.burstCount = this.maxBurstCount;
                this.burstTimer = 0;
            }
        } else if (this.state === 'bursting') {
            if (this.burstTimer <= 0) {
                // 連射の各弾も、砲身が自機を向くまで待つ（回してから撃つ）。ふつうに動く自機なら
                // 砲身が追いつくので連射の間隔はほぼ変わらない。見失ったとき（target が無い）は待たずに
                // 今の向きへ撃つ — 待つと砲身が休みの向き（真上・真下）まで回ってから天井や床へ撃ってしまう
                if (target && !this._isAimed()) return;
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

            // 霧では索敵半径が縮む（sightScaleFor、陸上/env無しは1倍）
            if (withinSight(dx, dy, ENEMY_TURRET_SIGHT_RANGE * sightScaleFor(this.game))
                && (this.spec.ignoresLineOfSight || hasLineOfSightBetween(this, target, this.game.map))) {
                return target;
            }
        }
        return null;
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
            // 毎フレーム自機の方へ砲身を回している（一定の速さ。以前は即時照準）ので、
            // 間隔を空けて撃つだけで2発目はその間に回った向き＝自機を追った向きになる。
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

}

Object.assign(EnemyTurret.prototype, TurretDraw);
