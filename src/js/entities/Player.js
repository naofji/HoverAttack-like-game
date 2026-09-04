// ============================================
// Player (Attacker Robot)
// ============================================

import {
    TILE_SIZE,
    GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_MAX_SPEED,
    PLAYER_MAX_FALLING_SPEED, PLAYER_STUN_FALL_SPEED, LANDING_MIN_AIRBORNE_FRAMES, PLAYER_STUN_DURATION, PLAYER_MAX_HOVER_SPEED,
    PLAYER_BURST_FORCE,
    HOVER_THRUST, HOVER_THRUST_MIN, HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION,
    BURST_FUEL_CONSUMPTION, BURST_MIN_FUEL, HOVER_FUEL_RECOVERY, HOVER_FUEL_RECOVERY_BOOST,
    HOVER_COOLDOWN_AFTER_BURST,
    PLAYER_MAX_HP, PLAYER_INITIAL_LIVES, PLAYER_RESPAWN_INVINCIBLE_FRAMES,
    
    MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT,
    COLOR_HOVER_EXHAUST,
    PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME, MG_RELOAD_THRESHOLD_DEFAULT,
    DOCK_HP_RATE, DOCK_MISSILE_RATE, DOCK_GRENADE_RATE, DOCK_FUEL_RATE,
    OVERDRIVE_WARN_TICKS, OVERDRIVE_GLOW_RADIUS, OVERDRIVE_BLINK_MS,
    SLOPE_DOWNHILL_ACCEL, SLOPE_UPHILL_SCALE, ICE_MAX_SLIDE_SPEED,
    SNOW_KICK_WALK, SNOW_KICK_LAND, SNOW_KICK_SLIDE, SLOPE_SNAP_COYOTE
} from '../utils/Constants.js';
import { shouldStartMGReload, weaponKeyAction } from '../utils/mgReload.js';
import { collidesWithMap } from '../utils/Physics.js';
import { stairDirection, slopeDrawOffset, supportColumn } from '../utils/slope.js';
import { motionFor, LAND_MOTION } from '../world/StageEnvironment.js';
import { audioManager } from '../audio/AudioManager.js';
import { playerBodyParts, playerLegParts, playerWeaponParts } from './debris/playerParts.js';
import { playDestruction } from './destruction.js';
import { drawThrusterFlame } from './thrusterFlame.js';

/**
 * 歩行4フレーム → 手前脚/奥脚のポーズ番号（_legPose の walkPose に渡す）。
 * フレーム2は直立・停止時。以前は描画と破片生成が同じ表をそれぞれ持っていた。
 */
/**
 * オーバードライブの輝きのグラデーション。
 * [位置, 赤のときのRGB, 金のときのRGB, 不透明度]。
 * 描画専用のパラメータなので Constants ではなくここに置いている。
 */
const OVERDRIVE_GLOW_STOPS = [
    [0, [255, 70, 40], [255, 215, 60], 0.55],
    [0.55, [255, 30, 20], [255, 190, 30], 0.22],
    [1, [255, 0, 0], [255, 180, 0], 0],
];

/** 2色を t で混ぜて rgba 文字列にする。 */
function mixRgba([r1, g1, b1], [r2, g2, b2], t, alpha) {
    const at = (a, b) => Math.round(a + (b - a) * t);
    return `rgba(${at(r1, r2)}, ${at(g1, g2)}, ${at(b1, b2)}, ${alpha})`;
}

const WALK_POSES = [
    { near: 0, far: 1 },
    { near: 2, far: 3 },
    { near: 2, far: 2 }, // Standing straight/idle pose
    { near: 3, far: 2 },
];

/**
 * しゃがみ（およびドッキング中）の固定ポーズ。膝を外に折った形。
 * 歩行やホバーと違って計算で求まらないので、関節座標を直接持つ。
 */
const CROUCH_LEG_JOINTS = [
    { isNear: false, hipX: 7, hipY: 16, kx: 2, ky: 20, fx: 6, fy: 22 },
    { isNear: true, hipX: 10, hipY: 16, kx: 15, ky: 20, fx: 11, fy: 22 },
];

export class Player {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = PLAYER_WIDTH;
        this.height = PLAYER_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.wasOnGround = false;   // 着地音を1回だけ鳴らすための前フレームの接地状態
        this.airborneFrames = 0;    // 連続して宙に浮いていたフレーム数
        // 今フレームの環境係数。update() が毎フレーム引き直すが、docked 中や
        // 描画など update() を通らない経路でも undefined にならないよう陸上で初期化
        this.motion = LAND_MOTION;
        this.slopeDir = 0;      // 今フレームに足が乗っている階段の向き（雪面のみ）
        this.slopeCoyote = 0;   // 段を踏み外した直後、まだ階段の上とみなす残りフレーム
        this.drawOffsetY = 0;   // 45度の線に乗せるための描画だけの縦ずらし
        this.facingRight = true;
        this.alive = true;

        // Resources
        this.hp = PLAYER_MAX_HP;
        this.maxHp = this.hp;
        this.lives = PLAYER_INITIAL_LIVES;
        this.missiles = MISSILE_INITIAL_COUNT;
        this.grenades = GRENADE_INITIAL_COUNT;
        this.hoverFuel = HOVER_MAX_FUEL;
        this.hovering = false;
        this.repairKits = 0;
        this.autoAimTimer = 0;
        this.autoAimMaxTimer = 0;
        // Shift 長押しで立てる一時解除。**真なら必ず autoAimTimer > 0** という
        // 不変条件を _updateAutoAim() が守る（「解除中」は Auto Aim を持っている
        // 間だけ存在する状態で、通常状態に戻ったのに残っていると、次に拾った
        // ときの挙動が「いつ切ったか」で決まってしまう）
        this.autoAimPaused = false;
        // オーバードライブ（heavy のレア版キット）。真の間はミサイルと MG の
        // 弾が減らない。autoAimTimer と同じ形にしてあるので、HUD も減算も同じ作法
        this.overdriveTimer = 0;
        this.overdriveMaxTimer = 0;

        // Docking
        this.docked = false;
        // 新規に作った自機は常に満タン。resupply()/respawn() を通さずに
        // docked = true にされる経路（起動時・ミッション遷移）でも「レディ」が
        // 誤発火しないよう、ここで初期化しておく
        this._dockAllFull = true;

        // Crouching & Stun
        this.crouching = false;
        this.stunTimer = 0;

