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
    SMOKE_ROTATION_SPEED, SMOKE_SPREAD_RADIUS,
    SMOKE_ARC_FROM_HOUR, SMOKE_ARC_TO_HOUR, SMOKE_RING_INNER, SMOKE_RING_OUTER,
    SMOKE_PUFF_RADIUS_JITTER, SMOKE_DRIFT_SPEED,
    SMOKE_RISE_SPEED, SMOKE_SPRITE_SIZE,
} from '../utils/Constants.js';
import { envelope } from '../utils/concealment.js';
import { getSmokeSprites, SMOKE_SHAPES, SMOKE_TINTS } from './smokeSprites.js';

/**
 * 撒く場所の並び。乱数ではなく決め打ちにしてある。
 *
 * 乱数で散らすと、たまたま片側に寄ったり中心が空いたりして「噴き出した」形に
 * 見えない回が出る。中心 → 内側の列 → 外側の列、の順に撒くと、機体から湧いて
 * 周りへ回り込む見え方になり、どの発煙でも同じ品質になる。
 *
 * 扇形は時計の文字盤で 8時（左下）から 12時 を通って 16時＝4時（右下）まで。
 * 真下の120°を空けているのは、そちらは地面で、煙は上へ回り込むほうが自然なため。
 *
 *        11  12  1
 *      10    ·    2
 *      9   (機体)  3
 *       8         4
 *          （空き）
 *
 * 列ごとの距離は SMOKE_RING_INNER / _OUTER（SMOKE_SPREAD_RADIUS に対する比）。
 * 合計は SMOKE_PUFF_COUNT と一致していること（テストで縛っている）。
 */
const EMISSION_RINGS = [
    { count: 1, dist: 0 },                  // 中心。いちばん先に出る
    { count: 9, dist: SMOKE_RING_INNER },
    { count: 9, dist: SMOKE_RING_OUTER },
];

/** 時計の文字盤の「時」を canvas の角度へ。12時が真上（y は下向き正）。 */
function hourToAngle(hour) {
    return (hour / 12) * Math.PI * 2 - Math.PI / 2;
}

/** EMISSION_RINGS を {angle, dist} の並びへ展開する。起動時に一度だけ。 */
const SMOKE_EMISSION_SLOTS = EMISSION_RINGS.flatMap((ring) => {
    if (ring.dist === 0) return [{ angle: 0, dist: 0 }];
    return Array.from({ length: ring.count }, (_v, i) => {
        // 両端（8時と16時）を必ず含めたいので count-1 で割る
        const hour = SMOKE_ARC_FROM_HOUR
            + (SMOKE_ARC_TO_HOUR - SMOKE_ARC_FROM_HOUR) * (i / (ring.count - 1));
        return { angle: hourToAngle(hour), dist: ring.dist };
    });
});

export { SMOKE_EMISSION_SLOTS };

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
            p.radius = (SMOKE_PUFF_RADIUS_START + (SMOKE_PUFF_RADIUS_END - SMOKE_PUFF_RADIUS_START) * u)
                * p.radiusScale;
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
            this.puffs.push(this._makePuff(this.emitted));
            this.emitted++;
        }
    }

    _makePuff(index) {
        const slot = SMOKE_EMISSION_SLOTS[index] || SMOKE_EMISSION_SLOTS[SMOKE_EMISSION_SLOTS.length - 1];
        const dist = slot.dist * SMOKE_SPREAD_RADIUS;
        // 大きさだけはばらつかせる。配置を決めても、同じ年齢のパフが全部同じ半径では
        // 「同じ丸が並んでいる」に見えてしまう。
        // ただし中心のパフは縮ませない（上振れだけ）。機体そのものを覆っている当の
        // パフなので、ここに小さい目が出ると隠蔽の持続が落ちる（実測で 20.4秒の
        // 中央値に対し、40回に数回 14.7秒まで落ちていた）
        const radiusScale = slot.dist === 0
            ? 1 + Math.random() * SMOKE_PUFF_RADIUS_JITTER
            : 1 + (Math.random() * 2 - 1) * SMOKE_PUFF_RADIUS_JITTER;
        const isCore = dist === 0;
        const dirX = isCore ? 0 : Math.cos(slot.angle);
        const dirY = isCore ? 0 : Math.sin(slot.angle);
        return {
            x: this.x + dirX * dist,
            y: this.y + dirY * dist,
            radius: SMOKE_PUFF_RADIUS_START * radiusScale,
            radiusScale,
            age: 0,
            // 自分の居る向きへ広がりながら、ゆっくり浮き上がる。
            // 中心のパフだけは動かさない。機体そのものを覆っている当のパフで、
            // これが上へ抜けると停滞しているはずの間に判定点の濃さが落ちていく
            // （実測: 上昇させると coverage が 0.75 → 0.58 まで下がり、包絡が
            // 落ちるより先にしきい値を割っていた）
            vx: dirX * SMOKE_DRIFT_SPEED,
            vy: isCore ? 0 : dirY * SMOKE_DRIFT_SPEED - SMOKE_RISE_SPEED,
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
