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

import {
    DEBRIS_MAX_ACTIVE, LANDMINE_BLAST_RADIUS, SPLASH_MAX_PARTICLES, SPLASH_PARTICLES_PER_VY, WATER_RIPPLE_MAX,
    CASING_EJECT_SPREAD, CASING_EJECT_SPEED_MIN, CASING_EJECT_SPEED_MAX, CASING_EJECT_ANGLE_FROM_UP,
    EXPLOSION_RIPPLE_STRENGTH,
    WATER_COLUMN_PARTICLE_COUNT, WATER_COLUMN_SPEED_MIN, WATER_COLUMN_SPEED_MAX, WATER_COLUMN_SPREAD,
    TILE_SIZE,
} from '../utils/Constants.js';
import { createExplosion, createSparks, SplashParticle, SnowKickParticle, SnowMistParticle, CasingParticle } from '../entities/Particle.js';
import { SmokeScreen } from '../entities/SmokeScreen.js';
import { buildDebris, trimDebris } from '../entities/debris/index.js';
import { audioManager } from '../audio/AudioManager.js';

export const SpawnEffects = {
    /** Spawn explosion particles and chain-detonate nearby landmines */
    spawnExplosion(x, y, size, opts) {
        this.particles.push(...createExplosion(x, y, size, opts));
        audioManager.playExplosion(size > 10, x);

        // 水中での爆発（グレネード・ミサイル・敵機の破壊。全部ここを通る）は水面を揺らし、
        // 水柱を上げる。spawnSplash と違って「面をまたいだ」タイミングを検出する必要はなく、
        // 爆発の中心が水中にあれば毎回でよい
        const map = this.map;
        if (map && map.isWaterAtPixel && map.isWaterAtPixel(x, y)) {
            const r = this.env && this.env.renderer;
            if (r && r.addRipple) r.addRipple(x, EXPLOSION_RIPPLE_STRENGTH);
            this.spawnWaterColumn(x, y);
        }

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
        if (r && r.addRipple) r.addRipple(x, Math.min(WATER_RIPPLE_MAX, Math.abs(vy)));
    },

    /**
     * 水中爆発の水柱。SplashParticle をしぶきよりずっと勢いよく・まっすぐ上向きに
     * 多めに打ち上げる（実機の指摘: グレネードの爆発が敵機の爆発より地味に見える）。
     * (x, y) は爆発の中心（水中）。水面の Y は map.getSurfaceY から求める。
     */
    spawnWaterColumn(x, y) {
        const map = this.map;
        if (!map || !map.getSurfaceY) return;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        const surfaceY = map.getSurfaceY(r, c);
        if (surfaceY < 0) return;

        for (let i = 0; i < WATER_COLUMN_PARTICLE_COUNT; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * WATER_COLUMN_SPREAD;
            const s = WATER_COLUMN_SPEED_MIN + Math.random() * (WATER_COLUMN_SPEED_MAX - WATER_COLUMN_SPEED_MIN);
            this.particles.push(new SplashParticle(x, surfaceY, Math.cos(a) * s, Math.sin(a) * s));
        }
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

    /**
     * ホバー中、雪面の1〜2ブロック上空で地表に舞う粉雪。count は毎回まとめて
     * （HOVER_SNOW_MIST_COUNT）で、呼ぶ側が既に発生間隔で間引いている。
     *
     * スラスターの風は真上から受けるので、平地では真上には吹き上がらず
     * 横（水平から最大45度）に拡散する。`onSlope` が立っていれば、風が
     * 斜辺に逃げる形として水平から下向きに最大45度で舞わせる（実機の指摘:
     * 以前の全方位・高速な版は勢いよすぎた）。
     *
     * 角度は「右=0度、上=+90度」の独自基準（キャンバスは下が正なので
     * vy = -sin）。平地は [0,45]∪[135,180]、斜面は [-45,0]∪[180,225]。
     */
    spawnSnowMist(x, y, count, onSlope) {
        for (let i = 0; i < (count | 0); i++) {
            const dirSign = Math.random() < 0.5 ? 1 : -1; // 右 or 左
            const tilt = Math.random() * (Math.PI / 4); // 水平から最大45度
            const theta = dirSign > 0
                ? (onSlope ? -tilt : tilt)
                : (onSlope ? Math.PI + tilt : Math.PI - tilt);
            const s = 0.4 + Math.random() * 0.8;
            this.particles.push(new SnowMistParticle(
                this, x + (Math.random() - 0.5) * 24, y,
                Math.cos(theta) * s, -Math.sin(theta) * s,
            ));
        }
    },

    /**
     * マシンガンの薬莢を1個排出する。狙いの角度ではなく自機の向き（facingRight）基準で、
     * 常に「背中側・上」（右向きなら左上、左向きなら右上）へ飛ぶ。狙いの角度に追従すると
     * 上を向いて撃ったときなどに変な方向へ飛んでしまうため、左右反転にだけ追従させる（実機の指摘）。
     */
    spawnCasing(x, y, facingRight) {
        // 真上(-90°)から背中側へ CASING_EJECT_ANGLE_FROM_UP だけ傾けた方向。
        // 右向きなら背中は左(-方向)なので上へ足す、左向きなら背中は右なので引く
        const base = -Math.PI / 2 + (facingRight ? -1 : 1) * CASING_EJECT_ANGLE_FROM_UP;
        const eject = base + (Math.random() - 0.5) * CASING_EJECT_SPREAD;
        const speed = CASING_EJECT_SPEED_MIN + Math.random() * (CASING_EJECT_SPEED_MAX - CASING_EJECT_SPEED_MIN);
        this.particles.push(new CasingParticle(this, x, y, Math.cos(eject) * speed, Math.sin(eject) * speed));
    },
};
