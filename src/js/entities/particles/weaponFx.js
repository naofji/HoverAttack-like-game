// ============================================
// 武器の演出（跳弾の筋・ミサイルの軌跡・MG の薬莢・着弾の閃光）
// ============================================
//
// もとは entities/Particle.js の一部（2026-11-25 に分けた、中身は動かしただけ）。
// 使う側は今までどおり entities/Particle.js から import する。

import {
    PARTICLE_LIFETIME, IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS, RICOCHET_STREAK_LENGTH,
    RICOCHET_STREAK_LIFETIME, RICOCHET_STREAK_WIDTH, COLOR_RICOCHET, COLOR_RICOCHET_FADE,
    CASING_COLOR, CASING_LENGTH, CASING_WIDTH, CASING_GRAVITY, CASING_MAX_FALL_SPEED,
    CASING_LIFETIME, CASING_FADE_START, CASING_BOUNCE, CASING_FRICTION, CASING_SPIN,
} from '../../utils/Constants.js';
import { lerpColor } from '../../utils/color.js';
import { motionFor } from '../../world/StageEnvironment.js';

/**
 * 装甲に弾かれた跳弾の光。
 *
 * 既存の粒（Particle）は全て「四角い点」で、跳弾には向かない。点だと
 * 何がどちらへ抜けたのか読めず、当たった場所で光っただけに見えてしまう。
 * 進行方向へ伸びる線分にすると、跳ね返って飛び去ったことが一目で分かる。
 *
 * 重力を掛けていないのは、落ち始めると跳弾ではなく火花に見えるため。
 * 跳弾は一瞬で視界から消えるものなので、寿命の短さで表現している。
 */
export class RicochetStreak {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.maxLifetime = RICOCHET_STREAK_LIFETIME;
        this.lifetime = this.maxLifetime;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;
        if (this.lifetime <= 0) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;

        const alpha = this.lifetime / this.maxLifetime;
        // 速度の向きへ一定の長さで伸ばす。速さで長さを変えないのは、
        // ばらついた跳弾が「群れとして同じもの」に見えるようにするため
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const ux = this.vx / speed;
        const uy = this.vy / speed;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = lerpColor(COLOR_RICOCHET, COLOR_RICOCHET_FADE, 1 - alpha);
        ctx.lineWidth = RICOCHET_STREAK_WIDTH;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + ux * RICOCHET_STREAK_LENGTH, this.y + uy * RICOCHET_STREAK_LENGTH);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Missile Smoke Trail Particle
// Expands and fades out over time.
// --------------------------------------------
export class TrailParticle {
    constructor(x, y, lifetime = PARTICLE_LIFETIME) {
        this.x = x;
        this.y = y;
        this.maxLifetime = lifetime;
        this.lifetime = lifetime;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;
        this.lifetime--;
        if (this.lifetime <= 0) {
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const progress = 1.0 - (this.lifetime / this.maxLifetime);
        const alpha = Math.max(0.1, 1.0 - progress);
        const size = 2 + progress * 2;

        // save/restore を使わず、Particle.draw() と同じ「置いて最後に 1 へ戻す」形。
        // やっているのは globalAlpha と定数の fillStyle を置くことだけで、
        // 状態スタックの出入りに 2 呼び出し払う理由が無い。
        // 実測(2026-08-16)でこの粒は平均177個・**ピーク690個**と particles の
        // 大半を占めており、1個 3 呼び出しが 1 呼び出しになる。見た目は不変
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(this.x) - size / 2, Math.round(this.y) - size / 2, size, size);
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Casing Particle - マシンガンの薬莢
// --------------------------------------------
// DebrisPart と違い、地形に当たると跳ね返る（Grenade と同じ2D バウンス）。
// 「破片は地形を無視して落ちる」既存の演出用パーティクルとは違う挙動だが、
// 薬莢は数が多く近くで繰り返し見えるので、跳ねて転がる方が臨場感が出る（実機の指摘）。
// game.map が無い（テストのスタブなど）場合は衝突を見ずに素通りする、DebrisPart 相当の
// フォールバックにしておく。
// 水中かどうかだけは motionFor で見て、ゆっくり沈む見た目にする
// （Bullet の抗力方式とは違い、こちらは重力そのものを弱めるだけでよい。
// 水から出て加速して見える問題は起きない ― 薬莢は沈むだけで浮き上がらないため）。
export class CasingParticle {
    constructor(game, x, y, vx, vy) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() - 0.5) * CASING_SPIN; // rad/frame。転がりながら落ちる見た目
        this.maxLife = CASING_LIFETIME;
        this.life = CASING_LIFETIME;
        this.alive = true;
        // 水面をまたいだ瞬間のしぶきは StageEnvironment._trackWaterCrossings が
        // isDebris を目印に particles から拾う。薬莢も同じ仕組みに乗せる
        this.isDebris = true;
    }

