// ============================================
// 中身の種類 → アイテムの表
// ============================================
//
// 要塞のお宝・格納塔の中身は 'overdrive' / 'repair' / 'life' のような種類の名前で持ち、
// 実物のアイテムはここで作る。お宝の湧きと格納塔の破壊の2か所が同じ表を通るので、
// 新しい中身を足すときは表に1行でよい。
//
// オーバードライブキットは missileKits に入れる（OverdriveKit が MissileKit を継承していて、
// 更新・描画・拾得をそちらの配列で回しているため）。

import { RepairKit } from './RepairKit.js';
import { OverdriveKit } from './OverdriveKit.js';
import { ExtraLifeKit } from './ExtraLifeKit.js';

export const ITEM_KINDS = {
    overdrive: { cls: OverdriveKit, list: 'missileKits' },
    repair: { cls: RepairKit, list: 'repairKits' },
    life: { cls: ExtraLifeKit, list: 'lifeKits' },
};

/**
 * 種類の名前からアイテムを作り、game の該当する配列に入れる。
 *
 * **未知の種類は例外にする。** 以前の湧きは「それ以外はリペア」で、種類の綴りを間違えても
 * 黙ってリペアが出ていた（黙って落ちる作りは壊れを隠す）。
 *
 * @param {object} game
 * @param {string} kind ITEM_KINDS のキー
 * @param {number} x 中心X（PickupItem と同じ約束）
 * @param {number} y 上端Y
 * @returns {import('./PickupItem.js').PickupItem}
 */
export function spawnItem(game, kind, x, y) {
    const entry = ITEM_KINDS[kind];
    if (!entry) throw new Error(`未知のアイテムの種類: ${kind}`);
    const item = new entry.cls(game, x, y);
    game[entry.list].push(item);
    return item;
}
