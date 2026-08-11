import { PickupItem } from './PickupItem.js';

export const REPAIR_KIT_HEAL = 50; // carrier HP restored per kit

/** rival が落とす修理キット。持ち帰って母艦にドッキングすると効く。 */
export class RepairKit extends PickupItem {
    onPickup(player) {
        // ここでは持ち物が増えるだけ。母艦の回復はドッキング時に行う
        player.repairKits++;
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
