// ============================================
// Carrier (Supply Mothership)
// ============================================

import {
    TILE_SIZE,
    CARRIER_WIDTH, CARRIER_HEIGHT, CARRIER_SPEED,
    CARRIER_MAX_HP, CARRIER_INITIAL_LIVES,
    CARRIER_MAX_FALLING_SPEED,
    WATER_FALL_SPEED_SCALE,
    GRAVITY, FRICTION,
    HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL, HOVER_SNOW_MIST_COUNT,
    HOVER_WATER_MIST_MAX_ALT, HOVER_WATER_MIST_INTERVAL, HOVER_WATER_MIST_COUNT,
} from '../utils/Constants.js';
import { collidesWithMap } from '../utils/Physics.js';
import { motionFor, LAND_MOTION } from '../world/StageEnvironment.js';
import { groundClearance, groundSlopeDirection, waterClearance, hoverWaterMistCount, hoverWaterMistCloseness } from '../utils/surface.js';
import { createDestructionFinale } from './DestructionFinale.js';
import { playDestruction } from './destruction.js';

// draw() は当たり判定より上に船体を描く（「浮いている感じを出すため」）。
// 雪煙の高さ判定は見た目の船底基準にしたいので、判定側でも同じ分だけ差し引く。
const CARRIER_FLOAT_DRAW_OFFSET = 8;

export class Carrier {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.width = CARRIER_WIDTH;
        this.height = CARRIER_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        // 環境の物理係数。update() で毎フレーム引き直す（Player と同じ手順）。
        this.motion = LAND_MOTION;
        this.alive = true;

        this.hp = CARRIER_MAX_HP;
        this.maxHp = this.hp;
        this.lives = CARRIER_INITIAL_LIVES;

        // Platform area for docking (relative to carrier x)
        this.platformLeft = 16;
        this.platformRight = 48;

