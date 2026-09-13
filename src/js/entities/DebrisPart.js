// ============================================
// Debris Part - 破壊された機体のパーツ1個
// ============================================
// 既存の Particle と同じ「update() / draw() / alive」契約に従うので、
// game.particles[] に混ぜるだけでゲームループに乗る。当たり判定は一切
// 持たないが、CasingParticle と同じく地形には跳ね返り、水中では
// motionFor の gravity 倍率でゆっくり沈む（実機の指摘: 薬莢と同じように
// 障害物・水の影響を受けてほしい）。game.map が無い（テストのスタブ等）
// ときは、CasingParticle と同じく素通りするフォールバックにしてある。

import {
    DEBRIS_GRAVITY, DEBRIS_DRAG, DEBRIS_MAX_FALL_SPEED,
    DEBRIS_FLASH_COLOR, DEBRIS_FADE_START, DEBRIS_BOUNCE, DEBRIS_FRICTION,
} from '../utils/Constants.js';
import { isInView } from '../utils/viewCull.js';
import { motionFor } from '../world/StageEnvironment.js';

export class DebrisPart {
    /**
     * @param {object} opts
     * @param {number} opts.x パーツ中心のワールド X
     * @param {number} opts.y パーツ中心のワールド Y
     * @param {number} opts.w パーツ幅
     * @param {number} opts.h パーツ高さ
     * @param {string} opts.color
     * @param {number} opts.angle 初期回転（ラジアン）
     * @param {number} opts.vx
     * @param {number} opts.vy
     * @param {number} opts.spin 角速度（ラジアン/フレーム）
     * @param {number} opts.holdFrames 飛散開始までの静止フレーム数
     * @param {number} opts.lifetime 飛散開始後の寿命（フレーム）
     * @param {object} [opts.game] 画面外カリング・地形の跳ね返り・水中判定に使う。
     *   無ければカリングせず、地形も無視して素通りする
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;
        this.color = opts.color;
        this.angle = opts.angle || 0;
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.spin = opts.spin;
        this.hold = opts.holdFrames || 0;
        this.maxLife = opts.lifetime;
        this.life = opts.lifetime;
        this.game = opts.game || null;
        this.alive = true;
        // 水面またぎの検出（StageEnvironment._trackWaterCrossings）が
        // particles から破片だけを拾うための目印
        this.isDebris = true;
    }

    /** 縮小率。後半ほど強く効くカーブで、消える直前に一気に小さくなる。 */
    get scale() {
        const p = 1 - this.life / this.maxLife;
        return Math.max(0, 1 - p * p);
    }

    /** 不透明度。寿命の終盤 DEBRIS_FADE_START 以降でのみ落ちる。 */
    get alpha() {
        const p = 1 - this.life / this.maxLife;
        if (p < DEBRIS_FADE_START) return 1;
        return Math.max(0, (1 - p) / (1 - DEBRIS_FADE_START));
    }

    update() {
        if (!this.alive) return;

        // 局面1: ホールド。元の位置に静止したまま白熱する。
        // パーツが元の配置のまま並ぶので、これがそのまま発光シルエットになる。
        if (this.hold > 0) {
            this.hold--;
            return;
        }

        // 局面2: 飛散。CasingParticle と同じ2Dバウンス（Grenade 相当）＋
        // 水中の減速。game.map が無ければ地形を無視して素通りする。
        // 移動は「今の速度」で行い、重力は移動のあとで次フレームぶんだけ足す
        // （既存の自由落下の数値をそのまま保つため。Grenade/CasingParticle は
        // 先に重力を足すが、DebrisPart は既存テストが厳密な数値を固定して
        // いるので、この関数だけは元の順序を崩さない）
        const motion = motionFor(this.game, this.x, this.y);
        let nextX = this.x + this.vx * motion.speed;
        let nextY = this.y + this.vy * motion.speed;

        const map = this.game && this.game.map;
        if (map && map.isSolidAtPixel) {
            if (map.isSolidAtPixel(nextX, this.y)) {
                this.vx *= -DEBRIS_BOUNCE;
                nextX = this.x + this.vx * motion.speed;
            }
            if (map.isSolidAtPixel(this.x, nextY)) {
                // 落ちてきた勢いが弱ければ跳ねずに転がって止まる（Grenade と同じ考え方）
                if (Math.abs(this.vy) > 0.5) {
                    this.vy *= -DEBRIS_BOUNCE;
                } else {
                    this.vy = 0;
                    this.vx *= DEBRIS_FRICTION;
                }
                nextY = this.y + this.vy * motion.speed;
            }
        }
        this.x = nextX;
        this.y = nextY;

        this.vy = Math.min(this.vy + DEBRIS_GRAVITY * motion.gravity, DEBRIS_MAX_FALL_SPEED);
        this.vx *= DEBRIS_DRAG;
        this.angle += this.spin;

        // 局面3: 消滅
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;
        if (this._isOffscreen()) return;

        const s = this.scale;
        if (s <= 0) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.scale(s, s);
        ctx.fillStyle = (this.hold > 0) ? DEBRIS_FLASH_COLOR : this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }

    /**
     * カメラ矩形から余裕をもって外れていれば描画を省く。
     *
     * 判定は敵と共通の isInView() に寄せてある（同じ判定の写しを2つ持たない）。
     * ただし**余裕の取り方は敵と違う**ので margin で渡す。破片は当たり判定も
     * 意味も持たない演出なので、敵の VIEW_CULL_MARGIN(64) ほど広く取る必要がなく、
     * 従来どおり max(w,h) + 8 のまま。
     *
     * this.x/y は**中心**なので、width/height を渡さず点として判定させ、
     * 広がりは margin に含める（centerOf は width が無ければ x をそのまま中心と見る）。
     */
    _isOffscreen() {
        const game = this.game;
        if (!game || !game.camera || !game.canvas) return false;
        const margin = Math.max(this.w, this.h) + 8;
        return !isInView({ x: this.x, y: this.y }, game.camera, game.canvas, margin);
    }
}
