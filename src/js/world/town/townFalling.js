// ============================================
// Town: 落ちるもの（落ちる破片・倒れる木・瓦礫の山・落ちてきたものが機体に当たる）
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import { CHUNK, MAT_MASK, MAT_EXPLOSIVE, MAT_PLANT, MAT_ICE } from './chunks.js';
import { TOWN_RUBBLE_COLORS } from './palette.js';
import { FallingPiece } from './FallingPiece.js';
import { impactTargets, applyImpact } from '../../utils/impactDamage.js';
import {
    TOWN_FALLING_MAX, TILE_SIZE, TOWN_FALL_CHIP_RADIUS, TOWN_SHATTER_PARTICLES, TOWN_RUBBLE_MAX_H,
    PLANT_LEAF_PARTICLES_FALL, SNOWTREE_TOPPLE_LIE_TICKS, SNOWTREE_TOPPLE_PUFFS,
    SNOWTREE_TOPPLE_PUFF_PARTICLES, SNOWTREE_FLURRY_TRICKLE_EVERY, SNOWTREE_FLURRY_TRICKLE,
    SNOWTREE_FLURRY_LIE_EVERY, SNOWTREE_FLURRY_LIE_PARTICLES, SNOWTREE_FLURRY_SPREAD,
    SNOWTREE_FLURRY_TRICKLE_STEP, ICICLE_SHARDS,
} from '../../utils/Constants.js';

