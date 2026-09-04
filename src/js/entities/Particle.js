// ============================================
// Particle System - Explosions & Effects
// ============================================

import {
    PARTICLE_LIFETIME, EXPLOSION_SPREAD_WITH_DEBRIS,
    PLAYER_DEATH_EXPLOSION_SPREAD, CARRIER_DEATH_EXPLOSION_SPREAD,
    IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS,
    DEATH_FLASH_COUNT, DEATH_FLASH_STAGGER,
    RICOCHET_STREAK_LENGTH, RICOCHET_STREAK_LIFETIME, RICOCHET_STREAK_WIDTH,
    COLOR_RICOCHET, COLOR_RICOCHET_FADE,
    SPLASH_LIFETIME,
} from '../utils/Constants.js';
import { lerpColor } from '../utils/color.js';

/**
 * 本物のパーツ破片を撒く6機体（Player / Carrier / Drone / Tank / Turret / Attacker）が
 * 共有する爆発オプション。擬似デブリ粒子を混ぜず、広がりを抑えて破片を隠さない。
 */
export const MACHINE_EXPLOSION_OPTS = {
    debrisSmoke: false,
    spread: EXPLOSION_SPREAD_WITH_DEBRIS,
};

/**
 * 自機の死専用。他機体より広く取る（PLAYER_DEATH_EXPLOSION_SPREAD の理由は
 * Constants.js のコメント参照）。
 */
export const PLAYER_EXPLOSION_OPTS = {
    debrisSmoke: false,
    spread: PLAYER_DEATH_EXPLOSION_SPREAD,
};

/** 母艦の死専用。最大の機体なので、いちばん広く取る。 */
export const CARRIER_EXPLOSION_OPTS = {
    debrisSmoke: false,
    spread: CARRIER_DEATH_EXPLOSION_SPREAD,
};

// --------------------------------------------
// Explosion Particle
// --------------------------------------------
export class Particle {
    /**
     * @param {string} color 出た瞬間の色
     * @param {string|null} [fadeTo] 寿命の終わりに寄っていく色。
     *   反射ビームの被弾（白く出て紫に冷める）のために後から足した。
     *   **省略すると従来どおり最後まで単色**で、既存の粒は見た目が変わらない
     */
    constructor(x, y, vx, vy, color, size, lifetime, fadeTo = null) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.fadeTo = fadeTo;
        this.size = size;
        this.maxLifetime = lifetime || PARTICLE_LIFETIME;
        this.lifetime = this.maxLifetime;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;

        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; // slight gravity on particles
        this.lifetime--;

