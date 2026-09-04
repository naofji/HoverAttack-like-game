// ============================================
// EnemyAttacker - Humanoid enemy robot (3 types)
// ============================================

import {
    GRAVITY, AIR_FRICTION, PLAYER_WIDTH,
    PLAYER_HEIGHT, PLAYER_MAX_FALLING_SPEED, PLAYER_STUN_FALL_SPEED,
    LANDING_MIN_AIRBORNE_FRAMES, HOVER_MAX_FUEL, HOVER_FUEL_RECOVERY,
    ATTACKER_BOOST_MAX_FRAMES, EMERGENCY_DEFENSE_BASE_RADIUS, EMERGENCY_DEFENSE_SIGHT_RANGE,
    ENEMY_RECOIL_PROFILES, SMOKE_COOLDOWN,
} from '../utils/Constants.js';
import { RepairKit } from './RepairKit.js';
import { AutoAimUnit } from './AutoAimUnit.js';
import { MissileKit } from './MissileKit.js';
import { OverdriveKit } from './OverdriveKit.js';
import { decideAttackerDrop } from '../utils/drops.js';
import { attackerBodyParts, attackerLegParts } from './debris/attackerParts.js';
import { tickRecoil } from '../utils/Recoil.js';
import { playDestruction } from './destruction.js';
import { audioManager } from '../audio/AudioManager.js';
import { applyDamage } from '../utils/damage.js';
import { withinSight } from '../utils/Physics.js';
import { motionFor, LAND_MOTION, sightScaleFor } from '../world/StageEnvironment.js';
import { AttackerLegs } from './attacker/legs.js';
import { AttackerDraw } from './attacker/draw.js';
import { AttackerCollision } from './attacker/collision.js';
import { AttackerCombat } from './attacker/combat.js';
import { AttackerMovement } from './attacker/movement.js';

export class EnemyAttacker {
    constructor(game, x, y, config) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = PLAYER_WIDTH;   // Same size as player (16px)
        this.height = PLAYER_HEIGHT; // Same size as player (24px)
        this.vx = 0;
        this.vy = 0;
        // 環境の物理係数。update() で毎フレーム引き直し、
        // _moveAndCollide()（attacker/collision.js）が同じ値を読む。
        this.motion = LAND_MOTION;
        this.recoilProfile = ENEMY_RECOIL_PROFILES[config.name] || ENEMY_RECOIL_PROFILES.standard;
        this.recoilTimer = 0;
        this.alive = true;
        this.onGround = false;
        this.wasOnGround = false;   // 着地音を1回だけ鳴らすための前フレームの接地状態
        this.airborneFrames = 0;    // 連続して宙に浮いていたフレーム数

        // Config-driven stats
        this.config = config;
        this.hp = config.hp;
        // MG にだけ効くダメージ軽減。表(ENEMY_ATTACKER_TYPES)に行が無ければ等倍。
        // CollisionManager が敵の種類を知らずに読めるよう、config ではなく
        // インスタンスの属性として持たせている
        this.mgDamageMult = config.mgDamageMult ?? 1;
        // 撃破ドロップはスポーンした瞬間に確定させる（ユーザーの要望: 戦略性を
        // 高めるため、同じ週なら何度遊んでも同じ場所に同じ物が置かれるように
        // したい）。die() の時点で乱数を引くと、倒す順番やタイミングで結果が
        // 変わってしまい「配置を覚えて狙う」という戦略が成立しない。
        this.dropKind = decideAttackerDrop(game, x, y, config.name);
        this.maxHp = this.hp;
        this.maxSpeed = config.speed;
        this.jumpForce = config.jumpForce;
        this.score = config.score;

        // AI state
        this.facingRight = Math.random() < 0.5;
        this.patrolDir = this.facingRight ? 1 : -1;
        this.fireTimer = Math.floor(Math.random() * config.fireInterval);
        this.aiState = 'patrol'; // 'patrol', 'chase' or 'return'
        this.jumpCooldown = 0;

        // Home position (spawn point) — the attacker returns here when displaced
        this.homeX = x;
        this.homeY = y;
        this.returning = false;
        this.currentTarget = null;
        this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;

