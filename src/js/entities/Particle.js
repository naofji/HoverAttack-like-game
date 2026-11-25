// ============================================
// Particle System - Explosions & Effects（入口）
// ============================================
//
// 中身は entities/particles/ に系統ごと3ファイル（2026-11-25 に分けた。1ファイルに11クラス・
// 670行あり、爆発・武器・地形の演出が混ざっていた）。使う側の import を変えずに済むよう、
// ここは再 export するだけにしてある（utils/Constants.js と同じ作り）。
// 新しい粒子を足すときは、系統が合う particles/ のファイルに書いてここに名前を足す。

export { MACHINE_EXPLOSION_OPTS, PLAYER_EXPLOSION_OPTS, CARRIER_EXPLOSION_OPTS, Particle, FlashParticle, createExplosion, createSparks } from './particles/explosion.js';
export { RicochetStreak, TrailParticle, CasingParticle, ImpactFlash } from './particles/weaponFx.js';
export { SplashParticle, SnowKickParticle, SnowMistParticle, SnowFlurryParticle, WaterMistParticle } from './particles/terrainFx.js';
