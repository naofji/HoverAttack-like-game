// ============================================
// Screen Renderer - Title, Game Over, Mission Clear, MiniMap
// ============================================

import { TILE_SIZE } from '../utils/Constants.js';

export class ScreenRenderer {
    constructor(game) {
        this.game = game;
    }

    drawTitleScreen(ctx) {
        const ASCII_LOGO = [
            "    __  ______ _    ____________     ___  _______________   ________ __",
            "   / / / / __ \\ |  / / ____/ __ \\   /   |/_  __/_  __/   | / ____/ //_/",
            "  / /_/ / / / / | / / __/ / /_/ /  / /| | / /   / / / /| |/ /   / ,<  ",
            " / __  / /_/ /| |/ / /___/ _, _/  / ___ |/ /   / / / ___ / /___/ /| |  ",
            "/_/ /_/\\____/ |___/_____/_/ |_|  /_/  |_/_/   /_/ /_/  |_\\____/_/ |_|  "
        ];

        const canvas = this.game.canvas;

        ctx.fillStyle = '#00FF00'; // Retro green
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'left';

        // Approx character width for 16px Courier New is ~9.6px
        const logoWidth = 72 * 9.6;
        const startX = (canvas.width - logoWidth) / 2;
        const startY = canvas.height / 3 - 40;

        for (let i = 0; i < ASCII_LOGO.length; i++) {
            ctx.fillText(ASCII_LOGO[i], startX, startY + (i * 18));
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px "Courier New", monospace';
        ctx.textAlign = 'center';

        // Blinking text
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText('Press [W] or [Click] to Start', canvas.width / 2, canvas.height / 2 + 60);
        }

        // Render instructions
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Move: A/D | Launch/Burst: W | Hover: W (Hold) | Shoot: L-Click | Grenade: R-Click', canvas.width / 2, canvas.height - 60);
        ctx.fillText('Map: M | Lock-on: Shift | Dock: S', canvas.width / 2, canvas.height - 40);
    }

    drawMissionClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = '30px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press [W] or [Click] to continue', canvas.width / 2, canvas.height / 2 + 20);
    }

    drawGameOver(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 20);

        ctx.fillStyle = '#888888';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Press R to Restart', canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
    }

    drawMiniMap(ctx) {
        const game = this.game;
        const w = game.canvas.width;
        const h = game.canvas.height;
        const mm = game.map.miniMapCanvas;

        if (!mm) return;

        // Center of the screen
        const mmX = (w - mm.width) / 2;
        const mmY = (h - mm.height) / 2;

        ctx.save();
        ctx.globalAlpha = 0.85;

        // Draw the cached static map
        ctx.drawImage(mm, mmX, mmY);

        // Draw border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(mmX, mmY, mm.width, mm.height);

        ctx.globalAlpha = 1.0;

        // Helper to draw a dot
        const drawDot = (worldX, worldY, color, size = 2) => {
            const px = mmX + (worldX / TILE_SIZE) * game.map.miniMapScale;
            const py = mmY + (worldY / TILE_SIZE) * game.map.miniMapScale;
            ctx.fillStyle = color;
            ctx.fillRect(px - size / 2, py - size / 2, size, size);
        };

        // Carrier (Blue square)
        if (game.carrier && game.carrier.alive) {
            drawDot(game.carrier.x + game.carrier.width / 2, game.carrier.y + game.carrier.height / 2, '#0088FF', 5);
        }

        // Enemies (Red squares)
        for (const enemy of game.enemies) {
            if (enemy.alive) drawDot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FF3333', 3);
        }

        // Player (White square)
        if (game.player && game.player.alive && !game.player.docked) {
            drawDot(game.player.x + game.player.width / 2, game.player.y + game.player.height / 2, '#FFFFFF', 4);
        }

        ctx.restore();
    }
}
