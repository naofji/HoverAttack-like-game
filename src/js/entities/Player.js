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
    PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME,
    DOCK_HP_RATE, DOCK_MISSILE_RATE, DOCK_GRENADE_RATE, DOCK_FUEL_RATE
} from '../utils/Constants.js';
import { shouldStartMGReload } from '../utils/mgReload.js';
import { collidesWithMap } from '../utils/Physics.js';
import { audioManager } from '../audio/AudioManager.js';
import { playerBodyParts, playerLegParts, playerWeaponParts } from './debris/playerParts.js';
import { playDestruction } from './destruction.js';
import { drawThrusterFlame } from './thrusterFlame.js';

/**
 * 歩行4フレーム → 手前脚/奥脚のポーズ番号（_legPose の walkPose に渡す）。
 * フレーム2は直立・停止時。以前は描画と破片生成が同じ表をそれぞれ持っていた。
 */
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
        this._updateCrouching(input);
        this._updateHorizontal(input);

        this.vy += GRAVITY;

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
        this.airborneFrames = this.onGround ? 0 : this.airborneFrames + 1;
        this.wasOnGround = this.onGround;

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

    /** Start an MG reload when the magazine is low and the trigger allows it. */
    _updateMGReload(input) {
        if (this.currentWeapon !== 'mg' || this.mgReloadTimer > 0) return;
        const fireHeld = input.mouse.left || input.isKeyDown('Space');
        // 設定がまだ無い経路（テストの最小インスタンスなど）では現行どおり自動装填する
        const autoReload = this.game?.settings?.mgAutoReload ?? true;
        if (shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld, autoReload)) {
            this.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
        }
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
            this.vx = 0;
        } else {
            this.vx *= AIR_FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
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
                this.vy += thrust;
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

    _moveAndCollide() {
        const map = this.game.map;

        // Horizontal collision
        this.x += this.vx;

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
                this.x -= this.vx;
                if (this.vx > 0) {
                    this.x = Math.floor((this.x + this.width) / TILE_SIZE) * TILE_SIZE - this.width - 0.02;
                } else if (this.vx < 0) {
                    this.x = Math.ceil(this.x / TILE_SIZE) * TILE_SIZE + 0.02;
                }
                this.vx = 0;
            }
        }

        // Horizontal Carrier Collision
        if (!hitHMap) {
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

        // Horizontal Enemy Collision
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

        // Vertical collision
        this.y += this.vy;
        this.onGround = false;

        // 1. Check Map Collision
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
            }
            this.vy = 0;
        }

        // 2. Check Carrier Collision (only when falling and not already grounded on map)
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

        // 2b. Lift carrier from below
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

        // 3. Check Enemy Vertical Collision
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

        this.hp -= amount;
        this.game.spawnHeavyDamage(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
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

    /** Toggles between Missile and Machine Gun */
    switchWeapon() {
        if (this.currentWeapon === 'missile') {
            this.currentWeapon = 'mg';
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

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const isCrouched = this.crouching || this.docked;
        const crouchOffset = isCrouched ? 8 : 0;

        this._drawBody(ctx, x, y, isCrouched, crouchOffset);
        if (!isCrouched) {
            if (this.currentWeapon === 'missile') {
                this._drawBazooka(ctx, x, y, crouchOffset);
            } else {
                this._drawMachineGun(ctx, x, y, crouchOffset);
            }
        }
        this._drawHoverExhaust(ctx);
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
