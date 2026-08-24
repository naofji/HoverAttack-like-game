// ============================================
// EnemyAttacker - 描画（胴体・頭・腕・スラスター）
// ============================================
//
// 脚以外の見た目。脚は attacker/legs.js が持っていて、ここからは
// this._drawLegs() / this._drawArtilleryLegs() で呼ぶだけ。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import { drawThrusterFlame, attackerFlamePower } from '../thrusterFlame.js';

export const AttackerDraw = {
    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const cfg = this.config;
        const type = cfg.name;

        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        const isCrouching = this.crouching || this.burstCount > 0;
        const crouchOffset = isCrouching ? 4 : 0;
        ctx.translate(0, crouchOffset);

        // --- Design by Type ---
        if (type === 'heavy') {
            // BULKY / ARMORED DESIGN
            // Shoulder Pad (Back)
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(3, 2, 6, 4);
            // Bulky Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(4, 4, 12, 13);
            // Thick Legs
            this._drawLegs(ctx, crouchOffset);
            // Bigger Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(6, -1, 9, 6);
            // Visor (Slit)
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 4, 2);
            // Heavy Gun
            ctx.fillStyle = '#666666';
            ctx.fillRect(14, 8, 6, 4);
            ctx.fillStyle = '#999999';
            ctx.fillRect(18, 8, 3, 4);
        }
        else if (type === 'rival') {
            // SLEEK / SPEED DESIGN
            // Sleek Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(6, 4, 8, 12);
            // Sleek Head with horns
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(7, 0, 6, 5);
            ctx.fillRect(10, -3, 2, 2); // Bottom horn
            ctx.fillRect(11, -2, 2, 3); // Top horn
            // Visor (Glowing Eye)
            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 1, 5, 2);
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 3, 2);
            // Dual Barrels
            ctx.fillStyle = '#777777';
            ctx.fillRect(13, 6, 8, 2);
            ctx.fillRect(16, 7, -6, 3);
            this._drawLegs(ctx, crouchOffset);
            // Backpack
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(1, 6, 5, 5);
            ctx.fillRect(5, 4, -3, 9);
        }
        else if (type === 'artillery') {
            // SNIPER / RADAR DESIGN
            // Radar / Antenna on back
            ctx.strokeStyle = cfg.exhaustColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(3, 4); ctx.lineTo(3, -2);
            ctx.lineTo(6, -4); ctx.stroke();
            // Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(5, 5, 11, 11);
            // Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(7, 1, 7, 5);
            // Visor
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(11, 2, 3, 2);
            // LONG SNIPER BARREL
            ctx.fillStyle = '#555555';
            ctx.fillRect(14, 8, 12, 2);
            ctx.fillStyle = '#888888';
            ctx.fillRect(24, 7, 2, 4);
            this._drawArtilleryLegs(ctx, crouchOffset);
        }
        else {
            // STANDARD HUMANOID DESIGN
            // Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(5, 4, 10, 12);
            // Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(6, 0, 8, 5);
            // Visor
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 3, 3);
            // Backpack
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(2, 5, 4, 8);
            ctx.fillStyle = cfg.exhaustColor;
            ctx.fillRect(2, 12, 4, 2);
            // Legs
            this._drawLegs(ctx, crouchOffset);
            // Gun
            ctx.fillStyle = '#777777';
            ctx.fillRect(13, 7, 5, 2);
            ctx.fillStyle = '#999999';
            ctx.fillRect(17, 7, 2, 2);
        }

        // --- Hover Exhaust (Common) ---
        if (this.hovering) {
            // 炎はノズル中心に左右対称なので、scale(-1, 1) 済みのこの座標系でも
            // 向きの場合分けなしで置ける。
            //
            // ノズルの位置・太さは型ごと（cfg.flameX/flameY/flameWidth）。2足の3型は
            // 背中のバックパック直下だが、artillery は4脚なので胴体の真下から出す。
            //
            // crouchOffset を引いていない（＝この ctx の translate(0, crouchOffset) に
            // 素直に乗る）ので、しゃがんでも炎はノズルに付いたまま下がる。置き換え前は
            // 引いてワールド上の高さを固定していたが、それだと artillery のバースト中に
            // 炎が胴体から 4px 離れて浮いた。
            drawThrusterFlame(ctx, cfg.flameX, cfg.flameY, {
                // 機体側の部品の色（exhaustColor）ではなく炎専用の flameColor。
                // 機体色に馴染む色だと炎が機体に溶けて見分けがつかなかった
                color: cfg.flameColor,
                width: cfg.flameWidth,
                power: attackerFlamePower(cfg.climbThrust),
            });
        }

        ctx.restore();
    },
};
