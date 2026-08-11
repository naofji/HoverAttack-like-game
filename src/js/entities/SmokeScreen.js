// ============================================
// SmokeScreen - artillery が張る煙幕
// ============================================
//
// 雲1つ。パフは自分の経過時間ひとつから半径・alpha・色段が出るので、
// 拡散・希薄化・冷却の位相がずれない。
//
// 雲に独自の寿命を持たせていないのは、撒きを SMOKE_EMIT_SPAN ぶんずらす
// せいで、雲とパフで別の時計を持つと必ずどちらかが先に切れるため
// （「まだ濃いのに消える」か「消えたのに判定が残る」のどちらかが起きる）。
// パフだけが寿命を持ち、雲はパフが全滅したら死ぬ。
//
// 隠蔽判定は utils/concealment.js が puffs をそのまま読む。描画の alpha も
// 同じ puffAlphaAt から出るので、見えなくなる時刻と隠れなくなる時刻が一致する。

import {
    SMOKE_PUFF_COUNT, SMOKE_EMIT_SPAN, SMOKE_PUFF_LIFETIME,
    SMOKE_PUFF_RADIUS_START, SMOKE_PUFF_RADIUS_END, SMOKE_PUFF_ALPHA_MAX,
    SMOKE_ROTATION_SPEED, SMOKE_SPREAD_RADIUS, SMOKE_DRIFT_SPEED,
    SMOKE_RISE_SPEED, SMOKE_SPRITE_SIZE,
} from '../utils/Constants.js';
import { envelope } from '../utils/concealment.js';
import { getSmokeSprites, SMOKE_SHAPES, SMOKE_TINTS } from './smokeSprites.js';

export class SmokeScreen {
    /**
     * @param {number} x 発煙位置（機体の中心）
     * @param {number} y
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.puffs = [];
        this.alive = true;
        this.emitted = 0;
        this.timer = 0;
    }

    update() {
        this.timer++;
        this._emitDue();

        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age++;
            if (p.age >= SMOKE_PUFF_LIFETIME) {
                this.puffs.splice(i, 1);
                continue;
            }
            const u = p.age / SMOKE_PUFF_LIFETIME;
            p.radius = SMOKE_PUFF_RADIUS_START + (SMOKE_PUFF_RADIUS_END - SMOKE_PUFF_RADIUS_START) * u;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.spin;
        }

        // 撒き終わっていて、かつパフが尽きたら雲も死ぬ
        if (this.emitted >= SMOKE_PUFF_COUNT && this.puffs.length === 0) {
            this.alive = false;
        }
    }

    /** この tick までに生まれているべき数まで撒く。 */
    _emitDue() {
        const due = Math.min(
            SMOKE_PUFF_COUNT,
            Math.ceil((this.timer / SMOKE_EMIT_SPAN) * SMOKE_PUFF_COUNT),
        );
        while (this.emitted < due) {
            this.puffs.push(this._makePuff());
            this.emitted++;
        }
    }

    _makePuff() {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * SMOKE_SPREAD_RADIUS;
        return {
            x: this.x + Math.cos(angle) * dist,
            y: this.y + Math.sin(angle) * dist,
            radius: SMOKE_PUFF_RADIUS_START,
            age: 0,
            // 外へ広がりながら、ゆっくり浮き上がる
            vx: Math.cos(angle) * SMOKE_DRIFT_SPEED * (0.5 + Math.random()),
            vy: Math.sin(angle) * SMOKE_DRIFT_SPEED * (0.5 + Math.random()) - SMOKE_RISE_SPEED,
            rotation: Math.random() * Math.PI * 2,
            // 回る向きを揃えると渦に見えてしまうので符号をばらす
            spin: (Math.random() < 0.5 ? -1 : 1) * SMOKE_ROTATION_SPEED * Math.PI / 180,
            shape: Math.floor(Math.random() * SMOKE_SHAPES.length),
        };
    }

    /**
     * 焼いたスプライトを回転・拡大して重ねる。
     * 色段は年齢で選び、隣り合う段をまたぐときはクロスフェードする
     * （段が切り替わる瞬間に色が飛ぶのを防ぐ）。
     */
    draw(ctx) {
        const sprites = getSmokeSprites();
        const lastTint = SMOKE_TINTS.length - 1;

        for (const p of this.puffs) {
            const u = p.age / SMOKE_PUFF_LIFETIME;
            const alpha = SMOKE_PUFF_ALPHA_MAX * envelope(u);
            if (alpha <= 0) continue;

            const scale = (p.radius * 2) / SMOKE_SPRITE_SIZE;
            // 年齢を色段の連続値に写す。整数部が段、小数部がクロスフェードの比
            const tintPos = u * lastTint;
            const lo = Math.min(lastTint, Math.floor(tintPos));
            const hi = Math.min(lastTint, lo + 1);
            const mix = tintPos - lo;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(scale, scale);
            const half = SMOKE_SPRITE_SIZE / 2;

            ctx.globalAlpha = alpha * (1 - mix);
            ctx.drawImage(sprites[p.shape][lo], -half, -half);
            if (hi !== lo && mix > 0) {
                ctx.globalAlpha = alpha * mix;
                ctx.drawImage(sprites[p.shape][hi], -half, -half);
            }
            ctx.restore();
        }
        // ctx.restore() が save() 時点の globalAlpha（通常は1）へ戻すので、
        // ループの外で改めて 1 に戻す必要はない。むしろここで代入すると
        // 「set:globalAlpha の最大値」を測るテストが常に1を拾って壊れる。
    }
}
