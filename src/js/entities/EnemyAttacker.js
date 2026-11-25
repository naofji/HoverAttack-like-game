// ============================================
// EnemyAttacker - Humanoid enemy robot (3 types)
// ============================================

import {
    GRAVITY, AIR_FRICTION, PLAYER_WIDTH,
    PLAYER_HEIGHT, PLAYER_MAX_FALLING_SPEED, PLAYER_STUN_FALL_SPEED,
    LANDING_MIN_AIRBORNE_FRAMES, HOVER_MAX_FUEL, HOVER_FUEL_RECOVERY,
    ATTACKER_BOOST_MAX_FRAMES, EMERGENCY_DEFENSE_BASE_RADIUS, EMERGENCY_DEFENSE_SIGHT_RANGE,
    ENEMY_RECOIL_PROFILES,
    SNOW_KICK_WALK, ENEMY_SNOW_KICK_MIN_SPEED, VIEW_CULL_MARGIN,
    HOVER_JET_BUBBLE_INTERVAL,
} from '../utils/Constants.js';
import { JET_BUBBLE_DROP } from './thrusterFlame.js';
import { spawnItem } from './itemKinds.js';
import { decideAttackerDrop } from '../utils/drops.js';
import { spawnStateRng } from '../utils/spawnState.js';
import { attackerBodyParts, attackerLegParts } from './debris/attackerParts.js';
import { tickRecoil } from '../utils/Recoil.js';
import { playDestruction } from './destruction.js';
import { audioManager } from '../audio/AudioManager.js';
import { applyDamage } from '../utils/damage.js';
import { withinSight } from '../utils/Physics.js';
import { floorSlide, groundSlide, approachVx } from '../utils/surface.js';
import { isInView } from '../utils/viewCull.js';
import { motionFor, LAND_MOTION, sightScaleFor, fallSpeedScaleFor } from '../world/StageEnvironment.js';
import { AttackerLegs } from './attacker/legs.js';
import { HoverMist } from './hoverMist.js';
import { AttackerDraw } from './attacker/draw.js';
import { AttackerCollision } from './attacker/collision.js';
import { AttackerCombat } from './attacker/combat.js';
import { AttackerMovement } from './attacker/movement.js';
import { AttackerAfterimage } from './attacker/afterimage.js';
import { AttackerRollerDash } from './attacker/rollerDash.js';
import { SlopeBody } from './slopeBody.js';
import { WalkerBody } from './walkerBody.js';
import { isCrouched } from './attacker/stance.js';

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
        // 回避の立ち上がりの瞬間加速（rival のみ。attacker/movement.js）
        this.dashTimer = 0;
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
        // 初期状態は**湧いた場所**から決める（utils/spawnState.js のコメントに経緯）。
        // ドロップ（decideAttackerDrop）が既に同じ考え方で位置から引いている
        const spawnRng = spawnStateRng(game, x, y);
        this.facingRight = spawnRng.next() < 0.5;
        this.patrolDir = this.facingRight ? 1 : -1;
        this.fireTimer = Math.floor(spawnRng.next() * config.fireInterval);
        this.aiState = 'patrol'; // 'patrol', 'chase' or 'return'
        this.jumpCooldown = 0;
        this._burstMistFrames = 0; // ジャンプの直後、水面に水滴を舞わせる残りフレーム（_kickHoverWaterMist）
        this._burstSnowPuff = false; // ジャンプで飛び立った直後、雪面に粉雪を 1 回出す印（_kickHoverSnowMist）

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

        // ローラーダッシュ（attacker/rollerDash.js。rollerDash を持つ型だけが使う）
        this.rollerPhase = null;
        this.rollerTimer = 0;
        this.rollerDir = 0;
        this.rollerGlideFrames = 0;
        this.rollerCooldown = 0;
        this._rollerSoundStop = null; // playRollerDash が返す「止める関数」

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
        // 'missile'（既定）か 'mg'（3連射、ATTACKER_MG_BURST_COUNT）。表の行に `weapon` があればそれ。
        // MG 持ちの行（色違い）を渡すのは SpawnManager が standard の一部にだけ
        // （utils/attackerWeapon.js）。ここで決めないのは、面ごとの比率を
        // 機体数の中で正確に出すには「何機目か」を数える必要があるため
        this.weapon = config.weapon ?? 'missile';
        this.mgAimError = 0;   // MG の連射1回ぶんの狙いの外れ（連射の頭で引く）

        // Hover fuel support (used if movementType allows hovering)
        this.hoverFuel = HOVER_MAX_FUEL;
        this.frameCounter = Math.floor(spawnRng.next() * 100);
        // 緊急防衛で基地の周りに散る角度も、位置から決めておく（下の _enterEmergency）
        this.emergencyAngle = spawnRng.next() * Math.PI * 2;
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
            // stacking on one pixel. **スポーン時に位置から決めてある**（毎回変わると
            // 総攻撃の絵が走るたびに違う）
            const angle = this.emergencyAngle;
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
        if (!tickRecoil(this)) {
            // 前フレームの速さは AI が書く前に取っておく。_updateMovement は this.vx を
            // 目標で上書きするので、後から this.vx を読むと「前の速さ＝目標」になって
            // 滑りが消えていた（2026-11-22 に発見。_applyGroundSlide を直接呼ぶテストでは見えなかった）
            const prevVx = this.vx;
            this._updateMovement(target);
            // AI が出した vx は「こう動きたい」。実際に出る速度は床が決める
            // （雪の地形の上では滑るので、止まるのにも曲がるのにも時間がかかる）
            this._applyGroundSlide(this.vx, prevVx);
            // 坂の上の加速（押せば上り、止まれば滑り落ちる。自機と同じ規則。attacker/collision.js）
            this._applyAttackerSlope();
        } else if (this.isRollerDashing()) {
            // 反動中は _updateMovement が来ないので、ここで終わらせないと反動明けに続きを滑る
            this._endRollerDash();
        }

        // --- Hover Fuel Recovery ---
        if (this.onGround) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
            this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;
        }

        // --- Physics ---
        this.motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this.vy += GRAVITY * this.motion.gravity + (this.motion.downforce || 0);
        // 落下の上限は自機と同じ規則（水中は WATER_FALL_SPEED_SCALE 倍）。fallSpeedScaleFor のコメント
        const maxFall = PLAYER_MAX_FALLING_SPEED * fallSpeedScaleFor(this.motion);
        if (this.vy > maxFall) this.vy = maxFall;

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
        this._kickSnow();
        this._kickHoverSnowMist();
        this._kickHoverWaterMist();
        this._emitJetBubbles();
        // 移動が終わったあとの位置と速さを残像の種として残す（rival のみ）
        this._recordAfterimage();
    }

    /**
     * 雪の地形を歩くときの雪煙。自機・戦車と同じ床の規則に従う。
     * 粒は**画面内の敵だけ**（画面外の9割で撒くと particles を食い潰す。
     * 戦車が同じ理由で同じ条件を持っている）。
     */
    _kickSnow() {
        if (!this.game.spawnSnowKick) return;
        // 見るのは**床**の性質。滑らない機体（戦車のような slideScale 0）でも
        // 雪の上を走れば雪煙は上がる、という切り分け
        if (!floorSlide(this, this.game)) return;
        // しきい値が自機より高いのは、巡回の微速で撒き続けさせないため
        if (Math.abs(this.vx) < ENEMY_SNOW_KICK_MIN_SPEED) return;
        if (this.game.camera && this.game.canvas
            && !isInView(this, this.game.camera, this.game.canvas, VIEW_CULL_MARGIN)) return;
        this.game.spawnSnowKick(this.x + this.width / 2, this.y + this.height, SNOW_KICK_WALK);
    }

    /**
     * 水中でホバーしているあいだ、炎の先から泡が舞う（自機の _emitJetBubbles と同じ規則）。
     * kind が 'burst' ならジャンプ（movement.js の _jump）の一吹きで、ホバーも間引きも見ずに1回撒く。
     * 粒は自機と同じく画面内の敵だけ（泡は描画側の上限 WATER_BUBBLE_SPAWNED_MAX を自機と分け合う）
     * @param {'jet'|'burst'} [kind]
     */
    _emitJetBubbles(kind = 'jet') {
        if (!this.game.spawnBubbles) return;
        if (kind === 'jet') {
            if (!this.hovering) return;
            this._jetBubbleTimer = (this._jetBubbleTimer || 0) + 1;
            if (this._jetBubbleTimer % HOVER_JET_BUBBLE_INTERVAL !== 0) return;
        }
        if (this.game.camera && this.game.canvas
            && !isInView(this, this.game.camera, this.game.canvas, VIEW_CULL_MARGIN)) return;
        const n = this._hoverNozzle();
        this.game.spawnBubbles(n.x, n.y + JET_BUBBLE_DROP, kind);
    }

    /**
     * ホバーのノズルの位置（ワールド座標）。x はノズルの中心、y はノズルの下端。
     * 描画（attacker/draw.js）は cfg.flameX/flameY を、向きで反転し（左向きは translate(x+width) +
     * scale(-1, 1)）、しゃがみ（crouching かバースト中）で 4px 下げた座標系に置くので、それをワールドへ写す
     */
    _hoverNozzle() {
        const cfg = this.config;
        const crouchOffset = isCrouched(this) ? 4 : 0;
        return {
            x: this.facingRight ? (this.x + cfg.flameX) : (this.x + this.width - cfg.flameX),
            y: this.y + crouchOffset + cfg.flameY,
        };
    }

    /**
     * AI が決めた「こう動きたい」を、床の性質を通して実際の vx にする。
     * 陸上（slide 0）では目標がそのまま出るので、雪以外の面の挙動は変わらない。
     *
     * **規則は自機と同じ**（Player._updateHorizontal）: 動きたい向きがあるフレームは目標の速さを
     * そのまま出し、止まりたい（目標 0）フレームだけ前の速さに滑りを掛けて惰性で流す。
     * 以前は歩き出しや切り返しも approachVx で追従させる作りだったが、update() の順序の誤りで
     * 一度も効いていなかった。順序を直して追従を効かせると、坂の下り加速（_applyAttackerSlope）が
     * 毎フレーム持ち越されて 下り加速×k/(1−k) まで積み上がり、雪の坂を上れずに坂の下で
     * 止まってしまった（戦車が同じ理由で滑りを外した＝ENEMY_TANK_SLIDE_SCALE 0）。
     * 動いている間は代入にすれば積み上がらない（自機が坂を上れているのと同じ理由）。
     * @param {number} desiredVx AI が出した目標の速さ
     * @param {number} [prevVx] 前フレームの速さ。update() は AI が this.vx を書く前の値を渡す
     *   （_updateMovement が this.vx を目標で上書きするので、後から読むと前の速さ＝目標になる。
     *   2026-11-22 に見つかった「敵の雪の滑りが効いていない」の原因）
     */
    _applyGroundSlide(desiredVx, prevVx = this.vx) {
        // ローラーダッシュは車輪が噛んでいる扱い（rival が出る5面は氷 0.94 なので、
        // 滑らせると急停止の「キィッ」のあとも流れてしまう）
        if (this.isRollerDashing() || desiredVx !== 0) {
            this.vx = desiredVx;
            return;
        }
        this.vx = approachVx(prevVx, 0, groundSlide(this, this.game));
    }

    // ------------------------------------------
    // Damage
    // ------------------------------------------

    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        // 滑走中に倒されたら滑走音を止める（attacker/rollerDash.js）
        if (this.isRollerDashing()) this._endRollerDash();
        this.alive = false;
        playDestruction(this.game, this, 'attacker');
        const cx = this.x + this.width / 2;
        this.game.addScore(this.score);

        // ドロップの中身はスポーン時（decideAttackerDrop）で既に確定している。
        // ここでは乱数を一切引かず、決まった物を出すだけ（null は何も落とさない）。
        // 作り方は格納塔の中身と同じ表（itemKinds.js）。綴りを間違えた種類は黙らず例外になる
        if (this.dropKind) spawnItem(this.game, this.dropKind, cx, this.y);
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
    AttackerAfterimage, AttackerRollerDash, SlopeBody, WalkerBody, HoverMist,
);

// プロトタイプ既定値。既存テストの一部は `Object.create(EnemyAttacker.prototype)` で
// constructor を通さずインスタンスを作る（emergency-wild-fire.test.js など）ため、
// constructor 内の `this.motion = LAND_MOTION;` だけでは救えない（Player.js と同じ理由）。
EnemyAttacker.prototype.motion = LAND_MOTION;
// 坂で積み上がった下りの速さ（attacker/collision.js の _applyAttackerSlope）と坂の向き。
// constructor を通らない経路でも 0 から始まるようにプロトタイプに置く
EnemyAttacker.prototype.slopeVx = 0;
EnemyAttacker.prototype.slopeDir = 0;
EnemyAttacker.prototype._prevOnTerrain = false;
// ホバーの粉雪・水滴は画面内の敵だけ（hoverMist.js。画面外の9割で撒くと particles を食い潰す）
EnemyAttacker.prototype.hoverMistOnScreenOnly = true;
