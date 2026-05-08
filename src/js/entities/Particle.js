// ============================================
// Particle System - Explosions & Effects
// ============================================

import { PARTICLE_LIFETIME, EXPLOSION_PARTICLE_COUNT } from '../utils/Constants.js';

// --------------------------------------------
// Explosion Particle
// --------------------------------------------
export class Particle {
    constructor(x, y, vx, vy, color, size, lifetime) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
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
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
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

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(this.x) - size / 2, Math.round(this.y) - size / 2, size, size);
        ctx.restore();
    }
}

// --------------------------------------------
// Factory: Explosion Particles
// --------------------------------------------
const EXPLOSION_COLORS = ['#FFFF00', '#FFAA00', '#FF6600', '#FFFFFF', '#FF4400'];

export function createExplosion(x, y, count) {
    const particles = [];

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 3;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
        const size = 1 + Math.random() * 4;
        const lifetime = 10 + Math.floor(Math.random() * 25);

        particles.push(new Particle(x, y, vx, vy, color, size, lifetime));
    }

    return particles;
}

// --------------------------------------------
// Factory: Damage Sparks
// --------------------------------------------
const SPARK_COLORS = ['#FFFFE0', '#FFD700', '#FFA500'];

export function createSparks(x, y) {
    const particles = [];
    const count = 3 + Math.floor(Math.random() * 3); // 3 to 5 sparks

    for (let i = 0; i < count; i++) {
        // Upwards spread
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 1.5 + Math.random() * 2.5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
        const size = 2;
        const lifetime = 10 + Math.floor(Math.random() * 10);

        particles.push(new Particle(x, y, vx, vy, color, size, lifetime));
    }

    return particles;
}
