/**
 * 効果音の音量と左右の振り分けを求める。
 *
 * 音を鳴らす処理からは切り離してある。ここは純粋な計算だけなので、
 * WebAudio も DOM も無い環境で単体で試せる。
 */
import {
    AUDIO_PAN_RANGE, AUDIO_PAN_MAX,
    ENEMY_HOVER_OFFSCREEN_GAIN, ENEMY_HOVER_OFFSCREEN_FADE,
} from './Constants.js';

/**
 * 画面の矩形からどれだけ外にいるか。中にいれば 0。
 *
 * 斜め方向を厳密に測らずチェビシェフ距離（縦横の大きい方）で済ませている。
 * 音量を段階的に落とすためだけの値なので、平方根を取る意味が無い。
 *
 * @param {number} sx 音源のワールドX
 * @param {number} sy 音源のワールドY
 * @param {{cx:number, cy:number, halfW:number, halfH:number}} view 画面の中心と半径
 * @returns {number} はみ出したピクセル数
 */
export function offscreenDistance(sx, sy, view) {
    const ox = Math.abs(sx - view.cx) - view.halfW;
    const oy = Math.abs(sy - view.cy) - view.halfH;
    return Math.max(0, ox, oy);
}

/**
 * 位置を持つ音の音量。「画面内なら満音量、画面外なら半分」という割り切り。
 * 敵のホバー音・ジャンプ音・着地音で共通に使う。
 *
 * 以前は距離の2乗で減衰させていたが、可聴範囲(480px)が画面の半分(512px)より
 * 狭く、画面に映っている敵が既にほぼ無音だった（中心から256pxで22%）。
 * 見えている敵は聞こえるべきなので、画面内は一律で満音量にした。
 *
 * 画面外は半分から始めて、1画面ぶん離れると 0 になる。ここを 0 にしないと、
 * マップのどこかに敵がいる限り低い唸りが鳴り続ける。
 *
 * 画面の境界で音量が飛ぶが、AudioManager 側が setTargetAtTime で
 * 滑らかに追従させるので段差としては聞こえない。
 *
 * @param {number} sx 音源のワールドX
 * @param {number} sy 音源のワールドY
 * @param {{cx:number, cy:number, halfW:number, halfH:number}} view
 * @returns {number} 0〜1
 */
export function positionalVolume(sx, sy, view) {
    const out = offscreenDistance(sx, sy, view);
    if (out === 0) return 1;
    const fade = 1 - out / ENEMY_HOVER_OFFSCREEN_FADE;
    return fade > 0 ? ENEMY_HOVER_OFFSCREEN_GAIN * fade : 0;
}

/**
 * ホバーしている敵のうち、いちばん大きく聞こえる1体を返す。
 *
 * 合計しないのは、敵が増えるほど音量が青天井になるため。最も近い音源が
 * 全体の印象を決めるので、そこだけを鳴らす。左右の定位にもその1体を使う。
 *
 * @param {Array} enemies
 * @param {{cx:number, cy:number, halfW:number, halfH:number}} view
 * @returns {{x:number, y:number, volume:number}|null} 聞こえる敵がいなければ null
 */
export function nearestHoveringEnemy(enemies, view) {
    if (!enemies || enemies.length === 0) return null;

    let best = null;
    for (const e of enemies) {
        if (!e || !e.alive || !e.hovering) continue;
        const x = e.x + (e.width || 0) / 2;
        const y = e.y + (e.height || 0) / 2;
        const volume = positionalVolume(x, y, view);
        if (volume <= 0) continue;
        if (!best || volume > best.volume) best = { x, y, volume };
    }
    return best;
}

/**
 * 音源のワールドX を左右の振り分けに変換する。
 * @param {number} sourceX
 * @param {number} listenerX 画面中心のワールドX
 * @param {number} [range] これだけ離れると振り切る
 * @returns {number} -1（左）〜 +1（右）
 */
export function stereoPan(sourceX, listenerX, range = AUDIO_PAN_RANGE) {
    if (!(range > 0)) return 0;
    const ratio = (sourceX - listenerX) / range;
    const clamped = Math.max(-1, Math.min(1, ratio));
    return clamped * AUDIO_PAN_MAX;
}
