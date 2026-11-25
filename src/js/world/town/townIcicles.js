// ============================================
// Town: 5面のつらら（当たると欠けずに震え、震え終わると全体が落ちる・刺さって沈む）
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import {
    TILE_SIZE, SNOWTREE_FLURRY_TRICKLE_STEP, ICICLE_SHAKE_TICKS, ICICLE_SHAKE_AMPLITUDE, ICICLE_DRIP_EVERY,
    ICICLE_SHARDS, ICICLE_TRAIL_EVERY, ICICLE_TRAIL_COUNT, ICICLE_SINK_SPEED, ICICLE_POWDER,
} from '../../utils/Constants.js';

export const TownIcicles = {
    /**
     * 落ちるつららを 1 tick 進める。落ちている間は、機体に当てる・下の建物を欠かす・粉雪を舞わせる。
     * 先（先のかけらの真ん中）が岩に触れたら、砕けずに先からめり込み始める（_sinkIcicle）。
     * 触れたかを先の位置で見るのは、外接矩形の下の角で見ると、足場の縁が角だけに掛かったときに先が空中のまま触れた扱いになるため
     */
    _updateIcicle(p, game) {
        if (p.sinking) { this._sinkIcicle(p); return; }
        p.step();
        this._fallImpact(p, game);   // 触れる tick にも当てる
        const tx = p.tipX, ty = p.y + p.height;
        this._chipBelow(p, tx, ty);
        if (p.age % ICICLE_TRAIL_EVERY === 0) {
            // 粉雪を体に沿って舞わせる。位置は経過 tick から決める（上下に行き来する。シミュレーションに乱数を使わない）
            this._emit('leaf', tx, p.y + p.height * ((p.age * SNOWTREE_FLURRY_TRICKLE_STEP) % 1),
                { count: ICICLE_TRAIL_COUNT, flora: this._floraOf(p), mode: 'dust', spread: p.width / 2 });
        }
        if (this._solidAtPixel(tx, ty)) {
            p.sinking = true;
            p.vy = 0;
            p.groundY = Math.floor(ty / TILE_SIZE) * TILE_SIZE;
            this._emit('leaf', tx, p.groundY, { count: ICICLE_POWDER.land, flora: this._floraOf(p), mode: 'powder', spread: 3 });
            this._emit('iceSound', tx, p.groundY, { kind: 'sink' });
        }
    },

    /**
     * めり込み中のつらら。一定の速さで下がり（重力は使わない）、地面の線から大きめの粉雪を出し続け、
     * 頭が地面の線より下に潜りきったら最後にもう一度出して消える。めり込み中は機体に当てない
     * （先が床に刺さった状態。床に立つ機体にまで当てると、避けようのない当たりになる）。描画は IcicleFall.draw が地面の線で切る
     */
    _sinkIcicle(p) {
        p.y += ICICLE_SINK_SPEED;
        const depth = p.y + p.height - p.groundY;   // 先が地面の線より下へ入った深さ
        const done = p.y >= p.groundY;
        // 粉雪の広がりは、潜って太い所が地面の線に来るほど広がる（先は細いので、最初は狭い）
        const spread = Math.min(p.width / 2, 2 + depth * 0.15);
        this._emit('leaf', p.tipX, p.groundY, { count: done ? ICICLE_POWDER.end : ICICLE_POWDER.sink, flora: this._floraOf(p), mode: 'powder', spread });
        if (done) p.alive = false;
    },

    /**
     * もろい建物（つらら）が当たった。欠かさずに震え始める。一度震えたら、追加の当たりは時間を延ばさず、粒も出さない
     * @returns {number} 震え始めたら 1、すでに震えた・空なら 0（chip の戻り値「欠けたかけらの数」に合わせた）
     */
    _shake(b, x, y) {
        if (b.shaken || b.remaining === 0) return 0;
        b.shaken = true;
        b.shakeLeft = ICICLE_SHAKE_TICKS;
        this.shaking.push(b);
        this._emit('leaf', x, y, { count: ICICLE_SHARDS.hit, flora: b.flora, mode: 'hit', spread: 3 });
        this._emit('iceSound', x, y, { kind: 'shake' });
        return 1;
    },

    /**
     * 震えているつららを 1 tick 進める。震えが終わったら全体を落とす。先から水滴の粒を ICICLE_DRIP_EVERY tick おきに落とす（予兆）。
     * 震えている間に支えの岩が壊れて、すでに落ちた（remaining 0）つららは、時間切れで二重に落とさない
     */
    _updateShaking() {
        for (const b of this.shaking) {
            if (b.remaining === 0) { b.shakeLeft = 0; continue; }
            b.shakeLeft--;
            if (b.shakeLeft > 0 && b.shakeLeft % ICICLE_DRIP_EVERY === 0) {
                this._emit('leaf', b.x + b.footX, b.y + b.height, { count: 1, flora: b.flora, mode: 'drip', spread: 1 });
            }
            if (b.shakeLeft <= 0) this._releaseWhole(b);
        }
        this.shaking = this.shaking.filter((b) => b.shakeLeft > 0);
    },

    /** 建物の残りのかけら全部を 1 つの塊にして切り離す（つららが落ち始める） */
    _releaseWhole(b) {
        const group = [];
        for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) group.push(k);
        if (group.length > 0) this._detach(b, group);
    },

    /** 震えている間の描画の横ずれ（px）。偶数・奇数 tick で左右。描画だけで、当たりと支えは動かさない */
    _shakeOffset(b) {
        if (b.shakeLeft <= 0) return 0;
        return (b.shakeLeft % 2 === 0 ? 1 : -1) * ICICLE_SHAKE_AMPLITUDE;
    },
};
