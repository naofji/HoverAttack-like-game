// ============================================
// structure - 支えの探索（純関数）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章「支えの規則」）
// 支えのかけらから塗りつぶし探索して、つながっているかけらだけが残る。
// つながらない塊は、その形のまま落ちる破片になる。
// 1棟は多くても数百かけらなので、欠けるたびにその建物だけ探索し直す。
// つながりは上下左右だけ（斜めでつなぐと、角だけで触れている梁が宙に残る）。

/**
 * @param {Uint8Array} cells かけらの表（0 は空）
 * @param {number[]} anchorIdx 支えのかけらの番号（岩がまだあるもの）
 * @param {number} [maxDepth] 支えから何歩まで広げるか。崩壊で土台だけ残すときに使う
 * @returns {Uint8Array} 1 = 残る
 */
export function supportedMask(cells, cw, ch, anchorIdx, maxDepth = Infinity) {
    const mask = new Uint8Array(cells.length);
    let frontier = [];
    for (const k of anchorIdx) {
        if (cells[k] && !mask[k]) { mask[k] = 1; frontier.push(k); }
    }
    for (let d = 0; frontier.length > 0 && d < maxDepth; d++) {
        const next = [];
        const visit = (n) => { if (cells[n] && !mask[n]) { mask[n] = 1; next.push(n); } };
        for (const k of frontier) {
            const i = k % cw;
            if (i > 0) visit(k - 1);
            if (i < cw - 1) visit(k + 1);
            if (k >= cw) visit(k - cw);
            if (k + cw < cw * ch) visit(k + cw);
        }
        frontier = next;
    }
    return mask;
}

/**
 * 残らないかけらを、上下左右のつながりで塊に分ける。
 * @returns {number[][]} 塊ごとのかけらの番号（昇順）。塊どうしは先頭の番号の昇順
 */
export function detachedGroups(cells, cw, ch, mask) {
    const seen = new Uint8Array(cells.length);
    const groups = [];
    for (let s = 0; s < cells.length; s++) {
        if (!cells[s] || mask[s] || seen[s]) continue;
        const group = [];
        const stack = [s];
        seen[s] = 1;
        while (stack.length > 0) {
            const k = stack.pop();
            group.push(k);
            const i = k % cw;
            const nb = [];
            if (i > 0) nb.push(k - 1);
            if (i < cw - 1) nb.push(k + 1);
            if (k >= cw) nb.push(k - cw);
            if (k + cw < cw * ch) nb.push(k + cw);
            for (const n of nb) {
                if (cells[n] && !mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
            }
        }
        groups.push(group.sort((a, b) => a - b));
    }
    return groups;
}
