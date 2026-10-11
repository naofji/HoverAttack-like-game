// ============================================
// Town - 3面の町並み
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 建物1棟ごとに canvas を1枚焼き、毎フレームは画面に掛かる建物を drawImage で
// 貼るだけにする（案1。町全体を1枚に焼く案は、段2で崩れ落ちる部分を毎回
// 大きな絵から切り出すことになるので採らなかった）。
// 段2で欠け・支え・落下を足した。壊れ方はどれも buildings の cells（かけらの表）だけを読み書きし、
// 絵は消えたかけらを clearRect で抜くだけにする（建物全体は描き直さない）。
//
// 描く場所は main._drawWorld の「遠景のあと・地形の前」。土台は岩の縁の奥に隠れ、
// 機体や弾は必ず建物より手前に出る。

import { rasterizeParts, computeAnchors, chunkHash, CHUNK, CHARRED, SOLID } from './chunks.js';
import { paintParts } from './shapes.js';
import { TOWN_CHAR_EDGE, TOWN_RUIN_SHADE, TOWN_RUBBLE_COLORS, TOWN_DUST_COLOR } from './palette.js';
import { createExplosion, Particle } from '../../entities/Particle.js';
import { centerOf } from '../../utils/Physics.js';
import { supportedMask, detachedGroups } from './structure.js';
import { FallingPiece } from './FallingPiece.js';
import { FireSystem } from './fire.js';
import {
    TOWN_CHIP_JAGGED, TOWN_COLLAPSE_FRACTION, TOWN_RUIN_DEPTH, TOWN_BLAST_RADIUS_K,
    TOWN_FALLING_MAX, TOWN_FALL_SPIN_MAX, TOWN_FALL_DRIFT_MAX,
    TILE_SIZE, VIEW_CULL_MARGIN, TOWN_COLLAPSE_PARTICLES,
    TOWN_FALL_CHIP_RADIUS, TOWN_SHATTER_PARTICLES, TOWN_RUBBLE_MAX_H,
    TOWN_PROJECTILE_IMPACT, TOWN_SWEEP_STEP,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;
// 弾・爆発と建物の当たりを引くマス目の大きさ（px）。総当たりにしない（spec 5章）
const HIT_GRID = 64;
const NONE = new Set();

function defaultCreateCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
}

export class Town {
    /**
     * @param {Array<object>} specs generateTown() の設計図
     * @param {{isSolidTile?: (r:number, c:number) => boolean, createCanvas?: (w:number, h:number) => object}} [opts]
     */
    constructor(specs, { isSolidTile = () => false, createCanvas = defaultCreateCanvas, random = Math.random } = {}) {
        this.isSolidTile = isSolidTile;
        this.createCanvas = createCanvas;
        // 火のつき方・燃え広がりの乱数（spec 3章「乱数」: Math.random で構わない。テストは種つきを渡す）
        this.random = random;
        this.fire = new FireSystem(this);
        this.falling = [];
        this.rubble = [];
        // 弾ごとの覚え書き（発射位置で無視する建物・細い部品を欠かせた建物）。弾が消えれば一緒に消える
        this._projState = new WeakMap();
        // 粒・土煙の注文。update() でまとめて、画面の中の分だけ出す（spec 2章「画面の外」）。
        // 壊れ方そのもの（かけら・支え・落下）は注文と関係なく、その場で進める
        this.effects = [];
        this.buildings = specs.map((spec, id) => {
            const { cells, cw, ch } = rasterizeParts(spec.parts, spec.w, spec.h);
            const canvas = createCanvas(spec.w, spec.h);
            const ctx = canvas.getContext('2d');
            paintParts(ctx, spec.parts);
            const total = cells.reduce((n, v) => n + (v ? 1 : 0), 0);
            return {
                id, site: spec.site, style: spec.style, kind: spec.kind,
                x: spec.x, y: spec.y, width: spec.w, height: spec.h,
                cells, cw, ch,
                anchors: computeAnchors(cells, cw, ch, spec.x, spec.y, isSolidTile),
                canvas, ctx, total, remaining: total, collapsed: false,
                // 火が焦がしたかけら（燃えているあいだ崩れの対象。fire.js）
                burnt: new Set(),
            };
        });
        // 建物は動かないので、外接矩形が掛かるマス目に1度だけ登録する
        this._grid = new Map();
        for (const b of this.buildings) {
            for (const key of this._gridKeys(b.x, b.y, b.x + b.width, b.y + b.height)) {
                if (!this._grid.has(key)) this._grid.set(key, []);
                this._grid.get(key).push(b);
            }
        }
        // 岩のタイル → それに支えられている建物（岩が壊れたときに引く）
        this._anchorIndex = new Map();
        for (const b of this.buildings) {
            for (const a of b.anchors) {
                const key = `${a.r},${a.c}`;
                if (!this._anchorIndex.has(key)) this._anchorIndex.set(key, new Set());
                this._anchorIndex.get(key).add(b);
            }
        }
    }

