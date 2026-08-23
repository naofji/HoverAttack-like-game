// ============================================
// Drop decisions - 撃破ドロップの内訳を決める純ロジック
// ============================================

import {
    ATTACKER_HEAVY_OVERDRIVE_CHANCE,
    ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE,
    OVERDRIVE_LATE_MISSION,
} from './Constants.js';

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
