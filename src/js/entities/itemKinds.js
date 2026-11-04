// ============================================
// 中身の種類 → アイテムの表
// ============================================
//
// アイテムは 'overdrive' / 'repair' / 'life' のような種類の名前で持ち、実物はここで作る。
// 敵アタッカーの落とし物（dropKind）・要塞のお宝・格納塔の中身の3か所が同じ表を通るので、
// 新しいアイテムを足すときは表に1行でよい。作ったアイテムは game.pickups（1本の配列）に入る。

import { RepairKit } from './RepairKit.js';
import { MissileKit } from './MissileKit.js';
import { OverdriveKit } from './OverdriveKit.js';
import { AutoAimUnit } from './AutoAimUnit.js';
import { ExtraLifeKit } from './ExtraLifeKit.js';

export const ITEM_KINDS = {
    missile: MissileKit,
    overdrive: OverdriveKit,
    repair: RepairKit,
    autoaim: AutoAimUnit,
    life: ExtraLifeKit,
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
    const Cls = ITEM_KINDS[kind];
    if (!Cls) throw new Error(`未知のアイテムの種類: ${kind}`);
    const item = new Cls(game, x, y);
    game.pickups.push(item);
    return item;
}