        // Animation
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.invincibleTimer = 0; // frames of invincibility after respawn
        this.hoverCooldown = 0;   // frames before hover can activate after jump
        this.missileCooldown = 0; // frames before next missile can be fired

        // Machine Gun state
        this.mgBurstLeft = PLAYER_MG_BURST_SIZE;
        this.mgFireTimer = 0;
        this.mgReloadTimer = 0;
        // 「立てる」のは入力処理、「消す」のは読んだ側（シミュレーションティック）。
        // gameSpeed 0.8 では 1 フレームに 0 ティックのことがあるので、立てた
        // フレームで消すとティックに届かないことがある
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;

        // Current weapon ('missile' or 'mg')
        this.currentWeapon = 'missile';
    }

    update() {
        if (!this.alive) return;

        this._updateTimers();
        if (this.docked) {
            this._updateDockedResupply();
            return;
        }

        const input = this.game.input;
        this._updateMGReload(input);
        // 今フレームの環境の係数。中心で1回引いて、この後の重力・推力・位置更新が
        // 全部同じ値を使う（途中で水面をまたいでも同一フレーム内で係数が変わらない）
        this.motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this._updateCrouching(input);
        this._updateHorizontal(input);
        this._applySnowSlope(input);

        this.vy += GRAVITY * this.motion.gravity;

        this._updateBurstHover(input);
        this._updateFuelRecovery(input);
        this._updateSpeedCaps();
        this._updateFacing(input);

        // 着地音は「空中→接地」の遷移で1回だけ鳴らす。onGround を立てる箇所は
        // 地形・母艦の甲板など5つあるので、個別に足すと重複する。
        // 比べる相手は前フレームの結果。_moveAndCollide は毎フレーム冒頭で
        // onGround を false に戻すため、その直前の値では毎フレーム着地になる。
        //
        // ただし遷移だけでは足りない。接地判定は地形の端や動く母艦の甲板の上で
        // 1フレーム単位で途切れ、その都度「着地」になってしまう（動く甲板の上で
        // 3秒間に24回鳴っていた）。実際に宙に浮いていた時間を条件に加える。
        const impactVy = this.vy;
        this._moveAndCollide();
        const landed = !this.wasOnGround && this.onGround;
        if (landed && this.airborneFrames >= LANDING_MIN_AIRBORNE_FRAMES) {
            audioManager.playLanding(impactVy > PLAYER_STUN_FALL_SPEED);
        }
        if (this.motion.slide > 0) this._kickSnow(landed);
        this.airborneFrames = this.onGround ? 0 : this.airborneFrames + 1;
        this.wasOnGround = this.onGround;
        this.drawOffsetY = this.onGround ? slopeDrawOffset(this.slopeDir, this.x + this.width / 2) : 0;

        this._updateWalkAnimation();
    }

    /** Decrement all per-frame timers (runs even while docked). */
    _updateTimers() {
        if (this.invincibleTimer > 0) this.invincibleTimer--;
        if (this.missileCooldown > 0) this.missileCooldown--;
        if (this.mgFireTimer > 0) this.mgFireTimer--;
        if (this.mgReloadTimer > 0) {
            this.mgReloadTimer--;
            if (this.mgReloadTimer === 0) {
                this.mgBurstLeft = PLAYER_MG_BURST_SIZE; // reload finished — refill now
                // 自機の銃なので定位させない（座標を渡さないと中央で鳴る）
                audioManager.playWeapon('reload');
            }
        }
    }

    /** Start an MG reload when the settings and magazine state allow it. */
    _updateMGReload(input) {
        // フラグはこのメソッドが読んだ時点で必ず消す。武器が違う・装填中で
        // 早期 return する経路でも消さないと、次に mg へ戻った瞬間に古い
        // 「切り替えた」が効いてしまう
        const switchedToMG = this.mgSwitchedToMG;
        const manual = this.mgManualReload;
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;

        if (this.currentWeapon !== 'mg' || this.mgReloadTimer > 0) return;
        const fireHeld = input.mouse.left || input.isKeyDown('Space');
        // 設定がまだ無い経路（テストの最小インスタンスなど）では現行どおり自動装填する
        const settings = this.game?.settings;
        const started = shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld, {
            mode: settings?.mgAutoReloadMode ?? 'always',
            threshold: settings?.mgReloadThreshold ?? MG_RELOAD_THRESHOLD_DEFAULT,
            switchedToMG,
            manual,
        });
        if (started) this.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
    }

    /** Update crouching/stun state. */
    _updateCrouching(input) {
        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.crouching = true;
        } else {
            this.crouching = this.onGround && input.isKeyDown('KeyS');
        }
    }

    /** Apply horizontal movement or friction. */
    _updateHorizontal(input) {
        if (this.crouching) {
            if (this.onGround) this.vx = 0;
            return;
        }
        if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) {
            this.vx = -PLAYER_MAX_SPEED;
        } else if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) {
            this.vx = PLAYER_MAX_SPEED;
        } else if (this.onGround) {
            // 陸上は slide=0 で従来どおり即停止。氷では残存率ぶん滑る
            this.vx *= this.motion.slide;
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        } else {
            this.vx *= AIR_FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
    }

    /**
     * 雪の面の斜面（階段）。下りは加速、上りは最高速が落ちる。
     * onGround は前フレームの結果（_moveAndCollide が毎フレーム冒頭で倒す）。
     */
    _applySnowSlope(input) {
        if (this.motion.slide === 0) { this.slopeDir = 0; this.slopeCoyote = 0; return; }
        if (!this.onGround) {
            // 段を踏み外した直後の数フレームは階段の上のままにしておく。
            // 接地判定は足を4px内側で見るため、体が前の段に数px重なったまま「空中」に
            // なる。ここで slopeDir を 0 に落とすと下の吸着が二度と成立せず、
            // 1段16pxの落下を10フレーム待つ動きに戻ってしまう（実測）
            if (this.slopeCoyote > 0) this.slopeCoyote--; else this.slopeDir = 0;
            return;
        }
        this.slopeDir = 0;
        const map = this.game.map;
        const r = Math.floor((this.y + this.height + 1) / TILE_SIZE);
        const c = supportColumn(map, r, this.x, this.x + this.width - 1, this.x + this.width / 2);
        this.slopeDir = stairDirection(map, r, c);
        if (this.slopeDir === 0) { this.slopeCoyote = 0; return; }
        this.slopeCoyote = SLOPE_SNAP_COYOTE;
        const downhill = -this.slopeDir;
        const held = (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) ? -1
            : (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) ? 1 : 0;
        if (held === this.slopeDir) {
            // 上り: 入力の最高速を落とす（_updateHorizontal が ±MAX にした直後）
            this.vx = held * PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE;
        }
        // しゃがみ中もここへ来る（_updateHorizontal が vx=0 にした後に加速が乗る）。
        // 雪の斜面では屈んだまま滑り降りるのが意図した挙動
        this.vx += downhill * SLOPE_DOWNHILL_ACCEL;
        this.vx = Math.max(-ICE_MAX_SLIDE_SPEED, Math.min(ICE_MAX_SLIDE_SPEED, this.vx));
    }

    /** 雪の地上での粒。着地で多め、滑っているあいだは毎フレーム。 */
    _kickSnow(landed) {
        if (!this.game.spawnSnowKick) return;
        const fx = this.x + this.width / 2;
        const fy = this.y + this.height;
        if (landed) { this.game.spawnSnowKick(fx, fy, SNOW_KICK_LAND); return; }
        if (!this.onGround || Math.abs(this.vx) < 0.1) return;
        this.game.spawnSnowKick(fx, fy, this.slopeDir !== 0 ? SNOW_KICK_SLIDE : SNOW_KICK_WALK);
    }

    /** Handle burst jump and hovering. */
    _updateBurstHover(input) {
        this.hovering = false;
        if (this.hoverCooldown > 0) this.hoverCooldown--;

        const wHeld = input.isKeyDown('KeyW');
        if (wHeld && !this.crouching) {
            if (this.onGround && this.hoverFuel >= BURST_MIN_FUEL) {
                // Burst jump
                this.vy = PLAYER_BURST_FORCE;
                this.onGround = false;
                this.hoverFuel -= BURST_FUEL_CONSUMPTION;
                this.hoverCooldown = HOVER_COOLDOWN_AFTER_BURST;
                audioManager.playBurst();
            } else if (this.hoverCooldown <= 0 && this.hoverFuel > 0) {
                // Hover (dynamic thrust based on remaining fuel)
                const fuelRatio = this.hoverFuel / HOVER_MAX_FUEL;
                const thrust = HOVER_THRUST_MIN + (HOVER_THRUST - HOVER_THRUST_MIN) * fuelRatio;
                this.vy += thrust * this.motion.speed; // 水中では浮上がゆっくり
                this.hoverFuel = Math.max(0, this.hoverFuel - HOVER_FUEL_CONSUMPTION);
                this.hovering = true;
                audioManager.playHover(fuelRatio);
            }
        }

        if (!this.hovering) audioManager.stopHover();
    }

    /** Auto-recover hover fuel when not hovering. S key gives a boost (secret). */
    _updateFuelRecovery(input) {
        if (this.hovering || this.hoverFuel >= HOVER_MAX_FUEL) return;

        const carrier = this.game.carrier;
        const nearCarrier = carrier && carrier.alive &&
            Math.abs(this.x - carrier.x) < carrier.width * 2 &&
            Math.abs(this.y - carrier.y) < carrier.height * 2;
        const recoveryRate = (input.isKeyDown('KeyS') && !nearCarrier)
            ? HOVER_FUEL_RECOVERY_BOOST
            : HOVER_FUEL_RECOVERY;
        this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + recoveryRate);
    }

    /** Clamp vertical speed within allowed limits. */
    _updateSpeedCaps() {
        if (this.vy > PLAYER_MAX_FALLING_SPEED) this.vy = PLAYER_MAX_FALLING_SPEED;
        if (this.hovering && this.vy < PLAYER_MAX_HOVER_SPEED) this.vy = PLAYER_MAX_HOVER_SPEED;
    }

    /** Update facing direction based on mouse aim (or auto-aim target). */
    _updateFacing(input) {
        const targetWorld = this.game.autoAimTarget || input.getTargetWorld(this.game.camera);
        this.facingRight = targetWorld.x >= this.x + this.width / 2;
    }

    /** Advance the walk animation frame. */
    _updateWalkAnimation() {
        if (this.onGround && Math.abs(this.vx) > 0.5) {
            this.walkTimer++;
            if (this.walkTimer >= 4) {
                this.walkTimer = 0;
                const forward = (this.facingRight && this.vx > 0) || (!this.facingRight && this.vx < 0);
                this.walkFrame = forward
                    ? (this.walkFrame + 1) % 4
                    : (this.walkFrame - 1 + 4) % 4;
            }
        } else {
            this.walkFrame = 2;
            this.walkTimer = 0;
        }
    }

    /**
     * 速度を位置へ反映し、ぶつかったものから押し戻す。
     *
     * **手順の順番そのものが仕様。** 横をすべて解決してから縦へ入る、
     * マップを見てから母艦・敵を見る、最後に足元を1px 探る ── どれか1つでも
     * 入れ替えると、壁際で母艦に押し込まれたり接地がちらついたりする。
     * 各段は下の private に分けてあるが、**呼ぶ順はここが唯一の記述**。
     *
     * 以前は1メソッド215行で、このリポジトリで唯一の200行超だった。
     * 分けたのは読む範囲を絞るためで、判定そのものは1行も変えていない。
     */
    _moveAndCollide() {
        // --- 横 ---
        const hitHMap = this._moveHorizontalIntoMap();
        if (!hitHMap) this._pushOutOfCarrierHorizontally();
        this._pushOutOfEnemiesHorizontally();

        // --- 縦 ---
        this.y += this.vy * this.motion.speed;
        this.onGround = false;
        this._landOnMapOrHitCeiling();
        this._landOnCarrier();
        this._liftCarrierFromBelow();
        this._landOnEnemy();
        this._probeGroundBelowFeet();
    }


    /**
     * 横方向。マップにぶつかったら、まず1タイルの段差を乗り上げてみて、
     * 駄目ならタイル境界へ吸着して止まる。
     * @returns {boolean} マップに当たって止まったか（母艦の押し出しを飛ばす判断に使う）
     */
    _moveHorizontalIntoMap() {
        this.x += this.vx * this.motion.speed;

        let hitHMap = false;
        if (this._collidesWithMap()) {
            // STEP-UP LOGIC: Try stepping up 1 tile if on ground
            let steppedUp = false;
            if (this.onGround && Math.abs(this.vx) > 0) {
                const originalY = this.y;
                this.y -= TILE_SIZE;
                if (!this._collidesWithMap()) {
                    steppedUp = true;
                    // Successfully stepped up! 
                } else {
                    this.y = originalY; // Could not step up
                }
            }

            if (!steppedUp) {
                hitHMap = true;
                this.x -= this.vx * this.motion.speed;
                if (this.vx > 0) {
                    this.x = Math.floor((this.x + this.width) / TILE_SIZE) * TILE_SIZE - this.width - 0.02;
                } else if (this.vx < 0) {
                    this.x = Math.ceil(this.x / TILE_SIZE) * TILE_SIZE + 0.02;
                }
                this.vx = 0;
            }
        }
        return hitHMap;
    }


    /**
     * 横方向。母艦の側面に当たったら押し出される。母艦が動いてぶつかる場合も含む。
     * **マップに当たって止まったフレームは呼ばない**（_moveAndCollide 側で判断）。
     */
    _pushOutOfCarrierHorizontally() {
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) {
            // If the player overlaps the carrier horizontally AND vertically
            if (this.x < carrier.x + carrier.width &&
                this.x + this.width > carrier.x &&
                this.y < carrier.y + carrier.height &&
                this.y + this.height > carrier.y) {

                // We hit the side of the carrier
                // Push out appropriately
                if (this.vx > 0 || carrier.vx < 0) {
                    // Moving right into carrier OR carrier moving left into us
                    if (this.x + this.width - this.vx <= carrier.x + 4) { // 4px leeway
                        this.x = carrier.x - this.width;
                        this.vx = 0;
                    }
                } else if (this.vx < 0 || carrier.vx > 0) {
                    // Moving left into carrier OR carrier moving right into us
                    if (this.x - this.vx >= carrier.x + carrier.width - 4) {
                        this.x = carrier.x + carrier.width;
                        this.vx = 0;
                    }
                }
            }
        }
    }


    /** 横方向。敵の側面に当たったら押し出される。 */
    _pushOutOfEnemiesHorizontally() {
        for (const enemy of this.game.enemies) {
            if (!enemy.alive) continue;
            // Check horizontal overlap (assuming vertical is overlapping)
            if (this.x < enemy.x + enemy.width &&
                this.x + this.width > enemy.x &&
                this.y < enemy.y + enemy.height &&
                this.y + this.height > enemy.y) {

                if (this.vx > 0) { // Moving right into enemy
                    this.x = enemy.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0) { // Moving left into enemy
                    this.x = enemy.x + enemy.width;
                    this.vx = 0;
                }
            }
        }
    }


    /** 縦方向。マップへの着地（強い落下ならスタン）と天井への衝突。 */
    _landOnMapOrHitCeiling() {
        if (this._collidesWithMap()) {
            if (this.vy > 0) {
                // Landing on map
                if (this.vy > PLAYER_STUN_FALL_SPEED) { // Hard landing threshold
                    this.stunTimer = PLAYER_STUN_DURATION;
                }
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                this.onGround = true;
                this.walkFrame = 2; // Reset to standing straight
            } else if (this.vy < 0) {
                // Hit ceiling
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
                // 天井に当たったらバースト後のクールダウンを解除する。
                //
                // 解除しないと、天井の低い場所では「バースト → 数フレームで
                // 天井 → vy=0 → クールダウンが残っていてホバーに入れない →
                // 落ちて着地 → W を押しっぱなしなのでまたバースト」という
                // 跳ね返りのループになる（実機フィードバック。テストで再現
                // させると200フレームで8回バーストしていた）。
                // プレイヤーの期待は「天井に当たったらそこからホバリングが
                // 始まって張り付く」なので、当たった時点でホバーを許す。
                // ホバーの推力(-0.50)は重力(0.30)を上回るので、W を押している
                // 間は天井に押し付けられ続け、燃料が尽きれば落ちる。
                this.hoverCooldown = 0;
            }
            this.vy = 0;
        }
    }


    /** 縦方向。母艦の甲板に着地する。乗っている間は母艦と一緒に横へ動く。 */
    _landOnCarrier() {
        if (!this.onGround && this.vy > 0) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                // Check if player's bottom edge crosses the carrier's platform
                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy; // Where were we last frame?
                const cPlatformY = carrier.y; // Carrier logical top is roughly its y

                const pLeft = this.x;
                const pRight = this.x + this.width;
                const cPlatformLeft = carrier.x + carrier.platformLeft - 4; // slight leeway
                const cPlatformRight = carrier.x + carrier.platformRight + 4; // slight leeway

                // If player is horizontally within platform, and vertically falling *onto* it
                if (pRight > cPlatformLeft && pLeft < cPlatformRight) {
                    // Check if we just crossed the platform boundary, or if we are embedded in it while falling
                    if (pPrevBottom <= cPlatformY + 4 && pBottom >= cPlatformY) {
                        // Land on carrier
                        if (this.vy > PLAYER_STUN_FALL_SPEED) { // Hard landing threshold
                            this.stunTimer = PLAYER_STUN_DURATION;
                        }
                        this.y = cPlatformY - this.height;
                        this.onGround = true;
                        this.walkFrame = 2; // Reset to standing straight
                        this.vy = 0;

                        // Move with carrier horizontally if standing on it
                        this.x += carrier.vx;
                    }
                }
            }
        }
    }


    /** 縦方向。真下から母艦の底面を押し上げる。 */
    _liftCarrierFromBelow() {
        if (!this.docked && this.vy < 0) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                const cBottom = carrier.y + carrier.height;
                const hOverlap = this.x + this.width > carrier.x && this.x < carrier.x + carrier.width;
                // 頭がキャリア底面に入り込み、かつ足はまだ底面以下にある（真下からの衝突）
                if (hOverlap && this.y < cBottom && this.y + this.height >= cBottom) {
                    this.y = cBottom;           // 頭をキャリア底面にスナップ（プレイヤーはキャリアに追従）
                    carrier.vy = this.vy * 0.5; // キャリアは重いので半分の速度で持ち上がる
                    carrier.vx = this.vx;       // 持ち上げ中はプレイヤーの左右移動に追従
                }
            }
        }
    }


    /** 縦方向。敵の頭の上に着地する。乗っている間は敵と一緒に横へ動く。 */
    _landOnEnemy() {
        if (!this.onGround && this.vy > 0) {
            for (const enemy of this.game.enemies) {
                if (!enemy.alive) continue;

                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy;
                const eTop = enemy.y;

                if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                    // Falling onto the enemy
                    if (pPrevBottom <= eTop + 4 && pBottom >= eTop) {
                        this.y = eTop - this.height;
                        this.onGround = true;
                        this.walkFrame = 2;
                        this.vy = 0;
                        // Move with enemy horizontally if standing on it
                        this.x += enemy.vx || 0;
                        break; // Landed on one enemy, no need to check others
                    }
                }
            }
        }
    }


    _probeGroundBelowFeet() {
        const map = this.game.map;
        // 雪の階段を下るとき: 足元の1段下が床なら落下を待たず吸着する
        // （段を跳ねる動きが消え、描画オフセットと合わせて斜面を滑って見える）
        if (!this.onGround && this.vy >= 0 && this.motion.slide > 0 && this.slopeDir !== 0) {
            const probeY = this.y + this.height + TILE_SIZE + 1;
            const cx = this.x + this.width / 2;
            if (map.isSolidAtPixel(cx, probeY) && !map.isSolidAtPixel(cx, probeY - TILE_SIZE)) {
                // 吸着先で地形にめり込まないことを確かめてから移す。中心の1点だけ見て
                // 落とすと、体の左半分がまだ1段高い段に乗っているうちに下ろしてしまい、
                // 次のフレームに押し戻されて 184⇔200 と16px往復する（実測）
                const prevY = this.y;
                this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
                if (!this._collidesWithMap()) {
                    this.onGround = true;
                    this.vy = 0;
                    return;
                }
                this.y = prevY;
            }
        }
        // Extra ground probe: check 1px below feet if vy is ~0 (standing still or falling slightly)
        // This prevents the "not grounded" flicker when standing on a surface,
        // but it must NOT trigger when moving upward (vy < 0) otherwise slow hover gets stuck to the ground.
        if (!this.onGround && this.vy >= 0 && this.vy < 0.5) {
            const probeY = this.y + this.height + 1;
            const leftFoot = map.isSolidAtPixel(this.x + 4, probeY);
            const rightFoot = map.isSolidAtPixel(this.x + this.width - 4, probeY);
            if (leftFoot || rightFoot) {
                this.onGround = true;
                this.vy = 0;
                // Snap to surface
                this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
            } else {
                // Also check if standing on an enemy directly below
                for (const enemy of this.game.enemies) {
                    if (!enemy.alive) continue;
                    if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                        if (Math.abs(probeY - enemy.y) < 2) {
                            this.onGround = true;
                            this.vy = 0;
                            this.y = enemy.y - this.height;
                            break;
                        }
                    }
                }
            }
        }
    }

    _collidesWithMap() {
        return collidesWithMap(this, this.game.map);
    }

    takeDamage(amount) {
        if (!this.alive || this.invincibleTimer > 0) return;
        // デバッグ用の無敵モード（main.js の debugInvincible）。ダメージの入口は
        // 弾もミサイルもグレネードも地雷も衝突も最終的にここへ集まるので、
        // 経路ごとに手当てせずここ1箇所で止められる
        if (this.game.debugInvincible) return;

        this.hp -= amount;
        this.game.spawnHeavyDamage(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    /**
     * HP を回復する。最大値で頭打ち、死んでいるときは何もしない。
     * ドッキング中の自然回復とリペアキットの両方から呼べるよう、
     * 「HP を増やす」をここ1箇所にまとめてある。
     */
    heal(amount) {
        if (!this.alive) return;
        this.hp = Math.min(PLAYER_MAX_HP, this.hp + amount);
    }

    /** オーバードライブが効いているか。判定を1か所に閉じておく。 */
    get overdriveActive() { return this.overdriveTimer > 0; }

    /**
     * ミサイルを1発消費する。
     * デバッグ用の無敵モード中は減らさない（撃ち放題）。
     * 弾数を減らす箇所が main.js に散っていたので、Player 側にまとめた。
     */
    consumeMissile(n = 1) {
        if (this.game.debugInvincible || this.overdriveActive) return;
        this.missiles = Math.max(0, Math.floor(this.missiles) - n);
    }

    /**
     * MG を1発消費する。
     *
     * オーバードライブ中は減らさない。**これだけで打ちっぱなしになる** のが要点で、
     * mgReload.js の6つの規則には一切触っていない。残弾が満タンのままなら
     * 規則1（弾切れ）も規則4（しきい値）も成立せず、装填が始まらない。
     * F の手動装填も burstLeft < burstSize が偽になって空振りする。
     */
    consumeMGRound(n = 1) {
        if (this.overdriveActive) return;
        this.mgBurstLeft = Math.max(0, this.mgBurstLeft - n);
    }

    /** グレネードを1発消費する。無敵モード中は減らさない。 */
    consumeGrenade(n = 1) {
        if (this.game.debugInvincible) return;
        this.grenades = Math.max(0, Math.floor(this.grenades) - n);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'player');
        audioManager.playPlayerDestroyed();
        this.lives--;

        // Release lock-on when dead
        if (this.game.input) {
            this.game.input.crosshairLocked = false;
        }
    }

    respawn(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.wasOnGround = false;
        this.airborneFrames = 0;
        this.hp = PLAYER_MAX_HP;
        this.missiles = MISSILE_INITIAL_COUNT;
        this.grenades = GRENADE_INITIAL_COUNT;
        this.hoverFuel = HOVER_MAX_FUEL;
        this.repairKits = 0;
        this.autoAimTimer = 0;
        this.autoAimMaxTimer = 0;
        this.autoAimPaused = false;
        this.overdriveTimer = 0;
        this.overdriveMaxTimer = 0;
        this.alive = true;
        this.docked = true;
        this.invincibleTimer = PLAYER_RESPAWN_INVINCIBLE_FRAMES;

        // Reset all transient states
        this.hovering = false;
        this.crouching = false;
        this.stunTimer = 0;
        this.hoverCooldown = 0;
        this.missileCooldown = 0;
        this.walkFrame = 2;
        this.walkTimer = 0;
        this._resetMGState();

        audioManager.stopHover();
        audioManager.stopRepairHum();
        this._dockAllFull = this._isFullyStocked();
        this.currentWeapon = 'missile';
    }

    /**
     * `F` を押した1フレームの処理。**規則は utils/mgReload.js の weaponKeyAction に
     * 置いてある** — main.js に分岐を書くと、切り替えとリロードの境目が2箇所に散る。
     *
     * 手動リロードを受け付けたときだけ playSwitch() を鳴らす。従来もミサイル 0 で F を
     * 押せば（意味のない切り替えでも）この音が鳴っていたので、押した手応えが変わらない。
     * 受け付けないとき（満タン・装填中）は無音にして、効かなかったことを耳で伝える。
     */
    pressWeaponKey() {
        // currentWeapon === 'missile' を先に見るのが要点。設計時は「ミサイルが 0 のとき
        // currentWeapon は _fireMissile() が必ず 'mg' に戻す」という前提で
        // weaponKeyAction(this.missiles) だけを見ていたが、それは自力で撃ち切った経路
        // にしか成り立たない。autoSwitchMissile 設定 ON でドックすると main.js が
        // currentWeapon を 'missile' に固定し、missiles はゆっくり補充されるので、
        // 補充が終わる前に undock すると currentWeapon === 'missile' かつ missiles === 0
        // のまま取り残る。この状態で weaponKeyAction(0) は 'reload' を返し、
        // F がミサイル発射機を持ったまま無反応（reload 要求は mg の武器ガードで
        // 無音のまま捨てられる）になっていた
        if (this.currentWeapon === 'missile' || weaponKeyAction(this.missiles) === 'switch') {
            this.switchWeapon();
            return;
        }
        if (this.mgReloadTimer > 0 || this.mgBurstLeft >= PLAYER_MG_BURST_SIZE) return;
        this.mgManualReload = true;
        audioManager.playSwitch();
    }

    /** Toggles between Missile and Machine Gun */
    switchWeapon() {
        if (this.currentWeapon === 'missile') {
            this.currentWeapon = 'mg';
            // 「武器切り替え時」の装填はここが起点。_fireMissile() がミサイル切れで
            // 勝手に mg へ戻す経路では立てない — ゲーム側が戻したのは切り替えではない
            this.mgSwitchedToMG = true;
        } else {
            this.currentWeapon = 'missile';
        }
        audioManager.playSwitch();
    }

    /** Called every frame while docked — gradually restores HP, ammo, and fuel. */
    _updateDockedResupply() {
        // Rates are defined per real-time frame; sim frames tick gameSpeed× slower
        // in NORMAL mode, so scale up to keep resupply seconds equal across modes.
        const scale = 1 / (this.game.gameSpeed || 1);

        // 回復・装填はそれぞれ音を持つ。補給が進んでいることを耳で追えるように、
        // 「1発入った」瞬間と「満ちた」瞬間をここで拾う
        if (this.hp < PLAYER_MAX_HP) {
            this.hp = Math.min(PLAYER_MAX_HP, this.hp + DOCK_HP_RATE * scale);
            if (this.hp < PLAYER_MAX_HP) {
                audioManager.startRepairHum(this.hp / PLAYER_MAX_HP);
            } else {
                audioManager.stopRepairHum();
            }
        }
        // Math.floor(x) > before は1フレームにつき最大1回しか鳴らせない。
        // 装填レートが 1発/フレーム 未満である前提（現状は最大でも約0.13発/フレーム）が崩れると、
        // 1フレームで2発以上進んだ分のクリックを取りこぼす
        if (this.missiles < MISSILE_INITIAL_COUNT) {
            const before = Math.floor(this.missiles);
            this.missiles = Math.min(MISSILE_INITIAL_COUNT, this.missiles + DOCK_MISSILE_RATE * scale);
            if (Math.floor(this.missiles) > before) audioManager.playWeapon('ammoMissile');
        }
        if (this.grenades < GRENADE_INITIAL_COUNT) {
            const before = Math.floor(this.grenades);
            this.grenades = Math.min(GRENADE_INITIAL_COUNT, this.grenades + DOCK_GRENADE_RATE * scale);
            if (Math.floor(this.grenades) > before) audioManager.playWeapon('ammoGrenade');
        }
        if (this.hoverFuel < HOVER_MAX_FUEL) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + DOCK_FUEL_RATE * scale);
        }

        // 全部満ちた瞬間に一度だけ。満タンで居続けても、ドックした時点で既に
        // 満タンでも鳴らさない（_dockAllFull はドック成立時に現状で初期化される）
        const full = this._isFullyStocked();
        if (full && !this._dockAllFull) audioManager.playWeapon('readyVoice');
        this._dockAllFull = full;
    }

    /** 補給するものが何も残っていないか。 */
    _isFullyStocked() {
        return this.hp >= PLAYER_MAX_HP
            && this.missiles >= MISSILE_INITIAL_COUNT
            && this.grenades >= GRENADE_INITIAL_COUNT
            && this.hoverFuel >= HOVER_MAX_FUEL;
    }

    /** Resupply all resources (when docking). */
    resupply() {
        // Weapon state is reset immediately on dock; actual HP/ammo/fuel
        // are restored gradually each frame via _updateDockedResupply().
        this._resetMGState();
        // 満タンでドックしたときに「レディ」を鳴らさないよう、今の状態で初期化する
        this._dockAllFull = this._isFullyStocked();
    }

    /** Reset machine-gun burst/reload counters to factory defaults. */
    _resetMGState() {
        this.mgBurstLeft = PLAYER_MG_BURST_SIZE;
        this.mgFireTimer = 0;
        this.mgReloadTimer = 0;
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;
    }

    /** 破壊時の破片パーツ。静的部位に、死亡時のポーズを焼き込んだ脚と武装を足す。 */
    getDebrisParts() {
        return [
            ...playerBodyParts(this),
            ...playerLegParts(this),
            ...playerWeaponParts(this),
        ];
    }

    draw(ctx) {
        if (!this.alive) return;

        // Blinking during invincibility
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 3) % 2 === 0) {
            return;
        }

        // 45度の斜面に乗って見せるための縦ずらし。当たり判定は動かさず描画だけ。
        // 点滅の早期 return より後に save するので、restore は末尾の1回で足りる
        ctx.save();
        ctx.translate(0, this.drawOffsetY);

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const isCrouched = this.crouching || this.docked;
        const crouchOffset = isCrouched ? 8 : 0;

        // 機体より先に描いて「背後から漏れる光」にする。手前に描くと
        // 機体そのものが赤く塗り潰されて、被弾の点滅と紛らわしい
        this._drawOverdriveGlow(ctx);
        this._drawBody(ctx, x, y, isCrouched, crouchOffset);
        if (!isCrouched) {
            if (this.currentWeapon === 'missile') {
                this._drawBazooka(ctx, x, y, crouchOffset);
            } else {
                this._drawMachineGun(ctx, x, y, crouchOffset);
            }
        }
        this._drawHoverExhaust(ctx);
        ctx.restore();
    }

    /**
     * オーバードライブ中の輝き。
     *
     * HUD の残時間バーだけだと視線を下へ外さないと状態が読めないので、
     * 機体そのものにも出す。
     *
     * 効いている間は**金と赤を速く往復**する。金はアイテムの色、赤は過負荷で
     * 焼けている色で、2色が入れ替わり続けることで「無理をして回っている」絵になる。
     * 残り3秒（OVERDRIVE_WARN_TICKS）を切ると**金の成分が残り時間に比例して
     * 抜けていき**、最後は赤だけの明滅になる。効果そのものが色として失われていく
     * ので、しきい値でいきなり演出が切り替わるより読みやすい。
     *
     * 赤一色になっても点滅は続ける必要がある（止まると「切れた」と誤読される）
     * ので、金が抜けるぶんは濃さの差に振り替えている。
     */
    _drawOverdriveGlow(ctx) {
        if (this.overdriveTimer <= 0) return;

        // 金の残り具合。しきい値より前は満量、そこから 0 へ落ちる
        const goldMix = Math.min(1, this.overdriveTimer / OVERDRIVE_WARN_TICKS);
        // 往復の片側だけを金に寄せる。もう片側は常に赤
        const goldPhase = Math.floor(Date.now() / OVERDRIVE_BLINK_MS) % 2 === 1;
        const mix = goldPhase ? goldMix : 0;
        // 金が抜けきったときに点滅が消えないよう、濃さの差へ振り替える
        const dim = goldPhase ? 0.35 + 0.65 * goldMix : 1;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const radius = this.width * OVERDRIVE_GLOW_RADIUS;

        ctx.save();
        // lighter で重ねると地形の上でも色が沈まない（コアの bloom と同じ手）
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        for (const [stop, red, gold, alpha] of OVERDRIVE_GLOW_STOPS) {
            g.addColorStop(stop, mixRgba(red, gold, mix, alpha * dim));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawBody(ctx, x, y, isCrouched, crouchOffset) {
        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        // Body
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(5, 4 + crouchOffset, 10, isCrouched ? 8 : 12);

        // Head
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(6, crouchOffset, 8, 5);
        // Visor
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(10, 1 + crouchOffset, 3, 3);

        // Backpack (hover unit)
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(2, 5 + crouchOffset, 4, isCrouched ? 6 : 8);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(2, (isCrouched ? 10 : 12) + crouchOffset, 4, 2);

        // Legs
        this._drawLegs(ctx, isCrouched);

        ctx.restore();
    }

    _drawLegs(ctx, isCrouched) {
        const joints = this._legJoints(isCrouched);
        if (isCrouched) {
            this._drawCrouchedLegs(ctx, joints);
        } else {
            // 奥脚を先に描く（手前脚が上に重なる）
            for (const j of joints) this._drawSingleLeg(ctx, j);
        }
    }

    /**
     * しゃがみの脚。関節は _legJoints() と同じ座標を使うが、
     * 見た目は通常の脚と別物にしてある。両脚とも同じ明るさで描き（しゃがむと
     * 奥行きが潰れるため）、足は振り子で回らない固定の板を左右に並べる。
     */
    _drawCrouchedLegs(ctx, joints) {
        ctx.strokeStyle = '#DDDDDD';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const j of joints) {
            ctx.beginPath();
            ctx.moveTo(j.hipX, j.hipY);
            ctx.lineTo(j.kx, j.ky);
            ctx.lineTo(j.fx, j.fy);
            ctx.stroke();
        }

        // Feet
        ctx.fillStyle = '#888888';
        ctx.fillRect(4, 21, 5, 3);
        ctx.fillRect(9, 21, 5, 3);
    }

    /**
     * 脚1本の関節座標を求める（描画はしない）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * @param {boolean} isNear 手前脚か
     * @param {number|null} walkPose 歩行ポーズ番号。ホバー中は null
     * @param {number|null} hoverSwing ホバー中の振り子量 -1..+1。接地中は null
     * @returns {{hipX:number,hipY:number,kx:number,ky:number,fx:number,fy:number}}
     */
    _legPose(isNear, walkPose, hoverSwing) {
        const hipX = isNear ? 10 : 7;
        const hipY = 16;
        let kx, ky, fx, fy;

        if (hoverSwing !== null) {
            const maxAngle = Math.PI / 4;
            const angle = hoverSwing * maxAngle;
            const baseKx = isNear ? 1 : -1;
            const baseKy = 3;
            const baseFx = isNear ? 0 : -2;
            const baseFy = 6;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            kx = hipX + (baseKx * cosA - baseKy * sinA);
            ky = hipY + (baseKx * sinA + baseKy * cosA);
            fx = hipX + (baseFx * cosA - baseFy * sinA);
            fy = hipY + (baseFx * sinA + baseFy * cosA);
        } else {
            switch (walkPose) {
                case 0: kx = hipX + 2; ky = hipY + 3; fx = kx + 2; fy = 22; break;
                case 1: kx = hipX - 3; ky = hipY + 3; fx = kx - 2; fy = 20; break;
                case 2: kx = hipX; ky = hipY + 3; fx = kx; fy = 22; break;
                case 3: kx = hipX + 4; ky = hipY + 1; fx = kx - 1; fy = 19; break;
            }
        }

        return { hipX, hipY, kx, ky, fx, fy };
    }

    /**
     * 死亡時の両脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    /**
     * ホバー中の両脚の振り子量。奥脚は位相をずらして左右が揃わないようにする。
     * @returns {Array<[boolean, number]>} [手前脚か, 振り子量 -1..+1]
     */
    _hoverSwings() {
        let localVx = this.facingRight ? this.vx : -this.vx;
        localVx = Math.max(-PLAYER_MAX_SPEED, Math.min(PLAYER_MAX_SPEED, localVx));
        const swing = localVx / PLAYER_MAX_SPEED;
        return [[false, swing * 0.8 - 0.2], [true, swing]];
    }

    /**
     * いまのポーズの両脚の関節座標を、描く順（奥脚→手前脚）で返す。
     * 描画（_drawLegs）と破片生成（_collectLegPoses）の唯一の供給元。
     *
     * @param {boolean} isCrouched しゃがみ姿勢か。draw() の判定をそのまま渡す
     * @returns {Array<{isNear:boolean, hipX:number, hipY:number, kx:number,
     *   ky:number, fx:number, fy:number, walkPose:number|null,
     *   hoverSwing:number|null}>}
     */
    _legJoints(isCrouched) {
        if (isCrouched) {
            return CROUCH_LEG_JOINTS.map((j) => ({ ...j, walkPose: null, hoverSwing: null }));
        }

        if (!this.onGround) {
            return this._hoverSwings().map(([isNear, hoverSwing]) => ({
                isNear, walkPose: null, hoverSwing,
                ...this._legPose(isNear, null, hoverSwing),
            }));
        }

        const frame = WALK_POSES[this.walkFrame] || WALK_POSES[2];
        return [[false, frame.far], [true, frame.near]].map(([isNear, walkPose]) => ({
            isNear, walkPose, hoverSwing: null,
            ...this._legPose(isNear, walkPose, null),
        }));
    }

    /**
     * 死亡時の両脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * 座標そのものは _legJoints() が決める（描画と同じ値）。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        return this._legJoints(this.crouching || this.docked).map((j) => ({
            isNear: j.isNear,
            hipX: j.hipX, hipY: j.hipY,
            kneeX: j.kx, kneeY: j.ky,
            footX: j.fx, footY: j.fy,
            lineWidth: 3,
        }));
    }

    /** 脚1本を描く。関節座標は _legJoints() が決めたものをそのまま使う。 */
    _drawSingleLeg(ctx, joint) {
        const { isNear, hipX, hipY, kx, ky, fx, fy, hoverSwing } = joint;

        // Leg stroke
        ctx.strokeStyle = isNear ? '#DDDDDD' : '#AAAAAA';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();

        // Foot
        ctx.fillStyle = isNear ? '#888888' : '#666666';
        ctx.save();
        ctx.translate(fx, fy);
        if (hoverSwing !== null) {
            ctx.rotate(hoverSwing * Math.PI / 6);
        }
        ctx.fillRect(-2, 0, 5, 2);
        ctx.restore();
    }

    /**
     * 武装の向き（機体ローカル、ラジアン）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * 照準情報が取れない場合（テスト等）は水平前方を返す。
     * @param {number} crouchOffset
     */
    _aimAngle(crouchOffset) {
        const input = this.game && this.game.input;
        if (!input || typeof input.getTargetWorld !== 'function') return 0;

        const targetWorld = input.getTargetWorld(this.game.camera);
        const cx = Math.round(this.x) + this.width / 2;
        const cy = Math.round(this.y) + 6 + crouchOffset;
        const raw = Math.atan2(targetWorld.y - cy, targetWorld.x - cx);
        return this.facingRight ? raw : Math.PI - raw;
    }

    _drawBazooka(ctx, x, y, crouchOffset) {
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;
        const rawAngle = this._aimAngle(crouchOffset);

        ctx.save();
        if (this.facingRight) {
            ctx.translate(cx + 2, cy);
        } else {
            ctx.translate(cx - 2, cy);
            ctx.scale(-1, 1);
        }
        ctx.rotate(rawAngle);

        // Tube
        ctx.fillStyle = '#666666';
        ctx.fillRect(-8, -2, 22, 4);
        // Muzzle
        ctx.fillStyle = '#444444';
        ctx.fillRect(11, -3, 4, 6);
        // Shoulder mount
        ctx.fillStyle = '#999999';
        ctx.fillRect(-3, -3, 6, 6);
        // Detail stripe
        ctx.fillStyle = '#808080';
        ctx.fillRect(-6, -1, 16, 2);

        ctx.restore();
    }

    _drawMachineGun(ctx, x, y, crouchOffset) {
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;
        const rawAngle = this._aimAngle(crouchOffset);

        ctx.save();
        if (this.facingRight) {
            ctx.translate(cx + 2, cy);
        } else {
            ctx.translate(cx - 2, cy);
            ctx.scale(-1, 1);
        }
        ctx.rotate(rawAngle);

        // Receiver / Body
        ctx.fillStyle = '#777777';
        ctx.fillRect(-2, -2, 7, 5);
        // Barrel (shorter and thinner than bazooka)
        ctx.fillStyle = '#666666';
        ctx.fillRect(5, -1, 6, 2);
        // Magazine (vertical box)
        ctx.fillStyle = '#555555';
        ctx.fillRect(0, 2, 3, 4);
        // Stock / Grip
        ctx.fillStyle = '#888888';
        ctx.fillRect(-4, -1, 3, 3);

        ctx.restore();
    }

    _drawHoverExhaust(ctx) {
        if (!this.hovering) return;

        // ノズルの位置は _drawBody() が描く橙のノズル矩形
        // fillRect(2, 12, 4, 2)（ローカル座標、しゃがみ中はここを呼ばない）から直接出す。
        // _drawBody() は右向き translate(x, y)、左向き translate(x+width, y) + scale(-1, 1)
        // なので、ワールド座標での中心 x はノズル矩形の中心 (2+4/2=4) を向きに応じて
        // 場合分けする必要がある（右向き: x+4、左向き: x+width-4）。上端 y はノズル
        // 矩形の下端 (12+2=14) で揃える（描画専用の値なので、敵側の
        // drawThrusterFlame(ctx, 4, 14 - crouchOffset, ...) と同じくコードに直接書く）。
        // 旧実装は向きで x のずれ幅が違い（-4px と +2px）、振り向くたびに炎が横へ飛んでいた。
        const nozzleX = this.facingRight ? (this.x + 4) : (this.x + this.width - 4);
        // 残燃料で実際の推力が変わる（HOVER_THRUST → HOVER_THRUST_MIN）ので、
        // 炎の長さも同じ比に合わせる。ホバー音も playHover(fuelRatio) で同じ値を
        // 受けているため、炎・音・推力が1つの値を指すことになる
        const fuelRatio = this.hoverFuel / HOVER_MAX_FUEL;
        drawThrusterFlame(ctx, nozzleX, this.y + 14, {
            color: COLOR_HOVER_EXHAUST,
            power: fuelRatio,
        });
    }
}

// プロトタイプ既定値。既存テストの一部は `Object.create(Player.prototype)` で
// constructor を通さずインスタンスを作る（carrier-lift.test.js）ため、
// constructor 内の `this.motion = LAND_MOTION;` だけでは救えない。
// プロトタイプ側にも既定を置き、update() を一度も呼んでいない・constructor も
// 通っていない経路でも motion が undefined にならないようにする。
Player.prototype.motion = LAND_MOTION;
