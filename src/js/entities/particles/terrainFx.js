// ============================================
// 地形の演出（水しぶき・雪を蹴る・ホバーの粉雪と水煙・雪の木から舞う雪）
// ============================================
//
// もとは entities/Particle.js の一部（2026-11-25 に分けた、中身は動かしただけ）。
// 使う側は今までどおり entities/Particle.js から import する。

import {
    SPLASH_LIFETIME, SNOW_KICK_COLOR, SNOW_KICK_LIFETIME, HOVER_SNOW_MIST_COLOR,
    HOVER_SNOW_MIST_LIFETIME, SNOWTREE_FLURRY_DRAG, SNOWTREE_FLURRY_GRAVITY, SNOWTREE_FLURRY_SWAY,
    SNOWTREE_FLURRY_SWAY_FREQ, HOVER_WATER_MIST_COLOR, HOVER_WATER_MIST_LIFETIME,
} from '../../utils/Constants.js';

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
// Snow Kick - 足元から舞い上がる雪
// --------------------------------------------
//
// SplashParticle と同じ形（fillRect 1回、save/restore なし）。違うのは色と
// 重力だけで、雪は水しぶきより軽く落ちるので 0.18 ではなく 0.12 にしてある。
export class SnowKickParticle {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.lifetime = SNOW_KICK_LIFETIME;
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.vy += 0.12;
        this.x += this.vx;
        this.y += this.vy;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.globalAlpha = Math.max(0.15, this.lifetime / SNOW_KICK_LIFETIME);
        ctx.fillStyle = SNOW_KICK_COLOR;
        ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Snow Mist - ホバー中に地表で舞う粉雪
// --------------------------------------------
//
// SnowKickParticle は「蹴る」ので重力 0.12 で素早く落ちるが、こちらは接地せず
// 漂うだけなので重力を 1/6 (0.02) に弱め、寿命も伸ばしてふわっと漂わせる。
// 見分けやすいよう、alpha の上限は SnowKick(1.0) よりわずかに低く抑える程度に留める
// （実機の指摘: 巻き上げの勢いが伝わるくらい、はっきり見えてよい）。
//
// 地面とは CasingParticle と同じ考え方であたる（game.map.isSolidAtPixel）が、
// 跳ね返らずそのまま地面に吸収されて消える（実機の指摘: 粉雪が跳ねるのは不自然）。
// game.map が無ければ（テストの簡易呼び出しなど）衝突を見ずに素通りする。
export class SnowMistParticle {
    constructor(game, x, y, vx, vy) {
        this.game = game;
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.lifetime = HOVER_SNOW_MIST_LIFETIME;
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.vy += 0.02;
        const nextX = this.x + this.vx;
        const nextY = this.y + this.vy;
        const map = this.game && this.game.map;
        if (map && map.isSolidAtPixel && map.isSolidAtPixel(nextX, nextY)) {
            this.alive = false;
            return;
        }
        this.x = nextX;
        this.y = nextY;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.globalAlpha = Math.max(0.1, (this.lifetime / HOVER_SNOW_MIST_LIFETIME) * 0.9);
        ctx.fillStyle = HOVER_SNOW_MIST_COLOR;
        ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Snow Flurry - 雪の木が欠ける・倒れるときに舞う雪
// --------------------------------------------
//
// SnowMistParticle（ホバーの粉雪）との違いは 2 つ。出た勢いで飛んだあと空気抵抗で止まる（drag）ことと、
// ゆっくり左右に揺れながら落ちる（sway）こと。「ぱっと散る」ではなく「舞う」にするための動き。
// 揺れは粒ごとの位相でずらす（揃うと群れが一枚の布のように揺れる）。位相は見た目だけなので Math.random でよい。
// 落ちる速さは重力と抵抗が釣り合う GRAVITY / (1 - DRAG) に収まる（0.02 / 0.05 = 0.4px/tick）。
// 地面（game.map.isSolidAtPixel）に触れたら、跳ねずに吸収されて消える（SnowMistParticle と同じ）。
// game.map が無い（テストの簡易呼び出し）ときは衝突を見ない。
export class SnowFlurryParticle {
    constructor(game, x, y, vx, vy, color, size, lifetime) {
        this.game = game;
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.color = color;
        this.size = size;
        this.maxLifetime = lifetime;
        this.lifetime = lifetime;
        this.age = 0;
        this.phase = Math.random() * Math.PI * 2;
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.age++;
        this.vx *= SNOWTREE_FLURRY_DRAG;
        this.vy = this.vy * SNOWTREE_FLURRY_DRAG + SNOWTREE_FLURRY_GRAVITY;
        const sway = Math.sin(this.age * SNOWTREE_FLURRY_SWAY_FREQ + this.phase) * SNOWTREE_FLURRY_SWAY;
        const nextX = this.x + this.vx + sway;
        const nextY = this.y + this.vy;
        const map = this.game && this.game.map;
        // 形（isSolidPoint）で当てる。タイル単位（isSolidAtPixel）だと、5面の坂のマスはまるごと岩なので、
        // 坂の雪面の着弾・爆発で生まれた粒が最初の更新で消えた（2026-11-22 最終レビューの指摘。坂では 3 粒中 0〜2 粒しか
        // 残らなかった）。形の問い合わせを持たない地図（テストの偽地図）はタイル単位のまま
        const solidAt = map && (map.isSolidPoint || map.isSolidAtPixel);
        if (solidAt && solidAt.call(map, nextX, nextY)) {
            this.alive = false;
            return;
        }
        this.x = nextX;
        this.y = nextY;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        // 寿命の最後の 4 割で薄れる（途中までははっきり見える）
        ctx.globalAlpha = Math.min(1, this.lifetime / (this.maxLifetime * 0.4));
        ctx.fillStyle = this.color;
        const s = this.size;
        ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
        ctx.globalAlpha = 1.0;
    }
}

// --------------------------------------------
// Water Mist - ホバー中に水面で舞う水滴（SnowMistParticle の水面版）
// --------------------------------------------
//
// 形は SnowMistParticle と同じ（漂って、触れたら跳ねずに吸収されて消える）。
// 重力だけ変えてある: 水滴は雪の粉より重いので SnowMist(0.02)より強く、
// 派手に跳ねる水しぶき SplashParticle(0.18)ほどではない中間の値にする。
// 当たるのは地面(isSolidAtPixel)ではなく水面(isWaterAtPixel)。
export class WaterMistParticle {
    constructor(game, x, y, vx, vy) {
        this.game = game;
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.lifetime = HOVER_WATER_MIST_LIFETIME;
        this.size = Math.random() < 0.3 ? 3 : (Math.random() < 0.4 ? 1 : 2);
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.vy += 0.06;
        const nextX = this.x + this.vx;
        const nextY = this.y + this.vy;
        const map = this.game && this.game.map;
        if (map && map.isWaterAtPixel && map.isWaterAtPixel(nextX, nextY)) {
            this.alive = false;
            return;
        }
        this.x = nextX;
        this.y = nextY;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.globalAlpha = Math.max(0.1, (this.lifetime / HOVER_WATER_MIST_LIFETIME) * 0.9);
        ctx.fillStyle = HOVER_WATER_MIST_COLOR;
        const half = Math.floor(this.size / 2);
        ctx.fillRect(Math.round(this.x) - half, Math.round(this.y) - half, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}
