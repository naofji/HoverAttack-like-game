// ============================================
// Screen Renderer - Title, Game Over, Mission Clear, MiniMap
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, VOLUME_HUD_FADE_FRAMES } from '../utils/Constants.js';
import { RepairKit } from '../entities/RepairKit.js';
import { AutoAimUnit } from '../entities/AutoAimUnit.js';
import { MissileKit } from '../entities/MissileKit.js';
import { OverdriveKit } from '../entities/OverdriveKit.js';
import { volumePercent } from '../utils/bgmVolume.js';
import { lerpColor } from '../utils/color.js';
import { MODES, MODE_ORDER } from '../utils/modes.js';
import { drawStageScene, stageEnemyLabel } from './StageScene.js';
import { drawControlsDiagram, controlsDiagramHeight } from './controlsDiagram.js';
import { UI, SPACE, lineHeight, font, glow, drawFrame, drawPanel, drawScanlines } from './theme.js';
import { STAGE_PALETTES } from '../utils/Constants.js';
import { PANEL_HEAD, PANEL_PAD, panelHeight, panelContentTop } from './screens/layout.js';
import { MiniMap } from './screens/miniMap.js';
import { RankingScreens } from './screens/rankingScreens.js';
import { ResultScreens } from './screens/resultScreens.js';
import { SettingsScreen } from './screens/settingsScreen.js';

/**
 * 遊び方画面の ITEMS パネルに並べる拾い物。
 *
 * ここが「拾えるもの」の一覧そのもの。アイテムを増やしたらこの表に1行足す。
 * パネルの高さも行数から求めるので、足すだけでレイアウトが追従する。
 * アイコンは type で dummyKits を引き、実物のアイテムを描く。
 */
const ITEM_GUIDE = [
    { type: 'missile', color: '#FF4444', name: 'MISSILE SUPPLY KIT', desc: 'FULLY RESTORES YOUR MISSILE AMMO UPON PICKUP.' },
    { type: 'overdrive', color: '#FFDD22', name: 'OVERDRIVE KIT', desc: 'RARE DROP FROM HEAVY. GRANTS INFINITE AMMO AND NO RELOAD FOR A LIMITED TIME.' },
    { type: 'autoaim', color: '#FF8800', name: 'AUTO-AIM UNIT', desc: 'ENABLES AUTO-AIM FOR A LIMITED TIME. (DROPPED BY ARTILLERY)' },
    { type: 'repair', color: '#00FF00', name: 'CARRIER REPAIR KIT', desc: 'REPAIRS CARRIER HP WHEN DOCKED. GRANTS +1 LIFE IF FULL. (DROPPED BY RIVAL)' },
];

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
            const objectiveH = panelHeight(lineH * 2);
            const rulesH = panelHeight(Math.max(lineH * 6, ILLUST_H));
            const itemsH = panelHeight(ITEM_H * ITEM_GUIDE.length);
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
            let ty = panelContentTop(objectiveY, lineH);
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
            const rulesTop = panelContentTop(rulesY, lineH);
            rules.forEach((line, i) => ctx.fillText(line, cx - 380, rulesTop + i * lineH));

            // 右側のイラスト枠。パネルの中身の縦幅に対して中央へ置く。
            const illustTop = rulesY + PANEL_HEAD
                + Math.floor((rulesH - PANEL_HEAD - ILLUST_H) / 2);
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

            const items = ITEM_GUIDE;

            if (!this.dummyKits) {
                // 説明用に絵を描き起こさず、実物のアイテムを 2.5倍で描く。
                // 別に描くと、アイテムの見た目を変えたときに解説だけ古くなる
                this.dummyKits = {
                    'missile': new MissileKit(this.game, 0, 0),
                    'overdrive': new OverdriveKit(this.game, 0, 0),
                    'autoaim': new AutoAimUnit(this.game, 0, 0),
                    'repair': new RepairKit(this.game, 0, 0)
                };
            }
            // Animate dummy kits
            Object.values(this.dummyKits).forEach(kit => kit.frameCounter++);

            const itemsTop = itemsY + PANEL_HEAD + PANEL_PAD;
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
            const panelH = panelHeight(controlsDiagramHeight());
            const areaTop = 80;
            const areaBottom = H - SPACE.xl;
            const panelY = areaTop + Math.floor(((areaBottom - areaTop) - panelH) / 2);

            drawPanel(ctx, cx - panelW / 2, panelY, panelW, panelH, 'CONTROLS', UI.accent);
            drawControlsDiagram(
                ctx,
                cx - panelW / 2 + PANEL_PAD + SPACE.md,
                panelY + PANEL_HEAD + PANEL_PAD,
                panelW - (PANEL_PAD + SPACE.md) * 2,
            );
        }

        drawScanlines(ctx, W, H);

        this._drawStartHint(ctx, 600);
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

// ============================================
// Mixins
// ============================================
//
// 画面ごとの描画は screens/ に分けて、ここで prototype に混ぜている。
// `this` の意味は変わらないので、テストの `new ScreenRenderer(game)` から
// private も含めてそのまま呼べる。
Object.assign(ScreenRenderer.prototype, MiniMap, RankingScreens, ResultScreens, SettingsScreen);
