// ============================================
// Town: 弾の当たり（弾・ミサイル・グレネードの跳ね返り・反射ビーム）
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import { SOLID } from './chunks.js';
import { bounceOffTown } from '../../utils/grenadePhysics.js';
import { surfaceNormal } from './surfaceNormal.js';
import { TOWN_PROJECTILE_IMPACT, TOWN_SWEEP_STEP, TOWN_BOUNCE_NORMAL_RADIUS } from '../../utils/Constants.js';

const NONE = new Set();

export const TownProjectiles = {
    /**
     * 弾と建物の当たり。前の位置（tick の頭に記録した _prevX）から今の位置まで TOWN_SWEEP_STEP 刻みで
     * 調べる。厚い壁に当たったら当たった所を欠かせて p.onTownWall(x, y)。細い部品は 1棟1回欠かせて
     * 飛び続ける（表の thin）。
     *
     * 町の当たり方のルール（ユーザー整理 2026-11-01。実装はこの関数と SpawnEffects.spawnExplosion の2か所だけ）:
     *   1) 撃った位置に重なる建物は、その弾では無視する（通過する）。機体は建物の手前に重なって描かれるので、
     *      建物の前で撃つと撃った瞬間に目の前の壁で消えてしまう。弾を最初に見た tick で、発射位置に重なる建物を
     *      その弾の「無視する建物」として覚える。敵も自機も同じ。逆の「的が重なっている建物を素通りして的に届く」規則は無い
     *      （撃たれる側が建物に重なっていても、建物は弾を止める。遮蔽は建物のあるところ全部）
     *   2) 自機側の弾は建物に当たり、欠かせる・火をつける・誘爆させる（TOWN_PROJECTILE_IMPACT の表のとおり）
     *   3) 敵の弾（p.isPlayerOwned === false）も建物に当たる（止まる・跳ね返る）が、建物は無傷（欠かさない・火も誘爆も無し）。
     *      町は敵の陣地で、敵の攻撃は friendly fire。待ちの面で敵が町を壊し尽くすと、自機が着いたときには何も残らない
     *   草) 弾を通す建物（b.pass、4面の草）は止めず・跳ね返さず、1発につき1棟1回 passChip の半径で欠ける
     *      （ユーザー指定 2026-11-27）。敵の弾は上の 3) と同じく無傷で通る。予測の弾（p.preview、グレネードの軌道）も欠かさない
     *   例外) vulnerable（自機・母艦が重なっている建物の番号）だけは、敵の弾でも欠け、火がつく。無傷で弾を止めると、
     *      自機は建物に重なっているだけで完全防御できてしまう（ユーザー指摘）。削れて壊れれば遮蔽でなくなる
     * @param {Set<number>} vulnerable 自機・母艦が重なっている建物。敵の弾でも欠ける（buildingsUnder() で作る）
     */
    sweepProjectile(p, vulnerable = NONE) {
        const spec = TOWN_PROJECTILE_IMPACT[p.townKind];
        if (!spec || !p.alive || p.exploded) return;
        // 敵の弾は当たる（止まる）が、建物には何も起こさない。例外の建物（vulnerable）だけ自機側の弾と同じ
        const enemy = p.isPlayerOwned === false;
        const harmless = (b) => p.preview === true || (enemy && !vulnerable.has(b.id));
        if (spec.pierce) {
            if (!enemy) this._sweepBeam(p, spec);
            else if (vulnerable.size > 0) this._sweepBeam(p, spec, vulnerable);
            return;
        }
        // 発射したその tick は tick の頭の位置の記録が無い。1 tick 前の位置は x - vx で見積もる
        const x0 = p._prevX !== undefined ? p._prevX : p.x - (p.vx || 0);
        const y0 = p._prevY !== undefined ? p._prevY : p.y - (p.vy || 0);
        let st = this._projState.get(p);
        if (!st) {
            st = { ignore: new Set(this.buildingsAt(x0, y0).map((b) => b.id)), thin: new Set() };
            this._projState.set(p, st);
        }
        const n = Math.max(1, Math.ceil(Math.hypot(p.x - x0, p.y - y0) / TOWN_SWEEP_STEP));
        // 跳ね返す弾（グレネード）が側面か上面かを見るための、止まる壁の判定。ignore は本体の判定と同じ
        const wallAt = (x, y) => this.buildingsAt(x, y).some((b) => {
            if (st.ignore.has(b.id) || b.pass) return false;
            const k = this.cellAt(b, x, y);
            return k >= 0 && b.cells[k] && (b.cells[k] & SOLID);
        });
        for (let s = 1; s <= n; s++) {
            const px = x0 + ((p.x - x0) * s) / n;
            const py = y0 + ((p.y - y0) * s) / n;
            for (const b of this.buildingsAt(px, py)) {
                if (st.ignore.has(b.id)) continue;
                const k = this.cellAt(b, px, py);
                if (k < 0 || !b.cells[k]) continue;
                if (b.pass) {
                    // 草は通す。欠けるのは最初に触れた所の1回だけ（厚さのぶん毎歩欠かすと、弾の通り道が草を刈り取る溝になる）
                    if (!st.thin.has(b.id)) {
                        st.thin.add(b.id);
                        if (!harmless(b) && spec.passChip > 0) this.chip(b, px, py, spec.passChip * this.chipScale);
                    }
                    continue;
                }
                if (b.cells[k] & SOLID) {
                    if (spec.bounce) {
                        // 壁に入る一歩手前の点まで戻し、動いた軸で側面（横）か上面（縦）かを見て跳ね返す。
                        // 欠かさず火もつけない。その tick の残りの距離は動かさない（次の tick から新しい速度で進む）
                        const qx = x0 + ((p.x - x0) * (s - 1)) / n;
                        const qy = y0 + ((p.y - y0) * (s - 1)) / n;
                        // 面の向きはかけらの並びから推定する（木の斜めの面を縦横の軸に丸めない）。
                        // 推定できないとき（薄い壁など）だけ、動いた軸で側面か上面かを見る
                        bounceOffTown(p, wallAt(px, qy), wallAt(qx, py), surfaceNormal(wallAt, px, py, TOWN_BOUNCE_NORMAL_RADIUS));
                        p.x = qx;
                        p.y = qy;
                        return;
                    }
                    if (!harmless(b)) {
                        if (spec.chip > 0) this.chip(b, px, py, spec.chip * this.chipScale);
                        if (spec.ignite) this.fire.igniteByBullet(b, px, py);
                    }
                    p.onTownWall(px, py);
                    return;
                }
                if (spec.thin === 'chip' && !st.thin.has(b.id)) {
                    st.thin.add(b.id);
                    if (!harmless(b)) {
                        this.chip(b, px, py, spec.chip * this.chipScale);
                        if (spec.ignite) this.fire.igniteByBullet(b, px, py);
                    }
                }
            }
        }
    },

    /**
     * 反射ビーム。帯全体（描画・CollisionManager と同じ segments()）を TOWN_SWEEP_STEP 刻みで調べ、
     * かけらに触れた建物を1発につき1棟1回欠かせる。止まらない。
     * only: 敵のビームのとき、欠かしてよい建物の番号（自機・母艦が重なっている建物）。null なら全部
     */
    _sweepBeam(p, spec, only = null) {
        let st = this._projState.get(p);
        if (!st) { st = { chipped: new Set() }; this._projState.set(p, st); }
        for (const sg of p.segments()) {
            const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) / TOWN_SWEEP_STEP));
            for (let s = 0; s <= n; s++) {
                const px = sg.x1 + ((sg.x2 - sg.x1) * s) / n;
                const py = sg.y1 + ((sg.y2 - sg.y1) * s) / n;
                for (const b of this.buildingsAt(px, py)) {
                    if (st.chipped.has(b.id) || (only && !only.has(b.id))) continue;
                    const k = this.cellAt(b, px, py);
                    if (k < 0 || !b.cells[k]) continue;
                    st.chipped.add(b.id);
                    this.chip(b, px, py, spec.chip * this.chipScale);
                }
            }
        }
    },
};
