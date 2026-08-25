// ============================================
// HUD - Head-Up Display
// ============================================

import {
    HUD_TOP_HEIGHT,
    HUD_FONT, HUD_COLOR, HUD_BG_COLOR,
    HOVER_MAX_FUEL, PLAYER_MAX_HP, CARRIER_MAX_HP, BURST_MIN_FUEL,
    CARRIER_ARROW_ALPHA,
    OVERDRIVE_WARN_TICKS,
    AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION,
    OVERDRIVE_DURATION, OVERDRIVE_MAX_DURATION
} from '../utils/Constants.js';
import { lerpColor } from '../utils/color.js';

/**
 * 母艦の方向を示す矢印の画面座標。表示されないときは null。
 * ミニマップが矢印を隠さないよう、避ける対象としても使う（ScreenRenderer.drawMiniMap）。
 *
 * Crosshair.js の crosshairScreenPos() と同じ理由で切り出した: 避ける位置と
 * 実際に描かれる位置が食い違うと意味が無いため、_drawCarrierArrow() もこの
 * 関数を呼ぶ形にして、計算を二重に持たないようにしている。
 *
 * @param {object} game
 * @returns {{x:number, y:number, angle:number}|null}
 */
export function carrierArrowScreenPos(game) {
    const player = game.player;
    const carrier = game.carrier;

    if (!carrier || !carrier.alive) return null;
    if (player && player.docked) return null;

    const cam = game.camera;
    const w = game.canvas.width;
    const h = game.canvas.height;
    const cx = carrier.x + carrier.width / 2;
    const cy = carrier.y + carrier.height / 2;
    const isOffScreen =
        cx < cam.x ||
        cx > cam.x + w ||
        cy < cam.y ||
        cy > cam.y + h;

    if (!isOffScreen) return null;

    const screenCenterX = cam.x + w / 2;
    const screenCenterY = cam.y + h / 2;
    const angle   = Math.atan2(cy - screenCenterY, cx - screenCenterX);
    const radiusX = (w / 2) - 30;
    const radiusY = (h / 2) - HUD_TOP_HEIGHT - 10;
    const x = w / 2 + Math.cos(angle) * radiusX;
    const y = h / 2 + Math.sin(angle) * radiusY;

    return { x, y, angle };
}

// ============================================
// レイアウト
// ============================================
//
// HUD は「機体 / 武装 / ステータス」の3ゾーンを横に並べた帯。
//
// **縦の区切り線は引かない。** 一度入れたが実機で「機械的で、デザインされていない」
// と却下された。塊はゾーン間の余白（HUD_ZONE_GAP）と、段の高さを3ゾーンで
// 揃えることだけで表す。
//
// **段の中心は3ゾーン共通の固定値。** 以前はゾーンごとに中身を縦中央へ置いていて、
// 段の高さが違うぶん下段の中心が 43.0 / 46.5 / 47.5 とバラつき、ステータスの
// TIME と BONUS が沈んで見えた（実機で指摘された）。
//
// **ゾーン幅は中身の実測から決めてある。** 等幅フォントなので字数×フォント×0.6 で
// 出せる。tests/hud-layout.test.js が「画面幅に収まるか」を毎回確かめる。
const HUD_PAD = 20;          // 帯の左右の余白
const HUD_ZONE_GAP = 34;     // ゾーンとゾーンのあいだ。ここが唯一の区切り

/** 段の中心Y。上段 17 / 下段 44。合計 55px で、帯 60px の中でわずかに上寄せになる。 */
const HUD_ROW1_Y = 17;
const HUD_ROW2_Y = 44;

const HUD_ZONE_W = { units: 300, weapons: 573, status: 384 };

/**
 * HUD が成立する最小の画面幅。CANVAS_WIDTH を下げるときの見張りとして
 * tests/hud-layout.test.js が参照する。
 */
export const HUD_MIN_WIDTH =
    HUD_PAD * 2 + HUD_ZONE_W.units + HUD_ZONE_GAP + HUD_ZONE_W.weapons
    + HUD_ZONE_GAP + HUD_ZONE_W.status;

