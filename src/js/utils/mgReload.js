// ============================================
// Machine-gun reload decision (single source)
// ============================================

import { MG_RELOAD_THRESHOLD_DEFAULT } from './Constants.js';

/**
 * このフレームに MG の装填を始めるか。
 *
 * 上から順に見る。並びそのものが仕様なので、入れ替えると意味が変わる:
 *
 *  1. 弾切れ  … 常に装填する。撃てないまま詰まないため
 *  2. 手動    … しきい値もモードも無視する。プレイヤーが決めたことなので。
 *                **規則4より前**に置くのが要点で、後ろに置くと「オフ」を選んだ人が
 *                自分のタイミングで装填できなくなる
 *  3. off     … 弾切れ以外では装填しない
 *  4. しきい値 … onSwitch / always の**両方**に効く。弾倉がほぼ満タンなのに
 *                切り替えのたびに 60 フレームのリロードを背負う無駄を避ける
 *  5. onSwitch … F で持ち替えたフレームだけ。fireHeld は見ない（切り替えた直後に
 *                その武器の引き金を握っている状況が実質ないので、判定を増やしても
 *                振る舞いが変わらない）
 *  6. always  … 引き金を離すまで待つ（従来の ON）
 *
 * @param {number} burstLeft 残弾
 * @param {number} burstSize 弾倉
 * @param {boolean} fireHeld 引き金を握っているか
 * @param {object} [opts]
 * @param {'off'|'onSwitch'|'always'} [opts.mode]
 * @param {number} [opts.threshold] これ以下で装填する残弾
 * @param {boolean} [opts.switchedToMG] このフレームに F で mg へ持ち替えたか
 * @param {boolean} [opts.manual] F による手動装填の要求
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld, opts = {}) {
    const {
        mode = 'always',
        threshold = MG_RELOAD_THRESHOLD_DEFAULT,
        switchedToMG = false,
        manual = false,
    } = opts;

    if (burstLeft === 0) return true;
    if (manual) return burstLeft < burstSize;
    if (mode === 'off') return false;
    if (burstLeft > threshold) return false;
    if (mode === 'onSwitch') return switchedToMG;
    return !fireHeld;
}

/**
 * `F` を押したときに何をするか。
 *
 * ミサイルが尽きると武器を切り替えられなくなり、F が意味を失う。そのときだけ
 * リロードに割り当てると、キーを増やさずに手動装填の手段が持てる。
 * 「武器切り替え時に装填する」モードとも矛盾しない（切り替えられないときだけ
 * 意味が変わる、という規則が一つあるだけで済む）。
 *
 * @param {number} missiles 残ミサイル数（小数を取りうるので floor する）
 * @returns {'switch'|'reload'}
 */
export function weaponKeyAction(missiles) {
    return Math.floor(missiles) <= 0 ? 'reload' : 'switch';
}
