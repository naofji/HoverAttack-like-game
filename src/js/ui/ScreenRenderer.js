// ============================================
// Screen Renderer - Title, Game Over, Mission Clear, MiniMap
// ============================================

import { TILE_SIZE } from '../utils/Constants.js';
import { RepairKit } from '../entities/RepairKit.js';
import { AutoAimUnit } from '../entities/AutoAimUnit.js';
import { MissileKit } from '../entities/MissileKit.js';

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
        ctx.font = 'bold 16px "Space Mono", monospace';
        ctx.textAlign = 'left';

        // Approx character width for 16px Courier New is ~9.6px
        const logoWidth = 72 * 9.6;
        const startX = (canvas.width - logoWidth) / 2;
        const startY = canvas.height / 3 - 40;

        for (let i = 0; i < ASCII_LOGO.length; i++) {
            ctx.fillText(ASCII_LOGO[i], startX, startY + (i * 18));
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px "Space Mono", monospace';
        ctx.textAlign = 'center';

        // Blinking text
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height / 2 + 60);
            ctx.restore();
        }


        // Option toggle display
        const liftOn = this.game.options.carrierLift;
        ctx.font = '13px "Space Mono", monospace';
        ctx.fillStyle = '#555555';
        ctx.fillText('[TAB] CARRIER LIFT:', canvas.width / 2 - 30, canvas.height - 18);
        ctx.fillStyle = liftOn ? '#00FF88' : '#FF4444';
        ctx.textAlign = 'left';
        ctx.fillText(liftOn ? 'ON' : 'OFF', canvas.width / 2 + 78, canvas.height - 18);
        ctx.textAlign = 'center';
    }

    drawHowToPlay(ctx, page) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;

        // Rich Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#0a1020');
        bgGrad.addColorStop(1, '#000000');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Grid overlay for tech feel
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < W; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
        for (let j = 0; j < H; j += 40) { ctx.moveTo(0, j); ctx.lineTo(W, j); }
        ctx.stroke();

        // Header
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px "Space Mono", monospace';
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#00FF00';
        ctx.fillText('─── HOW TO PLAY ───', cx, 50);
        ctx.restore();

        if (page === 0) {
            // ---- PAGE 1: MISSION & RULES ----

            // PANEL 1: OBJECTIVE
            this._drawPanel(ctx, cx - 400, 80, 800, 100, 'MISSION OBJECTIVE', '#FFCC00');
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px "Space Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('DESTROY ENEMY ROBOTS, OBLITERATE THE ENEMY BASE CORE, AND CAPTURE THE FLAG.', cx, 130);
            ctx.fillStyle = '#FF5555';
            ctx.fillText('* GAME OVER IF THE CARRIER LOSES ALL ITS LIVES.', cx, 155);

            // PANEL 2: BASIC RULES
            this._drawPanel(ctx, cx - 400, 195, 800, 170, 'BASIC RULES', '#FFCC00');
            ctx.fillStyle = '#CCCCCC';
            ctx.font = '13px "Space Mono", monospace';
            ctx.textAlign = 'left';

            // Rule 1 (wrapped)
            ctx.fillText('1) CONTROL CARRIER WHILE DOCKED.', cx - 380, 250);
            ctx.fillText('   DETACH TO CONTROL ATTACKER (CARRIER BECOMES DEFENSELESS).', cx - 380, 266);

            // Rule 2 (wrapped)
            ctx.fillText('2) DOCKING ATTACKER WITH CARRIER RESUPPLIES AMMO/FUEL', cx - 380, 295);
            ctx.fillText('   AND REPAIRS DAMAGE.', cx - 380, 311);

            // Rule 3 (wrapped)
            ctx.fillText('3) IF ATTACKER IS DESTROYED, RESPAWN AT CARRIER.', cx - 380, 340);
            ctx.fillText('   IF CARRIER IS DESTROYED, RESPAWN AT START.', cx - 380, 356);

            // Sub-panel for Illustration on the Right
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.2)';
            ctx.lineWidth = 1;
            if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(cx + 220, 238, 140, 115, 6); ctx.stroke();
            } else {
                ctx.strokeRect(cx + 220, 238, 140, 115);
            }

            // Draw illustration: Player docking onto Carrier
            this._drawMiniPlayer(ctx, cx + 290, 260);
            this._drawMiniCarrier(ctx, cx + 290, 320);

            // Docking arrow
            ctx.strokeStyle = '#FFCC00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + 290, 275);
            ctx.lineTo(cx + 290, 305);
            ctx.lineTo(cx + 286, 301);
            ctx.moveTo(cx + 290, 305);
            ctx.lineTo(cx + 294, 301);
            ctx.stroke();

            // PANEL 3: ITEMS
            this._drawPanel(ctx, cx - 400, 380, 800, 260, 'ITEMS', '#FFCC00');

            const items = [
                { type: 'missile', color: '#FF4444', name: 'MISSILE SUPPLY KIT', desc: 'FULLY RESTORES YOUR MISSILE AMMO UPON PICKUP.' },
                { type: 'autoaim', color: '#FF8800', name: 'AUTO-AIM UNIT', desc: 'ENABLES AUTO-AIM FOR A LIMITED TIME. (DROPPED BY ARTILLERY)' },
                { type: 'repair', color: '#00FF00', name: 'CARRIER REPAIR KIT', desc: 'REPAIRS CARRIER HP WHEN DOCKED. GRANTS +1 LIFE IF FULL. (DROPPED BY RIVAL)' }
            ];

            if (!this.dummyKits) {
                this.dummyKits = {
                    'missile': new MissileKit(this.game, 0, 0),
                    'autoaim': new AutoAimUnit(this.game, 0, 0),
                    'repair': new RepairKit(this.game, 0, 0)
                };
            }
            // Animate dummy kits
            Object.values(this.dummyKits).forEach(kit => kit.frameCounter++);

            items.forEach((item, i) => {
                const y = 450 + i * 70;

                // Draw Icon using the actual game entity logic scaled up
                ctx.save();
                const dummy = this.dummyKits[item.type];
                if (dummy) {
                    ctx.translate(cx - 380, y - 20);
                    ctx.scale(2.5, 2.5); // 16 * 2.5 = 40
                    dummy.x = 0;
                    dummy.y = 0;
                    dummy.draw(ctx);
                }
                ctx.restore();

                // Text
                ctx.textAlign = 'left';
                ctx.fillStyle = item.color;
                ctx.font = 'bold 15px "Space Mono", monospace';
                ctx.fillText(item.name, cx - 320, y - 8);

                ctx.fillStyle = '#CCCCCC';
                ctx.font = '13px "Space Mono", monospace';
                ctx.fillText(item.desc, cx - 320, y + 15);
            });

        } else {
            // ---- PAGE 2: CONTROLS ----
            this._drawPanel(ctx, cx - 350, 90, 700, 450, 'CONTROLS', '#FFCC00');

            const controls = [
                { key: 'A / D', action: 'MOVE LEFT / RIGHT' },
                { key: 'W', action: 'BURST JUMP (GROUND) / HOVER (HOLD) / UNDOCK' },
                { key: 'SHIFT', action: 'LOCK-ON AIM (TAP)' },
                { key: 'L-CLICK', action: 'FIRE MISSILE OR MACHINE GUN' },
                { key: 'R-CLICK', action: 'THROW GRENADE (TAP: THROW / HOLD + L-CLICK)' },
                { key: 'F', action: 'SWITCH WEAPON (MISSILE ↔ M-GUN)' },
                { key: 'S', action: 'DOCK WITH CARRIER / HOLD FOR FAST FUEL CHARGE' },
                { key: 'R', action: 'TOGGLE MINI-MAP OVERLAY' },
            ];

            ctx.textAlign = 'left';
            controls.forEach((c, i) => {
                const y = 150 + i * 45;
                this._drawKeyCap(ctx, cx - 180, y, c.key);
                ctx.fillStyle = '#EEEEEE';
                ctx.font = '16px "Space Mono", monospace';
                ctx.textBaseline = 'middle';
                ctx.fillText(c.action, cx - 140, y);
            });
            ctx.textBaseline = 'alphabetic'; // reset
        }

        // ページドット
        ctx.textAlign = 'center';
        ctx.font = '18px sans-serif';
        ctx.fillStyle = page === 0 ? '#00FFFF' : '#444444';
        ctx.fillText('●', cx - 15, H - 35);
        ctx.fillStyle = page === 1 ? '#00FFFF' : '#444444';
        ctx.fillText('●', cx + 15, H - 35);

        // Press Any Key ヒント（点滅）
        if (Math.floor(Date.now() / 600) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', cx, H - 70);
            ctx.restore();
        }
    }

    _drawPanel(ctx, x, y, w, h, title, titleColor) {
        ctx.save();
        // Panel Background
        ctx.fillStyle = 'rgba(0, 20, 40, 0.7)';
        ctx.strokeStyle = '#0055AA';
        ctx.lineWidth = 2;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 8);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }

        // Title Bar
        ctx.fillStyle = 'rgba(0, 85, 170, 0.3)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, 35, { tl: 8, tr: 8, bl: 0, br: 0 });
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, 35);
        }

        ctx.fillStyle = titleColor;
        ctx.font = 'bold 18px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, x + w / 2, y + 18);
        ctx.restore();
    }

    _drawKeyCap(ctx, x, y, text) {
        ctx.save();
        ctx.font = 'bold 14px "Space Mono", monospace';
        const textWidth = ctx.measureText(text).width;
        const w = Math.max(textWidth + 20, 40);
        const h = 30;
        const rx = x - w; // align right visually by shifting
        const ry = y - h / 2;

        // Key shadow
        ctx.fillStyle = '#222222';
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(rx, ry + 3, w, h, 4); ctx.fill();
        } else {
            ctx.fillRect(rx, ry + 3, w, h);
        }

        // Key top
        const grad = ctx.createLinearGradient(rx, ry, rx, ry + h);
        grad.addColorStop(0, '#EEEEEE');
        grad.addColorStop(1, '#AAAAAA');
        ctx.fillStyle = grad;
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(rx, ry, w, h, 4); ctx.fill();
        } else {
            ctx.fillRect(rx, ry, w, h);
        }

        // Key border
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(rx, ry, w, h, 4); ctx.stroke();
        } else {
            ctx.strokeRect(rx, ry, w, h);
        }

        // Text
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rx + w / 2, ry + h / 2 + 1);

        ctx.restore();
    }

    drawMissionClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = '30px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#FFFF00';
        ctx.font = '24px "Space Mono", monospace';
        // Format time mm:ss.xx
        const mm = Math.floor(this.game.missionTimer / 60000).toString().padStart(2, '0');
        const ss = Math.floor((this.game.missionTimer % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((this.game.missionTimer % 1000) / 10).toString().padStart(2, '0');
        ctx.fillText(`CLEAR TIME: ${mm}:${ss}.${xx}`, canvas.width / 2, canvas.height / 2);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 30);
        } else {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO CONTINUE', canvas.width / 2, canvas.height / 2 + 60);
            ctx.restore();
        }
    }

    drawGameOver(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 36px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Space Mono", monospace';
        ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 20);

        ctx.fillStyle = '#888888';
        ctx.font = '14px "Space Mono", monospace';
        ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
    }

    drawGameClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FFFF'; // Cyan for clear
        ctx.font = 'bold 36px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CONGRATULATIONS!', canvas.width / 2, canvas.height / 2 - 60);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Space Mono", monospace';
        ctx.fillText(`ALL MISSIONS CLEARED!`, canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFF00';
        ctx.font = '24px "Space Mono", monospace';
        const mm = Math.floor(this.game.totalTime / 60000).toString().padStart(2, '0');
        const ss = Math.floor((this.game.totalTime % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((this.game.totalTime % 1000) / 10).toString().padStart(2, '0');
        ctx.fillText(`TOTAL TIME: ${mm}:${ss}.${xx}`, canvas.width / 2, canvas.height / 2 + 20);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 50);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '18px "Space Mono", monospace';
            ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 60);

            ctx.fillStyle = '#888888';
            ctx.font = '14px "Space Mono", monospace';
            ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 90);
        }
        ctx.textAlign = 'left';
    }

    drawRankingEntry(ctx, currentName, score) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFFF00'; // Yellow
        ctx.font = 'bold 24px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!!! YOU GOT A HIGH SCORE !!!', canvas.width / 2, canvas.height / 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Space Mono", monospace';
        ctx.fillText(`YOUR SCORE: ${score}`, canvas.width / 2, canvas.height / 4 + 40);

        ctx.fillText('ENTER YOUR NAME:', canvas.width / 2, canvas.height / 2 - 20);

        // Name input box
        ctx.fillStyle = '#000000';
        ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);
        ctx.strokeStyle = '#00FF00';
        ctx.strokeRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 24px "Space Mono", monospace';
        ctx.textAlign = 'left';

        // Blink cursor
        let displayStr = currentName;
        if (Math.floor(Date.now() / 400) % 2 === 0) {
            displayStr += '_';
        }
        ctx.fillText(displayStr, canvas.width / 2 - 90, canvas.height / 2 + 28);
        ctx.textAlign = 'left'; // Already left, but kept for consistency

        ctx.fillStyle = '#AAAAAA';
        ctx.font = '14px "Space Mono", monospace';
        ctx.fillText('PRESS [ENTER] TO SAVE', canvas.width / 2, canvas.height / 2 + 70);

        ctx.textAlign = 'left';
    }

    drawRankingDisplay(ctx, scores, highlightIndex = -1) {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 42px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WALL OF FAME', canvas.width / 2, 50);

        ctx.font = 'bold 19px "Space Mono", monospace';
        ctx.fillStyle = '#AAAAAA';
        // Headers for single column
        ctx.fillText('RANK   SCORE       NAME         MISSION (TIME)', canvas.width / 2, 95);

        ctx.font = 'bold 19px "Space Mono", monospace';
        const startY = 130;
        const lineH = 22.5; // Fit 20 lines perfectly with max vertical spread

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

            // Single column layout (Adjusted for wider font size)
            const textLeft = canvas.width / 2 - 255;
            ctx.textAlign = 'left';

            ctx.fillText(`${rank}.  ${scoreStr}     ${nameStr}      ${missionStr}${timeStr}`, textLeft, startY + index * lineH);
        });

        // Blinking text
        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
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

    _drawMiniCarrier(ctx, x, y) {
        ctx.save();
        ctx.translate(x - 20, y - 10);
        ctx.scale(0.6, 0.6); // Scale down slightly to fit UI
        const drawY = 0;

        // Bottom hull
        ctx.fillStyle = '#1a3a6a';
        ctx.fillRect(4, drawY + 14, 56, 16);
        // Top hull (red accent)
        ctx.fillStyle = '#AA2222';
        ctx.fillRect(8, drawY + 8, 48, 8);
        // Platform deck
        ctx.fillStyle = '#CC9900';
        ctx.fillRect(16, drawY + 4, 32, 5); // platformLeft=16, platformRight=48
        // Platform surface line
        ctx.fillStyle = '#FFCC00';
        ctx.fillRect(16, drawY + 4, 32, 2);
        // Cockpit window
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(28, drawY + 10, 8, 4);
        // Engine pods
        ctx.fillStyle = '#2255AA';
        ctx.fillRect(0, drawY + 18, 8, 10);
        ctx.fillRect(56, drawY + 18, 8, 10);
        // Thruster glow
        ctx.fillStyle = '#00CCFF';
        ctx.fillRect(1, drawY + 28, 6, 4);
        ctx.fillRect(57, drawY + 28, 6, 4);
        ctx.fillRect(20, drawY + 30, 6, 5);
        ctx.fillRect(38, drawY + 30, 6, 5);
        ctx.restore();
    }

    _drawMiniPlayer(ctx, x, y) {
        ctx.save();
        ctx.translate(x - 10, y - 10);
        ctx.scale(0.8, 0.8);

        // Backpack (hover unit)
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(2, 5, 4, 8);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(2, 12, 4, 2);

        // Body
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(5, 4, 10, 12);
        // Head
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(6, 0, 8, 5);
        // Visor
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(10, 1, 3, 3);

        // Legs (Standing)
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(6, 16, 3, 6);
        ctx.fillRect(9, 16, 3, 6);
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(4, 20, 4, 3);
        ctx.fillRect(7, 20, 4, 3);

        // Machine Gun
        ctx.fillStyle = '#555555';
        ctx.fillRect(10, 8, 8, 4);
        ctx.fillStyle = '#333333';
        ctx.fillRect(18, 9, 6, 2);

        ctx.restore();
    }

    _drawItemIcon(ctx, type, x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.75, 0.75); // Scale down slightly to fit well inside the 40x40 box

        if (type === 'missile') {
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.moveTo(0, -12); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(-3, 6, 6, 4);
        } else if (type === 'autoaim') {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
        } else if (type === 'repair') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(-8, -2, 16, 4);
            ctx.fillRect(-2, -8, 4, 16);
        }
        ctx.restore();
    }
}
