// ============================================
// Destruction - 機体の破壊演出をひとつにまとめる
// ============================================
// 以前は各機体の die() が「破片」「爆発」「(アタッカーのみ)閃光」を
// それぞれ別に呼んでおり、3つが同時に出て互いを打ち消していた。
//
// ここでは順序を持たせる:
//   1. 閃光が走り、破片は白熱シルエットのまま静止（破片側の holdFrames）
//   2. ホールドが明けるのと同時に爆発し、パーツが飛び散る
//
// 機体ごとの違いは DESTRUCTION_PROFILES の数値だけ。新しい機体を足すときも
// プロファイルを1つ書けば済む。

import { ImpactFlash, MACHINE_EXPLOSION_OPTS, PLAYER_EXPLOSION_OPTS, CARRIER_EXPLOSION_OPTS } from './Particle.js';
import { DelayedCall } from './DelayedCall.js';
import { DEBRIS_SPECS } from './debris/index.js';
import {
    IMPACT_FLASH_RADIUS, IMPACT_FLASH_RADIUS_MG, DEATH_FLASH_STAGGER,
    EXPLOSION_PARTICLE_COUNT, GRENADE_EXPLOSION_COUNT,
    PLAYER_DEATH_EXPLOSION_COUNT, CARRIER_DEATH_EXPLOSION_COUNT,
    FINALE_SHAKE_INTENSITY, FINALE_SHAKE_DURATION,
} from '../utils/Constants.js';

/**
 * 機体ごとの破壊演出。
 *
 * - `flash.count` / `flash.radius` — 閃光の数と大きさ
 * - `flash.stagger` — 閃光同士の時間差（0なら同時）
 * - `blast.count` / `blast.opts` — 爆発の粒子数と広がり
 * - `blast.delay` — 閃光から爆発までの間。破片の holdFrames と揃える
 * - `shake` — 爆発と同時にカメラを揺らすなら {intensity, duration}
 */
export const DESTRUCTION_PROFILES = {
    drone: {
        flash: { count: 2, radius: IMPACT_FLASH_RADIUS * 0.7, stagger: 0 },
        blast: { count: 20, opts: MACHINE_EXPLOSION_OPTS, delay: 0 },
    },
    tank: {
        flash: { count: 3, radius: IMPACT_FLASH_RADIUS * 0.8, stagger: DEATH_FLASH_STAGGER },
        blast: { count: EXPLOSION_PARTICLE_COUNT, opts: MACHINE_EXPLOSION_OPTS, delay: 2 },
    },
    turret: {
        flash: { count: 3, radius: IMPACT_FLASH_RADIUS * 0.8, stagger: DEATH_FLASH_STAGGER },
        blast: { count: 30, opts: MACHINE_EXPLOSION_OPTS, delay: 2 },
    },
    attacker: {
        flash: { count: 5, radius: IMPACT_FLASH_RADIUS, stagger: DEATH_FLASH_STAGGER },
        blast: { count: EXPLOSION_PARTICLE_COUNT, opts: MACHINE_EXPLOSION_OPTS, delay: 4 },
    },
    player: {
        flash: { count: 5, radius: IMPACT_FLASH_RADIUS, stagger: DEATH_FLASH_STAGGER },
        blast: { count: PLAYER_DEATH_EXPLOSION_COUNT, opts: PLAYER_EXPLOSION_OPTS, delay: 5 },
    },
    carrier: {
        flash: { count: 8, radius: IMPACT_FLASH_RADIUS * 1.4, stagger: DEATH_FLASH_STAGGER },
        blast: { count: CARRIER_DEATH_EXPLOSION_COUNT, opts: CARRIER_EXPLOSION_OPTS, delay: 6 },
        shake: { intensity: FINALE_SHAKE_INTENSITY, duration: FINALE_SHAKE_DURATION },
    },
};

/**
 * 破壊演出を再生する。各機体の die() はこれを1回呼ぶだけでよい。
 * @param {object} game
 * @param {object} entity 破壊された機体（x/y/width/height を使う）
 * @param {string} kind DESTRUCTION_PROFILES と DEBRIS_SPECS のキー
 */