    *_gridKeys(x0, y0, x1, y1) {
        for (let gy = Math.floor(y0 / HIT_GRID); gy <= Math.floor((y1 - 1) / HIT_GRID); gy++) {
            for (let gx = Math.floor(x0 / HIT_GRID); gx <= Math.floor((x1 - 1) / HIT_GRID); gx++) yield `${gx},${gy}`;
        }
    }

    /** 外接矩形が点 (x, y) を含む建物 */
    buildingsAt(x, y) {
        const list = this._grid.get(`${Math.floor(x / HIT_GRID)},${Math.floor(y / HIT_GRID)}`) || [];
        return list.filter((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
    }

    /** 外接矩形が円に掛かる建物（重複なし・番号順） */
    buildingsInCircle(x, y, r) {
        const found = new Set();
        for (const key of this._gridKeys(x - r, y - r, x + r + 1, y + r + 1)) {
            for (const b of this._grid.get(key) || []) {
                const nx = Math.max(b.x, Math.min(x, b.x + b.width));
                const ny = Math.max(b.y, Math.min(y, b.y + b.height));
                if (Math.hypot(nx - x, ny - y) <= r) found.add(b);
            }
        }
        return [...found].sort((a, b) => a.id - b.id);
    }

    /** 機体（x, y, width, height。中心の求め方は Physics.centerOf）が重なっている建物の番号 */
    buildingsUnder(entities) {
        const ids = new Set();
        for (const e of entities) {
            const c = centerOf(e);
            const r = Math.max(e.width || 0, e.height || 0) / 2;
            for (const b of this.buildingsInCircle(c.x, c.y, r)) ids.add(b.id);
        }
        return ids;
    }

    /** ワールド座標のかけらの番号。建物の外は -1（空かどうかは見ない） */
    cellAt(b, x, y) {
        const i = Math.floor((x - b.x) / CHUNK);
        const j = Math.floor((y - b.y) / CHUNK);
        if (i < 0 || j < 0 || i >= b.cw || j >= b.ch) return -1;
        return j * b.cw + i;
    }

    /**
     * (x, y) を中心に半径 radius のかけらを欠かせる。縁はかけらごとに chunkHash で半径を揺らして
     * ぎざぎざにする（位置から決まるので、同じ所に撃てば同じ穴）。当たった点のかけらは必ず欠ける
     * （マシンガンの 4px でも何かが欠けないと、撃っても変わらない壁に見える）。
     * 描き直しは消えたかけらを clearRect で抜き、縁に焦げを重ねるだけ。建物全体は描き直さない
     * @returns {number} 欠けたかけらの数
     */
    chip(b, x, y, radius) {
        const lx = x - b.x;
        const ly = y - b.y;
        const reach = radius + TOWN_CHIP_JAGGED;
        const i0 = Math.max(0, Math.floor((lx - reach) / CHUNK));
        const i1 = Math.min(b.cw - 1, Math.floor((lx + reach) / CHUNK));
        const j0 = Math.max(0, Math.floor((ly - reach) / CHUNK));
        const j1 = Math.min(b.ch - 1, Math.floor((ly + reach) / CHUNK));
        const hit = this.cellAt(b, x, y);
        const removed = [];
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const k = j * b.cw + i;
                if (!b.cells[k]) continue;
                const d = Math.hypot(i * CHUNK + HALF - lx, j * CHUNK + HALF - ly);
                if (k === hit || d <= radius + (chunkHash(b.id, i, j) - 0.5) * TOWN_CHIP_JAGGED) removed.push(k);
            }
        }
        if (removed.length === 0) return 0;
        this._removeCells(b, removed);
        this._charEdges(b, removed);
        this._settle(b);
        return removed.length;
    }

