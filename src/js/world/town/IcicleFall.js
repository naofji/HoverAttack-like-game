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
