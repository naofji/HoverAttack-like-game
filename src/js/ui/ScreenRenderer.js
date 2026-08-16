// ============================================
// Screen Renderer - Title, Game Over, Mission Clear, MiniMap
// ============================================

import {
    TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, VOLUME_HUD_FADE_FRAMES, MINIMAP_ALPHA,
    MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    MINIMAP_MAX_WIDTH_RATIO, MINIMAP_FADE_SPEED, MINIMAP_AVOID_PADDING, MINIMAP_SIDE_HYSTERESIS,
    MINIMAP_AVOID_PADDING_UNIT, MINIMAP_VIEWPORT_HIGHLIGHT, COLOR_MINIMAP_VIEWPORT,
} from '../utils/Constants.js';
import { pickStickyMiniMapCorner, miniMapCornerPositions } from './minimapPlacement.js';
import { advanceMiniMapTransition } from './minimapTransition.js';
import { crosshairScreenPos } from './Crosshair.js';
import { RepairKit } from '../entities/RepairKit.js';
import { AutoAimUnit } from '../entities/AutoAimUnit.js';
import { MissileKit } from '../entities/MissileKit.js';
import { flagEmoji } from '../utils/geo.js';
import { formatClock } from '../utils/formatTime.js';
import { volumePercent } from '../utils/bgmVolume.js';
import { lerpColor } from '../utils/color.js';
import { MODES, MODE_ORDER } from '../utils/modes.js';
import { drawStageScene, stageEnemyLabel } from './StageScene.js';
import { visibleSettingsItems, settingValueText } from './settingsItems.js';
import { drawControlsDiagram, controlsDiagramHeight } from './controlsDiagram.js';
import { UI, TIER, ROW_HIGHLIGHT, SPACE, lineHeight, font, glow, drawFrame, drawPanel, drawScanlines } from './theme.js';
import { SAVE_COST, STAGE_PALETTES } from '../utils/Constants.js';

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

        this._drawTitleMenu(ctx, canvas);

        this._drawModeSelector(ctx, canvas);

        this._drawKeyLegend(ctx, canvas);
    }

    /**
     * タイトルの縦メニュー。**使えない項目は並べない**ので、出ている行は必ず
     * 選べる（Game.titleMenuItems() が唯一の判断元。描画側で条件を書き直すと、
     * 「行はあるのに決定しても何も起きない」がまた生まれる）。
     *
     * CONTINUE には**どの面・どのモードから再開するのかを必ず書く** — 再開時は
     * モードが保存値へ固定されるので、A/D で選んだモードとの食い違いを先に見せる。
     *
     * 縦位置: ロゴの下端（canvas.height/3 - 40 から 5行×18px ≒ 高さ720で 272）と、
     * モードセレクタの見出し `[ A / D ] SELECT MODE`(-108) の間に置く。
     * 3項目・行間28pxで -230..-174。
     */
    _drawTitleMenu(ctx, canvas) {
        const items = this.game.titleMenuItems();
        const selected = this.game.selectedTitleItem();
        const cx = canvas.width / 2;
        const top = canvas.height - 230;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);

        // 目印の位置は**一番長い項目を実測して**決める。
        // 当初は中央から ±190px の固定値だったが、CONTINUE 行は
        // 「CONTINUE - STAGE 7 / NEWTYPE  (TRY 12)」で 38 文字ほどになり、
        // 18px 等幅だと片側 205px を超えて目印に文字がかぶった（実機の指摘）。
        // **行ごとの幅に合わせない**のは、上下に動かすたび目印が寄ったり離れたり
        // して落ち着かないため。一番長い項目に合わせて固定する。
        const widest = Math.max(...items.map((k) => ctx.measureText(this._titleMenuLabel(k)).width));
        // 24px は目印と文字の間の余白（font('sub') の1文字幅 ≒ 11px の約2文字分）
        const markerGap = widest / 2 + 24;

        items.forEach((key, i) => {
            const on = key === selected;
            const y = top + i * 28;
            ctx.font = font('sub', true);
            if (on) {
                ctx.fillStyle = UI.gold;
                glow(ctx, UI.gold, 'mid');
            } else {
                ctx.fillStyle = UI.dim;
                ctx.shadowBlur = 0;
            }
            ctx.fillText(this._titleMenuLabel(key), cx, y);
            if (on) {
                // 左右に置くのは、項目の文字数がまちまちで下線だと長さが揃わないため
                ctx.fillText('\u25B6', cx - markerGap, y);
                ctx.fillText('\u25C0', cx + markerGap, y);
            }
        });
        ctx.restore();
        ctx.textAlign = 'left';
    }

    _titleMenuLabel(key) {
        if (key === 'continue') {
            const s = this.game.saveManager.save;
            const modeLabel = MODES[s.mode] ? MODES[s.mode].label : s.mode;
            return `CONTINUE - STAGE ${s.missionsCompleted + 1} / ${modeLabel}  (TRY ${s.tries})`;
        }
        if (key === 'stageSelect') return 'STAGE SELECT';
        return 'START';
    }

    /**
     * 操作の凡例。**キーの役割は画面をまたいで固定**（A/D=横の選択、
     * W/S=縦の選択、ENTER=決定）なので、タイトルで一度見せれば他の画面でも通じる。
     * 以前あった `PRESS ENTER TO START` の位置(-20)をそのまま使う。
     */
    _drawKeyLegend(ctx, canvas) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('small', true);
        ctx.fillStyle = UI.dim;
        ctx.fillText('[W][S] / [\u2191][\u2193] SELECT    [A][D] MODE    [ENTER] DECIDE', canvas.width / 2, canvas.height - 20);
        ctx.restore();
        ctx.textAlign = 'left';
    }

    /**
     * 面セレクト。**デモの巡回には入れない**ので、位置ドットは出さない。
     *
     * 面別ランキング画面と同じ言語で見せる ── 左に面の一覧、右に選んでいる面の
     * `drawStageScene()`（洞窟の色が面ごとに変わり、自機とその面の敵が撃ち合う）。
     * 番号だけを並べた版から作り直したのは、色とキャラクターが無いと
     * 「何面がどんな面か」が思い出せず選べないため（ユーザーの指摘）。
     *
     * **未到達の面は番号も敵の名前も伏せる。** このリポジトリは未到達の面と
     * その敵を驚きとして取っておく方針（面別ランキング画面の出現ゲートも同じ理由）。
     */
    drawStageSelect(ctx) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const max = this.game.saveManager.reached;
        const picked = this.game.stageSelectIndex;
        const palette = STAGE_PALETTES[picked - 1] || STAGE_PALETTES[0];
        // 面の色はどれも暗いので、文字に使うぶんは白へ寄せて読めるようにする
        // （面別ランキング画面と同じ 0.55）
        const accent = lerpColor(palette.fill, '#ffffff', 0.55);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        this._metallicText(ctx, 'STAGE SELECT', W / 2, 56, accent);
        ctx.fillStyle = UI.info;
        ctx.font = font('small', true);
        ctx.fillText('TIME ATTACK \u00B7 RECORDED IN STAGE RANKINGS ONLY', W / 2, 82);
        ctx.restore();

        this._drawStageSelectList(ctx, W * 0.22, 140, max, picked, accent);

        // 右半分にシーン。幅は画面の 46%、高さはシーンの作りに合わせて 150px
        // （面別ランキング画面と同じ高さ。それ以上潰すと脚や砲塔が読めない）
        const sceneW = Math.round(W * 0.46);
        const sceneX = Math.round(W * 0.5);
        drawStageScene(ctx, sceneX, 150, sceneW, 150, picked - 1, palette, Date.now());

        ctx.save();
        ctx.textAlign = 'center';
        const midX = sceneX + sceneW / 2;
        ctx.font = font('head', true);
        ctx.fillStyle = accent;
        glow(ctx, accent, 'mid');
        ctx.fillText(`STAGE ${picked}`, midX, 336);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);
        ctx.fillStyle = UI.ink;
        ctx.fillText(stageEnemyLabel(picked - 1), midX, 366);
        ctx.font = font('small');
        ctx.fillStyle = UI.dim;
        ctx.fillText(MODES[this.game.mode].label, midX, 392);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('small', true);
        ctx.fillStyle = UI.dim;
        ctx.fillText('[W][S] / [\u2191][\u2193] SELECT    [ENTER] START    [ESC] BACK', W / 2, H - 20);
        ctx.restore();

        drawScanlines(ctx, W, H);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    /**
     * 面セレクトの一覧。7行を必ず描き、未到達の面は伏せ字にする ── 行数が
     * 増減すると「あと何面あるのか」が読めず、解放の手応えも消えるため。
     */
    _drawStageSelectList(ctx, centerX, topY, max, picked, accent) {
        const LINE_H = 34;
        ctx.save();
        ctx.textBaseline = 'middle';
        for (let n = 1; n <= STAGE_PALETTES.length; n++) {
            const y = topY + (n - 1) * LINE_H;
            const locked = n > max;
            const on = n === picked;

            if (on) {
                // 選択中の帯。面の色をそのまま敷くと暗すぎて読めないので、
                // 黒へ寄せた帯＋左端に面の色の縦棒を立てる
                ctx.fillStyle = lerpColor(STAGE_PALETTES[n - 1].fill, '#000000', 0.55);
                ctx.fillRect(centerX - 150, y - 15, 300, 30);
                ctx.fillStyle = accent;
                ctx.fillRect(centerX - 150, y - 15, 4, 30);
            }

            ctx.textAlign = 'right';
            ctx.font = font('sub', true);
            ctx.fillStyle = locked ? UI.faint : (on ? accent : UI.dim);
            ctx.fillText(locked ? '-' : String(n), centerX - 110, y);

            ctx.textAlign = 'left';
            ctx.font = font('body', true);
            if (locked) {
                ctx.fillStyle = UI.faint;
                ctx.fillText('- - -', centerX - 92, y);
            } else {
                ctx.fillStyle = on ? UI.ink : UI.dim;
                ctx.fillText(stageEnemyLabel(n - 1), centerX - 92, y);
            }
        }
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
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

            // パネルの高さを中身から求め、余った縦幅を等間隔に配る。
            // 以前はパネル間15pxに対して最終パネルの下が108px空いていた。
            const lineH = lineHeight('small');
            const ILLUST_H = 115;
            const ITEM_H = 64;
            const objectiveH = ScreenRenderer.panelHeight(lineH * 2);
            const rulesH = ScreenRenderer.panelHeight(Math.max(lineH * 6, ILLUST_H));
            const itemsH = ScreenRenderer.panelHeight(ITEM_H * 3);
            const areaTop = 80;
            const areaBottom = H - SPACE.xl;
            const gap = Math.floor(
                (areaBottom - areaTop - objectiveH - rulesH - itemsH) / 3,
            );

            const objectiveY = areaTop;
            const rulesY = objectiveY + objectiveH + gap;
            const itemsY = rulesY + rulesH + gap;

            // PANEL 1: OBJECTIVE
            drawPanel(ctx, cx - 400, objectiveY, 800, objectiveH, 'MISSION OBJECTIVE', UI.accent);
            ctx.font = font('small');
            ctx.textAlign = 'center';
            let ty = ScreenRenderer.panelContentTop(objectiveY, lineH);
            ctx.fillStyle = UI.ink;
            ctx.fillText('DESTROY ENEMY ROBOTS, OBLITERATE THE ENEMY BASE CORE, AND CAPTURE THE FLAG.', cx, ty);
            ctx.fillStyle = UI.warn;
            ctx.fillText('* GAME OVER IF THE CARRIER LOSES ALL ITS LIVES.', cx, ty + lineH);

            // PANEL 2: BASIC RULES
            drawPanel(ctx, cx - 400, rulesY, 800, rulesH, 'BASIC RULES', UI.accent);
            ctx.fillStyle = UI.dim;
            ctx.font = font('small');
            ctx.textAlign = 'left';

            const rules = [
                '1) CONTROL CARRIER WHILE DOCKED.',
                '   DETACH TO CONTROL ATTACKER (CARRIER BECOMES DEFENSELESS).',
                '2) DOCKING ATTACKER WITH CARRIER RESUPPLIES AMMO/FUEL',
                '   AND REPAIRS DAMAGE.',
                '3) IF ATTACKER IS DESTROYED, RESPAWN AT CARRIER.',
                '   IF CARRIER IS DESTROYED, RESPAWN AT START.',
            ];
            const rulesTop = ScreenRenderer.panelContentTop(rulesY, lineH);
            rules.forEach((line, i) => ctx.fillText(line, cx - 380, rulesTop + i * lineH));

            // 右側のイラスト枠。パネルの中身の縦幅に対して中央へ置く。
            const illustTop = rulesY + ScreenRenderer.PANEL_HEAD
                + Math.floor((rulesH - ScreenRenderer.PANEL_HEAD - ILLUST_H) / 2);
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.2)';
            ctx.lineWidth = 1;
            drawFrame(ctx, cx + 220, illustTop, 140, ILLUST_H, 'rgba(0, 200, 255, 0.2)', { radius: 6 });

            // Draw illustration: Player docking onto Carrier
            const illustMidX = cx + 290;
            this._drawMiniPlayer(ctx, illustMidX, illustTop + 22);
            this._drawMiniCarrier(ctx, illustMidX, illustTop + 82);

            // Docking arrow
            ctx.strokeStyle = UI.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(illustMidX, illustTop + 37);
            ctx.lineTo(illustMidX, illustTop + 67);
            ctx.lineTo(illustMidX - 4, illustTop + 63);
            ctx.moveTo(illustMidX, illustTop + 67);
            ctx.lineTo(illustMidX + 4, illustTop + 63);
            ctx.stroke();

            // PANEL 3: ITEMS
            drawPanel(ctx, cx - 400, itemsY, 800, itemsH, 'ITEMS', UI.accent);

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

            const itemsTop = itemsY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD;
            items.forEach((item, i) => {
                const y = itemsTop + i * ITEM_H + Math.round(ITEM_H / 2);

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
            // キー名と説明を並べた表では「手をどこに置くのか」が読めなかったので
            // 図にした（controlsDiagram.js）。設定画面のオーバーレイと同じものを
            // 描くので、2画面で見た目も文言もずれない
            const panelW = 800;
            const panelH = ScreenRenderer.panelHeight(controlsDiagramHeight());
            const areaTop = 80;
            const areaBottom = H - SPACE.xl;
            const panelY = areaTop + Math.floor(((areaBottom - areaTop) - panelH) / 2);

            drawPanel(ctx, cx - panelW / 2, panelY, panelW, panelH, 'CONTROLS', UI.accent);
            drawControlsDiagram(
                ctx,
                cx - panelW / 2 + ScreenRenderer.PANEL_PAD + SPACE.md,
                panelY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD,
                panelW - (ScreenRenderer.PANEL_PAD + SPACE.md) * 2,
            );
        }

        drawScanlines(ctx, W, H);

        this._drawStartHint(ctx, 600);
    }

    /**
     * 設定画面。プレイ中（ポーズ）とタイトルの両方から同じものを出す。
     *
     * 背後は消さずにパネルを重ねる。プレイ中なら止まった戦場の上に、
     * タイトルならタイトル画面の上に出て、どこから開いたかが分かる。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{settings: object, index: number, fromPlaying: boolean, confirmingQuit: boolean}} state
     */
    drawSettings(ctx, state) {
        const { settings, index, fromPlaying, confirmingQuit, quitChoiceYes, showingControls } = state;
        const W = this.game.canvas.width;
        const H = this.game.canvas.height;
        const cx = Math.floor(W / 2);
        const items = visibleSettingsItems(fromPlaying);

        // 背後を暗く沈める（消さない）。設定を見ている間も戦況が見えるように
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, H);

        const rowH = 44;
        const panelH = ScreenRenderer.panelHeight(rowH * items.length + rowH);
        const panelY = Math.floor((H - panelH) / 2);
        drawPanel(ctx, cx - 320, panelY, 640, panelH, 'SETTINGS', UI.accent);

        const rowsTop = panelY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD;
        ctx.textBaseline = 'middle';
        items.forEach((item, i) => {
            const y = rowsTop + i * rowH + Math.round(rowH / 2);
            const selected = i === index;

            const dimmed = typeof item.dimWhen === 'function' && item.dimWhen(settings);

            ctx.textAlign = 'left';
            // カーソルは矢印だけ独立した fillText として立てる（モード選択の ◀/▶ と
            // 同じ作り。ラベル文字列に接頭辞を混ぜると「表の項目が全部描かれるか」の
            // 完全一致テストと噛み合わない上、キー操作カーソルの土台としても
            // 位置の手掛かりが色だけでは弱い）。色と太字はそのまま選択の手掛かりに残す。
            //
            // 選択色は淡色より優先する。効いていない行でもカーソルは見えないと動かせない。
            //
            // 危険な行（進行を捨てる QUIT MISSION）だけは選択色よりさらに優先して
            // 警告色のままにする。選ぶと通常の選択色に変わる作りだと、**Enter を押す
            // 直前にだけ危険の手掛かりが消える**という逆の挙動になるため。選んでいる
            // ことは ▶ カーソルと太字が示すので、色を選択に使わなくても伝わる
            ctx.fillStyle = item.danger ? UI.warn : (selected ? UI.ok : (dimmed ? UI.faint : UI.dim));
            ctx.font = font('body', selected);
            if (selected) ctx.fillText('▶', cx - 312, y);
            ctx.fillText(item.label, cx - 290, y);

            const value = settingValueText(item, settings);
            if (value === null) return;
            ctx.textAlign = 'right';
            // こちらはラベルと逆に淡色を優先する。カーソル（ラベル側の選択色）さえ
            // 見えれば行を操作できるので、値のほうは効いていないことを色で伝える
            // 役目を選択色より優先させる。値まで選択色にすると「効いていない行に
            // カーソルが乗っている」ことが伝わらなくなるため
            ctx.fillStyle = dimmed ? UI.faint : (selected ? UI.ink : UI.dim);
            ctx.fillText(value, cx + 290, y);
        });

        // 操作の案内。最下段に1行
        ctx.textAlign = 'center';
        ctx.fillStyle = UI.dim;
        ctx.font = font('small');
        // カーソルキーでも動くので併記する。案内に載せないと、WASD しか効かないと
        // 思われて片手で操作できることに気づかれない。パネル幅 640 に収めるため
        // 「W / S」ではなく「WS」と詰め、矢印は記号1つぶんで済ませている
        const hint = confirmingQuit
            ? 'AD ←→ : SELECT      ENTER : CONFIRM'
            : 'WS ↑↓ : MOVE    AD ←→ : CHANGE    ENTER : RUN    P : CLOSE';
        ctx.fillText(hint, cx, rowsTop + items.length * rowH + Math.round(rowH / 2));

        // quitChoiceYes 未指定（undefined）は NO 扱い。押し間違いで進行を
        // 捨てないよう、既定は常に安全側（NO）に倒す
        if (confirmingQuit) this._drawQuitConfirm(ctx, cx, H, quitChoiceYes === true);
        if (showingControls) this._drawControlsOverlay(ctx, cx, H);

        ctx.textBaseline = 'alphabetic';
        drawScanlines(ctx, W, H);
    }

    /**
     * 操作一覧。設定画面のパネルの上に重ねる。中身は HOW TO PLAY の2ページ目と
     * 同じ表（controlsList.js）で、行の描き方（キーキャップ＋説明）も揃えてある。
     * 同じものが2通りの見た目で出ると、別の一覧だと思われるため。
     *
     * 設定パネル（幅 640）より広く取る。行の説明が長く、640 では折り返さずに
     * はみ出す行があった。
     */
    _drawControlsOverlay(ctx, cx, H) {
        const panelW = 720;
        const hintH = 30; // 最下段の「閉じ方」の案内ぶん
        const panelH = ScreenRenderer.panelHeight(controlsDiagramHeight() + hintH);
        const panelY = Math.floor((H - panelH) / 2);

        // 背後の設定パネルを一段沈める。重なった2枚のうちどちらが手前かを
        // 枠線だけで判断させると、行が同じ色で並んでいるぶん読み取りにくい
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, this.game.canvas.width, H);

        drawPanel(ctx, cx - panelW / 2, panelY, panelW, panelH, 'CONTROLS', UI.accent);

        const contentTop = panelY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD;
        const pad = ScreenRenderer.PANEL_PAD + SPACE.md;
        const h = drawControlsDiagram(ctx, cx - panelW / 2 + pad, contentTop, panelW - pad * 2);

        // 閉じ方の案内。設定画面の最下段の案内と同じ位置関係にする
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UI.dim;
        ctx.font = font('small');
        ctx.fillText('ENTER / P : CLOSE', cx, contentTop + h + hintH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    /** 途中終了の確認。押し間違いで進行を捨てないよう1段挟む。 */
    _drawQuitConfirm(ctx, cx, H, yesSelected) {
        const boxW = 420;
        const boxH = 140;
        const y = Math.floor((H - boxH) / 2);
        drawPanel(ctx, cx - boxW / 2, y, boxW, boxH, 'CONFIRM', UI.warn);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UI.ink;
        ctx.font = font('body');
        ctx.fillText('QUIT THIS MISSION?', cx, y + 74);

        // 選ばれている方だけ強調する（色＋太字）。カーソルが動いても画面が
        // 変わらないと A/D の反応が見えないため、行リストと同じ考え方を適用
        ctx.font = font('body', yesSelected);
        ctx.fillStyle = yesSelected ? UI.warn : UI.dim;
        ctx.fillText('YES', cx - 70, y + 110);
        ctx.font = font('body', !yesSelected);
        ctx.fillStyle = !yesSelected ? UI.warn : UI.dim;
        ctx.fillText('NO', cx + 70, y + 110);
    }

    /**
     * 「PRESS ENTER FOR MENU」の点滅ヒント。デモループの全画面が同じものを
     * 画面下端の中央に出すので、5画面ぶんの写しをここ1箇所にまとめる。
     *
     * save/restore で囲うので、呼び出し側が前後で textAlign を触っていても
     * 影響しない（従来もこの形だった）。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} blinkMs 点滅の半周期。HOW TO PLAY だけ 600ms で、
     *   他の画面（500ms）とわざとずらしてある
     */
    _drawStartHint(ctx, blinkMs = 500) {
        if (Math.floor(Date.now() / blinkMs) % 2 !== 0) return;
        const canvas = this.game.canvas;
        ctx.save();
        ctx.fillStyle = UI.ink;
        ctx.font = font('sub', true);
        ctx.textAlign = 'center';
        glow(ctx, UI.info, 'mid');
        // **「START」ではなく「MENU」。** デモ画面の ENTER はゲームを始めず
        // タイトルのメニューへ戻る（ゲームを始める入口はメニュー1箇所だけ、
        // という統一）。文言を残すと嘘の案内になる。
        ctx.fillText('PRESS ENTER FOR MENU', canvas.width / 2, canvas.height - 20);
        ctx.restore();
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
        ctx.fillText(`CLEAR TIME: ${formatClock(this.game.missionTimer)}`, canvas.width / 2, canvas.height / 2);

        if (this.game.targetTimeBonus > 0 || this.game.slotRunning) {
            ctx.fillStyle = '#FF8800';
            ctx.fillText(`TIME BONUS: ${this.game.currentTimeBonus.toString().padStart(6, '0')}`, canvas.width / 2, canvas.height / 2 + 30);
        }

        // **操作の案内はタイムボーナスと排他にしない。** 以前はここが if/else で、
        // targetTimeBonus は加算アニメが終わってもリセットされないため、
        // ボーナスが付いた面（＝ほとんどの面）では案内が一度も出なかった
        // （従来の `PRESS ANY KEY TO CONTINUE` も同じ理由で見えていなかった）。
        // 実機で「セーブするか聞かれない」と報告されて発覚。
        //
        // 出す条件は slotRunning だけを見る。_updateMissionClear が
        // _updateTimeBonusSlot の間は入力を受けないので、**押せるようになった
        // 瞬間と案内が出る瞬間が一致する。**
        if (!this.game.slotRunning) {
            ctx.save();
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('[ENTER] NEXT STAGE', canvas.width / 2, canvas.height / 2 + 60);
            ctx.restore();

            this._drawSaveOption(ctx, canvas.width / 2, canvas.height / 2 + 88);
        }

        // [ENTER] NEXT STAGE が +60、[S] SAVE & NEXT が +88(font('sub')=18px)。
        // 通知を +90 のままにすると [S] 行とベースラインが2pxしか離れず重なって
        // 読めなくなった（+88 の行を今回足したことによる退行）。+88 の行の下端
        // (18px)から34px空けた +122 にする。ゲームクリア画面側の呼び出し(+120、
        // こちらは [S] 行が無い)は触らない。
        this._drawStageTop5Notice(ctx, canvas.height / 2 + 122);
    }

    /**
     * 面クリア画面のセーブ行。**払えないときも行は出す** — 黙って消すと
     * 「セーブという機能がある」ことすら伝わらないため、理由を添えて暗くする。
     */
    _drawSaveOption(ctx, cx, y) {
        const canSave = this.game.saveManager && this.game.saveManager.canSaveNow();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);
        if (canSave) {
            ctx.fillStyle = UI.gold;
            glow(ctx, UI.gold, 'mid');
            ctx.fillText(`[S] SAVE & NEXT   -${SAVE_COST} PTS`, cx, y);
        } else {
            ctx.fillStyle = UI.dim;
            ctx.fillText(`[S] SAVE & NEXT   SCORE TOO LOW`, cx, y);
        }
        ctx.restore();
        ctx.textAlign = 'left';
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

        if (this.game.canContinueHere && this.game.canContinueHere()) {
            const save = this.game.saveManager.save;
            ctx.save();
            ctx.fillStyle = UI.gold;
            glow(ctx, UI.gold, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText(
                `CONTINUE FROM STAGE ${save.missionsCompleted + 1}?   [C] YES`,
                canvas.width / 2, canvas.height / 2 + 60
            );
            ctx.restore();

            ctx.fillStyle = UI.ink;
            ctx.font = font('head', true);
            ctx.fillText(String(this.game.continueSecondsLeft()), canvas.width / 2, canvas.height / 2 + 96);

            ctx.fillStyle = '#888888';
            ctx.font = font('small');
            ctx.fillText(`TRY ${save.tries}`, canvas.width / 2, canvas.height / 2 + 122);
        } else {
            ctx.fillStyle = '#888888';
            ctx.font = font('small');
            ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 60);
        }
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
        ctx.fillText(`TOTAL TIME: ${formatClock(this.game.totalTime)}`, canvas.width / 2, canvas.height / 2 + 20);

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
        // TRY は「そのランがどう終わったか」の仲間なので MISSION / TIME と並べる。
        // 当初は名前と国旗の隙間（x=346・small）に押し込んでいたが、名前列に
        // ぶら下がって見えて浮いた（実機の指摘）。国旗(354 左揃え)から十分離れた
        // 470 に右揃えで置くと、470→552→632 と 82/80px のほぼ等間隔になり、
        // 3列が1つのまとまりとして読める。
        { key: 'tries', label: 'TRY', x: 470, align: 'right' },
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
        // TRY はブロックの右端。名前(162 左揃え・最大10文字≒258)と
        // 国旗(292 左揃え)の隙間に入れると、週ランキング表で一度やって
        // 「名前にぶら下がって浮く」と言われた形になる。国旗の右へ出すために
        // ブロック幅を 330→366 に広げた（2列で 788px、1024 の画面に収まる）。
        { key: 'tries', x: 366, align: 'right' },
    ];

    static FAME_BLOCK_WIDTH = 366;

    /** パネル見出し帯の高さ（theme.drawPanel と揃える）＋内側の余白。 */
    static PANEL_HEAD = 36;
    static PANEL_PAD = SPACE.md;

    /** 中身の高さから必要なパネル高を求める。 */
    static panelHeight(contentH) {
        return ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD * 2 + contentH;
    }

    /** パネル内で中身を書き始める y（1行目のベースライン）。 */
    static panelContentTop(panelY, lineH) {
        return panelY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD + Math.round(lineH * 0.75);
    }

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
                    if (c.key === 'tries') continue; // 空き枠に T の点線は出さない（意味が無い）
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
                // tries が無い(旧データ)か 1(初回クリア)なら何も描かない。
                // セーブを使わない大多数の行を "T1" で汚さないため。
                tries: (Number(entry.tries) || 1) >= 2 ? `T${Number(entry.tries)}` : '',
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
        this._drawStartHint(ctx);
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
                        // 週ランキング表と同じ規則。1（と旧データ）は空文字にして、
                        // 描画ループの `if (!text) continue;` に落とす
                        tries: (Number(e.tries) || 1) >= 2 ? `T${Number(e.tries)}` : '',
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
        }

        // 走査線は分岐の外で1回だけ。以前は分岐の中と外で二重に掛かっていて、
        // この画面だけ走査線の濃さが 0.10 ではなく 0.19 相当になっていた。
        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        this._drawStartHint(ctx);
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
        this._drawStartHint(ctx);
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
            const valStr = isTime ? formatClock(entry.timeMs) : String(entry.score).toLocaleString();

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

    drawMiniMap(ctx) {
        const game = this.game;
        const w = game.canvas.width;
        const h = game.canvas.height;

        // 地形が壊れて「古い」印が立っていたら、開いて描く直前に1回だけ焼き直す。
        // 閉じている間は焼かないので毎フレームのコストは増えない。
        game.map.refreshMiniMap();
        const mm = game.map.miniMapCanvas;

        if (!mm) return;

        // 表示位置は「操作している側」（ドッキング中でなければ自機、そうでなければ母艦）と
        // クロスヘアを避ける。母艦の方向矢印（HUD.drawCarrierArrow）はミニマップより
        // 上の面に描くようになったため、もう避ける必要が無い（重なっても矢印側が
        // 前面に出るので位置の問題が起きない）。
        // 自機／母艦とクロスヘアは性質が違うので別々に持つ:
        //   - 自機／母艦: 余白(MINIMAP_AVOID_PADDING_UNIT)の外にあれば OK。
        //     クロスヘアより大きく取るのは、隅の切り替えがフェードを挟むぶん
        //     早く動き始めないと、動いている最中に重なってしまうため
        //   - クロスヘア: 余白(MINIMAP_AVOID_PADDING)の外にあれば OK
        // （詳しくは pickStickyMiniMapCorner のコメント）
        // どちらを操作中かで避けるべき対象が変わるため、両方は見ずに操作している方だけを見る。
        let unitPoint = null;
        if (game.player && game.player.alive && !game.player.docked) {
            unitPoint = { x: game.player.x + game.player.width / 2 - game.camera.x, y: game.player.y + game.player.height / 2 - game.camera.y };
        } else if (game.carrier && game.carrier.alive) {
            unitPoint = { x: game.carrier.x + game.carrier.width / 2 - game.camera.x, y: game.carrier.y + game.carrier.height / 2 - game.camera.y };
        }
        // クロスヘアは「実際に描かれる位置」と一致させる必要があるため、Crosshair.draw() と
        // 共有の関数を呼ぶ（計算を二重に持つと避ける位置と描画位置がずれる）。
        const crosshairPoint = crosshairScreenPos(game);

        // 焼く解像度（cols*2 x rows*2）はマップの広さに比例するが、**画面に出す
        // 大きさはマップの広さによらず一定**にする。以前は「上限より小さければ
        // 等倍」＝拡大しない作りだったので、面が進んでマップが広くなるほど
        // ミニマップも大きくなり、面ごとに見え方が変わっていた（実機フィードバック）。
        // 幅を画面幅の MINIMAP_MAX_WIDTH_RATIO に合わせ、縦が HUD 帯の間に
        // 収まらないマップだけ高さ側で頭打ちにする（アスペクト比は常に保つ）。
        // 小さいマップは拡大されることになるが、ミニマップは元々彩度と明度を
        // 落として沈めた絵なので、多少の甘さは問題にならない。
        const availH = h - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT - MINIMAP_MARGIN * 2;
        const shrink = Math.min(
            (w * MINIMAP_MAX_WIDTH_RATIO) / mm.width,
            availH / mm.height,
        );
        const destW = mm.width * shrink;
        const destH = mm.height * shrink;

        // 四隅の座標は先に1回だけ求めて、避ける隅を選ぶのにも実際に描く座標を
        // 引くのにも使い回す（以前は pickMiniMapCorner の内部と、直後の座標取得とで
        // 同じ引数の miniMapCornerPositions を2回呼んでいた）。
        // mapW/mapH には「実際に見える大きさ」＝縮小後の値を渡すこと。ここを
        // 元サイズのままにすると、置き場所の当たり判定が見た目とずれる。
        const positions = miniMapCornerPositions({
            canvasW: w,
            canvasH: h,
            mapW: destW,
            mapH: destH,
            margin: MINIMAP_MARGIN,
            hudTop: HUD_TOP_HEIGHT,
            hudBottom: HUD_BOTTOM_HEIGHT,
        });
        // 「カーソルがいる側の反対側」ルールで隅を選ぶ（詳しくは pickStickyMiniMapCorner）。
        // 「今の隅」は miniMapTransition.corner にある。まだ何も無い（初回描画）ときは
        // 'topLeft' を仮の今の隅として渡す。中心線の不感帯の中にカーソルがいるときは
        // 「今の隅」がそのまま答えになるので、初回の既定値がそこで効く
        // （＝画面中央にカーソルがある状態で開いたら左上に出る、という従来の見た目）。
        const currentCorner = this.miniMapTransition ? this.miniMapTransition.corner : 'topLeft';
        const desired = pickStickyMiniMapCorner({
            positions, mapW: destW, mapH: destH,
            currentCorner, unitPoint, crosshairPoint,
            padding: MINIMAP_AVOID_PADDING,
            unitPadding: MINIMAP_AVOID_PADDING_UNIT,
            hysteresis: MINIMAP_SIDE_HYSTERESIS,
        });

        // 隅の切り替えをフェードでつなぐ。初回描画（このインスタンスでまだ何も
        // 選んでいない）は、望ましい隅をそのまま完全に見える状態で採用する
        // （開いた瞬間に一度フェードインさせる必要は無い＝0.85→0.55等と同じ独立した
        // 開閉フェードは game.miniMapAlpha が別に受け持っている）。
        if (!this.miniMapTransition) {
            this.miniMapTransition = { corner: desired.corner, fade: 1, phase: 'idle' };
        } else {
            this.miniMapTransition = advanceMiniMapTransition(this.miniMapTransition, desired.corner, MINIMAP_FADE_SPEED);
        }

        const { x: mmX, y: mmY } = positions[this.miniMapTransition.corner];

        const alpha = game.miniMapAlpha || 0;

        ctx.save();
        // 最終的な濃さは3つの独立したフェードの積: 地形の上に重ねる基本濃度 ×
        // 開閉フェード(miniMapAlpha) × 隅の切り替えフェード(transition.fade)
        ctx.globalAlpha = MINIMAP_ALPHA * alpha * this.miniMapTransition.fade;

        // Draw the cached static map, shrunk to destW/destH
        ctx.drawImage(mm, mmX, mmY, destW, destH);

        // 外枠は描かない。サイズを上げて薄さを補ったあとは、枠が無いほうが
        // 地形と馴染んで邪魔にならないという実機フィードバックで撤去した
        // （COLOR_MINIMAP_BORDER も使わなくなったので Constants.js から削除済み）。

        // 「今この画面に映っている範囲」を明るくする。ミニマップの表示サイズを
        // マップの広さによらず一定にしたことで失われた「全体がどれくらい広いか」を、
        // **可視領域が占める割合**という形で取り戻すためのもの（可視領域は常に
        // 64x48 タイル固定なので、割合がそのまま縮尺になる）。
        //
        // 白の半透明を重ねる。地形をもう一度重ねて不透明度を上げる方式は、
        // ミニマップがライブのゲーム画面の上に乗っているぶん背後の絵で
        // コントラストが変わってしまい、狙った差が出る保証がない。
        // 「外を暗くする」案はユーザーが却下（既に暗いのでこれ以上暗い部分を
        // 作るとマップとして読めなくなる）。
        //
        // 点より**先**に描くこと。ミニマップを開ける一番の目的は「見えていない
        // 敵がどこにいるか」なので、赤い点が白に埋もれてはいけない。
        const viewScale = game.map.miniMapScale * shrink;
        const viewX = mmX + (game.camera.x / TILE_SIZE) * viewScale;
        const viewY = mmY + (game.camera.y / TILE_SIZE) * viewScale;
        const viewW = (w / TILE_SIZE) * viewScale;
        const viewH = (h / TILE_SIZE) * viewScale;
        // マップの端ではカメラが止まるので、素直に計算するとミニマップの外へ
        // はみ出す。はみ出した白が地形の外に浮くと、ミニマップの矩形と食い違って見える
        const clipX = Math.max(mmX, viewX);
        const clipY = Math.max(mmY, viewY);
        const clipW = Math.min(mmX + destW, viewX + viewW) - clipX;
        const clipH = Math.min(mmY + destH, viewY + viewH) - clipY;
        if (clipW > 0 && clipH > 0) {
            // 濃さは地形と同じフェードに追随させるが、MINIMAP_ALPHA は掛けない
            // （あれは地形を背景に沈めるための値。ハイライトは沈める対象ではない）
            ctx.globalAlpha = MINIMAP_VIEWPORT_HIGHLIGHT * alpha * this.miniMapTransition.fade;
            ctx.fillStyle = COLOR_MINIMAP_VIEWPORT;
            ctx.fillRect(clipX, clipY, clipW, clipH);
        }

        // 点（自機・敵・母艦）は地形と別に、開閉フェードと隅の切り替えフェードだけを
        // 掛け直す。MINIMAP_ALPHA（地形を背景に沈めるための値）は点には掛けない。
        // 点は「今どこにいるか」を読むための情報であって背景ではないので、地形と
        // 同じだけ薄めると一番目を引くはずの自機・敵の位置が読みにくくなる。
        // 掛け直さず 1.0 に固定していた版は、隅の切り替え中に点だけフルオパシティの
        // まま瞬間移動して見える不具合になっていた。
        ctx.globalAlpha = alpha * this.miniMapTransition.fade;

        // Helper to draw a dot。点は miniMapScale だけでなく縮小率(shrink)にも
        // 追随させる必要がある。ここを忘れると、地形は縮むのに点だけ元の位置に
        // 残ってしまい、縮小したミニマップの上でずれて見える。
        // 縮尺は可視領域のハイライトと同じもの（viewScale）を使う。別々に持つと
        // 点とハイライトがずれる。
        const drawDot = (worldX, worldY, color, size = 2) => {
            const px = mmX + (worldX / TILE_SIZE) * viewScale;
            const py = mmY + (worldY / TILE_SIZE) * viewScale;
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

    /**
     * BGM 音量のインジケータ。変更した瞬間だけ画面右下に出る。
     *
     * 常時出しているとプレイの邪魔になるので、数秒で消える。目盛りを
     * 10 個に切ってあるのは「+」「-」1回ぶんが1目盛りだと分かるため。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} volume 0〜1
     * @param {number} framesLeft 残り表示フレーム。0以下なら描かない
     */
    drawVolumeIndicator(ctx, volume, framesLeft) {
        if (framesLeft <= 0) return;

        const SEGMENTS = 10;
        const pct = volumePercent(volume);
        const filled = Math.round((pct / 100) * SEGMENTS);
        const muted = pct === 0;

        // 最後だけ薄れて消える。急に消えると点滅に見える。
        const alpha = Math.min(1, framesLeft / VOLUME_HUD_FADE_FRAMES);

        const w = 236;
        const h = 56;
        const x = CANVAS_WIDTH - w - SPACE.lg;
        const y = CANVAS_HEIGHT - h - SPACE.lg;
        const accent = muted ? UI.warn : UI.info;

        ctx.save();
        ctx.globalAlpha = alpha;
        drawFrame(ctx, x, y, w, h, accent, { fill: UI.panelFill, glow: 'soft', radius: 8 });

        ctx.textBaseline = 'middle';
        ctx.font = font('small', true);
        ctx.textAlign = 'left';
        ctx.fillStyle = UI.dim;
        // 設定画面ができてから -/+ が動かすのは BGM 単体ではなく全体音量
        // （settings.masterVolume）。ラベルを実態に合わせないと、この HUD だけ
        // 「BGM 40%」と出るのに設定画面の BGM VOLUME は 100% のまま、という
        // 食い違いが起きる
        ctx.fillText('MASTER', x + SPACE.md, y + SPACE.md + 2);

        ctx.textAlign = 'right';
        ctx.fillStyle = accent;
        glow(ctx, accent, 'soft');
        ctx.fillText(muted ? 'MUTE' : `${pct}%`, x + w - SPACE.md, y + SPACE.md + 2);
        ctx.shadowBlur = 0;

        // 目盛り
        const barX = x + SPACE.md;
        const barY = y + h - SPACE.md - 8;
        const barW = w - SPACE.md * 2;
        const gap = 3;
        const segW = (barW - gap * (SEGMENTS - 1)) / SEGMENTS;
        for (let i = 0; i < SEGMENTS; i++) {
            ctx.fillStyle = (i < filled) ? accent : UI.faint;
            ctx.fillRect(barX + i * (segW + gap), barY, segW, 8);
        }
        ctx.restore();
    }
}
