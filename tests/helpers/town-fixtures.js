// 町（world/town/）のテストの共有。偽の canvas（描いた呼び出しを記録する）と、四角い建物の設計図
import { makeFakeCtx } from './fake-ctx.js';
import { MAT_ADOBE } from '../../src/js/world/town/chunks.js';

export function fakeCanvas(w, h) {
    const cv = { width: w, height: h, ctx: makeFakeCtx() };
    cv.getContext = () => cv.ctx;
    return cv;
}

/** 土の塊（全部厚い壁）を (x, y) に1棟。既定は 32x32 */
export function block(x, y, w = 32, h = 32) {
    return {
        site: 'floor', style: 'A', kind: 'tower', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#7d5a2a', mat: MAT_ADOBE, solid: true }],
    };
}