export const TownFalling = {
    _updateFalling(game) {
        // 写しで回す: 欠けが新しい破片を足したり、上限で古い破片を消したりするため。
        // 新しく増えた破片は次の tick から動く
        for (const p of [...this.falling]) {
            if (!p.alive) continue;
            if (p.topple) { this._updateTopple(p); continue; }
            if (p.icicle) { this._updateIcicle(p, game); continue; }
            p.step();
            if (p.damage > 0) this._fallImpact(p, game);   // 6面のクレーンの荷
            const by = p.y + p.height;
            this._chipBelow(p, p.cx, by);
            // 下端の左・中・右のどれかが岩に入ったら砕ける。盤面の外は岩（Map.isSolid と同じ）なので
            // 盤面の下へ抜けることはない
            if ([p.x + 2, p.cx, p.x + p.width - 2].some((sx) => this._solidAtPixel(sx, by))) this._shatter(p, by);
        }
        this.falling = this.falling.filter((p) => p.alive);
    },

    /** 落ちる破片が下の建物を欠かす（(x, y) の建物のかけらを、1 棟 1 回。燃えている破片は燃え移る。spec 3章） */
    _chipBelow(p, x, y) {
        for (const b of this.buildingsAt(x, y)) {
            const k = this.cellAt(b, x, y);
            if (p.hitIds.has(b.id) || k < 0 || !b.cells[k]) continue;
            p.hitIds.add(b.id);
            this.chip(b, x, y, TOWN_FALL_CHIP_RADIUS);
            if (p.fireFuel > 0) this.fire.igniteNear(b, x, y, TOWN_FALL_CHIP_RADIUS + CHUNK);
        }
    },

    /**
     * 倒れる木（ToppleTree）を 1 tick 進める。軸（根元）が岩か切り株に乗っていれば傾くだけ、乗っていなければ落ちながら傾く。
     * 軸が岩に入り込んだら、岩の上に乗せ直す。落ちる軸は、下の建物のかけら（隣の木・切り株）の上に乗って止まる
     * （ふつうの破片のように欠かさない。木の根元が隣の木にめり込んで、欠けて落ちる、を避ける）。
     * 横たわったら、木の長さに沿って雪の粒を数回に分けて出し（1か所で一斉に出すと爆発に見える）、薄れて消える
     */
    _updateTopple(p) {
        const supported = this._supportedAt(p.pivotX, p.pivotY);
        const landed = p.advance(supported);
        if (!supported && this._solidAtPixel(p.pivotX, p.pivotY)) {
            p.y = Math.floor(p.pivotY / TILE_SIZE) * TILE_SIZE - p.py;
            p.vy = 0;
        }
        if (!p.lying && p.age % SNOWTREE_FLURRY_TRICKLE_EVERY === 0) {
            // 倒れているあいだ、木に沿って雪がこぼれる。位置は経過 tick から決める（木の上を行き来する。シミュレーションに乱数を使わない）
            const pt = p.pointAlong(p.height * ((p.age * SNOWTREE_FLURRY_TRICKLE_STEP) % 1));
            this._emit('leaf', pt.x, pt.y, { count: SNOWTREE_FLURRY_TRICKLE, flora: this._floraOf(p), spread: SNOWTREE_FLURRY_SPREAD.trickle, mode: 'shake' });
        }
        if (p.lying && !landed && (SNOWTREE_TOPPLE_LIE_TICKS - p.lieLeft) % SNOWTREE_FLURRY_LIE_EVERY === 0) {
            // 横たわって薄れていくあいだも、倒れた木から雪が舞い上がる（位置は経過 tick から決める）
            const pt = p.pointAlong(p.height * ((p.age * SNOWTREE_FLURRY_TRICKLE_STEP) % 1));
            this._emit('leaf', pt.x, pt.y, { count: SNOWTREE_FLURRY_LIE_PARTICLES, flora: this._floraOf(p), spread: SNOWTREE_FLURRY_SPREAD.puff, mode: 'puff' });
        }
        if (landed) {
            const length = p.height;   // 倒れた木の長さ（もとの高さ）
            for (let i = 1; i <= SNOWTREE_TOPPLE_PUFFS; i++) {
                const pt = p.pointAlong((length * i) / (SNOWTREE_TOPPLE_PUFFS + 1));
                this._emit('leaf', pt.x, pt.y, { count: SNOWTREE_TOPPLE_PUFF_PARTICLES, flora: this._floraOf(p), spread: SNOWTREE_FLURRY_SPREAD.puff, mode: 'puff' });
            }
        }
        if (p.done) p.alive = false;
    },

    /**
     * 倒れる木の軸（根元）の 1px 下に足場があるか。岩のタイルか、残っている建物のかけら（切り株）。
     * 高い所で切れた木は切り株の上で傾き、切り株が壊れる（かけらが無くなる）と落ちる
     */
    _supportedAt(x, y) {
        if (this._solidAtPixel(x, y + 1)) return true;
        // 軸は一番下の段のかけらの中心の平均で、かけらの境目に来ることがある。幹は下へ向かって左右に 1px ほど
        // ずれる（揺れる幹）ので、真下の 1 本の列だけを見ると切り株をすり抜ける。左右 1px も見る
        for (const dx of [0, -1, 1]) {
            for (const b of this.buildingsAt(x + dx, y + 1)) {
                const k = this.cellAt(b, x + dx, y + 1);
                if (k >= 0 && b.cells[k]) return true;
            }
        }
        return false;
    },

    _shatter(p, by) {
        p.alive = false;
        const groundY = Math.floor(by / TILE_SIZE) * TILE_SIZE;
        // 爆発物の破片は、砕けた所で爆発する。瓦礫は残さない（爆発が吹き飛ばす）
        const src = p.sourceId >= 0 ? this.buildings[p.sourceId] : null;
        if (src && src.explosive && !src.exploded && p.cells.some((v) => (v & MAT_MASK) === MAT_EXPLOSIVE)) {
            this.explosives.trigger(src, 0, p.cx, groundY);
            return;
        }
        const mat = p.mainMaterial();
        if (mat === MAT_PLANT) {   // 葉は山にならない。粒になって散る（音も鳴らさない）
            this._emit('leaf', p.cx, groundY, { count: PLANT_LEAF_PARTICLES_FALL, flora: this._floraOf(p) });
            return;
        }
        this._addRubble(p.x, p.width, groundY, p.count, mat);
        this._emit('shatter', p.cx, groundY, { mat, count: TOWN_SHATTER_PARTICLES, size: p.count });
        if (p.fireFuel > 0) this.fire.addEmber(p.cx, groundY);
    },

    /**
     * 床に瓦礫の山を足す。同じ床で横に重なる山は1つにまとめる（数が増え続けないように）。
     * 置いた山は下の床に収まるよう縮める（_fitRubble）。床の縁で砕けた破片の瓦礫が、
     * 床の外へはみ出して浮かないように
     */
    _addRubble(x, w, groundY, cellCount, mat) {
        const h = Math.max(2, Math.min(TOWN_RUBBLE_MAX_H, Math.round(Math.sqrt(cellCount))));
        let heap = this.rubble.find((r) => r.groundY === groundY && x < r.x + r.w && r.x < x + w);
        if (heap) {
            const x0 = Math.min(heap.x, x);
            heap.w = Math.max(heap.x + heap.w, x + w) - x0;
            heap.x = x0;
            heap.h = Math.min(TOWN_RUBBLE_MAX_H, Math.max(heap.h, h) + 1);
        } else {
            heap = { x, w, groundY, h, mat, color: TOWN_RUBBLE_COLORS[mat] || TOWN_RUBBLE_COLORS[1] };
            this.rubble.push(heap);
        }
        if (!this._fitRubble(heap)) this._dropRubble(heap);
    },

    /**
     * 瓦礫の山を、真下の床（岩が続いている列のひと続き）の上に収まる幅へ縮める。
     * 山の真ん中に一番近いひと続きを選ぶ。下に岩が1列も無ければ false（落とす）
     */
    _fitRubble(heap) {
        const row = heap.groundY / TILE_SIZE;
        const c0 = Math.floor(heap.x / TILE_SIZE);
        const c1 = Math.floor((heap.x + heap.w - 1) / TILE_SIZE);
        const mid = (heap.x + heap.w / 2) / TILE_SIZE;
        let best = null;
        for (let c = c0; c <= c1; c++) {
            if (!this.isSolidTile(row, c)) continue;
            let e = c;
            while (e + 1 <= c1 && this.isSolidTile(row, e + 1)) e++;
            const d = mid < c ? c - mid : mid > e + 1 ? mid - (e + 1) : 0;
            if (!best || d < best.d) best = { s: c, e, d };
            c = e;
        }
        if (!best) return false;
        const x0 = Math.max(heap.x, best.s * TILE_SIZE);
        const x1 = Math.min(heap.x + heap.w, (best.e + 1) * TILE_SIZE);
        heap.x = x0;
        heap.w = x1 - x0;
        return true;
    },

    /** 下の床が無くなった瓦礫の山を、同じ形の破片にして落とす（落ちた先でまた瓦礫になる） */
    _dropRubble(heap) {
        this.rubble.splice(this.rubble.indexOf(heap), 1);
        const cw = Math.ceil(heap.w / CHUNK), ch = Math.ceil(heap.h / CHUNK);
        const canvas = this.createCanvas(cw * CHUNK, ch * CHUNK);
        const ctx = canvas.getContext('2d');
        // draw() の山と同じ2段の四角を、破片の canvas の下端に揃えて描く
        const top = ch * CHUNK - heap.h;
        const low = Math.ceil(heap.h / 2);
        ctx.fillStyle = heap.color;
        ctx.fillRect(0, top + heap.h - low, heap.w, low);
        ctx.fillRect(heap.w / 4, top, heap.w / 2, heap.h - low);
        this.falling.push(new FallingPiece({
            canvas, cells: new Uint8Array(cw * ch).fill(heap.mat || 1), cw, ch,
            x: heap.x, y: heap.groundY - ch * CHUNK, sourceId: -1,
        }));
        this._trimFalling();
    },

    /**
     * 落ちるもの（つらら・6面のクレーンの荷）が機体に当たる。かけらが機体の矩形に掛かったら、1 塊につき 1 機体 1 回だけ。
     * game が無い（道具・テストの引数なしの更新）ときは何もしない
     */
    _fallImpact(p, game) {
        if (!game) return;
        for (const e of impactTargets(game)) {
            if (p.hit.has(e) || !p.touches(e)) continue;
            p.hit.add(e);
            applyImpact(e, e.x + e.width / 2, p.y + p.height, p.damage, p.knockVy);
        }
    },

    /** 上限を超えた分を古いものから消す（土煙の注文を出す） */
    _trimFalling() {
        while (this.falling.length > TOWN_FALLING_MAX) {
            const old = this.falling.shift();
            old.alive = false;
            const mat = old.mainMaterial();
            if (mat === MAT_ICE) { this._emit('leaf', old.cx, old.cy, { count: ICICLE_SHARDS.land, flora: this._floraOf(old), mode: 'land', spread: old.width / 2 }); continue; }
            if (mat === MAT_PLANT) this._emit('leaf', old.cx, old.cy, { count: PLANT_LEAF_PARTICLES_FALL, flora: this._floraOf(old) });
            else this._emit('dust', old.cx, old.cy, { mat });
        }
    },
};
