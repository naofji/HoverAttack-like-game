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
 * ロック中の敵の速度を、中心座標の差分から測る。
 *
 * 敵は種類ごとに移動の実装が違い（vx を積む型、座標を直接動かす型、
 * そもそも動かない砲台）、`vx` を持つとは限らない。実際に描画される中心が
 * どれだけ動いたかを測れば、どの敵にも一様に効く。
 *
 * 1 tick ぶんの差分はぶれるので、指数平滑をかけて照準の揺れを抑える。
 */
export class AimLeadTracker {
    /** @param {number} smoothing 平滑化係数 0..1。1 で平滑化なし（生の差分） */
    constructor(smoothing) {
        this.smoothing = smoothing;
        this.reset();
    }

    /** 追跡状態を捨てる。次の measure() は初回扱いになる。 */
    reset() {
        this.target = null;
        this.lastX = 0;
        this.lastY = 0;
        this.vx = 0;
        this.vy = 0;
    }

    /**
     * 1 tick ぶん計測して、平滑化した速度を返す。
     * 対象が前回と違う敵なら基準を取り直し、速度はゼロから測り直す
     * （前の敵の速度を引き継ぐと、乗り換えた瞬間に的外れな偏差が出る）。
     * @param {{x:number,y:number,width:number,height:number}} enemy
     * @returns {{vx:number, vy:number}}
     */
    measure(enemy) {
        const cx = enemy.x + (enemy.width || 0) / 2;
        const cy = enemy.y + (enemy.height || 0) / 2;

        if (enemy !== this.target) {
            this.target = enemy;
            this.lastX = cx;
            this.lastY = cy;
            this.vx = 0;
            this.vy = 0;
            return { vx: 0, vy: 0 };
        }

        const dx = cx - this.lastX;
        const dy = cy - this.lastY;
        this.lastX = cx;
        this.lastY = cy;

        const a = this.smoothing;
        this.vx += (dx - this.vx) * a;
        this.vy += (dy - this.vy) * a;
        return { vx: this.vx, vy: this.vy };
    }
}
