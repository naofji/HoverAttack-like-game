// ============================================
// Drop decisions - 撃破ドロップの内訳を決める純ロジック
// ============================================

import {
    ATTACKER_HEAVY_OVERDRIVE_CHANCE,
    ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE,
    OVERDRIVE_LATE_MISSION,
    ATTACKER_HEAVY_DROP_CHANCE,
    ATTACKER_RIVAL_DROP_CHANCE,
    ATTACKER_ARTILLERY_DROP_CHANCE,
    TILE_SIZE,
} from './Constants.js';
import { stageSeed } from './WeekSeed.js';
import { SeededRNG } from './SeededRNG.js';

/**
 * heavy が落とすキットが「オーバードライブ付き」のレア版になる確率。
 *
 * 面が進むほど厚くする。理由と面ごとの見込みは Constants.js の
 * ATTACKER_HEAVY_OVERDRIVE_CHANCE のコメントにある。
 *
 * @param {number} [missionsCompleted] 0 = 1面。初期化前の undefined も受ける
 */
export function overdriveDropChance(missionsCompleted) {
    return (missionsCompleted || 0) >= OVERDRIVE_LATE_MISSION
        ? ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE
        : ATTACKER_HEAVY_OVERDRIVE_CHANCE;
}

/**
 * アタッカーの撃破ドロップを決める種（シード）を、面のシードとスポーン位置から作る。
 *
 * スポーン「順番」ではなく「位置（タイル座標）」から作るのがポイント。
 * 順番から作ると、将来 SpawnManager の抽選回数や順序が変わったとき
 * （例: 途中スポーンの追加）に既存の配置が意図せずズレてしまう。
 * 位置なら「同じ週・同じ面・同じ場所に立っているアタッカー」が常に
 * 同じ結果になり、地形と同じ意味で決定論的になる。
 *
 * ハッシュの作り方は Map._drawRockyBlock のタイル座標ハッシュと同じ流儀
 * （Math.imul + xorshift 系の混ぜ込み）に揃えてある。
 *
 * @param {number} stageSeedValue WeekSeed.stageSeed() の戻り値
 * @param {number} spawnX スポーン位置のpx（x）
 * @param {number} spawnY スポーン位置のpx（y）
 * @returns {number} 符号なし32bitのシード
 */
export function attackerDropSeed(stageSeedValue, spawnX, spawnY) {
    const tileX = Math.floor(spawnX / TILE_SIZE) | 0;
    const tileY = Math.floor(spawnY / TILE_SIZE) | 0;
    let h = Math.imul((stageSeedValue ^ 0x27d4eb2f) >>> 0, 0x9e3779b9) >>> 0;
    h = Math.imul((h ^ tileX) >>> 0, 0x85ebca6b) >>> 0;
    h = Math.imul((h ^ tileY) >>> 0, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
}

/**
 * アタッカーの撃破ドロップの内訳を1回だけ決める純ロジック。
 *
 * die() に直書きされていた Math.random() の呼び出し順・確率を**そのまま**
 * 移しただけで、率は一切変えていない。heavy はまず率判定を引き、当たった
 * ときだけレア版判定（overdriveDropChance）を引く2段構え。rival / artillery
 * は1回だけ。それ以外の型は何も引かずに null を返す（乱数消費が無いので、
 * 呼び出し側の rng の状態は他の型に影響しない）。
 *
 * @param {string} typeName config.name（'heavy' | 'rival' | 'artillery' | ...）
 * @param {number} missionsCompleted overdriveDropChance に渡す面の進み具合
 * @param {{next: () => number}} rng .next() が [0,1) を返すもの
 * @returns {'missile'|'overdrive'|'repair'|'autoaim'|null}
 */
export function rollAttackerDrop(typeName, missionsCompleted, rng) {
    if (typeName === 'heavy') {
        if (rng.next() < ATTACKER_HEAVY_DROP_CHANCE) {
            const rare = rng.next() < overdriveDropChance(missionsCompleted);
            return rare ? 'overdrive' : 'missile';
        }
        return null;
    }
    if (typeName === 'rival') {
        return rng.next() < ATTACKER_RIVAL_DROP_CHANCE ? 'repair' : null;
    }
    if (typeName === 'artillery') {
        return rng.next() < ATTACKER_ARTILLERY_DROP_CHANCE ? 'autoaim' : null;
    }
    return null;
}

/**
 * スポーン時点でドロップを確定させる。週シード＋面＋スポーン位置だけから
 * 決まるので、同じ週に何度遊んでも同じ場所のアタッカーは同じ物を落とす。
 *
 * 専用の SeededRNG を都度作って使うのがポイント：game.rng（マップ生成用の
 * 共有ストリーム）には一切触れない。ここで rng.next() を呼んでしまうと、
 * 呼び出し回数やタイミング次第で以降のマップ生成・敵構成がズレて
 * MapDeterminism の保証が壊れる。
 *
 * @param {object} game weekSeed / missionsCompleted を読む
 * @param {number} spawnX
 * @param {number} spawnY
 * @param {string} typeName config.name
 * @returns {'missile'|'overdrive'|'repair'|'autoaim'|null}
 */
export function decideAttackerDrop(game, spawnX, spawnY, typeName) {
    const missionsCompleted = game.missionsCompleted || 0;
    const seed = attackerDropSeed(stageSeed(game.weekSeed || 0, missionsCompleted), spawnX, spawnY);
    const rng = new SeededRNG(seed);
    return rollAttackerDrop(typeName, missionsCompleted, rng);
}
