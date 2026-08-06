// ============================================
// Screen Renderer - Title, Game Over, Mission Clear, MiniMap
// ============================================

import { TILE_SIZE } from '../utils/Constants.js';
import { RepairKit } from '../entities/RepairKit.js';
import { AutoAimUnit } from '../entities/AutoAimUnit.js';
import { MissileKit } from '../entities/MissileKit.js';
import { flagEmoji } from '../utils/geo.js';
import { lerpColor } from '../utils/color.js';
import { MODES, MODE_ORDER } from '../utils/modes.js';
import { drawStageScene } from './StageScene.js';
import { UI, TIER, ROW_HIGHLIGHT, SPACE, lineHeight, font, glow, drawFrame, drawPanel, drawKeyCap, drawScanlines } from './theme.js';

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

        // ロゴは画面の主役なので、いちばん強い発光をかける。
        ctx.save();
        ctx.fillStyle = UI.ok;
        ctx.font = font('body', true);
        ctx.textAlign = 'left';
        glow(ctx, UI.ok, 'hard');

        // 実測して中央に置く（従来は 1文字9.6px という近似だった）
        const logoWidth = ctx.measureText(ASCII_LOGO[4]).width;
        const startX = Math.round((canvas.width - logoWidth) / 2);
        const startY = canvas.height / 3 - 40;

        for (let i = 0; i < ASCII_LOGO.length; i++) {
            ctx.fillText(ASCII_LOGO[i], startX, startY + (i * 18));
        }
        ctx.restore();

        drawScanlines(ctx, canvas.width, canvas.height);

        // Blinking text
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = UI.ink;
            ctx.font = font('sub', true);
            ctx.textAlign = 'center';
            glow(ctx, UI.info, 'mid');
            ctx.fillText('PRESS ENTER TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }


        this._drawModeSelector(ctx, canvas);
    }

    /**
     * Both modes are drawn side by side so the choice — and which side you are
     * on — is visible at a glance; the picked one gets its colour, a framed box
     * and a glow, the other is dimmed back to near-background grey.
     */
    _drawModeSelector(ctx, canvas) {
        const rowY = canvas.height - 74;
        const GAP = 44;
        const LABEL_FONT = font('head', true);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Key hint, so the selection is discoverable without pressing anything.
        ctx.font = font('micro');
        ctx.fillStyle = UI.faint;
        ctx.fillText('[ A / D ]  SELECT MODE', canvas.width / 2, rowY - 34);

        // Lay the labels out around the centre of the canvas.
        ctx.font = LABEL_FONT;
        const widths = MODE_ORDER.map((key) => ctx.measureText(MODES[key].label).width);
        const rowWidth = widths.reduce((a, b) => a + b, 0) + GAP * (MODE_ORDER.length - 1);
        let x = (canvas.width - rowWidth) / 2;

        MODE_ORDER.forEach((key, i) => {
            const mode = MODES[key];
            const width = widths[i];
            const centerX = x + width / 2;
            const selected = key === this.game.mode;

            if (selected) {
                const boxW = width + 34;
                const boxH = 38;

                // 選択中は面取りフレーム＋発光で示す。角丸は使わない。
                drawFrame(ctx, centerX - boxW / 2, rowY - boxH / 2, boxW, boxH,
                    mode.color, { fill: UI.panelFill, glow: 'mid', radius: 6 });

                ctx.save();
                ctx.font = LABEL_FONT;
                ctx.fillStyle = mode.color;
                glow(ctx, mode.color, 'soft');
                ctx.fillText(mode.label, centerX, rowY);
                ctx.restore();
            } else {
                ctx.font = LABEL_FONT;
                ctx.fillStyle = UI.faint;
                ctx.fillText(mode.label, centerX, rowY);
            }

            x += width + GAP;
        });

        // Arrows flanking the row, so it reads as a left/right selection.
        const rowLeft = (canvas.width - rowWidth) / 2;
        ctx.font = font('sub', true);
        ctx.fillStyle = UI.dim;
        ctx.fillText('◀', rowLeft - 34, rowY);
        ctx.fillText('▶', rowLeft + rowWidth + 34, rowY);

        // What the selected mode actually changes.
        ctx.font = font('small');
        ctx.fillStyle = UI.dim;
        ctx.fillText(MODES[this.game.mode].desc, canvas.width / 2, rowY + 32);

        ctx.restore();
    }

    drawHowToPlay(ctx, page) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;

        // Rich Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, UI.panelFill);
        bgGrad.addColorStop(1, UI.bg);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Grid overlay for tech feel
        ctx.strokeStyle = 'rgba(0, 204, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < W; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
        for (let j = 0; j < H; j += 40) { ctx.moveTo(0, j); ctx.lineTo(W, j); }
        ctx.stroke();

        // Header
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font('head', true);
        glow(ctx, UI.ok, 'mid');
        ctx.fillStyle = UI.ok;
        ctx.fillText('─── HOW TO PLAY ───', cx, 50);
        ctx.restore();

        if (page === 0) {
            // ---- PAGE 1: MISSION & RULES ----

            // PANEL 1: OBJECTIVE
            this._drawPanel(ctx, cx - 400, 80, 800, 100, 'MISSION OBJECTIVE', UI.accent);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = font('small');
            ctx.textAlign = 'center';
            ctx.fillText('DESTROY ENEMY ROBOTS, OBLITERATE THE ENEMY BASE CORE, AND CAPTURE THE FLAG.', cx, 130);
            ctx.fillStyle = UI.warn;
            ctx.fillText('* GAME OVER IF THE CARRIER LOSES ALL ITS LIVES.', cx, 155);

            // PANEL 2: BASIC RULES
            this._drawPanel(ctx, cx - 400, 195, 800, 170, 'BASIC RULES', UI.accent);
            ctx.fillStyle = UI.dim;
            ctx.font = font('small');
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
            this._drawPanel(ctx, cx - 400, 380, 800, 260, 'ITEMS', UI.accent);

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
                ctx.font = font('body', true);
                ctx.fillText(item.name, cx - 320, y - 8);

                ctx.fillStyle = UI.dim;
                ctx.font = font('small');
                ctx.fillText(item.desc, cx - 320, y + 15);
            });

        } else {
            // ---- PAGE 2: CONTROLS ----
            this._drawPanel(ctx, cx - 350, 90, 700, 450, 'CONTROLS', UI.accent);

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
                ctx.fillStyle = UI.ink;
                ctx.font = font('body');
                ctx.textBaseline = 'middle';
                ctx.fillText(c.action, cx - 140, y);
            });
            ctx.textBaseline = 'alphabetic'; // reset
        }

        drawScanlines(ctx, W, H);

        // Press Enter ヒント（点滅）
        if (Math.floor(Date.now() / 600) % 2 === 0) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('PRESS ENTER TO START', cx, H - 20);
            ctx.restore();
        }
    }

    /** Shared position indicator for the title/demo attract-mode loop — every
     *  screen in the cycle shows the same dots, so "which screen is this" is
     *  always answerable (item 5: consistency across all demo screens). */
    drawDemoCycleDots(ctx, currentIndex, total) {
        if (total <= 1) return;
        const canvas = this.game.canvas;
        const cy = canvas.height - 5;
        const spacing = 14;
        const startX = canvas.width / 2 - ((total - 1) * spacing) / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('micro');
        for (let i = 0; i < total; i++) {
            ctx.fillStyle = i === currentIndex ? UI.info : UI.faint;
            ctx.fillText('●', startX + i * spacing, cy);
        }
        ctx.restore();
    }

    /** パネルとキーキャップの見た目は theme.js が持つ（角丸とグラデーションを廃した面取り版）。 */
    _drawPanel(ctx, x, y, w, h, title, titleColor) {
        drawPanel(ctx, x, y, w, h, title, titleColor);
    }

    _drawKeyCap(ctx, x, y, text) {
        return drawKeyCap(ctx, x, y, text);
    }

    drawMissionClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = font('head');
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#FFFF00';
        ctx.font = font('head');
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
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('PRESS ANY KEY TO CONTINUE', canvas.width / 2, canvas.height / 2 + 60);
            ctx.restore();
        }

        this._drawStageTop5Notice(ctx, canvas.height / 2 + 90);
    }

    _drawStageTop5Notice(ctx, y) {
        const canvas = this.game.canvas;
        const notices = [];
        if (this.game.stageTop5Time) notices.push('TOP 5!  FASTEST TIME');
        if (this.game.stageTop5Score) notices.push('TOP 5!  HIGH SCORE');
        if (notices.length === 0) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);
        const blink = Math.floor(Date.now() / 350) % 2 === 0;
        ctx.fillStyle = blink ? UI.gold : UI.accent;
        glow(ctx, UI.accent, 'mid');
        notices.forEach((t, i) => ctx.fillText(t, canvas.width / 2, y + i * 26));
        ctx.restore();
        ctx.textAlign = 'left';
    }

    drawGameOver(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = font('title', true);
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = font('sub');
        ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 20);

        ctx.fillStyle = '#888888';
        ctx.font = font('small');
        ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
    }

    drawGameClear(ctx) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FFFF'; // Cyan for clear
        ctx.font = font('title', true);
        ctx.textAlign = 'center';
        ctx.fillText('CONGRATULATIONS!', canvas.width / 2, canvas.height / 2 - 60);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = font('sub');
        ctx.fillText(`ALL MISSIONS CLEARED!`, canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFF00';
        ctx.font = font('head');
        const mm = Math.floor(this.game.totalTime / 60000).toString().padStart(2, '0');
        const ss = Math.floor((this.game.totalTime % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((this.game.totalTime % 1000) / 10).toString().padStart(2, '0');
        ctx.fillText(`TOTAL TIME: ${mm}:${ss}.${xx}`, canvas.width / 2, canvas.height / 2 + 20);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 50);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = font('sub');
            ctx.fillText(`FINAL SCORE: ${this.game.score}`, canvas.width / 2, canvas.height / 2 + 60);

            ctx.fillStyle = '#888888';
            ctx.font = font('small');
            ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 90);
        }

        this._drawStageTop5Notice(ctx, canvas.height / 2 + 120);
        ctx.textAlign = 'left';
    }

    drawRankingEntry(ctx, currentName, score) {
        const canvas = this.game.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFFF00'; // Yellow
        ctx.font = font('head', true);
        ctx.textAlign = 'center';
        ctx.fillText('!!! YOU GOT A HIGH SCORE !!!', canvas.width / 2, canvas.height / 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = font('sub');
        ctx.fillText(`YOUR SCORE: ${score}`, canvas.width / 2, canvas.height / 4 + 40);

        ctx.fillText('ENTER YOUR NAME:', canvas.width / 2, canvas.height / 2 - 20);

        // Name input box
        ctx.fillStyle = '#000000';
        ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);
        ctx.strokeStyle = '#00FF00';
        ctx.strokeRect(canvas.width / 2 - 100, canvas.height / 2, 200, 40);

        ctx.fillStyle = '#00FF00';
        ctx.font = font('head', true);
        ctx.textAlign = 'left';

        // Blink cursor
        let displayStr = currentName;
        if (Math.floor(Date.now() / 400) % 2 === 0) {
            displayStr += '_';
        }
        ctx.fillText(displayStr, canvas.width / 2 - 90, canvas.height / 2 + 28);
        ctx.textAlign = 'left'; // Already left, but kept for consistency

        ctx.fillStyle = '#AAAAAA';
        ctx.font = font('small');
        ctx.fillText('PRESS [ENTER] TO SAVE', canvas.width / 2, canvas.height / 2 + 70);

        ctx.textAlign = 'left';
    }

    /** Chrome-style vertical gradient: bright top → dark "horizon" band → bright bottom reflection. */
    _metallicGradient(ctx, base, top, bottom) {
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0.00, lerpColor(base, '#ffffff', 0.90)); // bright top edge
        g.addColorStop(0.30, lerpColor(base, '#ffffff', 0.45));
        g.addColorStop(0.49, lerpColor(base, '#ffffff', 0.05)); // just above horizon
        g.addColorStop(0.51, lerpColor(base, '#000000', 0.60)); // dark horizon line
        g.addColorStop(0.56, lerpColor(base, '#000000', 0.42));
        g.addColorStop(0.80, lerpColor(base, '#000000', 0.08));
        g.addColorStop(1.00, lerpColor(base, '#ffffff', 0.35)); // ground reflection glow
        return g;
    }

    /**
     * Draw glossy chrome text: thin dark edge under a chrome vertical gradient fill.
     *
     * 文字サイズは ctx.font から読む。以前は呼び出し側が px を渡す形で、
     * ctx.font が16pxなのに17を渡すといったズレが実際に起きていた
     * （階調の範囲が実際の字面と合わなくなる）。
     */
    _metallicText(ctx, text, x, y, base) {
        const fontPx = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 16);
        const top = y - fontPx * 0.78;
        const bottom = y + fontPx * 0.10;
        ctx.strokeStyle = lerpColor(base, '#000000', 0.7);
        ctx.lineWidth = Math.max(1, fontPx / 24);
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = this._metallicGradient(ctx, base, top, bottom);
        ctx.fillText(text, x, y);
    }

    /**
     * ランキング表の列。x は表の左端からの相対位置。
     *
     * 以前は1本の文字列に padStart/padEnd で桁を詰めて描いていたが、
     * 見出しと中身が最大4文字ずれていた。さらに国旗の絵文字は等幅フォントでも
     * 送り幅が一定にならないため、国旗の有無でそれ以降の列が動いていた。
     * 列ごとに座標と揃えを決めて独立に描けば、絵文字の幅に左右されない。
     */
    // 関連する列は寄せ、グループ間だけ空ける（順位＋スコア / 名前＋地域 / 到達＋時間）。
    // 等間隔に散らすと、どの値がどの値と対になるのか読み取りにくい。
    static RANKING_COLUMNS = [
        { key: 'rank', label: 'RANK', x: 31, align: 'right' },
        { key: 'score', label: 'SCORE', x: 130, align: 'right' },
        { key: 'name', label: 'NAME', x: 226, align: 'left' },
        { key: 'flag', label: 'REGION', x: 354, align: 'left' },
        { key: 'mission', label: 'MISSION', x: 552, align: 'right' },
        { key: 'time', label: 'TIME', x: 632, align: 'right' },
    ];

    static RANKING_TABLE_WIDTH = 632;

    /**
     * 常にこの数だけ枠を描き、記録が無い行は空欄で埋める。
     * 記録が少ないと画面下が大きく空いてしまう（3件のとき下に560px、埋まり10%）。
     * 当時のハイスコア表が固定枠だったのに倣うと、見た目が安定し余白も一定になる。
     */
    static RANKING_SLOTS = 20;

    /** Wall of Fame の1週ブロック内の列。ランキング表と同じ理由で座標指定にする。 */
    static FAME_COLUMNS = [
        { key: 'rank', x: 24, align: 'right' },
        { key: 'score', x: 130, align: 'right' },
        { key: 'name', x: 162, align: 'left' },
        { key: 'flag', x: 292, align: 'left' },
    ];

    static FAME_BLOCK_WIDTH = 330;

    _drawRankingList(ctx, o) {
        const canvas = this.game.canvas;
        const cols = ScreenRenderer.RANKING_COLUMNS;
        const tableW = ScreenRenderer.RANKING_TABLE_WIDTH;
        const left = Math.round((canvas.width - tableW) / 2);

        ctx.fillStyle = o.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        this._metallicText(ctx, o.title, canvas.width / 2, 40, o.titleColor);

        // 副題は表題の説明。小さくして表題との差をはっきりさせる。
        ctx.fillStyle = o.subtitleColor;
        ctx.font = font('small');
        ctx.fillText(o.subtitle, canvas.width / 2, 40 + SPACE.md + 2);

        // --- 見出し行 ---
        const headerY = 40 + SPACE.md + SPACE.lg + 2;
        ctx.fillStyle = o.subtitleColor;
        ctx.font = font('small', true);
        for (const c of cols) {
            ctx.textAlign = c.align;
            ctx.fillText(c.label, left + c.x, headerY);
        }
        ctx.strokeStyle = o.subtitleColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, headerY + SPACE.sm + 0.5);
        ctx.lineTo(left + tableW, headerY + SPACE.sm + 0.5);
        ctx.stroke();

        const scores = o.scores || [];
        const slots = ScreenRenderer.RANKING_SLOTS;
        const startY = headerY + SPACE.lg + SPACE.xs;
        const bottom = canvas.height - SPACE.xl;
        const lineH = Math.floor((bottom - startY) / slots);
        const emptyShade = lerpColor(o.rowDim, o.bg, 0.45);

        ctx.font = font('body', true);
        for (let index = 0; index < slots; index++) {
            const entry = scores[index];
            const rowY = startY + index * lineH;

            if (!entry) {
                // 空き枠。順位だけ残して他は罫で埋める。
                ctx.fillStyle = emptyShade;
                for (const c of cols) {
                    ctx.textAlign = c.align;
                    ctx.fillText(c.key === 'rank' ? `${index + 1}.` : '·····', left + c.x, rowY);
                }
                continue;
            }

            const highlighted = index === o.highlightIndex
                && Math.floor(Date.now() / 200) % 2 === 0;
            const shade = lerpColor(o.rowBright, o.rowDim, Math.min(index / (slots - 1), 1));

            const values = {
                rank: `${index + 1}.`,
                score: String(entry.score),
                name: String(entry.name || ''),
                flag: flagEmoji(entry.country),
                mission: String(entry.mission),
                time: entry.clearTime ? String(entry.clearTime) : '—',
            };

            for (const c of cols) {
                const text = values[c.key];
                if (!text) continue;
                ctx.textAlign = c.align;
                if (highlighted) {
                    ctx.fillStyle = ROW_HIGHLIGHT;
                    ctx.fillText(text, left + c.x, rowY);
                } else {
                    this._metallicText(ctx, text, left + c.x, rowY, shade);
                }
            }
        }

        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('PRESS ENTER TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    drawLocalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '▌ LOCAL RANKING — THIS DEVICE',
            subtitle: `${weekId} · YOUR MACHINE`,
            bg: TIER.local.bg, titleColor: TIER.local.title, subtitleColor: TIER.local.subtitle,
            rowBright: TIER.local.rowBright, rowDim: TIER.local.rowDim,
        });
    }

    drawGlobalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '◍ GLOBAL RANKING — THIS WEEK 🌐',
            subtitle: `${weekId} · WORLDWIDE`,
            bg: TIER.global.bg, titleColor: TIER.global.title, subtitleColor: TIER.global.subtitle,
            rowBright: TIER.global.rowBright, rowDim: TIER.global.rowDim,
        });
    }

    drawWallOfFame(ctx, fame) {
        const canvas = this.game.canvas;

        ctx.fillStyle = TIER.fame.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 表題。この画面の主役なので最大サイズ＋クローム。
        ctx.font = font('title', true);
        ctx.textAlign = 'center';
        this._metallicText(ctx, '✦ WALL OF FAME ✦', canvas.width / 2, 40, TIER.fame.title);

        // 副題は「表題の説明」であって見出しではない。小さく落ち着かせて、
        // 表題との大小差をはっきりさせる（以前は16px太字で週見出しと同格だった）。
        ctx.fillStyle = TIER.fame.subtitle;
        ctx.font = font('small');
        ctx.fillText('WEEKLY CHAMPIONS', canvas.width / 2, 40 + SPACE.md + 2);

        if (!fame || fame.length === 0) {
            ctx.fillStyle = TIER.fame.subtitle;
            ctx.font = font('sub', true);
            ctx.fillText('NO CHAMPIONS YET', canvas.width / 2, canvas.height / 2);
            drawScanlines(ctx, canvas.width, canvas.height);
        } else {
            // 週ブロックを2列に並べる。1列だと画面の横半分以上が空くうえ、
            // 表示できる週数も半分になってしまう。
            const cols = ScreenRenderer.FAME_COLUMNS;
            const blockW = ScreenRenderer.FAME_BLOCK_WIDTH;
            const colGap = SPACE.xl + SPACE.md;
            const totalW = blockW * 2 + colGap;
            const left = Math.round((canvas.width - totalW) / 2);

            const areaTop = 40 + SPACE.md + SPACE.lg + SPACE.sm;
            const bottom = canvas.height - SPACE.xl;
            const blockH = SPACE.md + lineHeight('body') * 3 + SPACE.md;
            const rowsPerCol = Math.max(1, Math.floor((bottom - areaTop) / blockH));

            // 週数が少ないときは上に寄せず、縦に中央へ置く（下だけ大きく空くのを防ぐ）
            const usedRows = Math.min(rowsPerCol, Math.ceil(fame.length / 2));
            const topY = areaTop + Math.floor(((bottom - areaTop) - usedRows * blockH) / 2);

            fame.slice(0, rowsPerCol * 2).forEach((wk, i) => {
                const colIndex = Math.floor(i / rowsPerCol);   // 先に縦を埋めてから隣の列へ
                const blockLeft = left + colIndex * (blockW + colGap);
                let y = topY + (i % rowsPerCol) * blockH;

                // 週の見出しは「ラベル」。行より小さくして、序列を大きさで示す。
                ctx.textAlign = 'left';
                ctx.fillStyle = TIER.fame.subtitle;
                ctx.font = font('small', true);
                ctx.fillText(wk.weekId, blockLeft, y);
                y += SPACE.md;

                // 3行しかないブロックの中で文字サイズを変えると行送りが混ざり
                // (18px→26px / 16px→23px)、ブロック全体が歪んで見える。
                // サイズは揃え、1位の強調は明るさ（クロームの階調）だけで示す。
                ctx.font = font('body', true);
                wk.entries.forEach((e, rank) => {
                    const shade = lerpColor(TIER.fame.rowBright, TIER.fame.rowDim, Math.min(rank / 2, 1));
                    const values = {
                        rank: `${rank + 1}.`,
                        score: String(e.score),
                        name: String(e.name || ''),
                        flag: flagEmoji(e.country),
                    };
                    for (const c of cols) {
                        const text = values[c.key];
                        if (!text) continue;
                        ctx.textAlign = c.align;
                        this._metallicText(ctx, text, blockLeft + c.x, y, shade);
                    }
                    y += lineHeight('body');
                });
            });

            drawScanlines(ctx, canvas.width, canvas.height);
        }

        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('PRESS ENTER TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    drawStageRankings(ctx, stageIndex, stageData, palette) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const stageNo = stageIndex + 1;
        // Brighten the (often dark) stage colour into a legible accent.
        const accent = lerpColor(palette.fill, '#ffffff', 0.55);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);

        // Title + subtitle
        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        this._metallicText(ctx, `STAGE ${stageNo}`, W / 2, 46, accent);
        ctx.fillStyle = lerpColor(palette.fill, '#ffffff', 0.35);
        ctx.font = font('small', true);
        ctx.fillText('THIS WEEK · TOP 5', W / 2, 70);

        // Scene strip (full width)
        drawStageScene(ctx, 40, 84, W - 80, 150, stageIndex, palette, Date.now());

        // Two side-by-side lists.
        this._drawStageColumn(ctx, 'FASTEST TIME', stageData.time || [], W * 0.27, 258, accent, true);
        this._drawStageColumn(ctx, 'HIGH SCORE', stageData.score || [], W * 0.73, 258, accent, false);

        // Divider between columns
        ctx.strokeStyle = lerpColor(palette.fill, '#000000', 0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2, 250);
        ctx.lineTo(W / 2, 250 + 200);
        ctx.stroke();

        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('PRESS ENTER TO START', W / 2, H - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    _drawStageColumn(ctx, label, rows, centerX, topY, accent, isTime) {
        // Header
        ctx.textAlign = 'center';
        ctx.fillStyle = accent;
        ctx.font = font('sub', true);
        ctx.fillText(label, centerX, topY);

        const startY = topY + 30;
        const lineH = 30;
        const left = centerX - 150;
        if (rows.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#666666';
            ctx.font = font('body');
            ctx.fillText('NO RECORDS YET', centerX, startY + 16);
            ctx.textAlign = 'left';
            return;
        }
        ctx.textAlign = 'left';
        rows.forEach((entry, i) => {
            const y = startY + i * lineH;
            const rank = String(i + 1);
            const name = String(entry.name || '').substring(0, 8);
            const flag = flagEmoji(entry.country);
            const valStr = isTime ? this._formatMs(entry.timeMs) : String(entry.score).toLocaleString();

            // Rank number in accent, dimmer for lower ranks.
            ctx.font = font('body', true);
            ctx.fillStyle = lerpColor(accent, '#5a5a5a', Math.min(i / 4, 1) * 0.55);
            ctx.fillText(rank + '.', left, y);
            // Name (off-white) + flag
            ctx.fillStyle = '#EAEAEA';
            ctx.fillText(name + (flag ? ' ' + flag : ''), left + 30, y);
            // Value, right-aligned within the column
            ctx.textAlign = 'right';
            ctx.fillStyle = isTime ? '#EAEAEA' : accent;
            ctx.fillText(valStr, left + 300, y);
            ctx.textAlign = 'left';
        });
    }

    _formatMs(ms) {
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const cs = Math.floor((ms % 1000) / 10);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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
