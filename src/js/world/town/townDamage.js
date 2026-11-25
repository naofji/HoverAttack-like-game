// ============================================
// Town: 壊れ方（欠ける・焦げる・金属が焼ける・爆風・支えの岩が壊れる・崩れる・切り離す）
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import { chunkTouchesRock, chunkHash, CHUNK, CHARRED, MAT_MASK, MAT_METAL } from './chunks.js';
import {
    TOWN_CHAR_EDGE, TOWN_RUIN_SHADE, PLANT_CHAR_EDGE, SNOWTREE_CHAR_EDGE, FACTORY_HEAT_COLORS,
} from './palette.js';
import { lerpColor } from '../../utils/color.js';
import { supportedMask, detachedGroups } from './structure.js';
import { FallingPiece } from './FallingPiece.js';
import { ToppleTree } from './ToppleTree.js';
import { IcicleFall } from './IcicleFall.js';
import {
    FACTORY_HEAT_COOL, FACTORY_LOAD_DAMAGE, FACTORY_LOAD_KNOCK_VY, TOWN_CHIP_JAGGED, TOWN_COLLAPSE_FRACTION,
    TOWN_RUIN_DEPTH, TOWN_BLAST_RADIUS_K, TOWN_FALL_SPIN_MAX, TOWN_FALL_DRIFT_MAX, TILE_SIZE,
    PLANT_LEAF_PARTICLES_HIT, SNOWTREE_TOPPLE_MIN_CELLS, SNOWTREE_TOPPLE_LEAN_DEADZONE, SNOWTREE_FLURRY_HIT,
    SNOWTREE_FLURRY_START, SNOWTREE_FLURRY_SPREAD, SNOWTREE_FLURRY_START_HEIGHT,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;

export const TownDamage = {
    /**
     * (x, y) を中心に半径 radius のかけらを欠かせる。縁はかけらごとに chunkHash で半径を揺らして
     * ぎざぎざにする（位置から決まるので、同じ所に撃てば同じ穴）。当たった点のかけらは必ず欠ける
     * （マシンガンの 4px でも何かが欠けないと、撃っても変わらない壁に見える）。
     * 描き直しは消えたかけらを clearRect で抜き、縁に焦げを重ねるだけ。建物全体は描き直さない
     * @param {'hit'|'blast'} [cause] 爆風（blast）か、弾・破片（hit）か。爆発物の誘爆の遅れに使う（段3b）
     * @returns {number} 欠けたかけらの数
     */
    chip(b, x, y, radius, cause = 'hit') {
        // もろい建物（つらら）は、欠けずに震える。弾・爆風・敵の弾・落ちる破片のどれでも同じ
        if (b.brittle) return this._shake(b, x, y);
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
        this._settle(b, x);
        if (b.soft) this._emit('leaf', x, y, { count: b.flora === 'snow' ? SNOWTREE_FLURRY_HIT : PLANT_LEAF_PARTICLES_HIT, flora: b.flora, spread: SNOWTREE_FLURRY_SPREAD.hit, mode: 'hit' });
        // 欠けた爆発物は爆発する（spec 3b章）。弾・破片ならすぐ（その tick の update で）、
        // 爆風なら 8〜15 フレーム遅れて（一斉に爆発させず連鎖を見せる）
        if (b.explosive) this.explosives.trigger(b, cause === 'blast' ? this.explosives.chainDelay() : 0);
        return removed.length;
    },

    _removeCells(b, list) {
        for (const k of list) {
            const i = k % b.cw;
            b.cells[k] = 0;
            b.ctx.clearRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
        b.remaining -= list.length;
        this.fire.onCellsRemoved(b, list);
    },

    /** かけらを抜いて支えを確かめ直す（燃えて崩れたかけら。fire.js から） */
    removeAndSettle(b, list) {
        if (list.length === 0) return;
        this._removeCells(b, list);
        this._charEdges(b, list);
        this._settle(b);
    },

    /** 爆発した爆発物の残りのかけらを全部抜く。崩壊の閃光と粒は出さない（爆発そのものが演出） */
    consume(b) {
        const left = [];
        for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) left.push(k);
        if (left.length > 0) this._removeCells(b, left);
        b.collapsed = true;
    },

    /** 消えたかけらの上下左右に残ったかけらへ焦げを重ねる（1回の欠けで同じかけらは1度だけ） */
    _charEdges(b, removed) {
        const done = new Set();
        b.ctx.fillStyle = !b.soft ? TOWN_CHAR_EDGE : b.flora === 'snow' ? SNOWTREE_CHAR_EDGE : PLANT_CHAR_EDGE;
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
                // 6面の金属は焦がさず赤く焼く（冷めきったら _updateHeat が焼け色を焼き込む）
                if (this.metalHeat && (b.cells[n] & MAT_MASK) === MAT_METAL) { this._heat(b, n); continue; }
                const ni = n % b.cw;
                b.ctx.fillRect(ni * CHUNK, ((n - ni) / b.cw) * CHUNK, CHUNK, CHUNK);
            }
        }
    },

    /** かけら k を焼けたばかりにする（もう焼けていれば熱を戻す） */
    _heat(b, k) {
        const key = b.id * 0x10000 + k;
        const h = this._heatIndex.get(key);
        if (h) { h.age = 0; return; }
        const e = { b, k, age: 0 };
        this.hot.push(e);
        this._heatIndex.set(key, e);
    },

    /** 建物 b の焼けたかけらを、冷め具合の色で重ねる。建物が薄い間は同じだけ薄く */
    _drawHeat(ctx, b, hot) {
        ctx.globalAlpha = b.alpha;
        for (const { k, age } of hot) {
            if (!b.cells[k]) continue;   // 欠けた tick の描画（_updateHeat の前）でも穴の上に描かない
            const i = k % b.cw;
            ctx.fillStyle = lerpColor(FACTORY_HEAT_COLORS.hot, FACTORY_HEAT_COLORS.burnt, age / FACTORY_HEAT_COOL);
            ctx.fillRect(b.x + i * CHUNK, b.y + ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
        ctx.globalAlpha = 1;
    },

    /**
     * 焼けたかけらを1 tick 冷ます。冷めきったら焼け色を建物の canvas に焼き込んで外す。
     * 欠けた・崩れて落ちた・爆発で消えたかけらは描かずに外す（穴の上に赤い四角が浮かないように）。
     * 熱は見た目だけで、火も誘爆も起こさない（金属は燃えない。ユーザー決定）
     */
    _updateHeat() {
        if (this.hot.length === 0) return;
        const keep = [];
        for (const h of this.hot) {
            const { b, k } = h;
            if (!b.cells[k] || ++h.age >= FACTORY_HEAT_COOL) {
                if (b.cells[k]) {
                    const i = k % b.cw;
                    b.ctx.fillStyle = FACTORY_HEAT_COLORS.burnt;
                    b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
                }
                this._heatIndex.delete(b.id * 0x10000 + k);
                continue;
            }
            keep.push(h);
        }
        this.hot = keep;
    },

    /**
     * 爆発（spawnExplosion がすべての爆発で呼ぶ）。半径は粒の数から決める: K × √size
     * （マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、グレネード 150粒 → 約40px）
     */
    blast(x, y, size, only = null) {
        const radius = TOWN_BLAST_RADIUS_K * Math.sqrt(size);
        for (const b of this.buildingsInCircle(x, y, radius)) {
            // 敵の爆発（町は敵の陣地）は、自機・母艦が重なっている建物だけ欠かす。それ以外は無傷・延焼なし・誘爆なし
            if (only && !only.has(b.id)) continue;
            this.chip(b, x, y, radius, 'blast');
            // 爆風の中の燃える材料には必ず火がつく（spec 3章）。半径の中は欠けて無くなるので、
            // 穴の縁（かけら2つぶん外まで）に残ったかけらにつける
            this.fire.igniteNear(b, x, y, radius + CHUNK * 2);
        }
    },

    /** 岩のタイルが壊れた（Map.damageBlock の「壊れた」分岐から）。支えていた建物を確かめ直す */
    onBlockDestroyed(r, c) {
        // その岩の上の瓦礫は、残った床に収まるよう縮める。収まらなければ落とす（宙に浮かせない）
        const groundY = r * TILE_SIZE;
        const x0 = c * TILE_SIZE, x1 = x0 + TILE_SIZE;
        for (const heap of this.rubble.filter((h) => h.groundY === groundY && h.x < x1 && x0 < h.x + h.w)) {
            if (!this._fitRubble(heap)) this._dropRubble(heap);
        }
        // 形で支えを見るときは、形を作り直した 8 近傍（Map._rebuildTileShapesAround）のタイルに支えられた建物も
        // 確かめ直す。壊れたタイルそのものに支えられていなくても、隣の削れで支えのかけらが宙に出る
        const near = new Set();
        for (let rr = r - 1; rr <= r + 1; rr++) {
            for (let cc = c - 1; cc <= c + 1; cc++) {
                if (!this.rockAt && (rr !== r || cc !== c)) continue;
                for (const b of this._anchorIndex.get(`${rr},${cc}`) || []) near.add(b);
            }
        }
        for (const b of [...near].sort((a, b) => a.id - b.id)) this._settle(b);
    },

    /** 岩がまだある支えのかけら */
    _liveAnchors(b) {
        return b.anchors.filter((a) => b.cells[a.i] && this.isSolidTile(a.r, a.c) && (!this.rockAt || chunkTouchesRock(this.rockAt, a.x, a.y))).map((a) => a.i);
    },

    /**
     * 支えにつながっていないかけらを破片にして落とす。残りが元の TOWN_COLLAPSE_FRACTION を
     * 下回るなら崩壊: 支えから TOWN_RUIN_DEPTH かけら以内の土台だけを残して焦がし、残りは全部落とす。
     * 崩壊は1棟1回（焦げた土台がまた欠けても、ふつうに支えを確かめるだけ）
     */
    _settle(b, hitX) {
        const anchors = this._liveAnchors(b);
        let mask = supportedMask(b.cells, b.cw, b.ch, anchors);
        const kept = mask.reduce((n, v) => n + v, 0);
        if (!b.soft && !b.collapsed && kept < b.total * TOWN_COLLAPSE_FRACTION) {
            b.collapsed = true;
            mask = supportedMask(b.cells, b.cw, b.ch, anchors, TOWN_RUIN_DEPTH);
            this._charRuins(b, mask);
            // 土台の上で燃えていた火は残り火にする（焦げた骨組みが燃え続けて崩れ去らないように。
            // 最終レビュー指摘: 約15秒燃え続けて土台の6割が崩れた）。落ちる塊の火は _detach で破片が持っていく
            this.fire.quench(b, mask);
            this._emit('collapse', b.x + b.width / 2, b.y + b.height / 2, { size: b.remaining });
        }
        for (const group of detachedGroups(b.cells, b.cw, b.ch, mask)) this._detach(b, group, hitX);
    },

    /** 崩壊で残った土台を焦がす（焦げた骨組み）。段3の火はこの印を見て、燃え尽きた所として扱う */
    _charRuins(b, mask) {
        b.ctx.fillStyle = TOWN_RUIN_SHADE;
        for (let k = 0; k < mask.length; k++) {
            if (!mask[k]) continue;
            b.cells[k] |= CHARRED;
            const i = k % b.cw;
            b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
    },

    /** かけらの塊を建物から切り離して、自分の canvas を持つ破片にする */
    _detach(b, group, hitX) {
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
        // 塊の上の火は破片が持っていく（_removeCells で消す前に外す）
        const fireFuel = this.fire.takeFires(b, group);
        this._removeCells(b, group);
        const piece = {
            canvas, cells, cw: pcw, ch: pch,
            x: b.x + i0 * CHUNK, y: b.y + j0 * CHUNK,
            vx: (chunkHash(b.id, i0 + 101, j0 + 211) - 0.5) * 2 * TOWN_FALL_DRIFT_MAX,
            spin: (chunkHash(b.id, j0 + 307, i0 + 401) - 0.5) * 2 * TOWN_FALL_SPIN_MAX,
            sourceId: b.id, fireFuel,
        };
        if (b.brittle) {
            // つららは全体が 1 つの IcicleFall。震えが終わったとき（_releaseWhole）も、支えの岩が壊れたとき（_settle）も同じ
            this.falling.push(new IcicleFall({ ...piece, damage: b.damage }));
            this._emit('iceSound', piece.x + pw / 2, piece.y + ph / 2, { kind: 'fall' });   // 落ち始めの音（震えて落ちたときも、支えが壊れてすぐ落ちたときも）
        } else if (b.flora === 'snow' && group.length >= SNOWTREE_TOPPLE_MIN_CELLS) {
            // 雪の木の大きな塊は、傾きながら倒れる（ToppleTree）。撃たれた側から離れる向きへ。撃った位置が
            // 塊の真ん中と同じ（幹をまっすぐ撃った）か分からない（岩が壊れた）ときは、位置から決めた向き
            const mid = piece.x + pw / 2;
            const lean = hitX !== undefined && Math.abs(mid - hitX) >= SNOWTREE_TOPPLE_LEAN_DEADZONE
                ? Math.sign(mid - hitX)
                : (chunkHash(b.id, i0 + 503, j0 + 601) < 0.5 ? -1 : 1);
            // 塊の真下（4 段まで。切れ目の穴の分）に残ったかけら（切り株）があれば、その x を軸の手がかりにする
            let footX;
            for (let j = j1 + 1; j <= Math.min(b.ch - 1, j1 + 4) && footX === undefined; j++) {
                const cols = [];
                for (let i = i0; i <= i1; i++) if (b.cells[j * b.cw + i]) cols.push(i - i0 + 0.5);
                if (cols.length > 0) footX = (cols.reduce((a, c) => a + c, 0) / cols.length) * CHUNK;
            }
            if (footX === undefined && b.footX !== undefined) footX = b.footX - i0 * CHUNK;   // 切り株が無い（根元の段ごと壊れた）: 木の幹の位置
            const tree = new ToppleTree({ ...piece, vx: 0, spin: 0, lean, footX });
            this.falling.push(tree);
            // 幹が切れた揺れで、木が雪を振るい落とす（塊の上半分あたり、幅いっぱいに）
            this._emit('leaf', piece.x + pw / 2, piece.y + ph * SNOWTREE_FLURRY_START_HEIGHT, { count: SNOWTREE_FLURRY_START, flora: 'snow', spread: pw / 2, mode: 'shake' });
        } else {
            // 6面のクレーンの荷を含む塊は、落ちている間に機体へ当たる（つららと同じ。荷の無い塊は3面と同じく痛くない）
            const damage = this._heavyDamage(b, group);
            this.falling.push(new FallingPiece(damage > 0 ? { ...piece, damage, knockVy: FACTORY_LOAD_KNOCK_VY } : piece));
        }
        this._trimFalling();
    },

    /** 切り離す塊 group に、建物 b の荷（heavy）のかけらが入っているなら、その荷のダメージ。無ければ 0 */
    _heavyDamage(b, group) {
        const h = b.heavy;
        if (!h) return 0;
        for (const k of group) {
            const i = k % b.cw, j = (k - i) / b.cw;
            const cx = i * CHUNK + HALF, cy = j * CHUNK + HALF;
            if (cx >= h.x && cx < h.x + h.w && cy >= h.y && cy < h.y + h.h) return FACTORY_LOAD_DAMAGE[h.kind] || 0;
        }
        return 0;
    },
};
