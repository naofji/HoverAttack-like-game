// ============================================
// HUD - Head-Up Display
// ============================================

import {
    HUD_TOP_HEIGHT,
    HUD_FONT, HUD_COLOR, HUD_BG_COLOR,
    HOVER_MAX_FUEL, PLAYER_MAX_HP, CARRIER_MAX_HP, BURST_MIN_FUEL,
    CARRIER_ARROW_ALPHA,
    OVERDRIVE_WARN_TICKS
} from '../utils/Constants.js';

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

        // --- ROW 1 ---
        const row1Y = HUD_TOP_HEIGHT * 0.3;

        // Per-stage elapsed time (not the whole run).
        const elapsed = this.game.missionTimer;
        const minutes  = Math.floor(elapsed / 60000);
        const seconds  = Math.floor((elapsed % 60000) / 1000);
        const centis   = Math.floor((elapsed % 1000) / 10);
        const timeStr  = `TIME ${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText(timeStr, 12, row1Y);

        // Live time bonus: decays as the stage drags on. Colour shifts
        // green -> yellow -> red (blinking near zero) to convey urgency.
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
        ctx.fillStyle = bonusColor;
        ctx.fillText('BONUS ' + String(tb.current).padStart(6, '0'), 250, row1Y);

        ctx.fillStyle = '#FFCC00';
        ctx.fillText('MISSION', 510, row1Y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(this.game.missionsCompleted + 1 || 1), 585, row1Y);

        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('SCORE ' + String(this.game.score).padStart(7, '0'), w - 160, row1Y);

        // --- ROW 2 ---
        const row2Y = HUD_TOP_HEIGHT * 0.7;

        ctx.fillStyle = '#FFCC00';
        ctx.fillText('GRENADE', 12, row2Y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(player ? Math.floor(player.grenades) : 0).padStart(3, ' '), 90, row2Y);

        this._drawWeaponStatus(ctx, player, row2Y);
        this._drawHoverGauge(ctx, player, row2Y);
        this._drawAutoAimBar(ctx, player, row2Y);
        this._drawOverdriveBar(ctx, player, row2Y);
        this._drawUnitHpBar(ctx, player, PLAYER_MAX_HP, 'ATTACKER', 600, 685, 705, row2Y);
        this._drawUnitHpBar(ctx, carrier, CARRIER_MAX_HP, 'CARRIER',  800, 875, 895, row2Y, 60);
        this._drawRepairKitIcons(ctx, player, row2Y);
        this._drawDebugInvincibleBadge(ctx, w, row2Y);
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
    // Weapon status (MISSILE / M-GUN)
    // ------------------------------------------
    _drawWeaponStatus(ctx, player, y) {
        if (!player) return;

        const isMissile = player.currentWeapon === 'missile';
        const isMG = player.currentWeapon === 'mg';

        // --- Missile Status ---
        ctx.fillStyle = isMissile ? '#FFCC00' : '#444444';
        ctx.fillText('MISSILE', 145, y);
        ctx.fillStyle = isMissile ? '#FFFFFF' : '#666666';
        ctx.fillText(String(Math.floor(player.missiles)).padStart(3, ' '), 220, y);

        // --- Machine Gun Status ---
        ctx.fillStyle = isMG ? '#FFCC00' : '#444444';
        ctx.fillText('M-GUN', 270, y);
        ctx.fillStyle = isMG ? '#FFFFFF' : '#666666';
        
        if (player.mgReloadTimer > 0) {
            ctx.fillText('RELOAD', 330, y);
        } else {
            ctx.fillText(`RDY ${player.mgBurstLeft}`, 330, y);
        }
    }

    // ------------------------------------------
    // Hover fuel triangle gauge
    // ------------------------------------------
    _drawHoverGauge(ctx, player, y) {
        ctx.fillStyle = '#FFCC00';
        ctx.fillText('HOVER', 420, y);

        const fuelRatio = player ? player.hoverFuel / HOVER_MAX_FUEL : 0;
        const barW = 80;
        const barH = 12;
        const barX = 485;
        const barY = y + 6; // Anchor to bottom of row

        // Color by fuel level — cyan when burst jump is available
        const canBurst = player && player.hoverFuel >= BURST_MIN_FUEL;
        let fuelColor = '#FF0000';
        if      (canBurst)           fuelColor = '#00FFFF';
        else if (fuelRatio > 0.5)    fuelColor = '#00FF00';
        else if (fuelRatio > 0.3)    fuelColor = '#FFAA00';

        // Empty background triangle
        ctx.fillStyle = 'rgba(51, 51, 51, 0.7)';
        ctx.beginPath();
        ctx.moveTo(barX,        barY);
        ctx.lineTo(barX + barW, barY - barH);
        ctx.lineTo(barX + barW, barY);
        ctx.closePath();
        ctx.fill();

        // Filled portion
        const filledW = barW * fuelRatio;
        const filledH = barH * fuelRatio;

        const glowing = canBurst;
        if (glowing) {
            ctx.shadowBlur  = 8;
            ctx.shadowColor = '#FFFFFF';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth   = 1.5;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = fuelColor;
        ctx.beginPath();
        ctx.moveTo(barX,           barY);
        ctx.lineTo(barX + filledW, barY - filledH);
        ctx.lineTo(barX + filledW, barY);
        ctx.closePath();
        ctx.fill();
        if (glowing) ctx.stroke();

        // Reset shadow/stroke
        ctx.shadowBlur = 0;
        ctx.lineWidth  = 1;

        // Static border
        ctx.strokeStyle = '#888888';
        ctx.beginPath();
        ctx.moveTo(barX,        barY);
        ctx.lineTo(barX + barW, barY - barH);
        ctx.lineTo(barX + barW, barY);
        ctx.closePath();
        ctx.stroke();

        // Faint bounding box
        ctx.strokeStyle = 'rgba(136, 136, 136, 0.3)';
        ctx.strokeRect(barX, barY - barH, barW, barH);
    }

    // ------------------------------------------
    // Auto-Aim remaining time bar (MISSILE/M-GUN エリアの下に小さく表示)
    // ------------------------------------------
    _drawAutoAimBar(ctx, player, y) {
        if (!player || player.autoAimTimer <= 0) return;

        const ratio = player.autoAimTimer / player.autoAimMaxTimer;
        const labelX = 145;
        const barX = 195;
        const barW = 220;
        const barH = 5;
        const rowY = y + 11; // row2Y の直下

        // Shift 長押しで解除している間はグレーで出す。**バーは消さないし止めない** —
        // 解除しても残り時間は減り続けるので、消すと「あと何秒あるか」が分からなくなる。
        // グレーにするのは、この HUD が既に武器セレクタで「有効＝色つき／無効＝グレー」
        // という語彙を使っているため（非選択の武器が #444444 / #666666）。そこへ揃える
        const paused = !!player.autoAimPaused;
        const fg = paused ? '#666666' : '#FF6600';

        ctx.font = 'bold 10px "Space Mono", monospace';
        ctx.fillStyle = fg;
        ctx.fillText('A-AIM', labelX, rowY);

        ctx.fillStyle = paused ? 'rgba(40,40,40,0.8)' : 'rgba(80,20,0,0.8)';
        ctx.fillRect(barX, rowY - barH + 2, barW, barH);

        ctx.fillStyle = fg;
        ctx.fillRect(barX, rowY - barH + 2, barW * ratio, barH);

        ctx.strokeStyle = paused ? '#444444' : '#663300';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, rowY - barH + 2, barW, barH);

        // フォントを元に戻す
        ctx.font = 'bold 16px "Space Mono", monospace';
    }

    // ------------------------------------------
    // オーバードライブ残り時間バー（A-AIM ゲージのすぐ下）
    // ------------------------------------------
    /**
     * heavy のレア版キットで得た「弾が減らない」効果の残り時間。
     *
     * A-AIM ゲージと同じ作法（ラベル＋地＋残量＋枠）で1段下に置く。
     * 切れる3秒前から点滅させるのは、無限だと思って撃っていた弾が急に
     * 減り始めるのが一番きついため。バーの分母は上限ではなく
     * 「そのとき持っていた最大」（OverdriveKit を参照）。
     */
    _drawOverdriveBar(ctx, player, y) {
        if (!player || !player.overdriveTimer || player.overdriveTimer <= 0) return;

        const max = player.overdriveMaxTimer || player.overdriveTimer;
        const ratio = Math.max(0, Math.min(1, player.overdriveTimer / max));
        const labelX = 145;
        const barX = 195;
        const barW = 220;
        const barH = 5;
        const rowY = y + 22; // A-AIM ゲージ(y + 11)のさらに下

        // 残り3秒(180 tick)で点滅。暗い側へ落とすだけで、消灯はしない
        const ending = player.overdriveTimer <= OVERDRIVE_WARN_TICKS;
        const dark = ending && Math.floor(Date.now() / 200) % 2 === 1;
        const fg = dark ? '#665511' : '#FFDD22';

        ctx.font = 'bold 10px "Space Mono", monospace';
        ctx.fillStyle = fg;
        ctx.fillText('O-DRIVE', labelX, rowY);

        ctx.fillStyle = 'rgba(70, 55, 0, 0.8)';
        ctx.fillRect(barX, rowY - barH + 2, barW, barH);

        ctx.fillStyle = fg;
        ctx.fillRect(barX, rowY - barH + 2, barW * ratio, barH);

        ctx.strokeStyle = '#665511';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, rowY - barH + 2, barW, barH);

        // フォントを元に戻す
        ctx.font = 'bold 16px "Space Mono", monospace';
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
        ctx.fillText('INVINCIBLE', w - 160, y);
    }

    // ------------------------------------------
    // Repair kit icons below CARRIER display
    // ------------------------------------------
    _drawRepairKitIcons(ctx, player, y) {
        if (!player || player.repairKits <= 0) return;

        const count = Math.min(player.repairKits, 10); // 最大10個表示
        const S = 7;   // アイコンサイズ
        const gap = 2; // アイコン間隔
        const startX = 800;
        const iconY = y + 8;
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
    _drawUnitHpBar(ctx, unit, maxHp, label, labelX, livesX, barX, y, barW = 40) {
        const hpH = 8;
        const barY = y - hpH / 2;

        ctx.fillStyle = '#FFCC00';
        ctx.fillText(label, labelX, y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(unit ? unit.lives : 0), livesX, y);

        if (unit && unit.alive) {
            const hpRatio = unit.hp / maxHp;
            ctx.fillStyle = '#DD0000'; // Damage
            ctx.fillRect(barX, barY, barW, hpH);
            ctx.fillStyle = '#00DD00'; // Remaining life
            ctx.fillRect(barX, barY, barW * hpRatio, hpH);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(barX, barY, barW, hpH);
        }
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
