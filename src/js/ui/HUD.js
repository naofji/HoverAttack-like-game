// ============================================
// HUD - Head-Up Display
// ============================================
//
// 本体に残しているのは draw()（何をどの順で重ねるかの唯一の記述）と、main.js が別の面で呼ぶ
// drawCarrierArrow() だけ。各ゾーンと警報は ui/hud/ の層（ScreenRenderer と同じ
// Object.assign(HUD.prototype, ...) 方式。2026-11-25 に分けた）、寸法は ui/hud/layout.js。
// 層どうしで名前が重なると黙って上書きされるので tests/hud-mixins.test.js が縛っている。

import {
    HUD_TOP_HEIGHT,
    HUD_FONT, HUD_BG_COLOR,
    PLAYER_MAX_HP, CARRIER_MAX_HP,
    CARRIER_ARROW_ALPHA,
} from '../utils/Constants.js';
import { hudZones, HUD_ROW1_Y, HUD_ROW2_Y, SLOT_INSET } from './hud/layout.js';
import { HudAlerts } from './hud/alerts.js';
import { HudWeapons } from './hud/weapons.js';
import { HudUnits } from './hud/units.js';
import { HudStatus } from './hud/status.js';

// テストと ScreenRenderer が今までどおり HUD.js から読めるように
export { HUD_MIN_WIDTH, HUD_BUFF_TICK_COLOR, HUD_HP_DAMAGE_COLOR, BUFF_SPECS } from './hud/layout.js';

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

        this._drawCruiseMissileWarning(ctx, w);

        // --- Carrier Alerts ---
        this._drawCarrierDamageAlert(ctx, w);
        this._drawProximityAlert(ctx, w);
        this._drawBaseEmergencyAlert(ctx, w);

        ctx.restore();
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

Object.assign(HUD.prototype, HudAlerts, HudWeapons, HudUnits, HudStatus);
