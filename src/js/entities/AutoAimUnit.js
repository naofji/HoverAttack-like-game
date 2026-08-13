import { AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION } from '../utils/Constants.js';
import { PickupItem, ITEM_SIZE } from './PickupItem.js';

/** artillery が落とす Auto Aim ユニット。一定時間だけ照準が敵に吸い付く。 */
export class AutoAimUnit extends PickupItem {
    onPickup(player) {
        // 重ね取りで延長できるが、上限は超えない
        player.autoAimTimer = Math.min(player.autoAimTimer + AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION);
        player.autoAimMaxTimer = AUTO_AIM_MAX_DURATION;
        // 既定では拾った時点で解除を解く。拾って何も起きないと壊れて見えるため。
        // OFF を選んだ人は「自分で切ったなら切れたまま」を望んでいる
        if (player.game?.settings?.autoAimResumeOnPickup ?? true) {
            player.autoAimPaused = false;
        }
    }

    // 他の2種より少し速く脈打たせて、時間もので急ぐ感じを出す
    get pulseSpeed() { return 0.12; }

    get glowColor() { return '#FF8800'; }

    bodyColor(pulse) {
        const orange = Math.floor(160 + pulse * 80);
        return `rgb(${orange}, 80, 0)`;
    }

    /** 照準環（二重丸＋外向きの十字線）。 */
    drawIcon(ctx, x, y, pulse) {
        const cx = x + ITEM_SIZE / 2;
        const cy = y + ITEM_SIZE / 2;

        ctx.strokeStyle = this.iconWhite(pulse);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.stroke();
        // 外リング
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.stroke();
        // 十字線（短め）
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy); ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 6);
        ctx.stroke();
    }
}
