// ============================================
// HUD: 機体ゾーン（ATTACKER / CARRIER の残機・HP バー・リペアキット）
// ============================================
//
// ui/HUD.js から切り出した（2026-11-25、中身は動かしただけ）。
// ScreenRenderer と同じく **Object.assign(HUD.prototype, ...) で混ぜる前提**の
// オブジェクトリテラルで、`this` は HUD を指す。

import {
    HUD_FONT,
} from '../../utils/Constants.js';
import {
    UNIT_COLS, HUD_HP_DAMAGE_COLOR, HUD_LABEL_FONT, HUD_LABEL_INK,
} from './layout.js';

export const HudUnits = {
    // ------------------------------------------
    // Repair kit icons below CARRIER display
    // ------------------------------------------
    _drawRepairKitIcons(ctx, player, y, zoneX = 0) {
        if (!player || player.repairKits <= 0) return;

        const count = Math.min(player.repairKits, 10); // 最大10個表示
        const S = 9;   // アイコンサイズ
        const gap = 3; // アイコン間隔
        const startX = zoneX + UNIT_COLS.kits;
        const iconY = y - S / 2;
        const r = 2;   // 角丸半径

        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#00FF66';

        for (let i = 0; i < count; i++) {
            const x = startX + i * (S + gap);

            // 角丸緑四角
            ctx.fillStyle = '#00BB44';
            ctx.beginPath();
            ctx.moveTo(x + r, iconY);
            ctx.lineTo(x + S - r, iconY);
            ctx.arcTo(x + S, iconY, x + S, iconY + r, r);
            ctx.lineTo(x + S, iconY + S - r);
            ctx.arcTo(x + S, iconY + S, x + S - r, iconY + S, r);
            ctx.lineTo(x + r, iconY + S);
            ctx.arcTo(x, iconY + S, x, iconY + S - r, r);
            ctx.lineTo(x, iconY + r);
            ctx.arcTo(x, iconY, x + r, iconY, r);
            ctx.closePath();
            ctx.fill();

            // 白い十字
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            const cx = x + S / 2;
            const cy = iconY + S / 2;
            ctx.fillRect(cx - 0.5, iconY + 1, 1, S - 2); // 縦
            ctx.fillRect(x + 1, cy - 0.5, S - 2, 1);     // 横
            ctx.shadowBlur = 4;
        }

        ctx.restore();
    },

    // ------------------------------------------
    // Unit label + lives count + HP bar
    // ------------------------------------------
    _drawUnitHpBar(ctx, unit, maxHp, label, zoneX, y) {
        const barX = zoneX + UNIT_COLS.bar;
        const barW = UNIT_COLS.barW;
        const hpH  = UNIT_COLS.barH;
        const barY = y - hpH / 2;

        ctx.font = HUD_LABEL_FONT;
        ctx.fillStyle = HUD_LABEL_INK;
        ctx.fillText(label, zoneX + UNIT_COLS.label, y);
        ctx.font = 'bold 18px "Space Mono", monospace';
        // 残機を拾った直後は数字を金色に点滅させる（lifeUpTimer を持つのは自機だけ）
        const lifeUp = unit && unit.lifeUpTimer > 0 && Math.floor(unit.lifeUpTimer / 6) % 2 === 0;
        ctx.fillStyle = lifeUp ? '#FFE066' : '#FFFFFF';
        ctx.fillText(String(unit ? unit.lives : 0), zoneX + UNIT_COLS.lives, y);
        ctx.font = HUD_FONT;

        if (!unit || !unit.alive) return;

        // **地が赤＝受けたダメージ。** 減った分がそのまま赤い帯として残るので、
        // 「どれだけ削られたか」が緑の残量と同時に読める（ユーザー判断）。
        const hpRatio = unit.hp / maxHp;
        ctx.fillStyle = HUD_HP_DAMAGE_COLOR;
        ctx.fillRect(barX, barY, barW, hpH);
        const filled = barW * hpRatio;
        ctx.fillStyle = '#12D64A';
        ctx.fillRect(barX, barY, filled, hpH);
        if (filled > 0) {
            // 先端の明るい線。他のゲージと同じ語彙で「ここが今の値」を示す
            ctx.fillStyle = '#B6FFCB';
            ctx.fillRect(barX + filled - 2, barY - 2, 2, hpH + 4);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, hpH);
    },
};
