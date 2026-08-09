// ============================================
// 距離による音量の減衰
// ============================================
// 画面内の音源（敵のホバーなど）を、聞き手（自機）からの距離で鳴らし分ける。
// 音を鳴らす部分と切り離しておくと、DOM の無い環境でも計算だけ検証できる。

import { AUDIO_PAN_RANGE, AUDIO_PAN_MAX } from './Constants.js';

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
 * ホバーしている敵のうち、いちばん近い1体を返す。
 *
 * 合計しないのは、敵が増えるほど音量が青天井になるため。最も近い音源が
 * 全体の印象を決めるので、そこだけを鳴らす。左右の定位にもその1体を使う。
 *
 * @param {Array} enemies
 * @param {number} listenerX 聞き手（自機）の位置
 * @param {number} listenerY
 * @param {number} range 可聴範囲
 * @returns {{x:number, y:number, volume:number}|null} 聞こえる敵がいなければ null
 */
export function nearestHoveringEnemy(enemies, listenerX, listenerY, range) {
    if (!enemies || enemies.length === 0) return null;

    let best = null;
    for (const e of enemies) {
        if (!e || !e.alive || !e.hovering) continue;
        const x = e.x + (e.width || 0) / 2;
        const y = e.y + (e.height || 0) / 2;
        const volume = distanceVolume(Math.hypot(x - listenerX, y - listenerY), range);
        if (volume <= 0) continue;
        if (!best || volume > best.volume) best = { x, y, volume };
    }
    return best;
}

/**
 * いちばん近い敵の音量だけを返す薄い包み。
 * 左右の定位が要らない場面（テストや音量だけの判断）で使う。
 */
export function loudestHoverVolume(enemies, listenerX, listenerY, range) {
    const near = nearestHoveringEnemy(enemies, listenerX, listenerY, range);
    return near ? near.volume : 0;
}

/**
 * 音源の横位置から左右の振り分けを求める。
 * @param {number} sourceX 音源のワールドX
 * @param {number} listenerX 聞き手のワールドX
 * @param {number} [range] この距離で振り切る
 * @returns {number} -AUDIO_PAN_MAX（左）〜 +AUDIO_PAN_MAX（右）
 */
export function stereoPan(sourceX, listenerX, range = AUDIO_PAN_RANGE) {
    if (!(range > 0)) return 0;
    const ratio = (sourceX - listenerX) / range;
    const clamped = Math.max(-1, Math.min(1, ratio));
    return clamped * AUDIO_PAN_MAX;
}
