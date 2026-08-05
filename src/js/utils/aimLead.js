// ============================================
// Aim Lead - 動く敵に対する偏差射撃の予測
// ============================================
// 自機の武器（ミサイル / マシンガン）はどちらも直進弾で誘導が無いため、
// 敵の現在位置をそのまま狙うと、動いている敵には常に置いていかれる。
// Auto Aim 中は「弾が届くころに敵がいる場所」を狙わせる。

import { AUTO_AIM_LEAD_ITERATIONS } from './Constants.js';

/**
 * 着弾予定地点を求める。
 *
 * 「弾の飛行時間」と「その時間ぶん敵が進む距離」は互いに依存するので、
 * 反復して収束させる（等速直線運動の仮定なら数回で十分に収まる）。
 *
 * @param {object} o
 * @param {number} o.shooterX 射手の位置
 * @param {number} o.shooterY
 * @param {number} o.targetX 敵の現在位置（中心）
 * @param {number} o.targetY
 * @param {number} o.targetVx 敵の速度（1 tick あたりの移動量）
 * @param {number} o.targetVy
 * @param {number} o.projectileSpeed 弾速（1 tick あたりの移動量）
 * @param {number} o.maxLeadTicks 予測してよい最大の飛行時間。遠くの高速な敵で
 *   予測が暴走して画面外を狙うのを防ぐ
 * @param {number} o.strength 偏差の強さ 0..1。1 で完全に合わせる
 * @returns {{x:number, y:number}}
 */
export function predictLeadPoint(o) {
    const {
        shooterX, shooterY, targetX, targetY,
        targetVx, targetVy, projectileSpeed, maxLeadTicks, strength,
    } = o;

    if (!(projectileSpeed > 0) || strength === 0) {
        return { x: targetX, y: targetY };
    }

    const pointAt = (t) => ({
        x: targetX + targetVx * t * strength,
        y: targetY + targetVy * t * strength,
    });

    let t = 0;
    for (let i = 0; i < AUTO_AIM_LEAD_ITERATIONS; i++) {
        const p = pointAt(t);
        const dist = Math.hypot(p.x - shooterX, p.y - shooterY);
        t = Math.min(dist / projectileSpeed, maxLeadTicks);
    }
    return pointAt(t);
}

/**
 * ロック中の敵の速度を、中心座標の移動から測る。
 *
 * 敵は種類ごとに移動の実装が違い（vx を積む型、座標を直接動かす型、
 * そもそも動かない砲台）、`vx` を持つとは限らない。実際に描画される中心が
 * どれだけ動いたかを測れば、どの敵にも一様に効く。
 *
 * 測るのは「窓のあいだの平均速度」（最新と最古の差 ÷ 区間数）。1 tick の差分や
 * 指数平滑では、実際には動いていない敵の見かけの往復が残ってしまう。
 * 地上の戦車がその例で、着地スナップの都合で中心Yが 3 tick 周期で
 * +0.3 / +0.6 / -0.9 と揺れる。正味の移動はゼロなのに、飛行時間（最大60tick）で
 * 増幅されると照準が激しく振動する。窓で平均すれば往復は打ち消し合う。
 *
 * それでも残る微小な値は、デッドゾーンで完全にゼロへ落とす。
 */
export class AimLeadTracker {
    /**
     * @param {number} window 速度を測る窓のサンプル数（区間数は window - 1）
     * @param {number} deadzone これ未満の速度は 0 とみなす（1 tick あたりの移動量）
     */
    constructor(window, deadzone) {
        this.window = Math.max(2, window);
        this.deadzone = deadzone;
        this.reset();
    }

    /** 追跡状態を捨てる。次の measure() は初回扱いになる。 */
    reset() {
        this.target = null;
        this.samples = [];
    }

    /**
     * 1 tick ぶん計測して、窓のあいだの平均速度を返す。
     * 対象が前回と違う敵なら履歴を捨てて測り直す
     * （前の敵の速度を引き継ぐと、乗り換えた瞬間に的外れな偏差が出る）。
     * @param {{x:number,y:number,width:number,height:number}} enemy
     * @returns {{vx:number, vy:number}}
     */
    measure(enemy) {
        const cx = enemy.x + (enemy.width || 0) / 2;
        const cy = enemy.y + (enemy.height || 0) / 2;

        if (enemy !== this.target) {
            this.target = enemy;
            this.samples = [{ x: cx, y: cy }];
            return { vx: 0, vy: 0 };
        }

        this.samples.push({ x: cx, y: cy });
        if (this.samples.length > this.window) this.samples.shift();

        const n = this.samples.length;
        // 窓が埋まるまでは速度を報告しない。区間数が半端だと、戦車の見かけの
        // 往復が打ち消し合わずに残り、ロック直後だけ照準が飛んでしまう。
        if (n < this.window) return { vx: 0, vy: 0 };

        const oldest = this.samples[0];
        const newest = this.samples[n - 1];
        const span = n - 1;
        return {
            vx: this._applyDeadzone((newest.x - oldest.x) / span),
            vy: this._applyDeadzone((newest.y - oldest.y) / span),
        };
    }

    _applyDeadzone(v) {
        return Math.abs(v) < this.deadzone ? 0 : v;
    }
}
