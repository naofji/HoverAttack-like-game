// ============================================
// 爆発とダメージのスパーク
// ============================================
//
// 爆発の火の粉（Particle）・中央の閃光（FlashParticle）と、それを撒く createExplosion /
// createSparks。機体ごとの爆発の広がり（*_EXPLOSION_OPTS）もここ。
// もとは entities/Particle.js の1ファイル（11クラス・670行）だった。2026-11-25 に系統で3つに
// 分けた（中身は動かしただけ）。使う側は今までどおり entities/Particle.js から import する。

import {
    PARTICLE_LIFETIME, EXPLOSION_SPREAD_WITH_DEBRIS, PLAYER_DEATH_EXPLOSION_SPREAD,
    CARRIER_DEATH_EXPLOSION_SPREAD,
} from '../../utils/Constants.js';
import { lerpColor } from '../../utils/color.js';

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