        if (this.lifetime <= 0) {
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const alpha = this.lifetime / this.maxLifetime;
        const s = this.size * (0.5 + 0.5 * alpha);

        ctx.globalAlpha = alpha;
        // fadeTo があれば経過に応じて色を移す。「拡がるにつれて紫になる」を
        // 位置ではなく時間で作っているのは、粒の速度がばらばらでも同じ見え方に
        // なるため（距離で決めると速い粒だけ先に紫になり、群れとして揃わない）
        ctx.fillStyle = this.fadeTo
            ? lerpColor(this.color, this.fadeTo, 1 - alpha)
            : this.color;
        ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
        ctx.globalAlpha = 1.0;
    }
}

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
// SplashParticle - 水面のしぶき。上へ跳ねて重力で落ちる。fillRect 1回
// --------------------------------------------
export class SplashParticle {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.lifetime = SPLASH_LIFETIME;
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.vy += 0.18;           // 粒は軽いので重力は本体より弱め
        this.x += this.vx;
        this.y += this.vy;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.globalAlpha = Math.max(0.15, this.lifetime / SPLASH_LIFETIME);
        ctx.fillStyle = '#BFE3FF';
        ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Flash Particle - Quick bright circle for explosions
// --------------------------------------------
export class FlashParticle {
    constructor(x, y, maxSize, lifetime = 15) {
        this.x = x;
        this.y = y;
        this.maxSize = maxSize;
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
        const alpha = Math.max(0, 1.0 - progress);
        const size = this.maxSize * (0.2 + 0.8 * Math.sin(progress * Math.PI));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.8;
        
        // Outer glow
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.4, '#FFFF88');
        grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
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

/**
 * 機体の破壊時に、ミサイル着弾と同じくらいの閃光を機体の範囲へ散らし、
 * 時間差で瞬かせる。1発の大きな光より誘爆している感じが出る。
 * @returns {ImpactFlash[]}
 */
export function createDeathFlashes(x, y, width, height) {
    const out = [];
    for (let i = 0; i < DEATH_FLASH_COUNT; i++) {
        out.push(new ImpactFlash(
            x + Math.random() * width,
            y + Math.random() * height,
            IMPACT_FLASH_RADIUS * (0.7 + Math.random() * 0.4),
            // 1つ目は即座に。以降は刻みごとにばらつかせる
            i === 0 ? 0 : Math.round(i * DEATH_FLASH_STAGGER * (0.6 + Math.random() * 0.8)),
        ));
    }
    return out;
}

// --------------------------------------------
// Factory: Explosion Particles
// --------------------------------------------
const EXPLOSION_COLORS = ['#FFFF00', '#FFAA00', '#FF6600', '#FFFFFF', '#FF4400'];

/**
 * @param {number} x
 * @param {number} y
 * @param {number} count
 * @param {object} [opts]
 * @param {boolean} [opts.debrisSmoke=true] 灰色のデブリ粒子を混ぜるか。
 *   本物のパーツ破片を撒く機体では false にして画面が濁るのを避ける。
 * @param {number} [opts.spread=1] 爆発の広がり倍率。粒子の初速と中央フラッシュの
 *   大きさに乗る。粒子数は変えないので、下げると密度を保ったまま塊が小さくなる。
 */
export function createExplosion(x, y, count, opts = {}) {
    const { debrisSmoke = true, spread = 1 } = opts;
    const particles = [];

    // Add a central flash
    const flashSize = (10 + count / 4) * spread;
    particles.push(new FlashParticle(x, y, flashSize));

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.5 + Math.random() * (count > 50 ? 5 : 3)) * spread;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        // Variety of colors
        let color = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
        if (debrisSmoke && Math.random() < 0.2) color = '#888888'; // Add some debris/smoke particles

        const size = 1 + Math.random() * 4;
        const lifetime = 15 + Math.floor(Math.random() * 25);

        particles.push(new Particle(x, y, vx, vy, color, size, lifetime));
    }

    return particles;
}

// --------------------------------------------
// Factory: Damage Sparks
// --------------------------------------------
const SPARK_COLORS = ['#FFFFE0', '#FFD700', '#FFA500'];

/**
 * ダメージのスパーク。
 *
 * opts は反射ビームの被弾演出（紫・全方向・数多め）のために後から足した。
 * **既定値は従来の見た目そのまま**にしてあり、引数なしの既存の呼び出し
 * （game.spawnSparks 経由が全部これ）は挙動が変わらない。
 *
 * @param {object} [opts]
 * @param {string[]} [opts.colors] 色の候補
 * @param {number} [opts.count] 個数（省略時は3〜5のランダム）
 * @param {boolean} [opts.radial] true なら全方向へ。既定は従来どおり上向きに扇状
 * @param {number} [opts.speedMin]
 * @param {number} [opts.speedMax]
 * @param {number} [opts.lifetime] 省略時は10〜19のランダム
 * @param {number} [opts.size] 粒の一辺。省略時は従来どおり2
 * @param {string} [opts.fadeTo] 寿命の終わりに寄っていく色。省略時は単色のまま
 */
export function createSparks(x, y, opts = {}) {
    const {
        colors = SPARK_COLORS,
        count = 3 + Math.floor(Math.random() * 3), // 3 to 5 sparks
        radial = false,
        speedMin = 1.5,
        speedMax = 4.0,
        lifetime = null,
        size = 2,
        fadeTo = null,
    } = opts;
    const particles = [];

    for (let i = 0; i < count; i++) {
        // 上向きの扇（従来）か、被弾点から全方向へ弾ける形か
        const angle = radial
            ? Math.random() * Math.PI * 2
            : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const life = lifetime ?? 10 + Math.floor(Math.random() * 10);

        particles.push(new Particle(x, y, vx, vy, color, size, life, fadeTo));
    }

    return particles;
}
