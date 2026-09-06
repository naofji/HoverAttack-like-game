// 現行（キャッシュ導入前）の遅い実装の写し。キャッシュの答え合わせ専用。
// 滝の判定だけは新しいルールC に差し替えてある（旧ルールは湖を貫く縦縞を
// 出すバグそのものなので、答えとして使えない）。
//
// ここを実装から import してはいけない。実装と同じコードを見てしまうと
// 「実装から期待値を導く」ことになり、テストが恒真になる。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../../src/js/utils/Constants.js';
import { WATER_NONE, WATER_BODY, WATER_SURFACE, WATER_FALL } from '../../src/js/world/waterQuery.js';

const isWater = (ctx, r, c) => {
    if (r < 0 || r >= ctx.rows || c < 0 || c >= ctx.cols) return false;
    return ctx.water[r * ctx.cols + c] >= MIN_WATER_MASS;
};

const isFalling = (ctx, r, c) => {
    if (!isWater(ctx, r, c)) return false;
    const mass = ctx.water[r * ctx.cols + c];
    if (mass >= MAX_WATER_MASS) return false;
    if (ctx.isSolid(r + 1, c)) return false;
    if (r + 1 >= ctx.rows) return false;
    return ctx.water[(r + 1) * ctx.cols + c] < MAX_WATER_MASS;
};

// 旧 Map.isWaterSurface をそのまま写したもの
const isSurface = (ctx, r, c) => {
    if (!isWater(ctx, r, c)) return false;
    if (isFalling(ctx, r, c)) return false;
    if (r > 0 && isWater(ctx, r - 1, c) && !isFalling(ctx, r - 1, c)) return false;
    if (r > 0 && ctx.isSolid(r - 1, c)) return false;
    return true;
};

export function referenceKindAt(ctx, r, c) {
    if (!isWater(ctx, r, c)) return WATER_NONE;
    if (isFalling(ctx, r, c)) return WATER_FALL;
    if (isSurface(ctx, r, c)) return WATER_SURFACE;
    return WATER_BODY;
}

// 旧 Map.getWaterSurfaceSegment + getSurfaceY をそのまま写したもの
export function referenceSurfaceY(ctx, r, c) {
    if (!isSurface(ctx, r, c)) return -1;
    const seg = [c];
    for (let cc = c - 1; cc >= 0 && isSurface(ctx, r, cc); cc--) seg.push(cc);
    for (let cc = c + 1; cc < ctx.cols && isSurface(ctx, r, cc); cc++) seg.push(cc);
    let total = 0;
    for (const sc of seg) {
        total += (r + 1 - ctx.water[r * ctx.cols + sc] / MAX_WATER_MASS) * TILE_SIZE;
    }
    return Math.round(total / seg.length);
}
