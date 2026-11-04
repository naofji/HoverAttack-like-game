// ============================================
// Player - 描画（胴体・脚・武装・噴射・オーバードライブの光・1UP）
// ============================================
//
// 自機の見た目。動き・当たり・武装の状態は Player.js が持っていて、ここは読むだけ。
// 1431行のうち約390行が絵で、動きのロジックと混ざって見通しが悪かったので分けた
// （敵アタッカーの attacker/draw.js と同じ切り方）。
//
// **Player.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、
// `this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。
// 脚の関節（_legJoints / _collectLegPoses）と照準の角度（_aimAngle）は破片生成
// （debris/playerParts.js）も読む。描画と破片が同じポーズになるよう、供給元はここ1つ。

import {
    PLAYER_MAX_SPEED,
    HOVER_MAX_FUEL,
    EXTRA_LIFE_FLASH_FRAMES,
    COLOR_HOVER_EXHAUST,
    OVERDRIVE_WARN_TICKS, OVERDRIVE_GLOW_RADIUS, OVERDRIVE_BLINK_MS,
} from '../../utils/Constants.js';
import { drawThrusterFlame } from '../thrusterFlame.js';

/**
 * オーバードライブの輝きのグラデーション。
 * [位置, 赤のときのRGB, 金のときのRGB, 不透明度]。
 * 描画専用のパラメータなので Constants ではなくここに置いている。
 */
const OVERDRIVE_GLOW_STOPS = [
    [0, [255, 70, 40], [255, 215, 60], 0.55],
    [0.55, [255, 30, 20], [255, 190, 30], 0.22],
    [1, [255, 0, 0], [255, 180, 0], 0],
];

/** 2色を t で混ぜて rgba 文字列にする。 */
function mixRgba([r1, g1, b1], [r2, g2, b2], t, alpha) {
    const at = (a, b) => Math.round(a + (b - a) * t);
    return `rgba(${at(r1, r2)}, ${at(g1, g2)}, ${at(b1, b2)}, ${alpha})`;
}

/**
 * 歩行4フレーム → 手前脚/奥脚のポーズ番号（_legPose の walkPose に渡す）。
 * フレーム2は直立・停止時。以前は描画と破片生成が同じ表をそれぞれ持っていた。
 */
const WALK_POSES = [
    { near: 0, far: 1 },
    { near: 2, far: 3 },
    { near: 2, far: 2 }, // Standing straight/idle pose
    { near: 3, far: 2 },
];

/**
 * しゃがみ（およびドッキング中）の固定ポーズ。膝を外に折った形。
 * 歩行やホバーと違って計算で求まらないので、関節座標を直接持つ。
 */
const CROUCH_LEG_JOINTS = [
    { isNear: false, hipX: 7, hipY: 16, kx: 2, ky: 20, fx: 6, fy: 22 },
    { isNear: true, hipX: 10, hipY: 16, kx: 15, ky: 20, fx: 11, fy: 22 },
];

