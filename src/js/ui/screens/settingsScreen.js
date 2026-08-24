// ============================================
// Settings Screen
// ============================================
//
// 設定画面と、そこに重ねる操作一覧・途中終了の確認。
// 並べる項目は ui/settingsItems.js の表が唯一の判断元で、ここは描くだけ。
// 更新側（カーソル移動・値の変更）は ui/flows/settingsFlow.js。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す（理由は screens/miniMap.js の冒頭）。

import { visibleSettingsItems, settingValueText } from '../settingsItems.js';
import { drawControlsDiagram, controlsDiagramHeight } from '../controlsDiagram.js';
import { UI, SPACE, font, drawPanel, drawScanlines } from '../theme.js';
import { PANEL_HEAD, PANEL_PAD, panelHeight } from './layout.js';

export const SettingsScreen = {
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
        const panelH = panelHeight(rowH * items.length + rowH);
        const panelY = Math.floor((H - panelH) / 2);
        drawPanel(ctx, cx - 320, panelY, 640, panelH, 'SETTINGS', UI.accent);

        const rowsTop = panelY + PANEL_HEAD + PANEL_PAD;
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
    },

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
        const panelH = panelHeight(controlsDiagramHeight() + hintH);
        const panelY = Math.floor((H - panelH) / 2);

        // 背後の設定パネルを一段沈める。重なった2枚のうちどちらが手前かを
        // 枠線だけで判断させると、行が同じ色で並んでいるぶん読み取りにくい
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, this.game.canvas.width, H);

        drawPanel(ctx, cx - panelW / 2, panelY, panelW, panelH, 'CONTROLS', UI.accent);

        const contentTop = panelY + PANEL_HEAD + PANEL_PAD;
        const pad = PANEL_PAD + SPACE.md;
        const h = drawControlsDiagram(ctx, cx - panelW / 2 + pad, contentTop, panelW - pad * 2);

        // 閉じ方の案内。設定画面の最下段の案内と同じ位置関係にする
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UI.dim;
        ctx.font = font('small');
        ctx.fillText('ENTER / P : CLOSE', cx, contentTop + h + hintH / 2);
        ctx.textBaseline = 'alphabetic';
    },

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
    },
};