export function playDestruction(game, entity, kind) {
    const profile = DESTRUCTION_PROFILES[kind];
    if (!profile) return;

    const cx = entity.x + entity.width / 2;
    const cy = entity.y + entity.height / 2;

    // 1. 破片を出す。破片側の holdFrames のあいだ白熱シルエットで静止する。
    game.spawnDebris(entity, kind);

    // 2. その静止のあいだに閃光を走らせる。
    for (let i = 0; i < profile.flash.count; i++) {
        game.particles.push(new ImpactFlash(
            entity.x + Math.random() * entity.width,
            entity.y + Math.random() * entity.height,
            profile.flash.radius * (0.7 + Math.random() * 0.4),
            i === 0 ? 0 : Math.round(i * profile.flash.stagger * (0.6 + Math.random() * 0.8)),
        ));
    }

    // 3. ホールドが明けるのと同時に爆発させる。
    const blast = () => {
        game.spawnExplosion(cx, cy, profile.blast.count, profile.blast.opts);
        if (profile.shake && game.camera) {
            game.camera.shake(profile.shake.intensity, profile.shake.duration);
        }
    };
    if (profile.blast.delay > 0) {
        game.particles.push(new DelayedCall(profile.blast.delay, blast));
    } else {
        blast();
    }
}

/** 破片スペックと突き合わせて、遅延がホールドと揃っているかを外から確認できるように。 */
export { DEBRIS_SPECS };


// ============================================
// 点の爆発（機体の破壊ではないもの）
// ============================================
// 着弾・誘爆・地雷など。以前は各所が spawn Explosion をその場の数値で呼んでおり、
// 閃光の有無も揃っていなかった（ミサイルは敵に当たると光るのに地形では光らない、
// など）。ここに集約して、どの爆発も「閃光＋粒子」で構成されるようにする。
//
// - `flash.count` / `flash.radius` — 閃光の数と大きさ
// - `flash.spread` — 閃光を散らす範囲（0なら着弾点そのもの）
// - `blast.count` — 爆発の粒子数
export const BLAST_PROFILES = {
    // --- 着弾 ---
    mgHit: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS_MG, spread: 0 },
        blast: { count: 4 },
    },
    missileHit: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS, spread: 0 },
        blast: { count: 12 },
    },
    missileTerrain: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS, spread: 0 },
        blast: { count: EXPLOSION_PARTICLE_COUNT },
    },
    enemyMissileHit: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS, spread: 0 },
        blast: { count: 8 },
    },
    homingHit: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS, spread: 0 },
        blast: { count: 12 },
    },
    cruiseSpark: {
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS_MG, spread: 0 },
        blast: { count: 5 },
    },

    // --- 誘爆・大型 ---
    grenade: {
        flash: { count: 3, radius: IMPACT_FLASH_RADIUS * 1.5, spread: 24 },
        blast: { count: GRENADE_EXPLOSION_COUNT },
    },
    cruise: {
        flash: { count: 3, radius: IMPACT_FLASH_RADIUS * 1.5, spread: 24 },
        blast: { count: GRENADE_EXPLOSION_COUNT },
    },
    landmine: {
        flash: { count: 2, radius: IMPACT_FLASH_RADIUS * 1.2, spread: 16 },
        blast: { count: EXPLOSION_PARTICLE_COUNT },
    },

    // --- 敵基地 ---
    baseDying: {   // 破壊シーケンス中の連続爆発。粒子数は呼び出し側が渡す
        flash: { count: 1, radius: IMPACT_FLASH_RADIUS, spread: 12 },
        blast: { count: EXPLOSION_PARTICLE_COUNT },
    },
    baseFinal: {
        flash: { count: 4, radius: IMPACT_FLASH_RADIUS * 1.6, spread: 28 },
        blast: { count: 80 },
    },
};

/**
 * 点の爆発を再生する。
 * @param {object} game
 * @param {number} x 爆心
 * @param {number} y
 * @param {string} kind BLAST_PROFILES のキー
 * @param {number} [countOverride] 粒子数を上書きする（基地の連続爆発など）
 */
export function playBlast(game, x, y, kind, countOverride) {
    const profile = BLAST_PROFILES[kind];
    if (!profile) return;

    const { count, radius, spread } = profile.flash;
    for (let i = 0; i < count; i++) {
        const ox = spread ? (Math.random() - 0.5) * 2 * spread : 0;
        const oy = spread ? (Math.random() - 0.5) * 2 * spread : 0;
        game.particles.push(new ImpactFlash(
            x + ox, y + oy,
            radius * (count > 1 ? 0.7 + Math.random() * 0.4 : 1),
            i === 0 ? 0 : Math.round(i * DEATH_FLASH_STAGGER * (0.6 + Math.random() * 0.8)),
        ));
    }

    game.spawnExplosion(x, y, countOverride ?? profile.blast.count);
}