        // Emergency base-defense state: when the boss base is attacked (mission 2+),
        // attackers rush to and guard the base. The redirected home reuses the
        // return/patrol/chase machine (see setEmergencyDefense).
        this.emergencyDefense = false;
        this.emergencyTargetBase = null;
        this._spawnHomeX = x; // real spawn home, restored when defense ends
        this._spawnHomeY = y;

        // Rival alignment-avoidance state
        this.alignXFrames = 0;
        this.alignYFrames = 0;
        this.evadeTimer = 0;
        this.evadeGoalX = 0;
        this.evadeVertical = 0; // -1 = go up, +1 = drop, 0 = horizontal only

        // Artillery cover-seeking state
        this.coverCheckTimer = 0;
        this.coverGoalX = null;
        this.inCover = false;
        this.smokeCooldown = 0;   // 発煙のクールダウン（SMOKE_COOLDOWN から減っていく）

        // Animation & State
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.hovering = false;
        this.crouching = false;
        this.crouchTimer = 0;
        this.burstCount = 0;
        this.burstTimer = 0;

        // Hover fuel support (used if movementType allows hovering)
        this.hoverFuel = HOVER_MAX_FUEL;
        this.frameCounter = Math.floor(Math.random() * 100);
    }

    /**
     * Toggle emergency base-defense mode (called by EnemyBase/Game when the boss
     * base is attacked on mission 2+). Rather than a new aiState, this redirects the
     * unit's "home" to a spread-out point around the base: the existing
     * return -> patrol -> chase machine then makes it rush in, guard the perimeter,
     * and engage any player that comes within the (widened) sight range.
     * @param {boolean} active
     * @param {{x:number,y:number,width:number,height:number}} [targetBase]
     */
    setEmergencyDefense(active, targetBase = null) {
        if (active) {
            if (!targetBase) return;
            if (!this.emergencyDefense) {
                // Capture the real spawn home once, on first activation.
                this._spawnHomeX = this.homeX;
                this._spawnHomeY = this.homeY;
            }
            this.emergencyDefense = true;
            this.emergencyTargetBase = targetBase;

            // Per-unit angle so multiple defenders spread around the base instead of
            // stacking on one pixel. Derived once here from Math.random().
            const angle = Math.random() * Math.PI * 2;
            const cx = targetBase.x + targetBase.width / 2;
            const cy = targetBase.y + targetBase.height / 2;
            this.homeX = cx + Math.cos(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;
            this.homeY = cy + Math.sin(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;

            // Force the return branch so the unit heads for the base next update().
            this.returning = true;
        } else {
            if (this.emergencyDefense) {
                this.homeX = this._spawnHomeX;
                this.homeY = this._spawnHomeY;
            }
            this.emergencyDefense = false;
            this.emergencyTargetBase = null;
        }
    }

    update() {
        if (!this.alive) return;

        this.frameCounter++;
        this.hovering = false;
        const target = this._getClosestTarget();
        const targetDist = target ? this._distToTarget(target) : Infinity;

        // --- AI state decision ---
        this.currentTarget = target;
        // 通常の索敵は楕円（横だけ画面幅に比例する）。総攻撃中の緊急索敵 250px は
        // 画面比と無関係な「至近距離の反応」なので、楕円に混ぜず真円のまま OR で
        // 足す。Math.max で楕円の横半径ごと広げると、16:9 では縦が
        // 250 * SIGHT_ASPECT = 187 に縮み、意図しないバランス変更になる。
        // 4:3 では楕円が真円に退化するので、この OR は元の
        // Math.max(config.sightRange, 250) と完全に同じ結果になる。
        //
        // 現状、この OR は実質的に効いていない。索敵の縦半径が一番小さい
        // standard/tank でも sightRange = CANVAS_WIDTH*0.4 ≈ 546.4、
        // その縦半径は 546.4 * SIGHT_ASPECT ≈ 409.6px あり、緊急索敵の
        // 250px は実在するどの敵の楕円にも収まってしまう（250/409.6 ≈ 0.61）。
        // それでも残してあるのは、将来どこかの索敵係数を下げて楕円の縦半径が
        // 250px を割り込んだときに、この OR が保険として即座に効くようにするため。
        const dx = target ? (target.x + target.width / 2) - (this.x + this.width / 2) : 0;
        const dy = target ? (target.y + target.height / 2) - (this.y + this.height / 2) : 0;
        // 霧では索敵半径が縮む（sightScaleFor、陸上/env無しは1倍）。
        // 緊急防衛用の EMERGENCY_DEFENSE_SIGHT_RANGE は保険の即応距離なので対象外。
        const inSight = !!target && (
            withinSight(dx, dy, this.config.sightRange * sightScaleFor(this.game))
            || (this.emergencyDefense && targetDist < EMERGENCY_DEFENSE_SIGHT_RANGE)
        );
        if (inSight) {
            this.aiState = 'chase';
            this.returning = false;
        } else {
            this._updateReturnState();
            this.aiState = this.returning ? 'return' : 'patrol';
            // Cover state is chase-scoped: reset so re-engagement re-checks LOS immediately
            this.inCover = false;
            this.coverGoalX = null;
            this.coverCheckTimer = 0;
        }

        // --- Movement ---
        // 反動中は自前の移動制御を飛ばす。重力・地形衝突・射撃はそのまま動く。
        if (!tickRecoil(this)) this._updateMovement(target);

        // --- Hover Fuel Recovery ---
        if (this.onGround) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
            this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;
        }

        // --- Physics ---
        this.motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this.vy += GRAVITY * this.motion.gravity;
        if (this.vy > PLAYER_MAX_FALLING_SPEED) this.vy = PLAYER_MAX_FALLING_SPEED;

        if (!this.onGround && this.aiState === 'patrol') {
            this.vx *= AIR_FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }

        if (this.jumpCooldown > 0) this.jumpCooldown--;

        // 着地音は自機と同じ扱い。接地判定は地形の端などで1フレーム単位で
        // 途切れるので、遷移だけでなく実際に浮いていた時間も条件にする。
        const impactVy = this.vy;
        this._moveAndCollide();
        if (!this.wasOnGround && this.onGround
            && this.airborneFrames >= LANDING_MIN_AIRBORNE_FRAMES) {
            audioManager.playEnemyLanding(
                this.x + this.width / 2, this.y + this.height / 2,
                impactVy > PLAYER_STUN_FALL_SPEED,
            );
        }
        this.airborneFrames = this.onGround ? 0 : this.airborneFrames + 1;
        this.wasOnGround = this.onGround;

        this._updateFacing(target);
        this._updateWalkAnimation();
        if (this.smokeCooldown > 0) this.smokeCooldown--;
        this._handleShooting();
    }

    // ------------------------------------------
    // Damage
    // ------------------------------------------

    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'attacker');
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.game.addScore(this.score);

        // ドロップの中身はスポーン時（decideAttackerDrop）で既に確定している。
        // ここでは乱数を一切引かず、決まった物を出すだけ
        switch (this.dropKind) {
            case 'missile':
                this.game.missileKits.push(new MissileKit(this.game, cx, this.y));
                break;
            case 'overdrive':
                this.game.missileKits.push(new OverdriveKit(this.game, cx, this.y));
                break;
            case 'repair':
                this.game.repairKits.push(new RepairKit(this.game, cx, this.y));
                break;
            case 'autoaim':
                this.game.autoAimUnits.push(new AutoAimUnit(this.game, cx, this.y));
                break;
            default:
                break;
        }
    }

    // ------------------------------------------
    // Drawing (Player-style, color-swapped)
    // ------------------------------------------

    /** 破壊時の破片パーツ。型別の胴体に、死亡時のポーズの脚を足す。 */
    getDebrisParts() {
        return [...attackerBodyParts(this), ...attackerLegParts(this)];
    }

}

// ============================================
// Mixins
// ============================================
//
// 脚や描画など、まとまった機能は別ファイルのオブジェクトリテラルにして
// ここで prototype に混ぜている。`this` の意味は変わらないので、テストが
// インスタンス経由で private を呼ぶ書き方もそのまま通る。
Object.assign(
    EnemyAttacker.prototype,
    AttackerMovement, AttackerCombat, AttackerCollision, AttackerDraw, AttackerLegs,
);

// プロトタイプ既定値。既存テストの一部は `Object.create(EnemyAttacker.prototype)` で
// constructor を通さずインスタンスを作る（emergency-wild-fire.test.js など）ため、
// constructor 内の `this.motion = LAND_MOTION;` だけでは救えない（Player.js と同じ理由）。
EnemyAttacker.prototype.motion = LAND_MOTION;
