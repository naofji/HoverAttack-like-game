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
//
// 帯は「節を積み上げ、節ごとに寿命で消える」形にしてある（beamPath.js 参照）。
// 固定長で切り出す旧方式は、節が反射の折れ点をまたぐと角をショートカットする
// 直線になり、反射のたびに帯が角でがたついて見えた。反射の瞬間に節を閉じれば
// その問題が消える。上限に達したときも帯ごと一瞬で消さず、先端だけ止めて
// （spent）節を後ろから寿命切れさせることで、唐突さを無くしている。

import {
    REFLECT_BEAM_SPEED, REFLECT_BEAM_SEGMENT_FRAMES, REFLECT_BEAM_SEGMENT_LIFE,
    REFLECT_BEAM_WIDTH, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
    COLOR_REFLECT_BEAM_CORE, COLOR_REFLECT_BEAM_MID, COLOR_REFLECT_BEAM_EDGE,
} from '../utils/Constants.js';
import { ageSegments, stepBeam } from '../utils/beamPath.js';
import { audioManager } from '../audio/AudioManager.js';

export class ReflectBeam {
    constructor(game, x, y, angle, { silent = false } = {}) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * REFLECT_BEAM_SPEED;
        this.vy = Math.sin(angle) * REFLECT_BEAM_SPEED;
        this.bounces = 0;
        this.distance = 0;

        // 今伸びている途中の節。segStart が始点、(this.x, this.y) が終点。
        // SEGMENT_FRAMES ごと・反射の瞬間に閉じて segs へ積む
        this.segStart = { x, y };
        this.segFrames = 0;
        // 閉じ終わった節。[0] が最新（先端側）。beamPath.ageSegments() で歳を取る
        this.segs = [];
        // 先端が止まったか。alive は segs が残っている間 true のまま
        // （spent の瞬間に alive を false にすると、節が残っているのに
        // CollisionManager が enemyBullets から取り除いてしまう）
        this.spent = false;
        this.alive = true;
        // CollisionManager が「点ではなく帯で見る」相手だと見分けるための印
        this.isReflectBeam = true;

        // 1発が2本の扇型になったため、本ごとに鳴らすと同一座標・同一フレームで
        // playWeapon が2回走り、ほぼコヒーレントに加算されて実効+6dBになる
        // （1本ぶんの実測が敵マシンガン比+4.99dBで既に上限際のため、2本鳴らすと
        // 実機で+11dB相当になっていた）。gain を下げるのではなく、扇の2本目以降を
        // silent にして「1回の攻撃につき1回だけ鳴らす」形にする
        // （EnemyTurret._executeAttack() が最初の1本だけ silent: false で生成する）
        if (!silent) audioManager.playWeapon('reflectBeam', x, y);
    }

    /** 開いている節を (endX, endY) で閉じて segs の先頭へ積む。長さ0なら積まない（反射直後にすぐ上限へ達した場合など） */
    _closeSegment(endX, endY) {
        const { x: sx, y: sy } = this.segStart;
        if (sx === endX && sy === endY) return;
        this.segs.unshift({ x1: sx, y1: sy, x2: endX, y2: endY, life: REFLECT_BEAM_SEGMENT_LIFE });
    }

    update() {
        if (!this.alive) return;

        if (this.spent) {
            // 先端は止まったまま。節だけ歳を取らせ、尽きたら消す
            this.segs = ageSegments(this.segs);
            if (this.segs.length === 0) this.alive = false;
            return;
        }

        const next = stepBeam(this, this.game.map);

        if (next.bounced) {
            // 反射点（＝現在位置。stepBeam は元の位置から新しい速度で動かす）で
            // 節を閉じる。閉じずに伸ばし続けると、節が折れ点をまたいで角を
            // ショートカットする直線になり、反射のたびに帯が角でがたついて見えた
            this._closeSegment(this.x, this.y);
            this.segStart = { x: this.x, y: this.y };
            this.segFrames = 0;
            this.bounces++;
        }

        this.x = next.x;
        this.y = next.y;
        this.vx = next.vx;
        this.vy = next.vy;
        this.distance += REFLECT_BEAM_SPEED;
        this.segFrames++;

        if (this.segFrames >= REFLECT_BEAM_SEGMENT_FRAMES) {
            this._closeSegment(this.x, this.y);
            this.segStart = { x: this.x, y: this.y };
            this.segFrames = 0;
        }

        this.segs = ageSegments(this.segs);

        // マップ外（BaseLaser と同じ扱い）
        const map = this.game.map;
        const outOfMap = map && map.width !== undefined
            && (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height);

        // 設計上は「上限に達したら先端を止める」。distance 側の判定が `>=` なのに
        // 揃える（`>` のままだと上限回数を跳ねた後もう1回生き残ってしまい、
        // 実質の反射回数が設計より1回多くなっていた：旧実装の教訓）
        if (this.bounces >= REFLECT_BEAM_MAX_BOUNCES || this.distance >= REFLECT_BEAM_MAX_DISTANCE || outOfMap) {
            // 先端を止める前に、伸びかけの節を今の位置で閉じる。閉じないと
            // その節だけ segs に入らず歳を取らないまま残り続けて消えなくなる
            this._closeSegment(this.x, this.y);
            this.segStart = { x: this.x, y: this.y };
            this.spent = true;
        }
    }

    /** 今この瞬間の帯。伸びている途中の節も含める（先端が見えないと不自然）。描画と当たり判定が**同じものを**使う。 */
    segments() {
        const open = this._openSegment();
        return open ? [open, ...this.segs] : [...this.segs];
    }

    /** 伸びている途中の節。閉じた瞬間や spent 中は始点＝終点になるので null */
    _openSegment() {
        if (this.spent) return null;
        const { x: sx, y: sy } = this.segStart;
        if (sx === this.x && sy === this.y) return null;
        // 伸びている途中の節は常に最新なので寿命は満タン扱い
        return { x1: sx, y1: sy, x2: this.x, y2: this.y, life: REFLECT_BEAM_SEGMENT_LIFE };
    }

    draw(ctx) {
        if (!this.alive) return;
        const segs = this.segments();
        if (segs.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 外周（暗紫）→ 中間 → 芯（白っぽい紫）の順に重ねる。3回なぞるだけで
        // 断面のグラデーションに見える。節ごとに描くので折れ点でも途切れない。
        // 節ごとに globalAlpha を寿命に応じて下げ、古い節ほど薄くする
        // （唐突に消えず、後ろからぼやけながら消えていくように）
        const passes = [
            { color: COLOR_REFLECT_BEAM_EDGE, width: REFLECT_BEAM_WIDTH + 4 },
            { color: COLOR_REFLECT_BEAM_MID, width: REFLECT_BEAM_WIDTH },
            { color: COLOR_REFLECT_BEAM_CORE, width: Math.max(1, REFLECT_BEAM_WIDTH * 0.4) },
        ];
        for (const seg of segs) {
            ctx.globalAlpha = seg.life / REFLECT_BEAM_SEGMENT_LIFE;
            for (const pass of passes) {
                ctx.strokeStyle = pass.color;
                ctx.lineWidth = pass.width;
                ctx.beginPath();
                ctx.moveTo(seg.x1, seg.y1);
                ctx.lineTo(seg.x2, seg.y2);
                ctx.stroke();
            }
        }

        // 戻し忘れると以降の描画が全部薄くなる
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
