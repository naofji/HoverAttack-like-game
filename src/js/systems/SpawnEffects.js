// ============================================
// Spawn Effects
// ============================================
//
// 爆発・破片・火花・煙幕を撒く入口。当たり判定を持たない演出用の生成を
// ここに集めてある。エンティティ側は「何を撒くか」だけ決めて、
// particles 配列への相乗りと上限の管理はこちらが引き受ける。
//
// settingsFlow.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { DEBRIS_MAX_ACTIVE, LANDMINE_BLAST_RADIUS, SPLASH_MAX_PARTICLES, SPLASH_PARTICLES_PER_VY } from '../utils/Constants.js';
import { createExplosion, createSparks, SplashParticle, SnowKickParticle } from '../entities/Particle.js';
import { SmokeScreen } from '../entities/SmokeScreen.js';
import { buildDebris, trimDebris } from '../entities/debris/index.js';
import { audioManager } from '../audio/AudioManager.js';

export const SpawnEffects = {
    /** Spawn explosion particles and chain-detonate nearby landmines */
    spawnExplosion(x, y, size, opts) {
        this.particles.push(...createExplosion(x, y, size, opts));
        audioManager.playExplosion(size > 10, x);

        for (const mine of this.landmines) {
            if (!mine.alive) continue;
            const dx = (mine.x + mine.width / 2) - x;
            const dy = (mine.y + mine.height / 2) - y;
            if (dx * dx + dy * dy <= LANDMINE_BLAST_RADIUS * LANDMINE_BLAST_RADIUS) mine.detonate();
        }
    },

    /**
     * 破壊された機体のパーツを破片として撒く。
     * 当たり判定は持たず、既存の particles 配列に相乗りするだけ。
     * @param {object} entity 破壊された機体
     * @param {string} kind DEBRIS_SPECS のキー
     */
    spawnDebris(entity, kind) {
        const debris = buildDebris(entity, kind);
        if (debris.length === 0) return;
        this.particles.push(...debris);
        this._trimDebris();
    },

    /** 破片の同時存在数を上限内に収める。古い破片から落とす。 */
    _trimDebris() {
        trimDebris(this.particles, DEBRIS_MAX_ACTIVE);
    },

    /** Spawn damage sparks at position */
    spawnSparks(x, y) {
        this.particles.push(...createSparks(x, y));
    },

    /**
     * 煙幕を張る。artillery が自機に発見されたときに呼ぶ。
     * 当たり判定は持たず、視界と Auto Aim だけを遮る。
     */
    spawnSmokeScreen(x, y) {
        this.smokeScreens.push(new SmokeScreen(x, y));
        audioManager.playWeapon('smoke', x, y);
    },

    /** Spawn heavy damage effect (sparks + sound) */
    spawnHeavyDamage(x, y) {
        this.spawnSparks(x, y);
        audioManager.playHeavyDamage();
    },

    /**
     * 水面のしぶき。エンティティが水面をまたいだフレームに StageEnvironment が呼ぶ。
     * 粒の数は |vy| に比例（速く落ちるほど盛大）。水面には波紋を足す。
     */
    spawnSplash(x, surfaceY, vy) {
        const n = Math.min(SPLASH_MAX_PARTICLES, Math.ceil(Math.abs(vy) * SPLASH_PARTICLES_PER_VY));
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const s = 1 + Math.random() * Math.min(4, Math.abs(vy));
            this.particles.push(new SplashParticle(x, surfaceY, Math.cos(a) * s, Math.sin(a) * s));
        }
        const r = this.env && this.env.renderer;
        if (r && r.addRipple) r.addRipple(x, Math.min(6, Math.abs(vy)));
    },

    /**
     * 舞う雪。足元から count 粒。
     * spawnSplash と違って上限を設けていないのは、SNOW_KICK_LIFETIME（30F）で
     * 必ず消えるうえ 1 フレームあたり最大 SNOW_KICK_SLIDE 粒しか出ないため。
     */
    spawnSnowKick(x, y, count) {
        for (let i = 0; i < (count | 0); i++) {
            this.particles.push(new SnowKickParticle(
                x + (Math.random() - 0.5) * 12, y,
                (Math.random() - 0.5) * 2, -(1 + Math.random() * 1.5),
            ));
        }
    },
};