    _removeCells(b, list) {
        for (const k of list) {
            const i = k % b.cw;
            b.cells[k] = 0;
            b.ctx.clearRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
        b.remaining -= list.length;
        this.fire.onCellsRemoved(b, list);
    }

    /** かけらを抜いて支えを確かめ直す（燃えて崩れたかけら。fire.js から） */
    removeAndSettle(b, list) {
        if (list.length === 0) return;
        this._removeCells(b, list);
        this._charEdges(b, list);
        this._settle(b);
    }

    /** 消えたかけらの上下左右に残ったかけらへ焦げを重ねる（1回の欠けで同じかけらは1度だけ） */
    _charEdges(b, removed) {
        const done = new Set();
        b.ctx.fillStyle = TOWN_CHAR_EDGE;
        for (const k of removed) {
            const i = k % b.cw;
            const nb = [];
            if (i > 0) nb.push(k - 1);
            if (i < b.cw - 1) nb.push(k + 1);
            if (k >= b.cw) nb.push(k - b.cw);
            if (k + b.cw < b.cells.length) nb.push(k + b.cw);
            for (const n of nb) {
                if (!b.cells[n] || done.has(n)) continue;
                done.add(n);
                const ni = n % b.cw;
                b.ctx.fillRect(ni * CHUNK, ((n - ni) / b.cw) * CHUNK, CHUNK, CHUNK);
            }
        }
    }

    /**
     * 爆発（spawnExplosion がすべての爆発で呼ぶ）。半径は粒の数から決める: K × √size
     * （マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、グレネード 150粒 → 約40px）
     */
    blast(x, y, size) {
        const radius = TOWN_BLAST_RADIUS_K * Math.sqrt(size);
        for (const b of this.buildingsInCircle(x, y, radius)) this.chip(b, x, y, radius);
    }

    /** 岩のタイルが壊れた（Map.damageBlock の「壊れた」分岐から）。支えていた建物を確かめ直す */
    onBlockDestroyed(r, c) {
        // その岩の上の瓦礫は、残った床に収まるよう縮める。収まらなければ落とす（宙に浮かせない）
        const groundY = r * TILE_SIZE;
        const x0 = c * TILE_SIZE, x1 = x0 + TILE_SIZE;
        for (const heap of this.rubble.filter((h) => h.groundY === groundY && h.x < x1 && x0 < h.x + h.w)) {
            if (!this._fitRubble(heap)) this._dropRubble(heap);
        }
        const set = this._anchorIndex.get(`${r},${c}`);
        if (!set) return;
        for (const b of set) this._settle(b);
    }

    /**
     * 弾と建物の当たり。前の位置（tick の頭に記録した _prevX）から今の位置まで TOWN_SWEEP_STEP 刻みで
     * 調べる。厚い壁に当たったら当たった所を欠かせて p.onTownWall(x, y)。細い部品は 1棟1回欠かせて
     * 飛び続ける（表の thin）。
     * 撃った位置に重なる建物は、その弾では無視する。機体は建物の手前に重なって描かれるので、
     * 建物の前で撃つと撃った瞬間に目の前の壁で消えてしまう（遮蔽になるのは撃った者と的のあいだの建物）。
     * 的の側も同じで、exposed（的になりうる機体が重なっている建物の番号。buildingsUnder() で作る）は
     * 止めない。塔の手前に止まった戦車を外から撃つと、塔の縁で弾が止まって戦車に届かなかった
     * （最終レビュー指摘。敵の湧き位置の 15% が厚い壁の上）
     */
    sweepProjectile(p, exposed = NONE) {
        const spec = TOWN_PROJECTILE_IMPACT[p.townKind];
        if (!spec || !p.alive || p.exploded) return;
        if (spec.pierce) {
            this._sweepBeam(p, spec);
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
        for (let s = 1; s <= n; s++) {
            const px = x0 + ((p.x - x0) * s) / n;
            const py = y0 + ((p.y - y0) * s) / n;
            for (const b of this.buildingsAt(px, py)) {
                if (st.ignore.has(b.id) || exposed.has(b.id)) continue;
                const k = this.cellAt(b, px, py);
                if (k < 0 || !b.cells[k]) continue;
                if (b.cells[k] & SOLID) {
                    if (spec.chip > 0) this.chip(b, px, py, spec.chip);
                    p.onTownWall(px, py);
                    return;
                }
                if (spec.thin === 'chip' && !st.thin.has(b.id)) {
                    st.thin.add(b.id);
                    this.chip(b, px, py, spec.chip);
                }
            }
        }
    }

    /**
     * 反射ビーム。帯全体（描画・CollisionManager と同じ segments()）を TOWN_SWEEP_STEP 刻みで調べ、
     * かけらに触れた建物を1発につき1棟1回欠かせる。止まらない
     */
    _sweepBeam(p, spec) {
        let st = this._projState.get(p);
        if (!st) { st = { chipped: new Set() }; this._projState.set(p, st); }
        for (const sg of p.segments()) {
            const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) / TOWN_SWEEP_STEP));
            for (let s = 0; s <= n; s++) {
                const px = sg.x1 + ((sg.x2 - sg.x1) * s) / n;
                const py = sg.y1 + ((sg.y2 - sg.y1) * s) / n;
                for (const b of this.buildingsAt(px, py)) {
                    if (st.chipped.has(b.id)) continue;
                    const k = this.cellAt(b, px, py);
                    if (k < 0 || !b.cells[k]) continue;
                    st.chipped.add(b.id);
                    this.chip(b, px, py, spec.chip);
                }
            }
        }
    }

    /** 毎 tick。main._simulationTick が map.update() のあとに呼ぶ */
    update(game) {
        // 自機側の弾（ミサイル・グレネード・マシンガン）。敵弾は CollisionManager が更新の直後に見る。
        // 敵が重なっている建物は、自機側の弾を止めない（1 tick に1回だけ集める）
        if (game.projectiles.length > 0) {
            const exposed = this.buildingsUnder(game.enemies.filter((e) => e.alive));
            for (const p of game.projectiles) this.sweepProjectile(p, exposed);
        }
        this._updateFalling();
        this.fire.update();
        this._flushEffects(game);
    }

    _solidAtPixel(x, y) {
        return this.isSolidTile(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    }

    _updateFalling() {
        // 写しで回す: 欠けが新しい破片を足したり、上限で古い破片を消したりするため。
        // 新しく増えた破片は次の tick から動く
        for (const p of [...this.falling]) {
            if (!p.alive) continue;
            p.step();
            const by = p.y + p.height;
            for (const b of this.buildingsAt(p.cx, by)) {
                const k = this.cellAt(b, p.cx, by);
                if (p.hitIds.has(b.id) || k < 0 || !b.cells[k]) continue;
                p.hitIds.add(b.id);
                this.chip(b, p.cx, by, TOWN_FALL_CHIP_RADIUS);
            }
            // 下端の左・中・右のどれかが岩に入ったら砕ける。盤面の外は岩（Map.isSolid と同じ）なので
            // 盤面の下へ抜けることはない
            if ([p.x + 2, p.cx, p.x + p.width - 2].some((sx) => this._solidAtPixel(sx, by))) this._shatter(p, by);
        }
        this.falling = this.falling.filter((p) => p.alive);
    }

    _shatter(p, by) {
        p.alive = false;
        const groundY = Math.floor(by / TILE_SIZE) * TILE_SIZE;
        const mat = p.mainMaterial();
        this._addRubble(p.x, p.width, groundY, p.count, mat);
        this._emit('shatter', p.cx, groundY, { mat, count: TOWN_SHATTER_PARTICLES });
    }

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
    }

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
    }

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
    }

    /**
     * 溜めた注文を出す。画面の中かそのすぐ外（VIEW_CULL_MARGIN）だけ。
     * 崩壊は createExplosion を直接足す（spawnExplosion を通すと town.blast に戻って
     * 崩壊が隣を崩す連鎖が止まらなくなる。spec 2章）。音は段4
     */
    _flushEffects(game) {
        const cam = game.camera;
        const cv = game.canvas;
        const m = VIEW_CULL_MARGIN;
        for (const e of this.effects) {
            if (cam && cv && (e.x < cam.x - m || e.x > cam.x + cv.width + m
                || e.y < cam.y - m || e.y > cam.y + cv.height + m)) continue;
            if (e.type === 'collapse') {
                game.particles.push(...createExplosion(e.x, e.y, TOWN_COLLAPSE_PARTICLES));
            } else {
                const color = TOWN_RUBBLE_COLORS[e.mat] || TOWN_RUBBLE_COLORS[1];
                const n = e.count || TOWN_SHATTER_PARTICLES;
                for (let i = 0; i < n; i++) {
                    // 見た目だけの粒なので Math.random でよい（既存の createExplosion と同じ）
                    const a = -Math.PI * Math.random();
                    const sp = 0.5 + Math.random() * 2;
                    const dust = e.type === 'dust' || i % 3 === 0;
                    game.particles.push(new Particle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
                        dust ? TOWN_DUST_COLOR : color, dust ? 2 + Math.random() * 3 : 1 + Math.random() * 2,
                        20 + Math.floor(Math.random() * 20)));
                }
            }
        }
        this.effects.length = 0;
    }

    _emit(type, x, y, extra = {}) {
        this.effects.push({ type, x, y, ...extra });
    }

    /** 岩がまだある支えのかけら */
    _liveAnchors(b) {
        return b.anchors.filter((a) => b.cells[a.i] && this.isSolidTile(a.r, a.c)).map((a) => a.i);
    }

    /**
     * 支えにつながっていないかけらを破片にして落とす。残りが元の TOWN_COLLAPSE_FRACTION を
     * 下回るなら崩壊: 支えから TOWN_RUIN_DEPTH かけら以内の土台だけを残して焦がし、残りは全部落とす。
     * 崩壊は1棟1回（焦げた土台がまた欠けても、ふつうに支えを確かめるだけ）
     */
    _settle(b) {
        const anchors = this._liveAnchors(b);
        let mask = supportedMask(b.cells, b.cw, b.ch, anchors);
        const kept = mask.reduce((n, v) => n + v, 0);
        if (!b.collapsed && kept < b.total * TOWN_COLLAPSE_FRACTION) {
            b.collapsed = true;
            mask = supportedMask(b.cells, b.cw, b.ch, anchors, TOWN_RUIN_DEPTH);
            this._charRuins(b, mask);
            this._emit('collapse', b.x + b.width / 2, b.y + b.height / 2, { size: b.remaining });
        }
        for (const group of detachedGroups(b.cells, b.cw, b.ch, mask)) this._detach(b, group);
    }

    /** 崩壊で残った土台を焦がす（焦げた骨組み）。段3の火はこの印を見て、燃え尽きた所として扱う */
    _charRuins(b, mask) {
        b.ctx.fillStyle = TOWN_RUIN_SHADE;
        for (let k = 0; k < mask.length; k++) {
            if (!mask[k]) continue;
            b.cells[k] |= CHARRED;
            const i = k % b.cw;
            b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
    }

    /** かけらの塊を建物から切り離して、自分の canvas を持つ破片にする */
    _detach(b, group) {
        let i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1;
        for (const k of group) {
            const i = k % b.cw, j = (k - i) / b.cw;
            i0 = Math.min(i0, i); i1 = Math.max(i1, i);
            j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        }
        const pcw = i1 - i0 + 1, pch = j1 - j0 + 1;
        const pw = pcw * CHUNK, ph = pch * CHUNK;
        const canvas = this.createCanvas(pw, ph);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(b.canvas, i0 * CHUNK, j0 * CHUNK, pw, ph, 0, 0, pw, ph);
        const cells = new Uint8Array(pcw * pch);
        for (const k of group) {
            const i = k % b.cw, j = (k - i) / b.cw;
            cells[(j - j0) * pcw + (i - i0)] = b.cells[k];
        }
        // 外接矩形のうち塊に入らないかけら（隣の残る部分の絵）を抜く
        for (let q = 0; q < cells.length; q++) {
            if (!cells[q]) ctx.clearRect((q % pcw) * CHUNK, Math.floor(q / pcw) * CHUNK, CHUNK, CHUNK);
        }
        this._removeCells(b, group);
        this.falling.push(new FallingPiece({
            canvas, cells, cw: pcw, ch: pch,
            x: b.x + i0 * CHUNK, y: b.y + j0 * CHUNK,
            vx: (chunkHash(b.id, i0 + 101, j0 + 211) - 0.5) * 2 * TOWN_FALL_DRIFT_MAX,
            spin: (chunkHash(b.id, j0 + 307, i0 + 401) - 0.5) * 2 * TOWN_FALL_SPIN_MAX,
            sourceId: b.id,
        }));
        this._trimFalling();
    }

    /** 上限を超えた分を古いものから消す（土煙の注文を出す） */
    _trimFalling() {
        while (this.falling.length > TOWN_FALLING_MAX) {
            const old = this.falling.shift();
            old.alive = false;
            this._emit('dust', old.cx, old.cy, { mat: old.mainMaterial() });
        }
    }

    /**
     * 画面に掛かる建物だけを描く。ctx はワールド座標に translate 済み。
     * 判定は外接矩形の重なり（utils/viewCull.js の isInView は外接円で取るので、
     * 縦長の塔では余分に描く。数百棟を毎フレーム見るので矩形で足りる）。
     * @param {{x:number, y:number, w:number, h:number}} view 画面のワールド矩形
     */
    draw(ctx, view) {
        const x1 = view.x + view.w;
        const y1 = view.y + view.h;
        for (const b of this.buildings) {
            if (b.x >= x1 || b.x + b.width <= view.x || b.y >= y1 || b.y + b.height <= view.y) continue;
            ctx.drawImage(b.canvas, b.x, b.y);
        }
        // 瓦礫の山: 下に広い段、上に狭い段の2つの四角（fillRect だけで描く決まり）
        for (const r of this.rubble) {
            if (r.x >= x1 || r.x + r.w <= view.x || r.groundY - r.h >= y1 || r.groundY <= view.y) continue;
            ctx.fillStyle = r.color;
            const low = Math.ceil(r.h / 2);
            ctx.fillRect(r.x, r.groundY - low, r.w, low);
            ctx.fillRect(r.x + r.w / 4, r.groundY - r.h, r.w / 2, r.h - low);
        }
        // 落ちる破片。回るので長辺の正方形で見る
        for (const p of this.falling) {
            const s = Math.max(p.width, p.height);
            if (p.cx - s >= x1 || p.cx + s <= view.x || p.cy - s >= y1 || p.cy + s <= view.y) continue;
            p.draw(ctx);
        }
    }
}
