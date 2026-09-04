// ============================================
// Screen Renderer - 画面をまたぐ共通部品と、screens/ の取りまとめ
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, VOLUME_HUD_FADE_FRAMES, DEMO_OVERLAY_ALPHA_SCALE } from '../utils/Constants.js';
import { volumePercent } from '../utils/bgmVolume.js';
import { lerpColor } from '../utils/color.js';
import { UI, SPACE, font, glow, drawFrame } from './theme.js';
import { StageEnvironment } from '../world/StageEnvironment.js';
import { MiniMap } from './screens/miniMap.js';
import { RankingScreens } from './screens/rankingScreens.js';
import { ResultScreens } from './screens/resultScreens.js';
import { SettingsScreen } from './screens/settingsScreen.js';
import { HowToPlayScreen } from './screens/howToPlayScreen.js';
import { TitleScreen } from './screens/titleScreen.js';

export class ScreenRenderer {
    constructor(game) {
        this.game = game;
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

    /**
     * デモ画面用の環境。面ごとに1つ作って持つ（霧・雪の板を毎フレーム作り直さない）。
     * game を渡さないので水の描画は none になる（シーン絵の水面線は StageScene が引く）。
     */
    _demoEnv(stageIndex) {
        this._demoEnvs = this._demoEnvs || {};
        if (!this._demoEnvs[stageIndex]) this._demoEnvs[stageIndex] = new StageEnvironment(null, stageIndex);
        return this._demoEnvs[stageIndex];
    }

    /** 画面全体に、その面の環境を（デモ用に薄めて）重ねる。 */
    _drawDemoEnvironment(ctx, stageIndex) {
        const env = this._demoEnv(stageIndex);
        env.update();
        env.drawDemoOverlay(ctx, DEMO_OVERLAY_ALPHA_SCALE);
    }

    /** タイトルの背景に使う面。CONTINUE があればその面、無ければ 1 面。 */
    _titleStageIndex() {
        const items = this.game.titleMenuItems ? this.game.titleMenuItems() : [];
        if (items.includes('continue') && this.game.saveManager) {
            return this.game.saveManager.save.missionsCompleted;
        }
        return 0;
    }
}

// ============================================
// Mixins
// ============================================
//
// 画面ごとの描画は screens/ に分けて、ここで prototype に混ぜている。
// `this` の意味は変わらないので、テストの `new ScreenRenderer(game)` から
// private も含めてそのまま呼べる。
Object.assign(
    ScreenRenderer.prototype,
    TitleScreen, HowToPlayScreen, SettingsScreen, ResultScreens, RankingScreens, MiniMap,
);