        this.damageTimer = 0;
    }

    update() {
        if (!this.alive) return;

        const input = this.game.input;
        const player = this.game.player;

        // Carrier moves with A/D when player is docked
        if (player && player.docked) {
            if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) {
                this.vx -= CARRIER_SPEED;
            }
            if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) {
                this.vx += CARRIER_SPEED;
            }
        }

        // Friction & Gravity
        this.vx *= FRICTION;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
        this.motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this.vy += GRAVITY * this.motion.gravity + (this.motion.downforce || 0);
        const fallScale = this.motion.fallSpeedScale !== undefined
            ? this.motion.fallSpeedScale
            : (this.motion.speed < 1 ? WATER_FALL_SPEED_SCALE : 1);
        const maxFall = CARRIER_MAX_FALLING_SPEED * fallScale;
        if (this.vy > maxFall) this.vy = maxFall;

        // Movement with collision
        this._moveAndCollide();
        this._applyBuoyancy();

        // Keep docked player on top
        if (player && player.docked) {
            player.x = this.x + this.width / 2 - player.width / 2;
            player.y = this.y - player.height;
        }

        // Damage alert timer
        if (this.damageTimer > 0) {
            this.damageTimer--;
        }

        this._kickHoverSnowMist();
        this._kickHoverWaterMist();
    }

    /**
     * 雪面の上にいるあいだ、船体の下で粉雪が舞う。
     *
     * 自機・敵アタッカーは重力に逆らうホバー推力を持ち、「浮いている(MIN_ALT
     * 以上)」と「接地して歩いている(SNOW_KICK)」を高さで住み分けられる。
     * キャリアにはそのホバー推力が無く、重力で落ちて地形に密着した位置で
     * そのまま止まるだけ（実機の指摘: SpawnManager は床にぴったり乗る高さへ
     * 配置するため、実プレイでは地面から16px以上浮いた状態がほぼ発生しない
     * ── 下限を自機・敵アタッカーと同じ MIN_ALT にすると事実上一度も鳴らない）。
     * 「止まっていても常にスラスターは動いている」という設定なので、
     * キャリアだけは下限を設けず、上限(MAX_ALT)以内なら接地に近い高さでも出す。
     *
     * 横幅が広い（CARRIER_WIDTH=64px=4タイル）ので、船体中心1点ではなく
     * 左・中央・右の3等分それぞれの下で独立に判定する（実機の指摘: 左右2カ所では
     * 足りず、片側が段差にかかっているようなときのためにも中央が要る）。
     */
    _kickHoverSnowMist() {
        if (!this.game.spawnSnowMist) return;
        if (this.motion.slide <= 0) return;
        const thirdWidth = this.width / 3;
        this._kickHoverSnowMistSide('L', this.x);
        this._kickHoverSnowMistSide('C', this.x + thirdWidth);
        this._kickHoverSnowMistSide('R', this.x + thirdWidth * 2);
    }

    /**
     * 船体の1/3ぶんの footprint で1カ所だけ判定する。距離は当たり判定ではなく
     * **見た目の船底**基準にする。draw() が船体を CARRIER_FLOAT_DRAW_OFFSET だけ
     * 上にずらして描く（浮いている感じを出すため）ぶん、判定側の足元もその分だけ
     * 浅くした footprint で見る（実機の指摘）。
     */
    _kickHoverSnowMistSide(side, footX) {
        const footprint = { x: footX, y: this.y, width: this.width / 3, height: this.height - CARRIER_FLOAT_DRAW_OFFSET };
        const clearance = groundClearance(footprint, this.game, HOVER_SNOW_MIST_MAX_ALT);
        if (clearance === null) return;
        const timerKey = `_hoverMistTimer${side}`;
        this[timerKey] = (this[timerKey] || 0) + 1;
        if (this[timerKey] % HOVER_SNOW_MIST_INTERVAL !== 0) return;
        const onSlope = groundSlopeDirection(footprint, this.game, clearance) !== 0;
        this.game.spawnSnowMist(footprint.x + footprint.width / 2, footprint.y + footprint.height + clearance, HOVER_SNOW_MIST_COUNT, onSlope);
    }

    /**
     * 水面の上にいるあいだ、船体の下で水滴が舞う（_kickHoverSnowMist の水面版）。
     * キャリアは _applyBuoyancy で水面にぴったり浮くので、雪と同じ理由で下限は
     * 設けない（浮いた位置の clearance はほぼ0になる）。左・中央・右の3等分も同じ。
     */
    _kickHoverWaterMist() {
        if (!this.game.spawnWaterMist) return;
        if (!this.game.env || this.game.env.kind !== 'water') return;
        const thirdWidth = this.width / 3;
        this._kickHoverWaterMistSide('L', this.x);
        this._kickHoverWaterMistSide('C', this.x + thirdWidth);
        this._kickHoverWaterMistSide('R', this.x + thirdWidth * 2);
    }

    _kickHoverWaterMistSide(side, footX) {
        const footprint = { x: footX, y: this.y, width: this.width / 3, height: this.height - CARRIER_FLOAT_DRAW_OFFSET };
        const clearance = waterClearance(footprint, this.game, HOVER_WATER_MIST_MAX_ALT);
        if (clearance === null) return;
        const timerKey = `_hoverWaterMistTimer${side}`;
        this[timerKey] = (this[timerKey] || 0) + 1;
        if (this[timerKey] % HOVER_WATER_MIST_INTERVAL !== 0) return;
        const count = hoverWaterMistCount(clearance);
        const closeness = hoverWaterMistCloseness(clearance);
        this.game.spawnWaterMist(footprint.x + footprint.width / 2, footprint.y + footprint.height + clearance, count, closeness);
    }

    // ------------------------------------------
    // Physics
    // ------------------------------------------

    _moveAndCollide() {
        // --- Horizontal ---
        this.x += this.vx * this.motion.speed;
        if (this._collidesWithMap()) {
            // Check if it's a 1-tile step
            this.y -= TILE_SIZE;
            const canClimb = !this._collidesWithMap();
            this.y += TILE_SIZE;

            if (canClimb) {
                this.x -= this.vx * this.motion.speed;
                this.y -= 3;
                this.vy = 0;
            } else {
                this.x -= this.vx * this.motion.speed;
                this.vx = 0;
            }
        }

        // Push non-docked player out of the way
        this._pushPlayer();

        // --- Vertical ---
        this.y += this.vy * this.motion.speed;
        if (this._collidesWithMap()) {
            if (this.vy > 0) {
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height - 0.01;
            } else if (this.vy < 0) {
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
            }
            this.vy = 0;
        }
    }

    /**
     * 水面に浮く。キャリアには重力に逆らうホバー推力が無く、水は衝突しない
     * （isSolidAtPixel が false）ので、_moveAndCollide だけでは水域で床の
     * 無い場所まで沈み続けてしまう。船体中心の直下が水なら、その水塊の液面
     * (map.getSurfaceY)を疑似的な床として扱い、底(y+height)がそこに届いたら
     * それ以上沈ませない。
     *
     * 陸地に来れば(直下が水でなくなれば)何もしないので、通常のソリッド衝突に
     * そのまま戻る。
     */
    _applyBuoyancy() {
        if (!this.game.env || this.game.env.kind !== 'water') return;
        const map = this.game.map;
        if (!map || !map.isWater || !map.getSurfaceY) return;
        const cx = this.x + this.width / 2;
        const bottomY = this.y + this.height;
        const r = Math.floor(bottomY / TILE_SIZE);
        const c = Math.floor(cx / TILE_SIZE);
        if (!map.isWater(r, c)) return;
        const surfaceY = map.getSurfaceY(r, c);
        if (surfaceY < 0) return;
        const floatY = surfaceY - this.height;
        if (this.y > floatY) {
            this.y = floatY;
            if (this.vy > 0) this.vy = 0;
        }
    }

    _pushPlayer() {
        const player = this.game.player;
        if (!player || !player.alive || player.docked || this.vx === 0) return;

        // Simple AABB overlap check
        if (player.x < this.x + this.width &&
            player.x + player.width > this.x &&
            player.y < this.y + this.height &&
            player.y + player.height > this.y) {

            if (this.vx > 0 && player.x + player.width / 2 >= this.x + this.width / 2) {
                player.x = this.x + this.width;
            } else if (this.vx < 0 && player.x + player.width / 2 <= this.x + this.width / 2) {
                player.x = this.x - player.width;
            }
        }
    }

    _collidesWithMap() {
        // Carrier uses extra bottom check points for its wider hull
        const points = [
            { x: this.x + 2, y: this.y + 2 },
            { x: this.x + this.width - 2, y: this.y + 2 },
            { x: this.x + 2, y: this.y + this.height - 1 },
            { x: this.x + this.width - 2, y: this.y + this.height - 1 },
            { x: this.x + this.width / 2, y: this.y + 2 },
            { x: this.x + this.width / 2, y: this.y + this.height - 1 },
            { x: this.x + this.width / 4, y: this.y + this.height - 1 },
            { x: this.x + this.width * 3 / 4, y: this.y + this.height - 1 },
        ];
        return collidesWithMap(this, this.game.map, points);
    }

    // ------------------------------------------
    // Docking
    // ------------------------------------------

    canDock(player) {
        if (player.docked) return false;
        const px = player.x + player.width / 2;
        const py = player.y + player.height;

        const onPlatform =
            px >= this.x + this.platformLeft &&
            px <= this.x + this.platformRight &&
            py >= this.y - 5 &&
            py <= this.y + 5 &&
            player.onGround === false;

        const onTop =
            px >= this.x + this.platformLeft &&
            px <= this.x + this.platformRight &&
            Math.abs((player.y + player.height) - this.y) < 8;

        return onPlatform || onTop;
    }

    // ------------------------------------------
    // Damage & Respawn
    // ------------------------------------------

    takeDamage(amount) {
        if (!this.alive) return;
        // デバッグ用の無敵モード。母艦が落ちてもランが終わるので、
        // 「止めずに先の面まで進めて確認する」には自機と両方が要る
        if (this.game.debugInvincible) return;
        this.hp -= amount;
        this.damageTimer = 60; // Show alert for 1 second
        this.game.spawnHeavyDamage(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'carrier');
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // 母艦の喪失は残機1＝必ずゲームオーバー。ゲーム中で最大の見せ場なので、
        // 敵基地と同じフィナーレ（集中線→衝撃波リング）も重ねる。
        this.game.particles.push(...createDestructionFinale(cx, cy));

        this.lives--;

        // Force undock player if docked
        const player = this.game.player;
        if (player && player.alive && player.docked) {
            player.docked = false;
            player.vy = -3; // Throw player slightly up into the air
            player.walkFrame = 2; // Standing straight
        }
    }

    respawn() {
        this.x = (this.spawnX !== undefined) ? this.spawnX : (5 * 16);
        this.y = (this.spawnY !== undefined) ? this.spawnY : (5 * 16);
        this.vx = 0;
        this.vy = 0;
        this.hp = CARRIER_MAX_HP;
        this.alive = true;
    }

    // ------------------------------------------
    // Draw
    // ------------------------------------------

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const drawY = y - CARRIER_FLOAT_DRAW_OFFSET; // Shifted up to simulate float

        this._drawHull(ctx, x, drawY);
        this._drawEngines(ctx, x, drawY);
        this._drawDockingIndicator(ctx, x, drawY);
    }

    _drawHull(ctx, x, drawY) {
        // Bottom hull
        ctx.fillStyle = '#1a3a6a';
        ctx.fillRect(x + 4, drawY + 14, 56, 16);

        // Top hull (red accent)
        ctx.fillStyle = '#AA2222';
        ctx.fillRect(x + 8, drawY + 8, 48, 8);

        // Platform deck
        ctx.fillStyle = '#CC9900';
        ctx.fillRect(x + this.platformLeft, drawY + 4, this.platformRight - this.platformLeft, 5);

        // Platform surface line
        ctx.fillStyle = '#FFCC00';
        ctx.fillRect(x + this.platformLeft, drawY + 4, this.platformRight - this.platformLeft, 2);

        // Cockpit window
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(x + 28, drawY + 10, 8, 4);

        // Hull border
        // ctx.strokeStyle = '#0a1a3a';
        // ctx.strokeRect(x + 4, drawY + 4, 56, 26);
    }

    _drawEngines(ctx, x, drawY) {
        // Engine pods
        ctx.fillStyle = '#2255AA';
        ctx.fillRect(x, drawY + 18, 8, 10);
        ctx.fillRect(x + 56, drawY + 18, 8, 10);

        // Thruster glow (animated)
        const time = Date.now() / 150;
        const glowOffset = Math.sin(time) * 2;
        ctx.fillStyle = '#00CCFF';
        ctx.fillRect(x + 1, drawY + 28, 6, 4 + glowOffset);
        ctx.fillRect(x + 57, drawY + 28, 6, 4 + glowOffset);
        ctx.fillRect(x + 20, drawY + 30, 6, 5 + glowOffset);
        ctx.fillRect(x + 38, drawY + 30, 6, 5 + glowOffset);
    }

    _drawDockingIndicator(ctx, x, drawY) {
        const player = this.game.player;
        if (player && !player.docked && this.canDock(player)) {
            ctx.fillStyle = Math.floor(Date.now() / 300) % 2 === 0 ? '#00FF00' : '#005500';
            ctx.fillRect(x + 30, drawY + 2, 4, 2);
        }
    }
}
