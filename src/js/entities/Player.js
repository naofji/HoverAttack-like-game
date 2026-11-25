// ============================================
// Player (Attacker Robot)
// ============================================

import {
    GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_MAX_SPEED,
    PLAYER_MAX_FALLING_SPEED, PLAYER_STUN_FALL_SPEED, LANDING_MIN_AIRBORNE_FRAMES, PLAYER_MAX_HOVER_SPEED,
    SPIDER_WEB_ENTANGLE_FRAMES, PLAYER_RECOIL_FRAMES, SPIDER_WEB_SLOW, SPIDER_WEB_SHAKE_FRAMES, SPIDER_WEB_JOLT_FRAMES, SPIDER_WEB_CLING_RADIUS, SPIDER_WEB_CLING_MIN_RADIUS,
    PLAYER_BURST_FORCE,
    HOVER_THRUST, HOVER_THRUST_MIN, HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION,
    BURST_FUEL_CONSUMPTION, BURST_MIN_FUEL, HOVER_FUEL_RECOVERY, HOVER_FUEL_RECOVERY_BOOST,
    HOVER_COOLDOWN_AFTER_BURST,
    PLAYER_MAX_HP, PLAYER_INITIAL_LIVES, PLAYER_RESPAWN_INVINCIBLE_FRAMES, EXTRA_LIFE_FLASH_FRAMES,
    MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT,
    PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME, MG_RELOAD_THRESHOLD_DEFAULT,
    DOCK_HP_RATE, DOCK_MISSILE_RATE, DOCK_GRENADE_RATE, DOCK_FUEL_RATE,
    SLOPE_UPHILL_SCALE,
    SNOW_KICK_WALK, SNOW_KICK_LAND, SNOW_KICK_SLIDE,
    HOVER_WATER_MIST_BURST_FRAMES,
} from '../utils/Constants.js';
import { shouldStartMGReload, weaponKeyAction } from '../utils/mgReload.js';
import { SlopeBody } from './slopeBody.js';
import { WalkerBody } from './walkerBody.js';
import { HoverMist } from './hoverMist.js';
import { floorSlide, groundSlide } from '../utils/surface.js';
import { motionFor, LAND_MOTION, fallSpeedScaleFor } from '../world/StageEnvironment.js';
import { audioManager } from '../audio/AudioManager.js';
import { playerBodyParts, playerLegParts, playerWeaponParts } from './debris/playerParts.js';
import { playDestruction } from './destruction.js';
import { PlayerDraw } from './player/draw.js';
import { PlayerCollision } from './player/collision.js';
import { WebScrap } from './SpiderWeb.js';

export class Player {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = PLAYER_WIDTH;
        this.height = PLAYER_HEIGHT;
        // 接地面が地形か。滑りと雪煙がこれを見る（utils/surface.js）。復活では戻さない（毎フレーム決め直す）
        this.onTerrain = false;
        // 今フレームの環境係数。update() が毎フレーム引き直すが、docked 中や
        // 描画など update() を通らない経路でも undefined にならないよう陸上で初期化
        this.motion = LAND_MOTION;
        this.facingRight = true;   // 復活では戻さない（前の命の向きのまま出る）
        this.maxHp = PLAYER_MAX_HP;
        this.lives = PLAYER_INITIAL_LIVES;

        // Docking
        this.docked = false;
        // 新規に作った自機は常に満タン。resupply()/respawn() を通さずに
        // docked = true にされる経路（起動時・ミッション遷移）でも「レディ」が
        // 誤発火しないよう、ここで初期化しておく
        this._dockAllFull = true;
        this.invincibleTimer = 0; // frames of invincibility after respawn