    update() {
        if (!this.alive) return;

        const motion = motionFor(this.game, this.x, this.y);
        this.vy = Math.min(this.vy + CASING_GRAVITY * motion.gravity, CASING_MAX_FALL_SPEED);

        const map = this.game && this.game.map;
        if (map && map.isSolidAtPixel) {
            let nextX = this.x + this.vx * motion.speed;
            if (map.isSolidAtPixel(nextX, this.y)) {
                this.vx *= -CASING_BOUNCE;
                nextX = this.x + this.vx * motion.speed;
            }
            this.x = nextX;

            let nextY = this.y + this.vy * motion.speed;
            if (map.isSolidAtPixel(this.x, nextY)) {
                // 落ちてきた勢いが弱ければ跳ねずに転がって止まる（Grenade と同じ考え方）
                if (Math.abs(this.vy) > 0.5) {
                    this.vy *= -CASING_BOUNCE;
                } else {
                    this.vy = 0;
                    this.vx *= CASING_FRICTION;
                }
                nextY = this.y + this.vy * motion.speed;
            }
            this.y = nextY;
        } else {
            this.x += this.vx * motion.speed;
            this.y += this.vy * motion.speed;
        }

        this.angle += this.spin;

        if (--this.life <= 0) this.alive = false;
    }

    /** 不透明度。DebrisPart と同じ考え方（経過が CASING_FADE_START 未満は不透明のまま）。 */
    get alpha() {
        const p = 1 - this.life / this.maxLife;
        if (p < CASING_FADE_START) return 1;
        return Math.max(0, (1 - p) / (1 - CASING_FADE_START));
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = CASING_COLOR;
        ctx.fillRect(-CASING_LENGTH / 2, -CASING_WIDTH / 2, CASING_LENGTH, CASING_WIDTH);
        ctx.restore();
    }
}

// --------------------------------------------
// Impact Flash - 着弾の瞬間を示す小さく硬い閃光
// --------------------------------------------
// FlashParticle（爆発の中央に入る柔らかいグラデーション）とは役割が違う。
// あちらは爆発の「熱」を表す下地で、こちらは「命中した」という一瞬の合図。
// 輪郭をはっきりさせるため、グラデーションではなく単色の円＋外周のリングで描く。
export class ImpactFlash {
    /**
     * @param {number} x 着弾点
     * @param {number} y
     * @param {number} [radius] 最大半径。弾種で変えられる
     * @param {number} [delay] 光り始めるまでの待ち。破壊時に連ねて瞬かせるのに使う
     * @param {object} [colors] 色。反射ビームの被弾（紫）のために後から足した。
     *   **既定は従来の白＋淡い橙**で、色を渡さない既存の呼び出しは見た目が変わらない
     * @param {string} [colors.core] 中心の芯
     * @param {string} [colors.ring] 外周のリング
     */
    constructor(x, y, radius = IMPACT_FLASH_RADIUS, delay = 0, colors = {}) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.delay = delay;
        this.coreColor = colors.core ?? '#FFFFFF';
        this.ringColor = colors.ring ?? '#FFE8A0';
        this.maxLifetime = IMPACT_FLASH_LIFETIME;
        this.lifetime = IMPACT_FLASH_LIFETIME;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;
        // 待機中は寿命を消費しない。消費すると遅い閃光ほど短命になってしまう
        if (this.delay > 0) {
            this.delay--;
            return;
        }
        this.lifetime--;
        if (this.lifetime <= 0) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive || this.delay > 0) return;

        const p = 1 - this.lifetime / this.maxLifetime;   // 0 → 1
        const r = this.radius * (0.35 + 0.65 * p);        // 広がる
        const alpha = 1 - p;                              // 薄れる

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;

        // 中心の芯。序盤ほど大きく、すぐ縮んで消える
        ctx.fillStyle = this.coreColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * (1 - p) * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // 外周のリング。これが「輪郭のある閃光」に見せている部分
        ctx.strokeStyle = this.ringColor;
        ctx.lineWidth = Math.max(1, 2 * (1 - p));
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}
