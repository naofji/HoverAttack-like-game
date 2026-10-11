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

import { rasterizeParts, computeAnchors, chunkHash, CHUNK } from './chunks.js';
import { paintParts } from './shapes.js';
import { TOWN_CHAR_EDGE } from './palette.js';
import { TOWN_CHIP_JAGGED } from '../../utils/Constants.js';

const HALF = CHUNK / 2;
// 弾・爆発と建物の当たりを引くマス目の大きさ（px）。総当たりにしない（spec 5章）
const HIT_GRID = 64;

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
    constructor(specs, { isSolidTile = () => false, createCanvas = defaultCreateCanvas } = {}) {
        this.isSolidTile = isSolidTile;
        this.createCanvas = createCanvas;
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

    /** 支えを確かめ直す（Task 4） */
    _settle(b) {}

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
    }
}
