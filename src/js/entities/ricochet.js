// ============================================
// Ricochet - 装甲に弾かれた跳弾の演出
// ============================================
// mgDamageMult を持つ敵（今は artillery だけ）に MG が当たったときに呼ぶ。
// ダメージは軽減されつつも入っているので、完全に弾く周回シールドの
// shieldDeflect とは別の音（armorRicochet）を鳴らす。
//
// playBlast / playDestruction と同じ作法で、呼び出し側は1行で済ませられる形にした。
// 音の間引きもここに閉じ込めてあるので、呼ぶ側は頻度を気にしなくてよい。

import { RicochetStreak, ImpactFlash } from './Particle.js';
import { audioManager } from '../audio/AudioManager.js';
import {
    RICOCHET_STREAK_COUNT, RICOCHET_STREAK_SPEED, RICOCHET_SPREAD,
    RICOCHET_SOUND_INTERVAL_MS, RICOCHET_FLASH_RADIUS,
    COLOR_RICOCHET_FLASH_CORE, COLOR_RICOCHET_FLASH_RING,
} from '../utils/Constants.js';

// 最後に「カン！」を鳴らした時刻。フレームではなく実時間で見るのは、
// これが物理ではなく耳の都合（音が詰まると雑音になる）だから。
// ドック補給と同じ考え方で、ゲーム速度で伸び縮みしてほしくない
let lastSoundAt = -Infinity;

/**
 * 跳弾を1回ぶん出す。
 * @param {object} game particles を持つゲーム
 * @param {number} x 命中した場所
 * @param {number} y
 * @param {number} vx 当たった弾の速度。これを反転した向きへ跳ね返す
 * @param {number} vy
 */
export function playRicochet(game, x, y, vx, vy) {
    // 入射を横方向に反転する。地上の敵に対して弾はほぼ水平に飛んでくるので、
    // 撃った側へ跳ね返すにはXの符号を返すだけで足りる
    const base = Math.atan2(vy, -vx);

    // 命中点の閃光。線だけだと「地味すぎる」と実機で言われたので足した。
    // 線は四方へ散るので視界の端では拾えないが、1点で光る閃光は拾える
    // （反射ビームの被弾で同じ指摘を受けたときと同じ手当て）
    game.particles.push(new ImpactFlash(x, y, RICOCHET_FLASH_RADIUS, 0, {
        core: COLOR_RICOCHET_FLASH_CORE,
        ring: COLOR_RICOCHET_FLASH_RING,
    }));

    for (let i = 0; i < RICOCHET_STREAK_COUNT; i++) {
        const a = base + (Math.random() - 0.5) * RICOCHET_SPREAD;
        game.particles.push(new RicochetStreak(
            x, y,
            Math.cos(a) * RICOCHET_STREAK_SPEED,
            Math.sin(a) * RICOCHET_STREAK_SPEED,
        ));
    }

    const now = Date.now();
    if (now - lastSoundAt < RICOCHET_SOUND_INTERVAL_MS) return;
    lastSoundAt = now;
    audioManager.playWeapon('armorRicochet', x, y);
}
