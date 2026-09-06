// ============================================
// spawnState - 敵の初期状態を「場所」から決める
// ============================================
//
// 敵の向き・巡回方向・射撃タイマーは Math.random() で決めていた。地形と湧き位置は
// 週シードで決まっているのに**ここだけ毎回変わる**ので、同じ週の同じ面でも走る
// たびに遭遇の形が違っていた（実機の報告。7面で 134体中 102体＝76% が別状態）。
// 面別ランキングはタイムアタックなので、これでは記録が公平に比べられない。
//
// 種は**スポーン順ではなくタイル座標**から作る。順番から作ると、将来スポーンの
// 抽選順が変わったとき（例: 途中湧きの追加）に既存の配置が意図せずずれる。
// 位置なら「同じ週・同じ面・同じ場所に立っている敵」が常に同じ状態になり、
// 地形と同じ意味で決定論的になる。ドロップ（utils/drops.js）と同じ考え方。
//
// **game.rng は消費しない。** 消費すると地形生成との兼ね合いが崩れる。

import { TILE_SIZE } from './Constants.js';
import { stageSeed } from './WeekSeed.js';
import { SeededRNG } from './SeededRNG.js';

/** 面のシードとタイル座標を混ぜた種。ハッシュの作り方は attackerDropSeed と同じ流儀。 */
export function spawnStateSeed(stageSeedValue, spawnX, spawnY) {
    const tileX = Math.floor(spawnX / TILE_SIZE) | 0;
    const tileY = Math.floor(spawnY / TILE_SIZE) | 0;
    let h = Math.imul((stageSeedValue ^ 0x5bf03635) >>> 0, 0x9e3779b9) >>> 0;
    h = Math.imul((h ^ tileX) >>> 0, 0x85ebca6b) >>> 0;
    h = Math.imul((h ^ tileY) >>> 0, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * その場所に湧く敵のための乱数。敵のコンストラクタが向きや初期タイマーを引く。
 *
 * @param {{weekSeed?:number, missionsCompleted?:number}} game
 * @param {number} spawnX ワールド座標
 * @param {number} spawnY ワールド座標
 * @returns {SeededRNG}
 */
export function spawnStateRng(game, spawnX, spawnY) {
    const seed = spawnStateSeed(
        stageSeed(game.weekSeed || 0, game.missionsCompleted || 0), spawnX, spawnY,
    );
    return new SeededRNG(seed);
}