export const PlayerDraw = {
    draw(ctx) {
        if (!this.alive) return;

        // Blinking during invincibility
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 3) % 2 === 0) {
            return;
        }

        // 点滅の早期 return より後に save するので、restore は末尾の1回で足りる
        ctx.save();

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const isCrouched = this.crouching || this.docked;
        const crouchOffset = isCrouched ? 8 : 0;

        // 機体より先に描いて「背後から漏れる光」にする。手前に描くと
        // 機体そのものが赤く塗り潰されて、被弾の点滅と紛らわしい
        this._drawOverdriveGlow(ctx);
        this._drawBody(ctx, x, y, isCrouched, crouchOffset);
        if (!isCrouched) {
            if (this.currentWeapon === 'missile') {
                this._drawBazooka(ctx, x, y, crouchOffset);
            } else {
                this._drawMachineGun(ctx, x, y, crouchOffset);
            }
        }
        this._drawHoverExhaust(ctx);
        ctx.restore();
        this._drawLifeUp(ctx);
    },

    /**
     * 残機を拾った直後に頭の上へ出す「1UP」。上へ昇りながら、後半で薄れる。
     * HUD の数字の点滅（HUD.js）だけだと、視線を下へ外さないと拾ったことが読めない。
     */
    _drawLifeUp(ctx) {
        if (this.lifeUpTimer <= 0) return;
        const t = 1 - this.lifeUpTimer / EXTRA_LIFE_FLASH_FRAMES;   // 0 → 1
        const alpha = Math.min(1, (1 - t) / 0.4);                    // 最後の 40% で薄れる
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 12px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00CCFF';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('1UP', Math.round(this.x + this.width / 2), Math.round(this.y - 4 - t * 18));
        ctx.restore();
    },

    /**
     * オーバードライブ中の輝き。
     *
     * HUD の残時間バーだけだと視線を下へ外さないと状態が読めないので、
     * 機体そのものにも出す。
     *
     * 効いている間は**金と赤を速く往復**する。金はアイテムの色、赤は過負荷で
     * 焼けている色で、2色が入れ替わり続けることで「無理をして回っている」絵になる。
     * 残り3秒（OVERDRIVE_WARN_TICKS）を切ると**金の成分が残り時間に比例して
     * 抜けていき**、最後は赤だけの明滅になる。効果そのものが色として失われていく
     * ので、しきい値でいきなり演出が切り替わるより読みやすい。
     *
     * 赤一色になっても点滅は続ける必要がある（止まると「切れた」と誤読される）
     * ので、金が抜けるぶんは濃さの差に振り替えている。
     */
    _drawOverdriveGlow(ctx) {
        if (this.overdriveTimer <= 0) return;

        // 金の残り具合。しきい値より前は満量、そこから 0 へ落ちる
        const goldMix = Math.min(1, this.overdriveTimer / OVERDRIVE_WARN_TICKS);
        // 往復の片側だけを金に寄せる。もう片側は常に赤
        const goldPhase = Math.floor(Date.now() / OVERDRIVE_BLINK_MS) % 2 === 1;
        const mix = goldPhase ? goldMix : 0;
        // 金が抜けきったときに点滅が消えないよう、濃さの差へ振り替える
        const dim = goldPhase ? 0.35 + 0.65 * goldMix : 1;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const radius = this.width * OVERDRIVE_GLOW_RADIUS;

        ctx.save();
        // lighter で重ねると地形の上でも色が沈まない（コアの bloom と同じ手）
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        for (const [stop, red, gold, alpha] of OVERDRIVE_GLOW_STOPS) {
            g.addColorStop(stop, mixRgba(red, gold, mix, alpha * dim));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    _drawBody(ctx, x, y, isCrouched, crouchOffset) {
        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        // Body
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(5, 4 + crouchOffset, 10, isCrouched ? 8 : 12);

        // Head
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(6, crouchOffset, 8, 5);
        // Visor
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(10, 1 + crouchOffset, 3, 3);

        // Backpack (hover unit)
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(2, 5 + crouchOffset, 4, isCrouched ? 6 : 8);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(2, (isCrouched ? 10 : 12) + crouchOffset, 4, 2);

        // Legs
        this._drawLegs(ctx, isCrouched);

        ctx.restore();
    },

    _drawLegs(ctx, isCrouched) {
        const joints = this._legJoints(isCrouched);
        if (isCrouched) {
            this._drawCrouchedLegs(ctx, joints);
        } else {
            // 奥脚を先に描く（手前脚が上に重なる）
            for (const j of joints) this._drawSingleLeg(ctx, j);
        }
    },

    /**
     * しゃがみの脚。関節は _legJoints() と同じ座標を使うが、
     * 見た目は通常の脚と別物にしてある。両脚とも同じ明るさで描き（しゃがむと
     * 奥行きが潰れるため）、足は振り子で回らない固定の板を左右に並べる。
     */
    _drawCrouchedLegs(ctx, joints) {
        ctx.strokeStyle = '#DDDDDD';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const j of joints) {
            ctx.beginPath();
            ctx.moveTo(j.hipX, j.hipY);
            ctx.lineTo(j.kx, j.ky);
            ctx.lineTo(j.fx, j.fy);
            ctx.stroke();
        }

        // Feet
        ctx.fillStyle = '#888888';
        ctx.fillRect(4, 21, 5, 3);
        ctx.fillRect(9, 21, 5, 3);
    },

    /**
     * 脚1本の関節座標を求める（描画はしない）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * @param {boolean} isNear 手前脚か
     * @param {number|null} walkPose 歩行ポーズ番号。ホバー中は null
     * @param {number|null} hoverSwing ホバー中の振り子量 -1..+1。接地中は null
     * @returns {{hipX:number,hipY:number,kx:number,ky:number,fx:number,fy:number}}
     */
    _legPose(isNear, walkPose, hoverSwing) {
        const hipX = isNear ? 10 : 7;
        const hipY = 16;
        let kx, ky, fx, fy;

        if (hoverSwing !== null) {
            const maxAngle = Math.PI / 4;
            const angle = hoverSwing * maxAngle;
            const baseKx = isNear ? 1 : -1;
            const baseKy = 3;
            const baseFx = isNear ? 0 : -2;
            const baseFy = 6;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            kx = hipX + (baseKx * cosA - baseKy * sinA);
            ky = hipY + (baseKx * sinA + baseKy * cosA);
            fx = hipX + (baseFx * cosA - baseFy * sinA);
            fy = hipY + (baseFx * sinA + baseFy * cosA);
        } else {
            switch (walkPose) {
                case 0: kx = hipX + 2; ky = hipY + 3; fx = kx + 2; fy = 22; break;
                case 1: kx = hipX - 3; ky = hipY + 3; fx = kx - 2; fy = 20; break;
                case 2: kx = hipX; ky = hipY + 3; fx = kx; fy = 22; break;
                case 3: kx = hipX + 4; ky = hipY + 1; fx = kx - 1; fy = 19; break;
            }
        }

        return { hipX, hipY, kx, ky, fx, fy };
    },

    /**
     * 死亡時の両脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    /**
     * ホバー中の両脚の振り子量。奥脚は位相をずらして左右が揃わないようにする。
     * @returns {Array<[boolean, number]>} [手前脚か, 振り子量 -1..+1]
     */
    _hoverSwings() {
        let localVx = this.facingRight ? this.vx : -this.vx;
        localVx = Math.max(-PLAYER_MAX_SPEED, Math.min(PLAYER_MAX_SPEED, localVx));
        const swing = localVx / PLAYER_MAX_SPEED;
        return [[false, swing * 0.8 - 0.2], [true, swing]];
    },

    /**
     * いまのポーズの両脚の関節座標を、描く順（奥脚→手前脚）で返す。
     * 描画（_drawLegs）と破片生成（_collectLegPoses）の唯一の供給元。
     *
     * @param {boolean} isCrouched しゃがみ姿勢か。draw() の判定をそのまま渡す
     * @returns {Array<{isNear:boolean, hipX:number, hipY:number, kx:number,
     *   ky:number, fx:number, fy:number, walkPose:number|null,
     *   hoverSwing:number|null}>}
     */
    _legJoints(isCrouched) {
        if (isCrouched) {
            return CROUCH_LEG_JOINTS.map((j) => ({ ...j, walkPose: null, hoverSwing: null }));
        }

        if (!this.onGround) {
            return this._hoverSwings().map(([isNear, hoverSwing]) => ({
                isNear, walkPose: null, hoverSwing,
                ...this._legPose(isNear, null, hoverSwing),
            }));
        }

        const frame = WALK_POSES[this.walkFrame] || WALK_POSES[2];
        return [[false, frame.far], [true, frame.near]].map(([isNear, walkPose]) => ({
            isNear, walkPose, hoverSwing: null,
            ...this._legPose(isNear, walkPose, null),
        }));
    },

    /**
     * 死亡時の両脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * 座標そのものは _legJoints() が決める（描画と同じ値）。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        return this._legJoints(this.crouching || this.docked).map((j) => ({
            isNear: j.isNear,
            hipX: j.hipX, hipY: j.hipY,
            kneeX: j.kx, kneeY: j.ky,
            footX: j.fx, footY: j.fy,
            lineWidth: 3,
        }));
    },

    /** 脚1本を描く。関節座標は _legJoints() が決めたものをそのまま使う。 */
    _drawSingleLeg(ctx, joint) {
        const { isNear, hipX, hipY, kx, ky, fx, fy, hoverSwing } = joint;

        // Leg stroke
        ctx.strokeStyle = isNear ? '#DDDDDD' : '#AAAAAA';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();

        // Foot
        ctx.fillStyle = isNear ? '#888888' : '#666666';
        ctx.save();
        ctx.translate(fx, fy);
        if (hoverSwing !== null) {
            ctx.rotate(hoverSwing * Math.PI / 6);
        }
        ctx.fillRect(-2, 0, 5, 2);
        ctx.restore();
    },

    /**
     * 武装の向き（機体ローカル、ラジアン）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * 照準情報が取れない場合（テスト等）は水平前方を返す。
     * @param {number} crouchOffset
     */
    _aimAngle(crouchOffset) {
        const input = this.game && this.game.input;
        if (!input || typeof input.getTargetWorld !== 'function') return 0;

        const targetWorld = input.getTargetWorld(this.game.camera);
        const cx = Math.round(this.x) + this.width / 2;
        const cy = Math.round(this.y) + 6 + crouchOffset;
        const raw = Math.atan2(targetWorld.y - cy, targetWorld.x - cx);
        return this.facingRight ? raw : Math.PI - raw;
    },

    _drawBazooka(ctx, x, y, crouchOffset) {
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;
        const rawAngle = this._aimAngle(crouchOffset);

        ctx.save();
        if (this.facingRight) {
            ctx.translate(cx + 2, cy);
        } else {
            ctx.translate(cx - 2, cy);
            ctx.scale(-1, 1);
        }
        ctx.rotate(rawAngle);

        // Tube
        ctx.fillStyle = '#666666';
        ctx.fillRect(-8, -2, 22, 4);
        // Muzzle
        ctx.fillStyle = '#444444';
        ctx.fillRect(11, -3, 4, 6);
        // Shoulder mount
        ctx.fillStyle = '#999999';
        ctx.fillRect(-3, -3, 6, 6);
        // Detail stripe
        ctx.fillStyle = '#808080';
        ctx.fillRect(-6, -1, 16, 2);

        ctx.restore();
    },

    _drawMachineGun(ctx, x, y, crouchOffset) {
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;
        const rawAngle = this._aimAngle(crouchOffset);

        ctx.save();
        if (this.facingRight) {
            ctx.translate(cx + 2, cy);
        } else {
            ctx.translate(cx - 2, cy);
            ctx.scale(-1, 1);
        }
        ctx.rotate(rawAngle);

        // Receiver / Body
        ctx.fillStyle = '#777777';
        ctx.fillRect(-2, -2, 7, 5);
        // Barrel (shorter and thinner than bazooka)
        ctx.fillStyle = '#666666';
        ctx.fillRect(5, -1, 6, 2);
        // Magazine (vertical box)
        ctx.fillStyle = '#555555';
        ctx.fillRect(0, 2, 3, 4);
        // Stock / Grip
        ctx.fillStyle = '#888888';
        ctx.fillRect(-4, -1, 3, 3);

        ctx.restore();
    },

    _drawHoverExhaust(ctx) {
        if (!this.hovering) return;

        const nozzle = this._hoverNozzle();
        // 残燃料で実際の推力が変わる（HOVER_THRUST → HOVER_THRUST_MIN）ので、
        // 炎の長さも同じ比に合わせる。ホバー音も playHover(fuelRatio) で同じ値を
        // 受けているため、炎・音・推力が1つの値を指すことになる
        const fuelRatio = this.hoverFuel / HOVER_MAX_FUEL;
        drawThrusterFlame(ctx, nozzle.x, nozzle.y, {
            color: COLOR_HOVER_EXHAUST,
            power: fuelRatio,
        });
    },
};
