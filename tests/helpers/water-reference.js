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

/**
 * 行 r の、(r, c) を含む壁(isSolid(r,・))区切りの連結区間に、天井が開いている
 * （岩でない）セルが1つでもあるか。waterQuery.js の rowSegmentHasOpenCeiling
 * と同じルールの、地形だけを見る独立した実装（水量には依存しない）。
 */
function rowSegmentHasOpenCeiling(ctx, r, c) {
    let c0 = c;
    while (c0 - 1 >= 0 && !ctx.isSolid(r, c0 - 1)) c0--;
    let c1 = c;
    while (c1 + 1 < ctx.cols && !ctx.isSolid(r, c1 + 1)) c1++;
    for (let cc = c0; cc <= c1; cc++) {
        if (r === 0 || !ctx.isSolid(r - 1, cc)) return true;
    }
    return false;
}

// 旧 Map.isWaterSurface をそのまま写したもの。
// 天井(岩)が直上にあるセルは、満ちていなくて、かつ同じ行の連結区間の中に
// 本当に開けたセルがあるときだけ水面として扱う（実機の指摘: 浮いた岩の下の
// 浅い水たまりで波の線が途切れる／完全に孤立した浅い水だまりに波が浮く）。
// waterQuery.js の classifyWaterColumn と同じルールに更新してある
const isSurface = (ctx, r, c) => {
    if (!isWater(ctx, r, c)) return false;
    if (isFalling(ctx, r, c)) return false;
    if (r > 0 && ctx.isSolid(r - 1, c)) {
        return ctx.water[r * ctx.cols + c] < MAX_WATER_MASS && rowSegmentHasOpenCeiling(ctx, r, c);
    }
    if (r > 0 && isWater(ctx, r - 1, c) && !isFalling(ctx, r - 1, c)) return false;
    return true;
};

export function referenceKindAt(ctx, r, c) {
    if (!isWater(ctx, r, c)) return WATER_NONE;
    if (isFalling(ctx, r, c)) return WATER_FALL;
    if (isSurface(ctx, r, c)) return WATER_SURFACE;
    return WATER_BODY;
}

// 液面の高さ。実装（waterQuery）は水面セルから塗り広げてかたまりを作るが、
// こちらは**全水面セルを列挙して union-find で同値類にまとめる**。同じ答えに
// なるはずだが解き方が別なので、実装のバグ（開始セルによって結果が変わる、
// 隣を1方向しか見ていない等）を突き合わせで捕まえられる。
function surfaceGroups(ctx) {
    const n = ctx.rows * ctx.cols;
    const parent = new Int32Array(n).fill(-1);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    const surfaces = [];
    for (let r = 0; r < ctx.rows; r++) {
        for (let c = 0; c < ctx.cols; c++) {
            if (!isSurface(ctx, r, c)) continue;
            const k = r * ctx.cols + c;
            parent[k] = k;
            surfaces.push([r, c]);
        }
    }

    // 隣り合う列の水面どうしを、行差1以内かつ「深いほうの行で両列とも水」なら繋ぐ
    for (const [r, c] of surfaces) {
        for (let nr = r - 1; nr <= r + 1; nr++) {
            const nc = c + 1;
            if (nr < 0 || nr >= ctx.rows || nc >= ctx.cols) continue;
            if (!isSurface(ctx, nr, nc)) continue;
            const deep = Math.max(r, nr);
            if (!isWater(ctx, deep, c) || !isWater(ctx, deep, nc)) continue;
            union(r * ctx.cols + c, nr * ctx.cols + nc);
        }
    }

    const sums = new global.Map();
    for (const [r, c] of surfaces) {
        const root = find(r * ctx.cols + c);
        const e = sums.get(root) || { total: 0, n: 0 };
        e.total += (r + 1 - ctx.water[r * ctx.cols + c] / MAX_WATER_MASS) * TILE_SIZE;
        e.n++;
        sums.set(root, e);
    }
    const out = new Int16Array(n).fill(-1);
    for (const [r, c] of surfaces) {
        const e = sums.get(find(r * ctx.cols + c));
        const avg = Math.round(e.total / e.n);
        out[r * ctx.cols + c] = avg;

        // 液面は水面セルだけのものではなく「その水塊にかかっている液面」。
        // 下の水中セルにも、液面がタイルより上に来るときは真上の空セルにも及ぶ。
        // 水中セルの判定は referenceKindAt（実装とは別物）から取る
        for (let rr = r + 1; rr < ctx.rows; rr++) {
            if (referenceKindAt(ctx, rr, c) !== WATER_BODY) break;
            out[rr * ctx.cols + c] = avg;
        }
        if (r - 1 >= 0 && referenceKindAt(ctx, r - 1, c) === WATER_NONE
            && avg < r * TILE_SIZE && !ctx.isSolid(r - 1, c)) {
            out[(r - 1) * ctx.cols + c] = avg;
        }
    }
    return out;
}

/** ctx 全体の液面配列を返す（1セルずつ聞かれると毎回作り直すので配列で返す） */
export function referenceSurfaceYAll(ctx) {
    return surfaceGroups(ctx);
}
