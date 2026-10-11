// ============================================
// IcicleFall - 落ちるつらら
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// FallingPiece（支えを失って落ちる塊）の一種。回らず、横へも流れず、重力で真下へ落ちる（先が真下を向いたまま）。
// 床・岩に触れたら砕ける処理（Town._shatter）と、下の建物を欠かす処理（Town._updateFalling）は
// ふつうの破片と同じ。違うのは、落下中に機体へダメージを与えること。
// ダメージは Town._icicleImpact が、この塊の touches() で機体に掛かったかを見て与える。
// 当てた機体は hit に覚える（1 本のつららが同じ機体を何度も当て続けないように）。

import { FallingPiece } from './FallingPiece.js';
import { CHUNK } from './chunks.js';

export class IcicleFall extends FallingPiece {
    /** @param {{damage:number}} opts damage: この 1 本が機体に与えるダメージ（建物の damage をそのまま持ってくる） */
    constructor({ damage, ...piece }) {
        super({ ...piece, vx: 0, spin: 0 });
        this.icicle = true;
        this.damage = damage;
        this.hit = new Set();
        this.age = 0;           // 落ち始めてからの tick（Town が粉雪を舞わせる間隔に使う）
        // 先のかけら（一番下の段）の真ん中の x（塊の左端から px）。先が床に触れたかは、外接矩形の角ではなくここで見る
        let sum = 0, n = 0;
        const last = this.ch - 1;
        for (let i = 0; i < this.cw; i++) if (this.cells[last * this.cw + i]) { sum += (i + 0.5) * CHUNK; n++; }
        this.tipLocalX = n > 0 ? sum / n : this.width / 2;
        // 床に触れてからは、先からめり込んでいく（Town._sinkIcicle）。groundY はめり込む地面の線（触れた床のタイルの上端）
        this.sinking = false;
        this.groundY = 0;
    }

    get tipX() { return this.x + this.tipLocalX; }

    step() {
        super.step();
        this.age++;
    }

    /**
     * めり込んでいる間は、地面の線より下を描かない（薄い足場の下から先がはみ出さないように。地形が上から隠すだけに頼らない）。
     * 描く元の絵の上から、見える高さだけを切り出す（クリップを使わない: 書き出しの道具 PixelCanvas が持っていない）
     */
    draw(ctx) {
        if (!this.sinking) { super.draw(ctx); return; }
        const visible = Math.min(this.height, this.groundY - this.y);
        if (visible <= 0) return;
        ctx.drawImage(this.canvas, 0, 0, this.width, visible, this.x, this.y, this.width, visible);
    }

    /**
     * かけらの矩形が機体の矩形に重なるか。外接矩形ではなく、残っているかけらごとに見る
     * （先の尖った形なので、外接矩形の端の空いた所には当たらない）。接しているだけ（面積が 0）は重ならない
     */
    touches(entity) {
        const ex1 = entity.x + entity.width, ey1 = entity.y + entity.height;
        for (let k = 0; k < this.cells.length; k++) {
            if (!this.cells[k]) continue;
            const i = k % this.cw, j = (k - i) / this.cw;
            const rx = this.x + i * CHUNK, ry = this.y + j * CHUNK;
            if (entity.x < rx + CHUNK && ex1 > rx && entity.y < ry + CHUNK && ey1 > ry) return true;
        }
        return false;
    }
}
