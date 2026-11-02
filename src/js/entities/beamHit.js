// ============================================
// beamHit - ビームが当たって弾けた演出（閃光・紫の火花・音）
// ============================================
// もとは反射ビームが自機・母艦に当たったときだけの演出で、CollisionManager._applyBulletHit に直に書いてあった。
// 2面の Orb がレーザー（反射ビーム・基地のレーザー）を吸収するときも「通常の弾が消えるときより派手に、
// 反射ビームが自機に当たるときのように」（2026-11-03 ユーザー指定）したので、両方から呼べるようここへ出した。
// playRicochet / playBlast と同じく、呼ぶ側は1行で済む形。

import { createSparks, ImpactFlash } from './Particle.js';
import { audioManager } from '../audio/AudioManager.js';
import {
    BEAM_SPARK_COLORS, BEAM_SPARK_COUNT,
    BEAM_SPARK_SPEED_MIN, BEAM_SPARK_SPEED_MAX, BEAM_SPARK_LIFETIME, BEAM_SPARK_SIZE, COLOR_BEAM_SPARK_FADE,
    BEAM_SPARK_FLASH_RADIUS, COLOR_BEAM_HIT_FLASH_CORE, COLOR_BEAM_HIT_FLASH_RING,
} from '../utils/Constants.js';

/**
 * ビームが (x, y) で弾けた演出を出す。
 * @param {object} game particles を持つゲーム
 * @param {number} x 当たった場所
 * @param {number} y
 */
export function playBeamHit(game, x, y) {
    // 「当たっても地味で判りづらい」という実機フィードバックへの対応。
    // 紫のスパークを被弾点から全方向へ弾けさせる。
    // 爆発（spawnExplosion）は使わない：playBlast は爆発音まで込みなので、
    // 演出だけ欲しいここでは合わない（音は下で beamHit を選んで鳴らす）。
    //
    // 粒だけでは「まだ地味で見えない」と再度指摘されたので、被弾点に
    // 紫の閃光を1つ足した。粒は散らばって視界の端では拾えないが、
    // 1点で光る閃光は拾える。ImpactFlash は「命中の合図」用の既存の
    // 部品で、色を渡せるようにして使い回している
    game.particles.push(new ImpactFlash(x, y, BEAM_SPARK_FLASH_RADIUS, 0, {
        core: COLOR_BEAM_HIT_FLASH_CORE,
        ring: COLOR_BEAM_HIT_FLASH_RING,
    }));
    // 当たるとビーム自体が消えるので 1発につき1回しか鳴らない。反射ビームの連射でも
    // 0.4秒(REFLECT_BEAM_BURST_DELAY) 離れた2回までで、鳴り続けることはない
    audioManager.playWeapon('beamHit', x, y);
    game.particles.push(...createSparks(x, y, {
        colors: BEAM_SPARK_COLORS,
        count: BEAM_SPARK_COUNT,
        radial: true,
        speedMin: BEAM_SPARK_SPEED_MIN,
        speedMax: BEAM_SPARK_SPEED_MAX,
        lifetime: BEAM_SPARK_LIFETIME,
        size: BEAM_SPARK_SIZE,
        // 出た瞬間は白く、離れるにつれてビームの紫へ冷める
        fadeTo: COLOR_BEAM_SPARK_FADE,
    }));
}
