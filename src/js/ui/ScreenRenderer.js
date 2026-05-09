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
            ctx.fillText('Press Any Key to Start', canvas.width / 2, canvas.height / 2 + 60);
        }

        // Render instructions
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Move: A/D | Launch/Burst: W | Hover: W (Hold) | Shoot: L-Click | Grenade: R-Click', canvas.width / 2, canvas.height - 60);
        ctx.fillText('Map: R | Lock-on: Shift | Weapon Switch: F | Dock: S', canvas.width / 2, canvas.height - 40);
    }

    drawMissionClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = '30px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#FFFF00';
        ctx.font = '24px "Courier New", monospace';
        // Format time mm:ss.xx
        const mm = Math.floor(this.game.missionTimer / 60000).toString().padStart(2, '0');
        const ss = Math.floor((this.game.missionTimer % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((this.game.missionTimer % 1000) / 10).toString().padStart(2, '0');
        ctx.fillText(`CLEAR TIME: ${mm}:${ss}.${xx}`, canvas.width / 2, canvas.height / 2);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 30);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px "Courier New", monospace';
            ctx.fillText('Press Any Key to continue', canvas.width / 2, canvas.height / 2 + 60);
        }
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
        ctx.fillText('Please wait...', canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
    }

    drawGameClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FFFF'; // Cyan for clear
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CONGRATULATIONS!', canvas.width / 2, canvas.height / 2 - 60);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText(`ALL MISSIONS CLEARED!`, canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFF00';
        ctx.font = '24px "Courier New", monospace';
        const mm = Math.floor(this.game.totalTime / 60000).toString().padStart(2, '0');
        const ss = Math.floor((this.game.totalTime % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((this.game.totalTime % 1000) / 10).toString().padStart(2, '0');
        ctx.fillText(`TOTAL TIME: ${mm}:${ss}.${xx}`, canvas.width / 2, canvas.height / 2 + 20);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 50);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '18px "Courier New", monospace';
            ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 60);

            ctx.fillStyle = '#888888';
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('Please wait...', canvas.width / 2, canvas.height / 2 + 90);
        }
        ctx.textAlign = 'left';
    }

    drawRankingEntry(ctx, currentName, score) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFFF00'; // Yellow
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!!! YOU GOT A HIGH SCORE !!!', canvas.width / 2, canvas.height / 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText(`YOUR SCORE: ${score}`, canvas.width / 2, canvas.height / 4 + 40);

        ctx.fillText('ENTER YOUR NAME:', canvas.width / 2, canvas.height / 2 - 20);

        // Name input box
        ctx.fillStyle = '#000000';
        ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);
        ctx.strokeStyle = '#00FF00';
        ctx.strokeRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        
        // Blink cursor
        let displayStr = currentName;
        if (Math.floor(Date.now() / 400) % 2 === 0) {
            displayStr += '_';
        }
        ctx.fillText(displayStr, canvas.width / 2 - 90, canvas.height / 2 + 28);
        ctx.textAlign = 'left'; // Already left, but kept for consistency

        ctx.fillStyle = '#AAAAAA';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Press [ENTER] to save', canvas.width / 2, canvas.height / 2 + 70);

        ctx.textAlign = 'left';
    }

    drawRankingDisplay(ctx, scores, highlightIndex = -1) {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TOP 20 RANKING', canvas.width / 2, 40);

        ctx.font = '16px "Courier New", monospace';
        ctx.fillStyle = '#AAAAAA';
        // Headers for single column
        ctx.fillText('RANK   SCORE       NAME         MISSION (TIME)', canvas.width / 2, 75);

        ctx.font = 'bold 16px "Courier New", monospace';
        const startY = 100;
        const lineH = 22; // Fit 20 lines in a single column

        scores.forEach((entry, index) => {
            if (index === highlightIndex && Math.floor(Date.now() / 200) % 2 === 0) {
                ctx.fillStyle = '#FF00FF'; // Blink magenta/pink for new entry
            } else {
                if (index === 0) ctx.fillStyle = '#FFFF00'; // 1st Gold
                else if (index === 1) ctx.fillStyle = '#CCCCCC'; // 2nd Silver
                else if (index === 2) ctx.fillStyle = '#CD7F32'; // 3rd Bronze
                else ctx.fillStyle = '#FFFFFF';
            }

            // Fixed width formatting
            const rank = String(index + 1).padStart(2, ' ');
            const scoreStr = String(entry.score).padStart(7, ' ');
            const nameStr = (entry.name).padEnd(10, ' ');
            const missionStr = String(entry.mission).padStart(2, ' ');
            let timeStr = "";
            if (entry.clearTime) {
                timeStr = ` (${entry.clearTime})`;
            }

            // Single column layout
            const textLeft = canvas.width / 2 - 200;
            ctx.textAlign = 'left';
            
            ctx.fillText(`${rank}.  ${scoreStr}     ${nameStr}      ${missionStr}${timeStr}`, textLeft, startY + index * lineH);
        });

        // Blinking text
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText('Press Any Key to Start', canvas.width / 2, canvas.height - 25);
        }

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
        const alpha = game.miniMapAlpha || 0;

        ctx.save();
        ctx.globalAlpha = 0.85 * alpha;

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