/** 各ゾーンの左端。ステータスの右端も返す（中身は右端揃えで置くため）。 */
function hudZones(w) {
    const units = HUD_PAD;
    const weapons = units + HUD_ZONE_W.units + HUD_ZONE_GAP;
    const status = weapons + HUD_ZONE_W.weapons + HUD_ZONE_GAP;
    return { units, weapons, status, right: w - HUD_PAD };
}

// --- 機体ゾーン ---
//
// ATTACKER と CARRIER を1本の表として組む。列を固定してあるので、ラベルの
// 字数が違ってもバーの左端と幅が縦に揃う。kits に列を確保してあるので、
// リペアキットが 0 個でも他の要素は動かない。
const UNIT_COLS = { label: 0, lives: 88, bar: 108, barW: 140, barH: 13, kits: 260 };

// --- 武装ゾーン ---
//
// 1段目は武器の札を3つ。**左の内寸は3状態とも同じ**にしてある（枠 + 余白）。
// 選択中だけ余白を詰めていた頃は、武器を切り替えるたびにラベルが 3px 横に飛んだ。
const SLOT_BORDER = 3;
const SLOT_PAD = 10;
const SLOT_INSET = SLOT_BORDER + SLOT_PAD;  // 字が始まる位置。2段目もここに合わせる
const SLOT_GAP = 14;                        // 札と札のあいだ

// 2段目のゲージ。**ラベルと自分のバーは近く、組と組は遠く**する。
// 等間隔にしていた頃は、ラベルがどちらのバーに属するのか目で決められなかった
// （とくに AUTO AIM。左隣の HOVER のバーが長いぶん、直後のラベルが宙に浮いた）。
const GAUGE_TIE = 8;    // 字の右端 → 自分のバーの左端
const GAUGE_SPLIT = 24; // 組と組のあいだ

const HOVER_W = 132, HOVER_H = 18;   // 三角形。元は 80x12 で細かった

/**
 * 時限バフのゲージ。**容量ぜんぶを1本にして、ユニット1個ぶんの境目に刻みを入れる。**
 * 塗りの長さ＝残り時間の絶対量、刻みの数＝何個ぶん重ねられるか。
 *
 * units は Constants の値から導く（AUTO AIM は 180秒/60秒=3、OVERDRIVE は 72秒/36秒=2）。
 * 幅は 1個ぶんがどちらも 36px になるように取ってある。同じ長さなら同じ「1個」に
 * 見えるので、2つのバフを同じ物差しで読める。
 */
const BUFF_UNIT_W = 36;
export const HUD_BUFF_TICK_COLOR = 'rgba(255,255,255,0.42)';
/** ライフの地。受けたダメージがこの赤で残る。 */
export const HUD_HP_DAMAGE_COLOR = '#C41212';
export const BUFF_SPECS = {
    autoAim: {
        label: 'AUTO AIM',
        units: Math.round(AUTO_AIM_MAX_DURATION / AUTO_AIM_DURATION),
        ink: '#FF8A1F', head: '#FFD9B0', dim: '#a5651f',
    },
    overdrive: {
        label: 'OVERDRIVE',
        units: Math.round(OVERDRIVE_MAX_DURATION / OVERDRIVE_DURATION),
        ink: '#FFD62B', head: '#FFF3B8', dim: '#a58a1f',
    },
    barH: 9,
    font: 'bold 10px "Space Mono", monospace',
};

