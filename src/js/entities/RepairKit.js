import { PickupItem } from './PickupItem.js';
import { REPAIR_KIT_PLAYER_HEAL } from '../utils/Constants.js';

export const REPAIR_KIT_HEAL = 50; // carrier HP restored per kit
// 自機側の回復量は Constants.js の REPAIR_KIT_PLAYER_HEAL(=30)。
// 母艦側のこの値だけが歴史的にここへ直書きされている

/**
 * rival が落とす修理キット。持ち帰って母艦にドッキングすると母艦が治る。
 *
 * 拾った瞬間に自機も少しだけ回復する（キットは消費されない）。これが無いと
 * 自機は母艦へ帰るまで一切治らず、前線で粘れなかった。
 */
export class RepairKit extends PickupItem {
    onPickup(player) {
        // 持ち物が増えるのが主で、母艦の回復はドッキング時。
        // 自機の回復はその場のおまけで、所持数は減らさない
        player.repairKits++;
        player.heal(REPAIR_KIT_PLAYER_HEAL);
    }

    get glowColor() { return '#00FF66'; }

    bodyColor(pulse) {
        const green = Math.floor(200 + pulse * 55);
        return `rgb(0, ${green}, 60)`;
    }

    /** 十字マーク（修理シンボル）。 */
    drawIcon(ctx, x, y, pulse) {
        ctx.fillStyle = this.iconWhite(pulse);
        ctx.fillRect(x + 6, y + 3, 4, 10);
        ctx.fillRect(x + 3, y + 6, 10, 4);
    }
}
