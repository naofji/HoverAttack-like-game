// ============================================
// FallingPiece - 支えを失って落ちる建物のかけらの塊
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章「落ちる破片」）
// 切り離したときの形のまま、自分の canvas を持って落ちる。当たりは回る前の外接矩形で見る
// （回転は見た目だけ。斜めの当たりを正確に取っても、遊びには関わらない）。
// x, y は左上。描画補間（utils/renderInterp.js）は x, y だけを動かすので、中心は毎回 x, y から求める。

import { CHUNK, MAT_MASK } from './chunks.js';
import { TOWN_FALL_GRAVITY, TOWN_FALL_MAX_SPEED } from '../../utils/Constants.js';

export class FallingPiece {
    constructor({ canvas, cells, cw, ch, x, y, vx = 0, vy = 0, spin = 0, sourceId = -1, fireFuel = 0 }) {
        this.canvas = canvas;
        this.cells = cells;
        this.cw = cw;
        this.ch = ch;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.spin = spin;
        this.sourceId = sourceId;
        // 燃えている破片の残り燃料（フレーム）。毎フレーム fire.js が 1 ずつ減らす。0 なら燃えていない
        this.fireFuel = fireFuel;
        this.width = cw * CHUNK;
        this.height = ch * CHUNK;
        this.angle = 0;
        this.alive = true;
        // 1棟1回だけ欠かせる（同じ建物を毎 tick 削り続けないように）
        this.hitIds = new Set();
    }

    get cx() { return this.x + this.width / 2; }
    get cy() { return this.y + this.height / 2; }
    get count() { return this.cells.reduce((n, v) => n + (v ? 1 : 0), 0); }

    /** 一番多い材料（瓦礫と破片の粒の色を決める） */
    mainMaterial() {
        const n = [0, 0, 0, 0, 0, 0, 0, 0];
        for (const v of this.cells) if (v) n[v & MAT_MASK]++;
        let best = 0;
        for (let m = 1; m < n.length; m++) if (n[m] > n[best]) best = m;
        return best;
    }

    /** 1 tick 進める。回転は見た目だけ */
    step() {
        this.vy = Math.min(TOWN_FALL_MAX_SPEED, this.vy + TOWN_FALL_GRAVITY);
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.spin;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.rotate(this.angle);
        ctx.drawImage(this.canvas, -this.width / 2, -this.height / 2);
        ctx.restore();
    }
}
