// ============================================
// Town: 問い合わせ（点・円・機体に掛かる建物、かけらの番号）と、機体が重なる建物を薄くする処理
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import { CHUNK } from './chunks.js';
import { centerOf } from '../../utils/Physics.js';
import { TOWN_OCCLUDE_ALPHA, TOWN_OCCLUDE_FADE_STEP, TILE_SIZE } from '../../utils/Constants.js';

// 弾・爆発と建物の当たりを引くマス目の大きさ（px）。総当たりにしない（spec 5章）
const HIT_GRID = 64;

export const TownQuery = {
    *_gridKeys(x0, y0, x1, y1) {
        for (let gy = Math.floor(y0 / HIT_GRID); gy <= Math.floor((y1 - 1) / HIT_GRID); gy++) {
            for (let gx = Math.floor(x0 / HIT_GRID); gx <= Math.floor((x1 - 1) / HIT_GRID); gx++) yield `${gx},${gy}`;
        }
    },

    /** 外接矩形が点 (x, y) を含む建物 */
    buildingsAt(x, y) {
        const list = this._grid.get(`${Math.floor(x / HIT_GRID)},${Math.floor(y / HIT_GRID)}`) || [];
        return list.filter((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
    },

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
    },

    /** 機体（x, y, width, height。中心の求め方は Physics.centerOf）が重なっている建物の番号 */
    buildingsUnder(entities) {
        const ids = new Set();
        for (const e of entities) {
            const c = centerOf(e);
            const r = Math.max(e.width || 0, e.height || 0) / 2;
            for (const b of this.buildingsInCircle(c.x, c.y, r)) ids.add(b.id);
        }
        return ids;
    },

    /** ワールド座標のかけらの番号。建物の外は -1（空かどうかは見ない） */
    cellAt(b, x, y) {
        const i = Math.floor((x - b.x) / CHUNK);
        const j = Math.floor((y - b.y) / CHUNK);
        if (i < 0 || j < 0 || i >= b.cw || j >= b.ch) return -1;
        return j * b.cw + i;
    },

    _solidAtPixel(x, y) {
        return this.isSolidTile(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    },

    /**
     * 機体が重なっている建物を薄くし、離れた建物を戻す。毎 tick 1回。
     * 重なりの判定は弾の例外と同じ buildingsUnder（機体の円と建物の外接矩形）。外接矩形なので、
     * 屋根の上に乗っているだけ・木の葉の脇をかすめるだけでも薄くなる（隠れていないものを隠すよりは安全側）
     * @param {Array<{x:number,y:number,width:number,height:number}>} entities
     */
    updateOcclusion(entities) {
        const under = this.buildingsUnder(entities);
        for (const b of this.buildings) {
            const target = under.has(b.id) ? TOWN_OCCLUDE_ALPHA : 1;
            if (b.alpha === target) continue;
            b.alpha = b.alpha < target
                ? Math.min(target, b.alpha + TOWN_OCCLUDE_FADE_STEP)
                : Math.max(target, b.alpha - TOWN_OCCLUDE_FADE_STEP);
        }
    },

    /**
     * 画面に掛かる建物だけを描く。ctx はワールド座標に translate 済み。
     * 判定は外接矩形の重なり（utils/viewCull.js の isInView は外接円で取るので、
     * 縦長の塔では余分に描く。数百棟を毎フレーム見るので矩形で足りる）。
     * @param {{x:number, y:number, w:number, h:number}} view 画面のワールド矩形
     */
    /** 画面に掛かる建物の外接矩形（draw と同じ選び方）。main がこの範囲だけ地形を重ねて土台を隠す */
    visibleRects(view) {
        const x1 = view.x + view.w;
        const y1 = view.y + view.h;
        const rects = [];
        for (const b of this.buildings) {
            if (b.x >= x1 || b.x + b.width <= view.x || b.y >= y1 || b.y + b.height <= view.y) continue;
            rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
        }
        return rects;
    },
};
