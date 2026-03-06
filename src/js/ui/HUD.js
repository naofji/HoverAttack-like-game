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
        this.startTime = Date.now();
    }

    draw(ctx) {
        const player = this.game.player;
        const carrier = this.game.carrier;
        const w = this.game.canvas.width;

        ctx.save();

        // ====== TOP BAR ======
        ctx.fillStyle = HUD_BG_COLOR;
        ctx.fillRect(0, 0, w, HUD_TOP_HEIGHT);

        ctx.font = 'bold 16px "Courier New", monospace';

        // Title
        ctx.fillStyle = '#00CCFF';
        ctx.fillText('HOVER ATTACK', 12, 16);

        // Score
        ctx.fillStyle = HUD_COLOR;
        const scoreStr = 'SCORE ' + String(this.game.score).padStart(7, '0');
        ctx.fillText(scoreStr, w - 200, 16);

        // Resource row
        ctx.font = HUD_FONT;
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('GRENADE', 12, 34);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(player ? player.grenades : 0).padStart(3, ' '), 85, 34);

        ctx.fillStyle = '#FFCC00';
        ctx.fillText('MISSILE', 130, 34);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(player ? player.missiles : 0).padStart(3, ' '), 205, 34);

        // Hover gauge
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('HOVER', 280, 34);
        const fuelRatio = player ? player.hoverFuel / HOVER_MAX_FUEL : 0;
        const barX = 340;
        const barY = 26;
        const barW = 150;
        const barH = 10;
        // Background
        ctx.fillStyle = '#333333';
        ctx.fillRect(barX, barY, barW, barH);
        // Fuel bar
        if (fuelRatio > 0.3) {
            ctx.fillStyle = '#00FF88';
        } else if (fuelRatio > 0.1) {
            ctx.fillStyle = '#FFAA00';
        } else {
            ctx.fillStyle = '#FF3333';
        }
        ctx.fillRect(barX, barY, barW * fuelRatio, barH);
        // Border
        ctx.strokeStyle = '#888888';
        ctx.strokeRect(barX, barY, barW, barH);

        // Separator line
        ctx.strokeStyle = '#444444';
        ctx.beginPath();
        ctx.moveTo(0, HUD_TOP_HEIGHT);
        ctx.lineTo(w, HUD_TOP_HEIGHT);
        ctx.stroke();

        // ====== BOTTOM BAR ======
        const bottomY = this.game.canvas.height - HUD_BOTTOM_HEIGHT;
        ctx.fillStyle = HUD_BG_COLOR;
        ctx.fillRect(0, bottomY, w, HUD_BOTTOM_HEIGHT);

        // Separator line
        ctx.strokeStyle = '#444444';
        ctx.beginPath();
        ctx.moveTo(0, bottomY);
        ctx.lineTo(w, bottomY);
        ctx.stroke();

        ctx.font = HUD_FONT;

        // TIME
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const centis = Math.floor((elapsed % 1000) / 10);
        const timeStr = `TIME ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText(timeStr, 12, bottomY + 16);

        // ATTACKER
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('ATTACKER', 230, bottomY + 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(player ? player.lives : 0), 320, bottomY + 16);

        // CARRIER
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('CARRIER', 400, bottomY + 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(carrier ? carrier.lives : 0), 480, bottomY + 16);

        // MISSION
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('MISSION', 560, bottomY + 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(this.game.missionsCompleted || 0), 640, bottomY + 16);

        // HP bar for player (small bar near bottom-left)
        if (player && player.alive) {
            const hpRatio = player.hp / PLAYER_MAX_HP;
            const hpX = 160;
            const hpY = bottomY + 6;
            const hpW = 50;
            const hpH = 6;
            ctx.fillStyle = '#333';
            ctx.fillRect(hpX, hpY, hpW, hpH);
            ctx.fillStyle = hpRatio > 0.5 ? '#00DD00' : hpRatio > 0.2 ? '#DDAA00' : '#DD0000';
            ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(hpX, hpY, hpW, hpH);
        }

        // HP bar for carrier
        if (carrier && carrier.alive) {
            const hpRatio = carrier.hp / CARRIER_MAX_HP;
            const hpX = 500;
            const hpY = bottomY + 6;
            const hpW = 50;
            const hpH = 6;
            ctx.fillStyle = '#333';
            ctx.fillRect(hpX, hpY, hpW, hpH);
            ctx.fillStyle = hpRatio > 0.5 ? '#00DD00' : hpRatio > 0.2 ? '#DDAA00' : '#DD0000';
            ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(hpX, hpY, hpW, hpH);

            // --- Carrier Direction Arrow ---
            const cam = this.game.camera;
            // Check if carrier center is outside the camera view
            const cx = carrier.x + carrier.width / 2;
            const cy = carrier.y + carrier.height / 2;
            const isOffScreen =
                cx < cam.x ||
                cx > cam.x + w ||
                cy < cam.y ||
                cy > cam.y + this.game.canvas.height;

            if (isOffScreen && (!player || !player.docked)) {
                // Determine screen center relative to world
                const screenCenterX = cam.x + w / 2;
                const screenCenterY = cam.y + this.game.canvas.height / 2;

                // Angle from screen center to carrier
                const angle = Math.atan2(cy - screenCenterY, cx - screenCenterX);

                // Place arrow near the edge of the screen, accounting for HUD
                const radiusX = (w / 2) - 30;
                const radiusY = (this.game.canvas.height / 2) - Math.max(HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT) - 30;

                // Calculate display position in screen coordinates
                const arrowX = w / 2 + Math.cos(angle) * radiusX;
                const arrowY = this.game.canvas.height / 2 + Math.sin(angle) * radiusY;

                // Draw yellow triangle pointing in `angle` direction
                ctx.translate(arrowX, arrowY);
                ctx.rotate(angle);

                ctx.fillStyle = '#FFFF00'; // Yellow
                ctx.beginPath();
                ctx.moveTo(10, 0);     // Tip
                ctx.lineTo(-8, 8);     // Bottom right
                ctx.lineTo(-4, 0);     // Inner indent
                ctx.lineTo(-8, -8);    // Bottom left
                ctx.closePath();
                ctx.fill();

                // Reset transform
                ctx.rotate(-angle);
                ctx.translate(-arrowX, -arrowY);
            }
        }

        ctx.restore();
    }
}
