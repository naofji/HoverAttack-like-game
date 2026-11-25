// ============================================
// HUD: 警報（巡航ミサイルの予告・母艦の被弾と接近・敵基地の緊急防衛）
// ============================================
//
// ui/HUD.js から切り出した（2026-11-25、中身は動かしただけ）。
// ScreenRenderer と同じく **Object.assign(HUD.prototype, ...) で混ぜる前提**の
// オブジェクトリテラルで、`this` は HUD を指す。

import {
    HUD_TOP_HEIGHT,
} from '../../utils/Constants.js';

export const HudAlerts = {
    /**
     * 巡航ミサイルの発射予告（画面の下 3/4 に点滅する赤い札）。
     * もとは draw() の中に直に書いてあった（2026-11-25 に他の警報と同じ置き場へ）。
     */
    _drawCruiseMissileWarning(ctx, w) {
    if (this.game.base && this.game.base.cruiseWarning) {
        const timerSec = Math.ceil(this.game.base.cruiseMissileTimer / 60);
        if (Math.floor(Date.now() / 200) % 2 === 0) { // Blink quickly
            const centerX = w / 2;
            const centerY = this.game.canvas.height * 0.75;
                
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
                
            // Draw semi-transparent background box for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(centerX - 300, centerY - 25, 600, 50);
                
            // Border for the box
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(centerX - 300, centerY - 25, 600, 50);

            ctx.fillStyle = '#FF0000';
            ctx.font = 'bold 24px "Space Mono", monospace';
            ctx.fillText(`⚠️ WARNING: CRUISE MISSILE LAUNCH IN T-${timerSec}... ⚠️`, centerX, centerY);
            ctx.restore();
        }
    }
    },

    _drawBaseEmergencyAlert(ctx, w) {
        if (!this.game.baseEmergencyAlert) return;

        // Stop blinking after a handful of cycles so the warning doesn't
        // stay visually noisy for the rest of the (possibly long) alert.
        const BLINK_PERIOD_MS = 400; // 200ms on + 200ms off
        const MAX_BLINKS = 10;
        const startTime = this.game.baseEmergencyAlertStartTime || Date.now();
        const elapsed = Date.now() - startTime;
        if (elapsed >= BLINK_PERIOD_MS * MAX_BLINKS) return;
        if (Math.floor(elapsed / 200) % 2 !== 0) return; // Blink

        const centerX = w / 2;
        const centerY = this.game.canvas.height * 0.35;
        const boxW = 680;
        const boxH = 50;
        const textPadding = 24; // keep text clear of the box border

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);

        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);

        // Shrink the font until the text fits inside the box, so the
        // warning never overflows its frame.
        const text = 'WARNING: ENEMY BASE UNDER ATTACK! DEFENSE MODE ACTIVATED!';
        const maxTextW = boxW - textPadding * 2;
        let fontSize = 20;
        ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
        while (fontSize > 10 && ctx.measureText(text).width > maxTextW) {
            fontSize--;
            ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
        }

        ctx.fillStyle = '#FF0000';
        ctx.fillText(text, centerX, centerY);
        ctx.restore();
    },

    _drawProximityAlert(ctx, w) {
        // Yellow alert if enemies/bullets are near carrier
        if (!this.game.proximityAlertActive) return;

        // Don't show yellow if red damage alert is active (red has priority)
        if (this.game.carrier && this.game.carrier.damageTimer > 0) return;

        const carrier = this.game.carrier;
        const cam = this.game.camera;
        const screenX = carrier.x - cam.x;
        const screenW = w;
        const screenH = this.game.canvas.height;

        // Pulsing yellow — same timing style as damage alert
        const alpha = Math.sin(Date.now() / 120) * 0.35 + 0.45;
        ctx.fillStyle = `rgba(255, 220, 0, ${alpha})`;

        const thickness = 10;

        if (screenX + carrier.width < 0) {
            // Carrier is to the left of the screen
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH);
        } else if (screenX > screenW) {
            // Carrier is to the right of the screen
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH);
        } else {
            // Carrier is visible on screen: full border
            ctx.fillRect(0, HUD_TOP_HEIGHT, screenW, thickness); // Top
            ctx.fillRect(0, screenH - thickness, screenW, thickness); // Bottom
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH); // Left
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH); // Right
        }
    },

    _drawCarrierDamageAlert(ctx, w) {
        const carrier = this.game.carrier;
        if (!carrier || carrier.damageTimer <= 0) return;

        const cam = this.game.camera;
        const screenX = carrier.x - cam.x;
        const screenW = w;
        const screenH = this.game.canvas.height;

        // Pulse intensity
        const alpha = (Math.sin(Date.now() / 100) * 0.4 + 0.5) * (carrier.damageTimer / 60);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;

        const thickness = 10;

        if (screenX + carrier.width < 0) {
            // Carrier is to the left of the screen
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH);
        } else if (screenX > screenW) {
            // Carrier is to the right of the screen
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH);
        } else {
            // Carrier is visible on screen: Pulse full border
            ctx.fillRect(0, HUD_TOP_HEIGHT, screenW, thickness); // Top
            ctx.fillRect(0, screenH - thickness, screenW, thickness); // Bottom
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH); // Left
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH); // Right
        }
    },
};
