// ============================================
// 距離による音量の減衰
// ============================================
// 画面内の音源（敵のホバーなど）を、聞き手（自機）からの距離で鳴らし分ける。
// 音を鳴らす部分と切り離しておくと、DOM の無い環境でも計算だけ検証できる。

/**
 * 距離から音量（0〜1）を求める。
 * 実際の音の減衰は近距離ほど急なので、線形ではなく二乗で落とす。
 * @param {number} dist 聞き手からの距離
 * @param {number} range この距離で無音になる
 */
export function distanceVolume(dist, range) {
    if (!(range > 0)) return 0;
    const d = Math.max(0, Math.min(dist, range));
    const near = 1 - d / range;
    return near * near;
}

/**
 * ホバーしている敵のうち、いちばん近い1体ぶんの音量を返す。
 *
 * 合計しないのは、敵が増えるほど音量が青天井になるため。最も近い音源が
 * 全体の印象を決めるので、最大値を採る。
 *
 * @param {Array} enemies
 * @param {number} listenerX 聞き手（自機）の位置
 * @param {number} listenerY
 * @param {number} range 可聴範囲
 * @returns {number} 0〜1
 */
export function loudestHoverVolume(enemies, listenerX, listenerY, range) {
    if (!enemies || enemies.length === 0) return 0;

    let loudest = 0;
    for (const e of enemies) {
        if (!e || !e.alive || !e.hovering) continue;
        const cx = e.x + (e.width || 0) / 2;
        const cy = e.y + (e.height || 0) / 2;
        const v = distanceVolume(Math.hypot(cx - listenerX, cy - listenerY), range);
        if (v > loudest) loudest = v;
    }
    return loudest;
}
