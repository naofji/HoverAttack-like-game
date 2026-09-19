// ============================================
// EnemyAttacker - 残像（速いフレームだけ引く尾）
// ============================================
//
// 「速く動いている数フレームぶんの自分を、薄い単色で後ろに置く」だけ。
// 挙動（速度・回避・ジグザグ）には一切触らない。出す型は
// ENEMY_ATTACKER_TYPES の `afterimage: true` の行だけ（今は rival）。
//
// **残像の絵は本体の draw() をそのまま再利用する。** 残像用に形を手書きすると
// 脚のアニメと必ずズレていくので、色の代入だけ握りつぶした ctx を渡して
// 同じ描画コードを通す（tintedCtx）。
//
// 速さの判定は hypot(vx, vy) をフレームごとに記録して持つ。「今速いか」で
// 尾全体を出し入れすると、止まった瞬間に3枚が同時に消えてちらつく。
// 1フレームずつ速さを覚えておけば、遅くなった側から順に尾が短くなる。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import {
    RIVAL_AFTERIMAGE_SPEED, RIVAL_AFTERIMAGE_COUNT,
    RIVAL_AFTERIMAGE_INTERVAL, RIVAL_AFTERIMAGE_ALPHA, RIVAL_AFTERIMAGE_COLOR,
} from '../../utils/Constants.js';

/** 履歴の長さ。これ以上古いフレームは、一番遠い残像からも外れるので捨てる。 */
const TRAIL_LEN = RIVAL_AFTERIMAGE_COUNT * RIVAL_AFTERIMAGE_INTERVAL;

/** 素通しするメソッド（draw.js と legs.js が実際に呼ぶものだけ）。 */
const PASS_THROUGH = [
    'save', 'restore', 'translate', 'scale', 'rotate',
    'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillRect', 'strokeRect',
];
/** 素通しするプロパティ（色以外。線の太さや端の形は本体と同じにしたい）。 */
const PASS_THROUGH_PROPS = ['lineWidth', 'lineCap', 'lineJoin'];

/**
 * fillStyle / strokeStyle への代入だけを握りつぶす ctx のラッパ。
 * 色は呼び出し側が1度だけ本物の ctx に入れておき、以降の塗り分けを無視させる。
 *
 * Object.create(ctx) では済まない（canvas のメソッドは `this` が本物の
 * CanvasRenderingContext2D でないと Illegal invocation で落ちる）ので、
 * 使うメソッドだけを明示的に束ねている。
 */
function tintedCtx(ctx) {
    const wrap = {};
    for (const name of PASS_THROUGH) {
        if (typeof ctx[name] === 'function') wrap[name] = (...args) => ctx[name](...args);
    }
    for (const prop of PASS_THROUGH_PROPS) {
        Object.defineProperty(wrap, prop, {
            get() { return ctx[prop]; },
            set(v) { ctx[prop] = v; },
        });
    }
    for (const prop of ['fillStyle', 'strokeStyle']) {
        Object.defineProperty(wrap, prop, {
            get() { return ctx[prop]; },
            set() { /* 単色にするため無視する */ },
        });
    }
    return wrap;
}

export const AttackerAfterimage = {
    /**
     * このフレームの位置と速さを履歴に積む。update() の末尾から毎フレーム呼ぶ。
     * 残像を出さない型では何もしない（履歴も作らない）。
     */
    _recordAfterimage() {
        if (!this.config.afterimage) return;

        if (!this.trail) this.trail = [];
        this.trail.push({
            x: this.x,
            y: this.y,
            // 向きも覚える。振り向いた瞬間に古い残像まで一緒に反転すると、
            // 尾が機体を追い越したように見えて気持ちが悪い
            facingRight: this.facingRight,
            fast: Math.hypot(this.vx, this.vy) > RIVAL_AFTERIMAGE_SPEED,
        });
        if (this.trail.length > TRAIL_LEN) this.trail.shift();
    },

    /**
     * 残像を描く。**本体より先に**呼ぶこと（後から描くと機体の上に被さる）。
     * 遠い（薄い）ものから順に描くので、新しい残像ほど上に乗る。
     */
    _drawAfterimages(ctx) {
        const trail = this.trail;
        if (!trail || trail.length === 0) return;

        const tint = tintedCtx(ctx);
        const trueX = this.x;
        const trueY = this.y;
        const trueFacing = this.facingRight;
        const prevAlpha = ctx.globalAlpha;

        for (let i = RIVAL_AFTERIMAGE_COUNT; i >= 1; i--) {
            const entry = trail[trail.length - i * RIVAL_AFTERIMAGE_INTERVAL];
            // そのフレームが遅ければ、その1枚だけ出ない（尾が根元から短くなる）
            if (!entry || !entry.fast) continue;

            this.x = entry.x;
            this.y = entry.y;
            this.facingRight = entry.facingRight;
            // 本体の draw() を再入する。この旗が立っている間は残像を描かない
            // （無限再帰よけ）し、スラスターの炎も出さない
            this._ghostPass = true;

            // alpha は save/restore ではなく明示的に戻す。draw() の中の
            // save/restore と入れ子になると、どちらが効いているのか読めなくなる
            ctx.globalAlpha = RIVAL_AFTERIMAGE_ALPHA
                * (RIVAL_AFTERIMAGE_COUNT + 1 - i) / RIVAL_AFTERIMAGE_COUNT;
            ctx.fillStyle = RIVAL_AFTERIMAGE_COLOR;
            ctx.strokeStyle = RIVAL_AFTERIMAGE_COLOR;
            this.draw(tint);
            ctx.globalAlpha = prevAlpha;

            this._ghostPass = false;
        }

        this.x = trueX;
        this.y = trueY;
        this.facingRight = trueFacing;
    },
};
