// ============================================
// Machine-gun reload decision (single source)
// ============================================

import { PLAYER_MG_RELOAD_THRESHOLD } from './Constants.js';

/**
 * Decide whether an MG reload should start this frame.
 * Reload only when the magazine is at or below the threshold, and only
 * once the player empties it or releases the trigger.
 *
 * autoReload=false は設定でオートリロードを切った状態。手動リロードのキーは
 * 作らない（R はミニマップで埋まっている）ので、**弾が尽きたときだけ装填する**。
 * 残弾を撃ち切りたい人向けで、撃てないまま詰むことはない。
 *
 * @param {boolean} [autoReload=true] 省略時は現行どおりの自動装填
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld, autoReload = true) {
    if (burstLeft === 0) return true;
    if (!autoReload) return false;
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false;
    return !fireHeld;
}
