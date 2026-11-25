// ============================================
// HUD: ステータスゾーン（MISSION / TIME / SCORE / BONUS）とデバッグ無敵の札
// ============================================
//
// ui/HUD.js から切り出した（2026-11-25、中身は動かしただけ）。
// ScreenRenderer と同じく **Object.assign(HUD.prototype, ...) で混ぜる前提**の
// オブジェクトリテラルで、`this` は HUD を指す。

import {
    HUD_FONT,
} from '../../utils/Constants.js';
import {
    HUD_ROW1_Y, HUD_ROW2_Y, hudZones, STATUS_COLS, HUD_LABEL_FONT, HUD_LABEL_INK, SCORE_FONT,
    SCORE_INK, MISSION_FONT, TIME_FONT, TIME_INK, BONUS_FONT, DEBUG_BADGE_DX,
} from './layout.js';

export const HudStatus = {
    // ------------------------------------------
    // ステータスゾーン
    // ------------------------------------------
    /**
     * 左列に MISSION / TIME、右列に SCORE / BONUS。右列は右端揃えなので、
     * 桁が増えても字面が左へ伸びるだけで枠から出ない。
     */
    _drawStatus(ctx, z, w) {
        const capAt = (text, x, y, align = 'left') => {
            ctx.font = HUD_LABEL_FONT;
            ctx.fillStyle = HUD_LABEL_INK;
            ctx.textAlign = align;
            ctx.fillText(text, x, y);
            ctx.textAlign = 'left';
        };

        // --- 左列 ---
        capAt('MISSION', z.status, HUD_ROW1_Y);
        ctx.font = MISSION_FONT;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(this.game.missionsCompleted + 1 || 1), z.status + STATUS_COLS.small, HUD_ROW1_Y);

        capAt('TIME', z.status, HUD_ROW2_Y);
        const elapsed = this.game.missionTimer;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const centis  = Math.floor((elapsed % 1000) / 10);
        ctx.font = TIME_FONT;
        ctx.fillStyle = TIME_INK;
        ctx.fillText(
            `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(centis).padStart(2,'0')}`,
            z.status + STATUS_COLS.small, HUD_ROW2_Y);

        // --- 右列（右端揃え） ---
        ctx.textAlign = 'right';
        capAt('SCORE', z.right - STATUS_COLS.capR, HUD_ROW1_Y, 'right');
        ctx.textAlign = 'right';
        ctx.font = SCORE_FONT;
        ctx.fillStyle = SCORE_INK;
        ctx.fillText(String(this.game.score).padStart(7, '0'), z.right, HUD_ROW1_Y);

        // Live time bonus: decays as the stage drags on. Colour shifts
        // green -> yellow -> red (blinking near zero) to convey urgency.
        // **始点が緑でないと、この赤が警告として効かない**（ユーザー判断）。
        const tb = this.game.liveTimeBonus();
        const frac = tb.max > 0 ? tb.current / tb.max : 0;
        let bonusColor;
        if (frac > 0.5) {
            bonusColor = '#33FF66';
        } else if (frac > 0.2) {
            bonusColor = '#FFCC00';
        } else {
            bonusColor = (Math.floor(Date.now() / 250) % 2 === 0) ? '#FF3333' : '#992222';
        }
        capAt('BONUS', z.right - STATUS_COLS.capR, HUD_ROW2_Y, 'right');
        ctx.textAlign = 'right';
        ctx.font = BONUS_FONT;
        ctx.fillStyle = bonusColor;
        ctx.fillText(String(tb.current).padStart(6, '0'), z.right, HUD_ROW2_Y);

        ctx.textAlign = 'left';
        ctx.font = HUD_FONT;
        void w;
    },

    /**
     * デバッグ用の無敵モードが ON の間だけ出す札。
     *
     * 出しておかないと、戻し忘れたまま調整して「当たってもHPが減らない」と
     * 悩むことになる。点滅させているのは、HUD の常設表示と見分けるため
     * （これは一時的な状態であって、ゲームの機能ではない）。
     */
    _drawDebugInvincibleBadge(ctx, w, y) {
        if (!this.game || !this.game.debugInvincible) return;
        ctx.fillStyle = (Math.floor(Date.now() / 400) % 2 === 0) ? '#FF3333' : '#661111';
        // 得点ゾーンの左側の余り。スコアは右端揃えなので、ここへ置けば
        // 画面幅が変わっても重ならない
        ctx.fillText('INVINCIBLE', hudZones(w).status + DEBUG_BADGE_DX, y);
    },
};
