// ============================================
// HUD: 武装ゾーン（1段目の武器の札、2段目のホバー燃料と時限バフのゲージ）
// ============================================
//
// ui/HUD.js から切り出した（2026-11-25、中身は動かしただけ）。
// ScreenRenderer と同じく **Object.assign(HUD.prototype, ...) で混ぜる前提**の
// オブジェクトリテラルで、`this` は HUD を指す。

import {
    HUD_FONT, HOVER_MAX_FUEL, BURST_MIN_FUEL, OVERDRIVE_WARN_TICKS, AUTO_AIM_MAX_DURATION,
    OVERDRIVE_MAX_DURATION,
} from '../../utils/Constants.js';
import {
    SLOT_BORDER, SLOT_PAD, SLOT_INSET, SLOT_GAP, GAUGE_TIE, GAUGE_SPLIT, HOVER_W, HOVER_H,
    BUFF_UNIT_W,
    HUD_BUFF_TICK_COLOR, BUFF_SPECS, HUD_LABEL_FONT,
} from './layout.js';
import { lerpColor } from '../../utils/color.js';

export const HudWeapons = {
    // ------------------------------------------
    // 武装ゾーン 1段目: 武器の札
    // ------------------------------------------
    /**
     * 札は3状態。**左の内寸はどれも同じ**なので、切り替えでラベルが横に飛ばない。
     *
     *   選択中   左に色つきの枠 ＋ 淡い地 ＋ 明るい字（19px）
     *   非選択   枠も地も無し   ＋ 沈んだ字（15px）
     *   常時     枠も地も無し   ＋ 明るい字（19px）… GRENADE
     *
     * 「明るさ」は撃てるかどうか、「枠と地」は選ばれているかどうか、と役割を分けた。
     * GRENADE はいつでも撃てるので暗くしない（選択の対象ではない）。
     */
    _drawWeaponSlots(ctx, player, y, zoneX) {
        if (!player) return;
        const slots = [
            { label: 'MISSILE',     value: String(Math.floor(player.missiles)).padStart(3, ' '),
              state: player.currentWeapon === 'missile' ? 'sel' : 'off' },
            { label: 'MACHINE GUN', value: player.mgReloadTimer > 0 ? 'RELOAD' : `RDY ${player.mgBurstLeft}`,
              state: player.currentWeapon === 'mg' ? 'sel' : 'off' },
            { label: 'GRENADE',     value: String(Math.floor(player.grenades)).padStart(3, ' '),
              state: 'always' },
        ];

        let x = zoneX;
        for (const slot of slots) {
            const dim = slot.state === 'off';
            ctx.font = HUD_LABEL_FONT;
            const labelW = ctx.measureText(slot.label).width;
            // **幅は常に「選択中の大きさ」で測る。** 非選択は 15px で描くが、
            // 実測で詰めてしまうと選択が移るたびに札の幅が変わり、隣の札が
            // 横に動く（テストで捕まえた）。
            ctx.font = 'bold 19px "Space Mono", monospace';
            const valueW = ctx.measureText(slot.value).width;
            const inner = labelW + 9 + valueW;

            if (slot.state === 'sel') {
                ctx.fillStyle = 'rgba(255, 204, 0, 0.13)';
                ctx.fillRect(x, y - 13, SLOT_BORDER + SLOT_PAD * 2 + inner, 26);
                ctx.fillStyle = '#FFCC00';
                ctx.fillRect(x, y - 13, SLOT_BORDER, 26);
            }

            const textX = x + SLOT_INSET;
            ctx.font = HUD_LABEL_FONT;
            ctx.fillStyle = dim ? '#3a5442' : '#FFCC00';
            ctx.fillText(slot.label, textX, y);
            ctx.font = dim ? 'bold 15px "Space Mono", monospace' : 'bold 19px "Space Mono", monospace';
            ctx.fillStyle = dim ? '#5d7a65' : '#FFFFFF';
            ctx.fillText(slot.value, textX + labelW + 9, y);

            x += SLOT_BORDER + SLOT_PAD * 2 + inner + SLOT_GAP;
        }
        ctx.font = HUD_FONT;
    },

    // ------------------------------------------
    // 武装ゾーン 2段目: ホバー燃料と時限バフ
    // ------------------------------------------
    /**
     * ラベルと自分のバーは GAUGE_TIE、組と組は GAUGE_SPLIT。
     * 近さがそのまま所属を表す。バーの左端は毎回 measureText の右端から
     * 取るので、ラベルの字数が違っても間隔は一定になる。
     */
    _drawGauges(ctx, player, y, zoneX) {
        let x = zoneX;
        x = this._drawHoverGauge(ctx, player, y, x) + GAUGE_SPLIT;
        x = this._drawBuffBar(ctx, y, x, BUFF_SPECS.autoAim, this._autoAimState(player)) + GAUGE_SPLIT;
        this._drawBuffBar(ctx, y, x, BUFF_SPECS.overdrive, this._overdriveState(player));
    },

    /** ラベルを置いて、そのバーを始めるXを返す。 */
    _gaugeLabel(ctx, label, ink, x, y) {
        ctx.font = BUFF_SPECS.font;
        ctx.fillStyle = ink;
        ctx.fillText(label, x, y);
        const right = x + ctx.measureText(label).width;
        ctx.font = HUD_FONT;
        return right + GAUGE_TIE;
    },

    // ------------------------------------------
    // ホバー燃料の三角ゲージ
    // ------------------------------------------
    /**
     * 形は従来どおりの直角三角形。残量は左下を共有する相似の三角形として育つ。
     * 三角形のままにしたのはユーザー判断（形で他のゲージと区別が付く）。
     * 大きさだけ 80x12 から 132x18 に上げた。左端が細いぶん残量が少ないときに
     * 読みにくかったのが、背を高くしたことで改善する。
     *
     * @returns {number} バーの右端X（次のゲージを置くため）
     */
    _drawHoverGauge(ctx, player, y, zoneX) {
        const barX = this._gaugeLabel(ctx, 'HOVER', '#FFCC00', zoneX, y);
        const barW = HOVER_W, barH = HOVER_H;
        const barY = y + barH / 2;   // 三角形の底辺

        const fuelRatio = player ? player.hoverFuel / HOVER_MAX_FUEL : 0;

        // Color by fuel level — cyan when burst jump is available
        const canBurst = player && player.hoverFuel >= BURST_MIN_FUEL;
        let fuelColor = '#FF0000';
        if      (canBurst)        fuelColor = '#00FFFF';
        else if (fuelRatio > 0.5) fuelColor = '#00FF00';
        else if (fuelRatio > 0.3) fuelColor = '#FFAA00';

        const tri = (w, h) => {
            ctx.beginPath();
            ctx.moveTo(barX,     barY);
            ctx.lineTo(barX + w, barY - h);
            ctx.lineTo(barX + w, barY);
            ctx.closePath();
        };

        ctx.fillStyle = 'rgba(0, 120, 140, 0.22)';
        tri(barW, barH);
        ctx.fill();

        const filledW = barW * fuelRatio;
        const filledH = barH * fuelRatio;
        if (canBurst) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#FFFFFF';
        }
        ctx.fillStyle = fuelColor;
        tri(filledW, filledH);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        tri(barW, barH);
        ctx.stroke();

        return barX + barW;
    },

    // ------------------------------------------
    // 時限バフのゲージ
    // ------------------------------------------
    /** @returns {{ratio:number, ink:string, head:string}|null} 効いていなければ null */
    _autoAimState(player) {
        if (!player || player.autoAimTimer <= 0) return null;
        // Shift 長押しで解除している間はグレーで出す。**バーは消さないし止めない** —
        // 解除しても残り時間は減り続けるので、消すと「あと何秒あるか」が分からなくなる。
        const paused = !!player.autoAimPaused;
        return {
            ratio: player.autoAimTimer / AUTO_AIM_MAX_DURATION,
            ink: paused ? '#666666' : BUFF_SPECS.autoAim.ink,
            head: paused ? '#888888' : BUFF_SPECS.autoAim.head,
        };
    },

    /**
     * オーバードライブの残り。
     *
     * **分母は上限（OVERDRIVE_MAX_DURATION）。** 以前は「そのとき持っていた最大」で、
     * 1個でも2個でも満タンから始まるため何個ぶん持っているか読めなかった。
     * 刻みを入れた今は「刻みちょうどまで＝1個ぶん」と読めるので、当時の意図
     * （1個拾って半分だと損に見える）は刻みが引き継いでいる。
     *
     * 切れる3秒前から金色が抜けて赤へ寄る。点滅は機体側だけで、HUD は残量を読む
     * 道具なので常時ちらつかせない。
     */
    _overdriveState(player) {
        if (!player || !player.overdriveTimer || player.overdriveTimer <= 0) return null;
        const goldMix = Math.min(1, player.overdriveTimer / OVERDRIVE_WARN_TICKS);
        const fg = lerpColor('#FF4433', '#FFDD22', goldMix);
        const blink = goldMix < 1 && Math.floor(Date.now() / 200) % 2 === 1;
        return {
            ratio: player.overdriveTimer / OVERDRIVE_MAX_DURATION,
            ink: blink ? lerpColor(fg, '#000000', 0.55) : fg,
            head: BUFF_SPECS.overdrive.head,
        };
    },

    /**
     * ラベル＋地＋残量＋刻み＋先端。
     *
     * **ラベルと地は、効いていなくても出す。** 位置が固定されていないと、
     * 片方が切れた瞬間にもう片方が飛んで目で追えなくなる。
     *
     * @returns {number} バーの右端X
     */
    _drawBuffBar(ctx, y, zoneX, spec, state) {
        const barW = spec.units * BUFF_UNIT_W;
        const barH = BUFF_SPECS.barH;
        // ラベルの色は**状態の色**。解除中のグレーも、切れかけの赤寄りも、
        // バーだけでなくラベルに出ないと「効いていない/切れる」が伝わらない
        const barX = this._gaugeLabel(ctx, spec.label, state ? state.ink : spec.dim, zoneX, y);
        const barY = y - barH / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(barX, barY, barW, barH);

        if (state) {
            const filled = barW * Math.max(0, Math.min(1, state.ratio));
            ctx.fillStyle = state.ink;
            ctx.fillRect(barX, barY, filled, barH);
            if (filled > 0) {
                ctx.fillStyle = state.head;
                ctx.fillRect(barX + filled - 2, barY - 2, 2, barH + 4);
            }
        }

        // ユニット1個ぶんの境目。ここが「何個ぶん持てるか」を数える手がかり
        ctx.fillStyle = HUD_BUFF_TICK_COLOR;
        for (let i = 1; i < spec.units; i++) {
            ctx.fillRect(barX + (barW * i) / spec.units, barY - 2, 1, barH + 4);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        return barX + barW;
    },
};
