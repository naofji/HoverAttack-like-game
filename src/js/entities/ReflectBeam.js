// ============================================
// ReflectBeam - 地形で跳ね返るビーム
// ============================================
//
// 7面の反射ビームキャノンが撃つ。母艦レーザー（BaseLaser）とは別物で、
// あちらは速度12の直線が地形を貫通する。こちらは遅く、地形で跳ねる。
//
// 当たり判定は**帯全体**（ユーザーの決定）。見えている帯と当たる帯が食い違うと
// そのまま理不尽さになるので、描画も CollisionManager も segments() の
// 同じ戻り値を使う。判定そのものは CollisionManager が持つ（他の弾と同じ分担）。

import {
    REFLECT_BEAM_SPEED, REFLECT_BEAM_TAIL_SEGMENTS, REFLECT_BEAM_TAIL_LENGTH,
    REFLECT_BEAM_WIDTH, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
    COLOR_REFLECT_BEAM_CORE, COLOR_REFLECT_BEAM_MID, COLOR_REFLECT_BEAM_EDGE,
} from '../utils/Constants.js';
import { beamSegments, stepBeam } from '../utils/beamPath.js';

export class ReflectBeam {
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * REFLECT_BEAM_SPEED;
        this.vy = Math.sin(angle) * REFLECT_BEAM_SPEED;
        this.alive = true;
        this.bounces = 0;
        this.distance = 0;
        // 通った経路。**[0] が先端**。反射の折れ点は「反射前の位置」なので、
        // 毎フレーム先端を積むだけで折れ線として正しくなる
        this.path = [{ x, y }];
        // 帯に必要なぶんだけ残す。速度4・帯160px なら 40節ぶん + 余裕
        this.maxNodes = Math.ceil(REFLECT_BEAM_TAIL_LENGTH / REFLECT_BEAM_SPEED) + 2;
        // CollisionManager が「点ではなく帯で見る」相手だと見分けるための印
        this.isReflectBeam = true;
    }

    update() {
        if (!this.alive) return;

        const next = stepBeam(this, this.game.map);
        this.x = next.x;
        this.y = next.y;
        this.vx = next.vx;
        this.vy = next.vy;
        if (next.bounced) this.bounces++;

        this.distance += REFLECT_BEAM_SPEED;
        this.path.unshift({ x: this.x, y: this.y });
        if (this.path.length > this.maxNodes) this.path.length = this.maxNodes;

        if (this.bounces > REFLECT_BEAM_MAX_BOUNCES) this.alive = false;
        if (this.distance >= REFLECT_BEAM_MAX_DISTANCE) this.alive = false;

        // マップ外（BaseLaser と同じ扱い）
        const map = this.game.map;
        if (map && map.width !== undefined) {
            if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
                this.alive = false;
            }
        }
    }

    /** 今この瞬間の帯。描画と当たり判定が**同じものを**使う。 */
    segments() {
        return beamSegments(this.path, REFLECT_BEAM_TAIL_LENGTH, REFLECT_BEAM_TAIL_SEGMENTS);
    }

    draw(ctx) {
        if (!this.alive) return;
        const segs = this.segments();
        if (segs.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 外周（暗紫）→ 中間 → 芯（白っぽい紫）の順に重ねる。3回なぞるだけで
        // 断面のグラデーションに見える。節ごとに描くので折れ点でも途切れない
        const passes = [
            { color: COLOR_REFLECT_BEAM_EDGE, width: REFLECT_BEAM_WIDTH + 4 },
            { color: COLOR_REFLECT_BEAM_MID, width: REFLECT_BEAM_WIDTH },
            { color: COLOR_REFLECT_BEAM_CORE, width: Math.max(1, REFLECT_BEAM_WIDTH * 0.4) },
        ];
        for (const pass of passes) {
            ctx.strokeStyle = pass.color;
            ctx.lineWidth = pass.width;
            ctx.beginPath();
            for (const s of segs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}
