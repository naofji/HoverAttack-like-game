// ============================================
// Crosshair - Mouse aiming reticle
// ============================================

import { COLOR_CROSSHAIR, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from '../utils/Constants.js';

export class Crosshair {
    constructor(game) {
        this.game = game;
    }

    draw(ctx) {
        const input = this.game.input;
        const camera = this.game.camera;
        const autoAimTarget = this.game.autoAimTarget;
        const player = this.game.player;
        const autoAimActive = !!(player && player.autoAimTimer > 0);

        let mx, my;
        if (autoAimTarget) {
            // オートエイムスナップ中: 敵のスクリーン座標に表示
            mx = autoAimTarget.x - camera.x;
            my = autoAimTarget.y - camera.y;
        } else if (input.crosshairLocked) {
            mx = input.lockedWorldX - camera.x;
            my = input.lockedWorldY - camera.y;
        } else {
            mx = input.mouse.x;
            my = input.mouse.y;
        }

        // クランプ範囲
        const minX = 0;
        const maxX = this.game.canvas.width;
        const minY = HUD_TOP_HEIGHT;
        const maxY = this.game.canvas.height - HUD_BOTTOM_HEIGHT;

        // クランプされた方向を記録してから補正
        const clampedLeft  = mx < minX;
        const clampedRight = mx > maxX;
        const clampedUp    = my < minY;
        const clampedDown  = my > maxY;

        if (clampedLeft)  mx = minX;
        if (clampedRight) mx = maxX;
        if (clampedUp)    my = minY;
        if (clampedDown)  my = maxY;

        const size = 12;
        const gap = 3;

        // 色の優先順位: スナップ中/オートエイム有効 > ロックオン > 通常
        const isSnapping = !!autoAimTarget;
        const color = (isSnapping || autoAimActive) ? '#FF3300' : (input.crosshairLocked ? '#FFFF00' : COLOR_CROSSHAIR);
        ctx.strokeStyle = color;
        ctx.lineWidth = (isSnapping || input.crosshairLocked) ? 2.5 : 1.5;

        ctx.beginPath();
        if (isSnapping || input.crosshairLocked) {
            const r = 14; // corner radius
            const l = 6; // length of the L segment

            // Top-Left
            ctx.moveTo(mx - r, my - r + l);
            ctx.lineTo(mx - r, my - r);
            ctx.lineTo(mx - r + l, my - r);
            
            // Top-Right
            ctx.moveTo(mx + r - l, my - r);
            ctx.lineTo(mx + r, my - r);
            ctx.lineTo(mx + r, my - r + l);
            
            // Bottom-Right
            ctx.moveTo(mx + r, my + r - l);
            ctx.lineTo(mx + r, my + r);
            ctx.lineTo(mx + r - l, my + r);
            
            // Bottom-Left
            ctx.moveTo(mx - r + l, my + r);
            ctx.lineTo(mx - r, my + r);
            ctx.lineTo(mx - r, my + r - l);
        } else {
            // Horizontal lines
            ctx.moveTo(mx - size, my);
            ctx.lineTo(mx - gap, my);
            ctx.moveTo(mx + gap, my);
            ctx.lineTo(mx + size, my);
            // Vertical lines
            ctx.moveTo(mx, my - size);
            ctx.lineTo(mx, my - gap);
            ctx.moveTo(mx, my + gap);
            ctx.lineTo(mx, my + size);
        }
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.fillRect(mx - 1, my - 1, 2, 2);

        // AUTO ラベル（オートエイム有効中のみ）
        if (autoAimActive) {
            ctx.save();
            ctx.font = 'bold 8px "Space Mono", monospace';
            ctx.fillStyle = '#FF3300';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('AUTO', mx + size + 2, my - size + 2);
            ctx.restore();
        }

        // 画面外方向インジケーター（頂点をクロスヘア中心に合わせたパス三角形）
        if (clampedLeft || clampedRight || clampedUp || clampedDown) {
            ctx.save();
            ctx.fillStyle = color;
            const tw = 5; // 底辺の半幅
            const th = 9; // 三角形の高さ

            if (clampedUp) {
                // 頂点(mx, my)、底辺は下方へ伸びる ▲
                ctx.beginPath();
                ctx.moveTo(mx,      my);
                ctx.lineTo(mx - tw, my + th);
                ctx.lineTo(mx + tw, my + th);
                ctx.closePath();
                ctx.fill();
            }
            if (clampedDown) {
                // 頂点(mx, my)、底辺は上方へ伸びる ▼
                ctx.beginPath();
                ctx.moveTo(mx,      my);
                ctx.lineTo(mx - tw, my - th);
                ctx.lineTo(mx + tw, my - th);
                ctx.closePath();
                ctx.fill();
            }
            if (clampedLeft) {
                // 頂点(mx, my)、底辺は右方へ伸びる ◀
                ctx.beginPath();
                ctx.moveTo(mx,      my);
                ctx.lineTo(mx + th, my - tw);
                ctx.lineTo(mx + th, my + tw);
                ctx.closePath();
                ctx.fill();
            }
            if (clampedRight) {
                // 頂点(mx, my)、底辺は左方へ伸びる ▶
                ctx.beginPath();
                ctx.moveTo(mx,      my);
                ctx.lineTo(mx - th, my - tw);
                ctx.lineTo(mx - th, my + tw);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.lineWidth = 1;
    }
}
