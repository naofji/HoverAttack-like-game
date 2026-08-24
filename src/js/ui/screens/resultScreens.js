// ============================================
// Result Screens
// ============================================
//
// 1回のランが終わったときに出る画面 ── ミッションクリア（とセーブの選択）、
// ゲームオーバー、全クリア、名前入力。
//
// 見出しの金属文字（_metallicText）と「PRESS ENTER」の点滅（_drawStartHint）は
// 画面をまたぐ共通部品なので ScreenRenderer.js 側に残してあり、`this.` で呼ぶ。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す（理由は screens/miniMap.js の冒頭）。

import { SAVE_COST } from '../../utils/Constants.js';
import { formatClock } from '../../utils/formatTime.js';
import { UI, font, glow } from '../theme.js';

export const ResultScreens = {
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },
};
