import { MISSILE_INITIAL_COUNT } from '../utils/Constants.js';
import { PickupItem } from './PickupItem.js';

/** ミサイル補給キット。拾った時点で残弾が満タンに戻る。 */
export class MissileKit extends PickupItem {
    onPickup(player) {
        // 加算ではなく満タンにする（拾えば必ず撃てる状態になるほうが分かりやすい）
        player.missiles = MISSILE_INITIAL_COUNT;
    }

    get glowColor() { return '#FF4444'; }

    bodyColor(pulse) {
        const red = Math.floor(200 + pulse * 55);
        return `rgb(${red}, 40, 40)`;
    }

    /** ミサイルの形（三角の弾頭＋尾部）。 */
    drawIcon(ctx, x, y, pulse) {
        ctx.fillStyle = this.iconWhite(pulse);
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 3); // Tip
        ctx.lineTo(x + 11, y + 10);
        ctx.lineTo(x + 5, y + 10);
        ctx.fill();
        ctx.fillRect(x + 6, y + 10, 4, 3); // Tail
    }
}
