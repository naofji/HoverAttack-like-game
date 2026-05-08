// ============================================
// HUD - Head-Up Display
// ============================================

import {
    CANVAS_WIDTH,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    HUD_FONT, HUD_COLOR, HUD_BG_COLOR,
    HOVER_MAX_FUEL, PLAYER_MAX_HP, CARRIER_MAX_HP
} from '../utils/Constants.js';

export class HUD {
    constructor(game) {
        this.game = game;
    }

    draw(ctx) {
        const player = this.game.player;
        const carrier = this.game.carrier;
        const w = this.game.canvas.width;

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // ====== Background ======
        ctx.fillStyle = HUD_BG_COLOR;
        ctx.fillRect(0, 0, w, HUD_TOP_HEIGHT);
        ctx.font = HUD_FONT;

        // --- ROW 1 ---
        const row1Y = HUD_TOP_HEIGHT * 0.3;

        ctx.fillStyle = '#00CCFF';
        ctx.fillText('HOVER ATTACK', 12, row1Y);

        const elapsed = this.game.totalTime;
        const minutes  = Math.floor(elapsed / 60000);
        const seconds  = Math.floor((elapsed % 60000) / 1000);
        const centis   = Math.floor((elapsed % 1000) / 10);
        const timeStr  = `TIME ${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText(timeStr, 250, row1Y);

        ctx.fillStyle = '#FFCC00';
        ctx.fillText('MISSION', 510, row1Y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(this.game.missionsCompleted + 1 || 1), 585, row1Y);

        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('SCORE ' + String(this.game.score).padStart(7, '0'), w - 160, row1Y);

        // --- ROW 2 ---
        const row2Y = HUD_TOP_HEIGHT * 0.7;

        ctx.fillStyle = '#FFCC00';
        ctx.fillText('GRENADE', 12, row2Y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(player ? player.grenades : 0).padStart(3, ' '), 90, row2Y);

        this._drawWeaponStatus(ctx, player, row2Y);
        this._drawHoverGauge(ctx, player, row2Y);
        this._drawUnitHpBar(ctx, player, PLAYER_MAX_HP, 'ATTACKER', 600, 685, 705, row2Y);
        this._drawUnitHpBar(ctx, carrier, CARRIER_MAX_HP, 'CARRIER',  800, 875, 895, row2Y, 60);
        this._drawCarrierArrow(ctx, player, carrier, w);

        // Separator line
        ctx.strokeStyle = '#444444';
        ctx.beginPath();
        ctx.moveTo(0, HUD_TOP_HEIGHT);
        ctx.lineTo(w, HUD_TOP_HEIGHT);
        ctx.stroke();

        ctx.restore();
    }

    // ------------------------------------------
    // Weapon status (MISSILE / M-GUN)
    // ------------------------------------------
    _drawWeaponStatus(ctx, player, y) {
        if (!player) return;

        const isMissile = player.currentWeapon === 'missile';
        const isMG = player.currentWeapon === 'mg';

        // --- Missile Status ---
        ctx.fillStyle = isMissile ? '#FFCC00' : '#444444';
        ctx.fillText('MISSILE', 145, y);
        ctx.fillStyle = isMissile ? '#FFFFFF' : '#666666';
        ctx.fillText(String(player.missiles).padStart(3, ' '), 220, y);

        // --- Machine Gun Status ---
        ctx.fillStyle = isMG ? '#FFCC00' : '#444444';
        ctx.fillText('M-GUN', 270, y);
        ctx.fillStyle = isMG ? '#FFFFFF' : '#666666';
        
        if (player.mgReloadTimer > 0) {
            ctx.fillText('RELOAD', 330, y);
        } else {
            ctx.fillText(`RDY ${player.mgBurstLeft}`, 330, y);
        }
    }

    // ------------------------------------------
    // Hover fuel triangle gauge
    // ------------------------------------------
    _drawHoverGauge(ctx, player, y) {
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('HOVER', 420, y);

        const fuelRatio = player ? player.hoverFuel / HOVER_MAX_FUEL : 0;
        const barW = 80;
        const barH = 12;
        const barX = 485;
        const barY = y + 6; // Anchor to bottom of row

        // Color by fuel level
        let fuelColor = '#FF0000';
        if      (fuelRatio > 0.8) fuelColor = '#00FFFF';
        else if (fuelRatio > 0.5) fuelColor = '#00FF00';
        else if (fuelRatio > 0.3) fuelColor = '#FFAA00';

        // Empty background triangle
        ctx.fillStyle = 'rgba(51, 51, 51, 0.7)';
        ctx.beginPath();
        ctx.moveTo(barX,        barY);
        ctx.lineTo(barX + barW, barY - barH);
        ctx.lineTo(barX + barW, barY);
        ctx.closePath();
        ctx.fill();

        // Filled portion
        const filledW = barW * fuelRatio;
        const filledH = barH * fuelRatio;

        const glowing = fuelRatio >= 0.8;
        if (glowing) {
            ctx.shadowBlur  = 8;
            ctx.shadowColor = '#FFFFFF';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth   = 1.5;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = fuelColor;
        ctx.beginPath();
        ctx.moveTo(barX,           barY);
        ctx.lineTo(barX + filledW, barY - filledH);
        ctx.lineTo(barX + filledW, barY);
        ctx.closePath();
        ctx.fill();
        if (glowing) ctx.stroke();

        // Reset shadow/stroke
        ctx.shadowBlur = 0;
        ctx.lineWidth  = 1;

        // Static border
        ctx.strokeStyle = '#888888';
        ctx.beginPath();
        ctx.moveTo(barX,        barY);
        ctx.lineTo(barX + barW, barY - barH);
        ctx.lineTo(barX + barW, barY);
        ctx.closePath();
        ctx.stroke();

        // Faint bounding box
        ctx.strokeStyle = 'rgba(136, 136, 136, 0.3)';
        ctx.strokeRect(barX, barY - barH, barW, barH);
    }

    // ------------------------------------------
    // Unit label + lives count + HP bar
    // ------------------------------------------
    _drawUnitHpBar(ctx, unit, maxHp, label, labelX, livesX, barX, y, barW = 40) {
        const hpH = 8;
        const barY = y - hpH / 2;

        ctx.fillStyle = '#FFCC00';
        ctx.fillText(label, labelX, y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(unit ? unit.lives : 0), livesX, y);

        if (unit && unit.alive) {
            const hpRatio = unit.hp / maxHp;
            ctx.fillStyle = '#DD0000'; // Damage
            ctx.fillRect(barX, barY, barW, hpH);
            ctx.fillStyle = '#00DD00'; // Remaining life
            ctx.fillRect(barX, barY, barW * hpRatio, hpH);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(barX, barY, barW, hpH);
        }
    }

    // ------------------------------------------
    // Off-screen carrier direction indicator
    // ------------------------------------------
    _drawCarrierArrow(ctx, player, carrier, w) {
        if (!carrier || !carrier.alive) return;
        if (player && player.docked) return;

        const cam = this.game.camera;
        const cx  = carrier.x + carrier.width  / 2;
        const cy  = carrier.y + carrier.height / 2;
        const isOffScreen =
            cx < cam.x ||
            cx > cam.x + w ||
            cy < cam.y ||
            cy > cam.y + this.game.canvas.height;

        if (!isOffScreen) return;

        const screenCenterX = cam.x + w / 2;
        const screenCenterY = cam.y + this.game.canvas.height / 2;
        const angle   = Math.atan2(cy - screenCenterY, cx - screenCenterX);
        const radiusX = (w / 2) - 30;
        const radiusY = (this.game.canvas.height / 2) - HUD_TOP_HEIGHT - 10;
        const arrowX  = w / 2 + Math.cos(angle) * radiusX;
        const arrowY  = this.game.canvas.height / 2 + Math.sin(angle) * radiusY;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo( 10,  0);   // Tip
        ctx.lineTo( -8,  8);   // Bottom left
        ctx.lineTo( -4,  0);   // Inner indent
        ctx.lineTo( -8, -8);   // Top left
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}