        this._resetLifeState();
    }

    /**
     * 1機ぶんの命の状態（速さ・接地・資源・Auto Aim・オーバードライブ・しゃがみ・スタン・糸・反動・
     * 歩きの絵・噴射の印・武器）を出撃時の値に戻す。constructor と respawn() の両方が呼ぶ。
     * 以前は2か所に同じ約40行を書いていて、一時状態（ノックバックの反動・糸の絡まり）を足すたびに両方へ
     * 書く必要があった（2026-11-26 に1つにまとめた。値も並びも当時の2か所と同じ）。
     * 新しい一時状態はここに足す。復活で戻さないもの（向き・地形の上か・環境の係数＝毎フレーム決め直す）と、
     * 作るときと復活とで値が違うもの（docked・無敵・_dockAllFull）は呼ぶ側に置く。
     */
    _resetLifeState() {
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.wasOnGround = false;   // 着地音を1回だけ鳴らすための前フレームの接地状態
        this.airborneFrames = 0;    // 連続して宙に浮いていたフレーム数
        // 今フレームに足が乗っている坂の向き（+1 = 右へ上る）。タイルの形（utils/tileShape.js）から読む。
        // 以前は階段・くの字の先端を isSolid の並びから見分け、絵だけを斜辺へ下げていたが、
        // 今は判定そのものが斜辺を持つので、足は斜辺の上にある（描画のずらしは無い）。
        // 坂で死んだ直後に古い向きで加速・吸着しないよう、復活でも戻す
        this.slopeDir = 0;
        this._prevOnTerrain = false; // 前フレームに地形に接地していたか（坂を下るときの吸着の条件）
        this.alive = true;

        // Resources
        this.hp = PLAYER_MAX_HP;
        this.lifeUpTimer = 0;   // 残機を拾った直後の「1UP」表示の残りフレーム
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

        // Crouching & Stun
        this.crouching = false;
        this.stunTimer = 0;
        // スパイダーの糸に絡まっている残りフレーム（entangle）と、もがいた向きを数えるための最後の左右の入力
        this.webTimer = 0;
        this._webLastDir = 0;
        // 被弾ノックバックの反動の残りフレーム（onKnockback）。この間は左右の入力と摩擦を止める
        this.recoilTimer = 0;
        // 絡まってからのフレーム数（機体の糸が育つ）と、揺さぶった瞬間に糸がはねる残りフレーム・向き
        this._webAge = 0;
        this._webJolt = 0;
        this._webJoltDir = 0;

        // Animation
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.hoverCooldown = 0;   // frames before hover can activate after jump
        this._burstMistFrames = 0; // バーストの直後、水面に水滴を舞わせる残りフレーム（_kickHoverWaterMist）
        this._burstSnowPuff = false; // バーストで飛び立った直後、雪面に粉雪を 1 回出す印（_kickHoverSnowMist）
        this.missileCooldown = 0; // frames before next missile can be fired

        // Machine Gun state（_resetMGState。反動のばらつき・切り替えの印の意味はそちら）
        this._resetMGState();

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
        this._updateWebHorizontal();
        this._applySnowSlope(input);

        this.vy += GRAVITY * this.motion.gravity + (this.motion.downforce || 0);

        this._updateBurstHover(input);
        this._updateFuelRecovery(input);
        this._updateSpeedCaps();
        this._updateWebVertical();
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
        if (this.motion.slide > 0) { this._kickSnow(landed); this._kickHoverSnowMist(); }
        this._kickHoverWaterMist();
        this._emitJetBubbles();
        this.airborneFrames = this.onGround ? 0 : this.airborneFrames + 1;
        this.wasOnGround = this.onGround;

        this._updateWalkAnimation();
    }

    /** Decrement all per-frame timers (runs even while docked). */
    _updateTimers() {
        if (this.invincibleTimer > 0) this.invincibleTimer--;
        if (this.lifeUpTimer > 0) this.lifeUpTimer--;
        if (this.webTimer > 0) {
            this.webTimer--;
            this._webAge++;
        }
        if (this._webJolt > 0) this._webJolt--;
        if (this.missileCooldown > 0) this.missileCooldown--;
        if (this.mgFireTimer > 0) this.mgFireTimer--;
        this.mgSinceShot++;
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

    /**
     * 被弾ノックバック（utils/Knockback.js の applyKnockback が呼ぶ）。2026-11-23 ユーザー指定
     * 「敵のアタッカーと同じように自機も被弾したときにノックバック」。速度は applyKnockback が書き換え済み。
     * それだけでは次のフレームで左右の入力（±MAX の代入）と地面の摩擦に消されていたので、
     * PLAYER_RECOIL_FRAMES の間その2つを止める（_updateHorizontal）。ホバーは止めない（穴・水の上で立て直せる）。
     * 岩へ向かって飛ばされても、横・縦の当たり（_moveAndCollide）は普段と同じに効く
     */
    onKnockback() {
        this.recoilTimer = PLAYER_RECOIL_FRAMES;
    }

    /** Apply horizontal movement or friction. */
    _updateHorizontal(input) {
        // 左右の入力の向き。母艦を横から押すのは入力で進んでいるときだけ（_pushOutOfCarrierHorizontally）。
        // vx の向きで見ると、被弾で飛ばされてぶつかっただけでも母艦が動いてしまう
        this.heldDir = 0;
        // 被弾の反動中は、飛ばされた速さのまま（入力も摩擦も効かせない）。数え下げもここで行い、
        // 敵アタッカーの tickRecoil と同じく、PLAYER_RECOIL_FRAMES のフレーム数ぶんちょうど止める
        if (this.recoilTimer > 0) {
            this.recoilTimer--;
            return;
        }
        if (this.crouching) {
            if (this.onGround) this.vx = 0;
            return;
        }
        if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) {
            this.vx = -PLAYER_MAX_SPEED;
            this.heldDir = -1;
        } else if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) {
            this.vx = PLAYER_MAX_SPEED;
            this.heldDir = 1;
        } else if (this.onGround) {
            // 滑るのは「雪の積もった地形の上」だけ。陸上も、甲板や敵の頭の上も
            // slide=0 で即停止になる（utils/surface.js）
            this.vx *= groundSlide(this, this.game);
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        } else {
            this.vx *= AIR_FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
    }

    /**
     * スパイダーの糸に絡まった（CollisionManager._updateSpiderWeb）。ダメージは無く、しばらく動きが遅くなる。
     * 絡まっている間にまた当たっても足し算はせず、最初からやり直す（重ねがけで長く動けなくなるのを避ける）
     */
    entangle() {
        this.webTimer = SPIDER_WEB_ENTANGLE_FRAMES;
        this._webAge = 0;
    }

    /**
     * 絡まっている間の横の動き。_updateHorizontal が ±MAX にした直後に上限を掛ける（掛け算で弱めると、
     * 入力の無いフレームの減衰と重なって積み上がるので上限にした）。左右の入力の向きを変えるたびに早く取れる
     */
    _updateWebHorizontal() {
        const dir = this.heldDir || 0;
        if (this.webTimer > 0) {
            if (dir !== 0 && this._webLastDir !== 0 && dir !== this._webLastDir) {
                this.webTimer = Math.max(0, this.webTimer - SPIDER_WEB_SHAKE_FRAMES);
                this._webJolt = SPIDER_WEB_JOLT_FRAMES;
                this._webJoltDir = dir;
                // 振りほどいた切れ端を、機体にまとわりつく糸（_drawWeb）の今の大きさのまわりから散らす
                const f = this.webTimer / SPIDER_WEB_ENTANGLE_FRAMES;
                WebScrap.scatter(this.game,
                    this.x + this.width / 2, this.y + this.height / 2,
                    SPIDER_WEB_CLING_MIN_RADIUS + (SPIDER_WEB_CLING_RADIUS - SPIDER_WEB_CLING_MIN_RADIUS) * f,
                    dir, this.webTimer * 0.7);
            }
            const cap = PLAYER_MAX_SPEED * SPIDER_WEB_SLOW;
            if (this.webTimer > 0 && Math.abs(this.vx) > cap) this.vx = Math.sign(this.vx) * cap;
        }
        if (dir !== 0) this._webLastDir = dir;
    }

    /** 絡まっている間は、ホバー・バーストで昇る速さにも上限を掛ける（落ちる速さはそのまま） */
    _updateWebVertical() {
        if (this.webTimer <= 0) return;
        const cap = PLAYER_MAX_HOVER_SPEED * SPIDER_WEB_SLOW;
        if (this.vy < cap) this.vy = cap;
    }

    /**
     * 雪の面の斜面。下りは加速、上りは最高速が落ちる（押し続ければ上れ、離すと滑り落ちる）。
     * 坂の向きは足の中心の真下のタイルの形から読む。床の縁や浮いた板の先の 8px の面取りも
     * 坂なので、中心がそこへ出れば同じく滑り落ちる（旧 plateTipDirection の役目もこれが持つ）。
     * onGround は前フレームの結果（_moveAndCollide が毎フレーム冒頭で倒す）。
     */
    _applySnowSlope(input) {
        const held = (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) ? -1
            : (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) ? 1 : 0;
        // 上り: 入力の最高速を落とす（_updateHorizontal が ±MAX にした直後）。
        // しゃがみ中もここへ来る（_updateHorizontal が vx=0 にした後に加速が乗る）。
        // 雪の斜面では屈んだまま滑り降りるのが意図した挙動
        this._applySlope(held, PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE);
    }

    /** 雪の地上での粒。着地で多め、滑っているあいだは毎フレーム。 */
    _kickSnow(landed) {
        if (!this.game.spawnSnowKick) return;
        // 着地したフレームは motion がまだ「雪の面」のまま（係数はフレーム先頭、
        // 着地は _moveAndCollide の中）なので、ここでも接地面を見る必要がある。
        // 床の性質（floorSlide）で見るので、敵基地の無敵ブロックの上では雪を蹴らない
        if (!floorSlide(this, this.game)) return;
        const fx = this.x + this.width / 2;
        const fy = this.y + this.height;
        if (landed) { this.game.spawnSnowKick(fx, fy, SNOW_KICK_LAND); return; }
        if (!this.onGround || Math.abs(this.vx) < 0.1) return;
        this.game.spawnSnowKick(fx, fy, this.slopeDir !== 0 ? SNOW_KICK_SLIDE : SNOW_KICK_WALK);
    }

    /**
     * ホバーのノズルの位置（ワールド座標）。x はノズルの中心、y はノズルの下端。
     * 炎（_drawHoverExhaust）と噴射の泡（_emitJetBubbles）が同じ点から出るよう1か所で決める。
     *
     * _drawBody() が描く橙のノズル矩形 fillRect(2, 12, 4, 2)（ローカル座標、しゃがみ中は
     * ホバーしない）から直接出す。_drawBody() は右向き translate(x, y)、左向き
     * translate(x+width, y) + scale(-1, 1) なので、ワールド座標での中心 x はノズル矩形の
     * 中心 (2+4/2=4) を向きに応じて場合分けする必要がある（右向き: x+4、左向き: x+width-4）。
     * y はノズル矩形の下端 (12+2=14)（描画専用の値なので、敵側の cfg.flameX/flameY と違い
     * コードに直接書く）。旧実装は向きで x のずれ幅が違い（-4px と +2px）、振り向くたびに
     * 炎が横へ飛んでいた。
     */
    _hoverNozzle() {
        return {
            x: this.facingRight ? (this.x + 4) : (this.x + this.width - 4),
            y: this.y + 14,
        };
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
                this._burstMistFrames = HOVER_WATER_MIST_BURST_FRAMES;
                // 雪面の上なら、飛び立つ瞬間に粉雪を 1 回（motion は今フレームの先頭で引いた値）
                this._burstSnowPuff = this.motion.slide > 0;
                // 水中なら一吹きぶんの泡（水の外では spawnBubbles が粒ごとに捨てる。hoverMist.js）
                this._emitJetBubbles('burst');
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
        const maxFall = PLAYER_MAX_FALLING_SPEED * fallSpeedScaleFor(this.motion);
        if (this.vy > maxFall) this.vy = maxFall;
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

    /** 残機を 1 増やす（残機アイテムが呼ぶ）。「1UP」の表示も始める */
    gainLife() {
        this.lives++;
        this.lifeUpTimer = EXTRA_LIFE_FLASH_FRAMES;
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
        this._resetLifeState();
        this.docked = true;
        this.invincibleTimer = PLAYER_RESPAWN_INVINCIBLE_FRAMES;

        audioManager.stopHover();
        audioManager.stopRepairHum();
        this._dockAllFull = this._isFullyStocked();
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
        // 反動のばらつき（utils/mgSpread.js）。続けて撃った発数と、前の発から経った tick 数
        this.mgStreak = 0;
        this.mgSinceShot = Infinity;
        // 「立てる」のは入力処理、「消す」のは読んだ側（シミュレーションティック）。
        // gameSpeed 0.8 では 1 フレームに 0 ティックのことがあるので、立てた
        // フレームで消すとティックに届かないことがある
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
}

// プロトタイプ既定値。既存テストの一部は `Object.create(Player.prototype)` で
// constructor を通さずインスタンスを作る（carrier-lift.test.js）ため、
// constructor 内の `this.motion = LAND_MOTION;` だけでは救えない。
// プロトタイプ側にも既定を置き、update() を一度も呼んでいない・constructor も
// 通っていない経路でも motion が undefined にならないようにする。
Player.prototype.motion = LAND_MOTION;
Player.prototype.webTimer = 0;
Player.prototype._webLastDir = 0;
Player.prototype.recoilTimer = 0;
Player.prototype._webAge = 0;
Player.prototype._webJolt = 0;
Player.prototype._webJoltDir = 0;

// 坂を歩く・坂に当たる手順と地形の上を歩く手順（どちらも敵アタッカーと共通）と、描画（entities/player/draw.js）と、
// 動いてぶつかったものから押し戻す手順（entities/player/collision.js）
Object.assign(Player.prototype, SlopeBody, WalkerBody, HoverMist, PlayerDraw, PlayerCollision);