// --- ステータスゾーン ---
//
// 左列に MISSION / TIME（文脈）、右列に SCORE / BONUS（動く数字）。
// TIME をここへ移したのは、得点系の情報だから（以前は帯の左端で、SCORE と
// 画面の端どうしに離れていて視線が往復していた）。
//
// 数字の大きさは SCORE 30 > MISSION 24 > BONUS 21 > TIME 19。BONUS は TIME と
// 同じく刻々と減るので TIME より大きく取ってある。
const STATUS_COLS = { cap: 0, small: 70, capR: 144, bigR: 0 };
const HUD_LABEL_FONT = 'bold 10px "Space Mono", monospace';
const HUD_LABEL_INK = '#5f8f6f';
const SCORE_FONT = 'bold 30px "Space Mono", monospace';
const SCORE_INK = '#F4F8F4';    // 白。BONUS の緑→黄→赤と役割を分ける
const MISSION_FONT = 'bold 24px "Space Mono", monospace';
const TIME_FONT = 'bold 19px "Space Mono", monospace';
const TIME_INK = '#E8F0E8';
const BONUS_FONT = 'bold 21px "Space Mono", monospace';

/** デバッグ札のX。ステータスゾーンの左側の余りに置く。 */
const DEBUG_BADGE_DX = 0;

export class HUD {
    constructor(game) {
        this.game = game;
    }

    draw(ctx) {
        const player = this.game.player;
        const carrier = this.game.carrier;
        const w = this.game.canvas.width;

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // ====== Background ======
        ctx.fillStyle = HUD_BG_COLOR;
        ctx.fillRect(0, 0, w, HUD_TOP_HEIGHT);
        ctx.font = HUD_FONT;

        const z = hudZones(w);

        // ====== 機体 ======
        this._drawUnitHpBar(ctx, player,  PLAYER_MAX_HP,  'ATTACKER', z.units, HUD_ROW1_Y);
        this._drawUnitHpBar(ctx, carrier, CARRIER_MAX_HP, 'CARRIER',  z.units, HUD_ROW2_Y);
        this._drawRepairKitIcons(ctx, player, HUD_ROW2_Y, z.units);

        // ====== 武装 ======
        this._drawWeaponSlots(ctx, player, HUD_ROW1_Y, z.weapons);
        this._drawGauges(ctx, player, HUD_ROW2_Y, z.weapons + SLOT_INSET);

        // ====== ステータス ======
        this._drawStatus(ctx, z, w);

        this._drawDebugInvincibleBadge(ctx, w, HUD_ROW1_Y);
        // 母艦の方向矢印はここでは描かない。ミニマップより上の面に出したいため、
        // main.js が _drawOverlays(ミニマップ)の後に drawCarrierArrow() を呼ぶ。

        // Separator line
        ctx.strokeStyle = '#444444';
        ctx.beginPath();
        ctx.moveTo(0, HUD_TOP_HEIGHT);
        ctx.lineTo(w, HUD_TOP_HEIGHT);
        ctx.stroke();

        // --- Cruise Missile Warning ---
        if (this.game.base && this.game.base.cruiseWarning) {
            const timerSec = Math.ceil(this.game.base.cruiseMissileTimer / 60);
            if (Math.floor(Date.now() / 200) % 2 === 0) { // Blink quickly
                const centerX = w / 2;
                const centerY = this.game.canvas.height * 0.75;
                
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Draw semi-transparent background box for readability
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(centerX - 300, centerY - 25, 600, 50);
                
                // Border for the box
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(centerX - 300, centerY - 25, 600, 50);

                ctx.fillStyle = '#FF0000';
                ctx.font = 'bold 24px "Space Mono", monospace';
                ctx.fillText(`⚠️ WARNING: CRUISE MISSILE LAUNCH IN T-${timerSec}... ⚠️`, centerX, centerY);
                ctx.restore();
            }
        }

        // --- Carrier Alerts ---
        this._drawCarrierDamageAlert(ctx, w);
        this._drawProximityAlert(ctx, w);
        this._drawBaseEmergencyAlert(ctx, w);

        ctx.restore();
    }

