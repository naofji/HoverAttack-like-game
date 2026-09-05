// ============================================
// PickupItem - 拾い物アイテムの共通の振る舞い
// ============================================

import { TILE_SIZE, GRAVITY, ITEM_PICKUP_SCORE } from '../utils/Constants.js';
import { motionFor } from '../world/StageEnvironment.js';
import { audioManager } from '../audio/AudioManager.js';

/** アイテムは1タイルぶんの正方形。3種とも同じ大きさで揃えてある。 */
export const ITEM_SIZE = TILE_SIZE;

/** 本体の角丸の半径。 */
export const ITEM_CORNER_RADIUS = 4;

/** 落下の終端速度。速すぎると床をすり抜ける。 */
const MAX_FALL_SPEED = 10;

/** 接地判定を左右の端から内側へ寄せる量（角が引っかかって浮くのを防ぐ）。 */
const GROUND_PROBE_INSET = 3;

/**
 * 敵が落とす拾い物の土台。
 *
 * リペアキット・ミサイル補給・Auto Aim ユニットの3種は、落下も接地も
 * 当たり判定も点滅も同じで、違うのは「拾ったときに何が起きるか」と
 * 「本体の色とアイコン」だけだった。3ファイルに同じ90行が並んでいたので、
 * 共通部分をここに集め、派生側は onPickup() と描画の中身だけを書く。
 *
 * 新しいアイテムを足すときは、このクラスを継承して
 * onPickup / glowColor / bodyColor / drawIcon を実装する。
 */
export class PickupItem {
    /**
     * @param {object} game
     * @param {number} x 落とす位置の中心X（内部では左上に直す）
     * @param {number} y 落とす位置の上端Y
     */
    constructor(game, x, y) {
        this.game = game;
        this.x = x - ITEM_SIZE / 2;
        this.y = y;
        this.width = ITEM_SIZE;
        this.height = ITEM_SIZE;
        this.vy = 0;
        this.alive = true;
        this.frameCounter = 0;
        this.onGround = false;
    }

    /** 点滅の位相。0..1 を往復する。既定は少しゆっくり。 */
    get pulseSpeed() { return 0.1; }

    update() {
        if (!this.alive) return;

        this.frameCounter++;
        this._fall();
        this._checkPickup();
    }

    /** 接地するまで落ちる。床に着いたらタイルの上端に吸着させる。 */
    _fall() {
        if (this.onGround) return;

        // アイテムは _moveAndCollide のような専用メソッドを持たないので、
        // ここで中心座標の係数をその場で引く（Player/EnemyTank と同じ考え方）。
        const motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this.vy += GRAVITY * motion.gravity;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
        this.y += this.vy * motion.speed;

        const map = this.game.map;
        const feetY = this.y + this.height;
        if (map.isSolidAtPixel(this.x + GROUND_PROBE_INSET, feetY) ||
            map.isSolidAtPixel(this.x + this.width - GROUND_PROBE_INSET, feetY)) {
            this.y = Math.floor(feetY / TILE_SIZE) * TILE_SIZE - this.height;
            this.vy = 0;
            this.onGround = true;
        }
    }

    /** 自機が重なったら拾う。ドッキング中は拾えない。 */
    _checkPickup() {
        const player = this.game.player;
        if (!player || !player.alive || player.docked) return;

        const overlapping = this.x < player.x + player.width &&
            this.x + this.width > player.x &&
            this.y < player.y + player.height &&
            this.y + this.height > player.y;
        if (!overlapping) return;

        this.onPickup(player);
        this.game.addScore(ITEM_PICKUP_SCORE);
        audioManager.playPickup();
        this.alive = false;
    }

    /**
     * 拾われたときの効果。派生クラスが実装する。
     * @param {object} player
     * @abstract
     */
    onPickup(player) { /* 派生クラスで実装 */ }

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const pulse = 0.5 + 0.5 * Math.sin(this.frameCounter * this.pulseSpeed);

        ctx.save();

        // 外側のグロー（脈打たせて「拾えるもの」だと分かるようにする）
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.shadowColor = this.glowColor;

        ctx.fillStyle = this.bodyColor(pulse);
        this._traceRoundedBody(ctx, x, y);
        ctx.fill();

        // アイコンはグローを乗せない（本体の発光でにじむと形が読めない）
        ctx.shadowBlur = 0;
        this.drawIcon(ctx, x, y, pulse);

        ctx.restore();
    }

    /** 本体の角丸四角のパスを引く（塗りは呼び出し側）。 */
    _traceRoundedBody(ctx, x, y) {
        const r = ITEM_CORNER_RADIUS;
        const S = ITEM_SIZE;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + S - r, y);
        ctx.arcTo(x + S, y, x + S, y + r, r);
        ctx.lineTo(x + S, y + S - r);
        ctx.arcTo(x + S, y + S, x + S - r, y + S, r);
        ctx.lineTo(x + r, y + S);
        ctx.arcTo(x, y + S, x, y + S - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    /** アイコンの白の濃さ。脈打ちに合わせてわずかに明滅する。 */
    iconWhite(pulse) { return `rgba(255,255,255,${0.8 + pulse * 0.2})`; }

    /** グローの色。派生クラスが実装する。 @abstract */
    get glowColor() { return '#FFFFFF'; }

    /** 本体の色。脈打ちに応じて明るさが変わる。派生クラスが実装する。 @abstract */
    bodyColor(pulse) { return '#FFFFFF'; }

    /** 本体の上に乗せる記号。派生クラスが実装する。 @abstract */
    drawIcon(ctx, x, y, pulse) { /* 派生クラスで実装 */ }
}
