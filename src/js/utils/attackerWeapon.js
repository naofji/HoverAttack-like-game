// ============================================
// standard アタッカーにミサイルとマシンガンのどちらを持たせるか
// ============================================
//
// 面ごとの割合は Constants.js の STANDARD_MG_SHARE_BY_MISSION。
//
// 1機ずつ乱数で決めると、機体数の少ない面では比率が大きくぶれる（7面で 1:3 の
// はずが全員ミサイル、もありうる）。しかも game.rng を1回でも余分に引くと
// 以降の敵の構成がずれて週次の決定性が壊れる。そこで乱数を使わず、standard を
// 湧かせた順に「ここまでで MG が何機いるべきか」= round((n+1)*share) を数え、
// 増えたときだけ MG にする（端数の繰り越し）。切り捨てでなく四捨五入なのは、
// 切り捨てだと 2面（0.125）の最初の MG が 8機目まで来ず、standard が7機以下の
// 面では1機も出ないため（四捨五入なら4機目）。並び順は Map 側で既に乱数で
// 混ざっているので、MG 持ちがマップの片側に偏ることもない。

import {
    STANDARD_MG_SHARE_BY_MISSION, STANDARD_MG_COLORS, ENEMY_ATTACKER_TYPES,
} from './Constants.js';

/**
 * MG 持ちの standard の行。standard の行に色と `weapon: 'mg'` を上書きしたもの。
 * name は 'standard' のまま ── 形・脚・反動・破片・破壊演出など、型の名前で
 * 引いているものはすべて standard と同じになる。違うのは色と撃ち方だけ。
 * ENEMY_ATTACKER_TYPES に行として足さないのは、あの表は SpawnManager が
 * 出現の重み（spawnWeight）を数える表でもあり、行が増えると型の抽選が変わるため。
 */
export const STANDARD_MG_CONFIG = Object.freeze({
    ...ENEMY_ATTACKER_TYPES.standard,
    ...STANDARD_MG_COLORS,
    weapon: 'mg',
});

/** missionsCompleted（0 = 1面）での MG 持ちの割合。表より先は最後の行。 */
export function standardMgShare(missionsCompleted) {
    const table = STANDARD_MG_SHARE_BY_MISSION;
    const i = Math.max(0, Math.min(table.length - 1, missionsCompleted | 0));
    return table[i];
}

/**
 * その面で n 番目（0 始まり）に湧いた standard の武器。
 * @returns {'mg'|'missile'}
 */
export function standardWeaponAt(missionsCompleted, n) {
    const share = standardMgShare(missionsCompleted);
    // 1e-9 は浮動小数の誤差で x.4999… に落ちて1機ずれないための足し
    const before = Math.floor(n * share + 0.5 + 1e-9);
    const after = Math.floor((n + 1) * share + 0.5 + 1e-9);
    return after > before ? 'mg' : 'missile';
}
