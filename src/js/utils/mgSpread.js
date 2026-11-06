// ============================================
// 自機のマシンガンの反動のばらつき（単一の置き場）
// ============================================
// 連射の1発目は照準どおり、2発目から反動でばらつく（ユーザー指定 2026-11-07）。
// 撃つ側（CombatActions._fireMachineGun）は「連射の何発目か」と「前の発から何 tick たったか」だけを渡す。
// 時間の数え方を純粋関数に切り出したのは、node --test で直接縛るため（mgReload.js と同じ考え方）

import { PLAYER_MG_SPREAD, PLAYER_MG_RECOIL_RAMP, PLAYER_MG_BURST_DELAY, PLAYER_MG_RECOIL_RECOVER } from './Constants.js';

/**
 * 次の発が連射の何発目か（0 = 1発目）。前の発から間が空いたら 0 に戻る。
 * @param {number} streak これまでに続けて撃った発数（前の発が何発目だったか + 1）
 * @param {number} sinceShot 前の発から経った tick 数
 */
export function nextMgShotIndex(streak, sinceShot) {
    return sinceShot > PLAYER_MG_BURST_DELAY + PLAYER_MG_RECOIL_RECOVER ? 0 : streak;
}

/**
 * その発のばらつきの全幅（rad）。角度には (乱数 - 0.5) × この値を足す。
 * 1発目は 0、そこから PLAYER_MG_RECOIL_RAMP 発かけて PLAYER_MG_SPREAD まで広がる
 * @param {number} shotIndex 連射の何発目か（0 = 1発目）
 */
export function mgShotSpread(shotIndex) {
    return PLAYER_MG_SPREAD * Math.min(1, Math.max(0, shotIndex) / PLAYER_MG_RECOIL_RAMP);
}
