// ============================================
// Machine-gun reload decision (single source)
// ============================================

import { PLAYER_MG_RELOAD_THRESHOLD } from './Constants.js';

/**
 * Decide whether an MG reload should start this frame.
 * Reload only when the magazine is at or below the threshold, and only
 * once the player empties it or releases the trigger.
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld) {
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false;
    return burstLeft === 0 || !fireHeld;
}
