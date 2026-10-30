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
 * 接地するまで1フレームぶん落とし、床に着いたらその上に吸着させる。
 * アイテムと格納塔（足場の床が撃ち抜かれたとき）が同じ落ち方をするので、ここに1つだけ置く。
 * body は game, x, y, width, height, vy, onGround を持つもの。onGround なら何もしない。
 */
export function fallToGround(body) {
    if (body.onGround) return;

    // アイテムは _moveAndCollide のような専用メソッドを持たないので、
    // ここで中心座標の係数をその場で引く（Player/EnemyTank と同じ考え方）。
    const motion = motionFor(body.game, body.x + body.width / 2, body.y + body.height / 2);
    body.vy += GRAVITY * motion.gravity;
    if (body.vy > MAX_FALL_SPEED) body.vy = MAX_FALL_SPEED;
    const dy = body.vy * motion.speed;
    body.y += dy;

    const map = body.game.map;
    const feetY = body.y + body.height;
    if (map.hasShapedTileIn(body.x, feetY - TILE_SIZE, body.width, TILE_SIZE + 1)) {
        landOnShape(body, feetY - dy, feetY);
        return;
    }
    if (map.isSolidAtPixel(body.x + GROUND_PROBE_INSET, feetY) ||
        map.isSolidAtPixel(body.x + body.width - GROUND_PROBE_INSET, feetY)) {
        body.y = Math.floor(feetY / TILE_SIZE) * TILE_SIZE - body.height;
        body.vy = 0;
        body.onGround = true;
    }
}

/**
 * 5面の坂と面取りの近くでは、足の2列を形で当て、当たった列の床の高さ（このフレームに
 * 動いた範囲で一番高いもの）へ合わせる（決定12）。タイルの上端へ寄せると、坂では最大 16px、
 * 面取りでは 8px 浮いて止まった
 * @param {number} prevFeet このフレームに動く前の足の y
 * @param {number} feetY 動いた後の足の y
 */
function landOnShape(body, prevFeet, feetY) {
    const map = body.game.map;
    let floor = null;
    for (const px of [body.x + GROUND_PROBE_INSET, body.x + body.width - GROUND_PROBE_INSET]) {
        if (!map.isSolidPoint(px, feetY)) continue;
        const top = map.terrainTopY(px, prevFeet, feetY);
        if (top !== null && (floor === null || top < floor)) floor = top;
    }
    if (floor === null) return;
    body.y = floor - body.height;
    body.vy = 0;
    body.onGround = true;
}

/**
 * 足の2列の真下（1px 下）に地形があるか。格納塔が、立っている床が撃ち抜かれたかを見る。
 */
export function hasGroundBelow(body) {
    const map = body.game.map;
    const feetY = body.y + body.height + 1;
    return map.isSolidPoint(body.x + GROUND_PROBE_INSET, feetY)
        || map.isSolidPoint(body.x + body.width - GROUND_PROBE_INSET, feetY);
}

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

    /** 接地するまで落ちる。床に着いたらタイルの上端に吸着させる（fallToGround）。 */
    _fall() {
        fallToGround(this);
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
        this.playPickupSound();
        this.alive = false;
    }

    /** 拾った音。既定は共通の拾得音で、残機のように専用の音を持つ派生クラスが差し替える */
    playPickupSound() { audioManager.playPickup(); }

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
