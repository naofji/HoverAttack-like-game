// ============================================
// Title & Stage Select Screens
// ============================================
//
// タイトル（ロゴ・縦メニュー・モード選択・キー凡例）と、面セレクト。
// どちらも「今どれを選んでいるか」を Game 側に聞いて描くだけで、
// 選択を動かすのは ui/flows/attractFlow.js。
//
// **項目の出し入れの判断元は Game.titleMenuItems() だけ**にしてある。
// 描画側で条件を書き直すと「行はあるのに決定しても何も起きない」が生まれる。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す（理由は screens/miniMap.js の冒頭）。

import { STAGE_PALETTES } from '../../utils/Constants.js';
import { lerpColor } from '../../utils/color.js';
import { MODES, MODE_ORDER } from '../../utils/modes.js';
import { drawStageScene, stageEnemyLabel } from '../StageScene.js';
import { UI, font, glow, drawFrame, drawScanlines } from '../theme.js';

export const TitleScreen = {
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
    },

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
    },

    _titleMenuLabel(key) {
        if (key === 'continue') {
            const s = this.game.saveManager.save;
            const modeLabel = MODES[s.mode] ? MODES[s.mode].label : s.mode;
            return `CONTINUE - STAGE ${s.missionsCompleted + 1} / ${modeLabel}  (TRY ${s.tries})`;
        }
        if (key === 'stageSelect') return 'STAGE SELECT';
        return 'START';
    },

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
    },

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
    },

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
    },

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
    },
};
