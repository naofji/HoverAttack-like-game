// ============================================
// motion - 面の環境の物理係数（陸上・水中・滝・雪）と、それを引く純関数
// ============================================
//
// もとは world/StageEnvironment.js の冒頭にあった。utils/ の surface.js と grenadePhysics.js が
// motionFor / fallSpeedScaleFor のためだけに world/ を import していて、utils/ → world/ の逆向きの依存に
// なっていた（そのうえ StageEnvironment は霧・水・雪の描画まで読み込むので、純関数の surface.js を
// 読むだけで 26 モジュールが付いてきた）。純関数と値だけをここへ移した（2026-11-26、中身は動かしただけ）。
// StageEnvironment.js が同じ名前で再 export するので、使う側の import はどちらからでもよい。
// 「utils/ は上の層を import しない」は tests/utils-layering.test.js が縛っている。
//
// エンティティは motionFor / sightScaleFor の2つの純関数経由でしか環境を知らない
// （game.env を直接読む箇所を増やさない。テストの簡易 game に env が無くても
// 陸上として動くようにするため）。

import {
    WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, WATER_FALL_SPEED_SCALE,
    WATERFALL_DOWNFORCE, WATERFALL_FALL_SPEED_SCALE, ICE_SLIDE,
} from './Constants.js';

/** 陸上。陸上の面では全エンティティがこれを受け取り、掛けても値が変わらない。 */
export const LAND_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: 0 });
export const WATER_MOTION = Object.freeze({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 });
/**
 * 滝（落下中の水柱）の中。**水中ではないので浮力も水の抵抗も無い**。
 * 以前は水中と同じ speed 0.5 / gravity 0.3 を掛けていたため、滝に触れた瞬間から
 * 実落下速度が 2.45px/frame（空気中 7.0 の 1/3）に落ち、「滝の中をゆっくり沈んで
 * いく」という実機の指摘になっていた。滝は空気と同じ重力・同じ速度で、
 * 上から水に打たれるぶんの押し下げ（downforce）だけが余分に掛かる。
 */
export const WATERFALL_MOTION = Object.freeze({
    speed: 1, gravity: 1, slide: 0,
    downforce: WATERFALL_DOWNFORCE, fallSpeedScale: WATERFALL_FALL_SPEED_SCALE,
});
export const SNOW_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: ICE_SLIDE });

/**
 * 座標の物理係数。game.env が無い（テストの簡易 game）なら陸上。
 * @returns {{speed:number, gravity:number, slide:number}}
 */
export function motionFor(game, x, y) {
    return game && game.env ? game.env.motionAt(x, y) : LAND_MOTION;
}

/**
 * 落下速度の上限（空気中の MAX_FALLING_SPEED）に掛ける倍率。滝は自分の値を持ち、
 * 水中（speed < 1）は WATER_FALL_SPEED_SCALE、陸上は 1。
 * 自機・敵アタッカー・グレネード（と軌道予測）が同じ規則で沈むよう、ここ1つで決める。
 * 以前は4か所に同じ式があり、敵アタッカーだけ書かれておらず水中で自機の約2.4倍の
 * 速さで沈んでいた（実機の指摘、2026-10-10）。
 */
export function fallSpeedScaleFor(motion) {
    if (motion.fallSpeedScale !== undefined) return motion.fallSpeedScale;
    return motion.speed < 1 ? WATER_FALL_SPEED_SCALE : 1;
}

/** 索敵の横半径に掛ける倍率。game.env が無ければ 1。 */
export function sightScaleFor(game) {
    return game && game.env ? game.env.sightScale : 1;
}