    _drawBaseEmergencyAlert(ctx, w) {
        if (!this.game.baseEmergencyAlert) return;

        // Stop blinking after a handful of cycles so the warning doesn't
        // stay visually noisy for the rest of the (possibly long) alert.
        const BLINK_PERIOD_MS = 400; // 200ms on + 200ms off
        const MAX_BLINKS = 10;
        const startTime = this.game.baseEmergencyAlertStartTime || Date.now();
        const elapsed = Date.now() - startTime;
        if (elapsed >= BLINK_PERIOD_MS * MAX_BLINKS) return;
        if (Math.floor(elapsed / 200) % 2 !== 0) return; // Blink

        const centerX = w / 2;
        const centerY = this.game.canvas.height * 0.35;
        const boxW = 680;
        const boxH = 50;
        const textPadding = 24; // keep text clear of the box border

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);

        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);

        // Shrink the font until the text fits inside the box, so the
        // warning never overflows its frame.
        const text = 'WARNING: ENEMY BASE UNDER ATTACK! DEFENSE MODE ACTIVATED!';
        const maxTextW = boxW - textPadding * 2;
        let fontSize = 20;
        ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
        while (fontSize > 10 && ctx.measureText(text).width > maxTextW) {
            fontSize--;
            ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
        }

        ctx.fillStyle = '#FF0000';
        ctx.fillText(text, centerX, centerY);
        ctx.restore();
    }

    _drawProximityAlert(ctx, w) {
        // Yellow alert if enemies/bullets are near carrier
        if (!this.game.proximityAlertActive) return;

        // Don't show yellow if red damage alert is active (red has priority)
        if (this.game.carrier && this.game.carrier.damageTimer > 0) return;

        const carrier = this.game.carrier;
        const cam = this.game.camera;
        const screenX = carrier.x - cam.x;
        const screenW = w;
        const screenH = this.game.canvas.height;

        // Pulsing yellow — same timing style as damage alert
        const alpha = Math.sin(Date.now() / 120) * 0.35 + 0.45;
        ctx.fillStyle = `rgba(255, 220, 0, ${alpha})`;

        const thickness = 10;

        if (screenX + carrier.width < 0) {
            // Carrier is to the left of the screen
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH);
        } else if (screenX > screenW) {
            // Carrier is to the right of the screen
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH);
        } else {
            // Carrier is visible on screen: full border
            ctx.fillRect(0, HUD_TOP_HEIGHT, screenW, thickness); // Top
            ctx.fillRect(0, screenH - thickness, screenW, thickness); // Bottom
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH); // Left
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH); // Right
        }
    }

    _drawCarrierDamageAlert(ctx, w) {
        const carrier = this.game.carrier;
        if (!carrier || carrier.damageTimer <= 0) return;

        const cam = this.game.camera;
        const screenX = carrier.x - cam.x;
        const screenW = w;
        const screenH = this.game.canvas.height;

        // Pulse intensity
        const alpha = (Math.sin(Date.now() / 100) * 0.4 + 0.5) * (carrier.damageTimer / 60);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;

        const thickness = 10;

        if (screenX + carrier.width < 0) {
            // Carrier is to the left of the screen
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH);
        } else if (screenX > screenW) {
            // Carrier is to the right of the screen
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH);
        } else {
            // Carrier is visible on screen: Pulse full border
            ctx.fillRect(0, HUD_TOP_HEIGHT, screenW, thickness); // Top
            ctx.fillRect(0, screenH - thickness, screenW, thickness); // Bottom
            ctx.fillRect(0, HUD_TOP_HEIGHT, thickness, screenH); // Left
            ctx.fillRect(screenW - thickness, HUD_TOP_HEIGHT, thickness, screenH); // Right
        }
    }

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
    }

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
    }

    /** ラベルを置いて、そのバーを始めるXを返す。 */
    _gaugeLabel(ctx, label, ink, x, y) {
        ctx.font = BUFF_SPECS.font;
        ctx.fillStyle = ink;
        ctx.fillText(label, x, y);
        const right = x + ctx.measureText(label).width;
        ctx.font = HUD_FONT;
        return right + GAUGE_TIE;
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    // ------------------------------------------
    // Repair kit icons below CARRIER display
    // ------------------------------------------
    _drawRepairKitIcons(ctx, player, y, zoneX = 0) {
        if (!player || player.repairKits <= 0) return;

        const count = Math.min(player.repairKits, 10); // 最大10個表示
        const S = 9;   // アイコンサイズ
        const gap = 3; // アイコン間隔
        const startX = zoneX + UNIT_COLS.kits;
        const iconY = y - S / 2;
        const r = 2;   // 角丸半径

        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#00FF66';

        for (let i = 0; i < count; i++) {
            const x = startX + i * (S + gap);

            // 角丸緑四角
            ctx.fillStyle = '#00BB44';
            ctx.beginPath();
            ctx.moveTo(x + r, iconY);
            ctx.lineTo(x + S - r, iconY);
            ctx.arcTo(x + S, iconY, x + S, iconY + r, r);
            ctx.lineTo(x + S, iconY + S - r);
            ctx.arcTo(x + S, iconY + S, x + S - r, iconY + S, r);
            ctx.lineTo(x + r, iconY + S);
            ctx.arcTo(x, iconY + S, x, iconY + S - r, r);
            ctx.lineTo(x, iconY + r);
            ctx.arcTo(x, iconY, x + r, iconY, r);
            ctx.closePath();
            ctx.fill();

            // 白い十字
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            const cx = x + S / 2;
            const cy = iconY + S / 2;
            ctx.fillRect(cx - 0.5, iconY + 1, 1, S - 2); // 縦
            ctx.fillRect(x + 1, cy - 0.5, S - 2, 1);     // 横
            ctx.shadowBlur = 4;
        }

        ctx.restore();
    }

    // ------------------------------------------
    // Unit label + lives count + HP bar
    // ------------------------------------------
    _drawUnitHpBar(ctx, unit, maxHp, label, zoneX, y) {
        const barX = zoneX + UNIT_COLS.bar;
        const barW = UNIT_COLS.barW;
        const hpH  = UNIT_COLS.barH;
        const barY = y - hpH / 2;

        ctx.font = HUD_LABEL_FONT;
        ctx.fillStyle = HUD_LABEL_INK;
        ctx.fillText(label, zoneX + UNIT_COLS.label, y);
        ctx.font = 'bold 18px "Space Mono", monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(unit ? unit.lives : 0), zoneX + UNIT_COLS.lives, y);
        ctx.font = HUD_FONT;

        if (!unit || !unit.alive) return;

        // **地が赤＝受けたダメージ。** 減った分がそのまま赤い帯として残るので、
        // 「どれだけ削られたか」が緑の残量と同時に読める（ユーザー判断）。
        const hpRatio = unit.hp / maxHp;
        ctx.fillStyle = HUD_HP_DAMAGE_COLOR;
        ctx.fillRect(barX, barY, barW, hpH);
        const filled = barW * hpRatio;
        ctx.fillStyle = '#12D64A';
        ctx.fillRect(barX, barY, filled, hpH);
        if (filled > 0) {
            // 先端の明るい線。他のゲージと同じ語彙で「ここが今の値」を示す
            ctx.fillStyle = '#B6FFCB';
            ctx.fillRect(barX + filled - 2, barY - 2, 2, hpH + 4);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, hpH);
    }

    // ------------------------------------------
    // Off-screen carrier direction indicator
    // ------------------------------------------
    // 公開メソッド: main.js がミニマップ(_drawOverlays)より後に呼ぶ
    // （ミニマップより上の面に矢印を出すため）。座標はすべて
    // carrierArrowScreenPos(this.game) から取れるので、player/carrier/w の
    // 引数は不要（前回のリファクタで実質未使用になっていたぶんを整理）。
    drawCarrierArrow(ctx) {
        const pos = carrierArrowScreenPos(this.game);
        if (!pos) return;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(pos.angle);
        // ミニマップより上の面に描くため、不透明のままだと下のミニマップを
        // 塗りつぶす。restore() で自動的に元へ戻るのでここで薄くする。
        ctx.globalAlpha = CARRIER_ARROW_ALPHA;
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo( 10,  0);   // Tip
        ctx.lineTo( -8,  8);   // Bottom left
        ctx.lineTo( -4,  0);   // Inner indent
        ctx.lineTo( -8, -8);   // Top left
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}
