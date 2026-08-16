// ============================================
// viewCull - 画面に入っていないものの描画を省く
// ============================================
//
// 2026-08-16 の実測で入れた。敵は平均 99.6 体いるのに**画面内にいるのは約11%**で
// （本物のマップ生成器で7面×5シードを走査。戦闘中のカメラ位置でも 9.5/86.1 体）、
// `enemies` の描画 0.433ms／フレームのうち 9割近くが捨て仕事だった。
//
// **安全側に倒す作りにしてある。** 見えているものを消す事故は、少し余分に描くより
// 遥かに高くつく。camera や canvas が無ければ「見えている」と答えるし、判定は
// 矩形ではなく外接円で取る（回転する機体でも、どの向きでも欠けない）。
//
// 中心の求め方は `centerOf()` に任せる。x,y が左上のクラスと中心のクラスが
// 混在していて、自前で width/2 を足すと巡航ミサイルで12px、レーザーで50px
// ずれる（Physics.js の centerOf のコメント参照）。

import { centerOf } from './Physics.js';

/**
 * entity がカメラの矩形に（margin ぶん広げた範囲で）掛かっているか。
 *
 * @param {object} entity x, y を持つ。左上基準なら width/height も
 * @param {{x:number,y:number}} camera 画面左上のワールド座標
 * @param {{width:number,height:number}} canvas 内部解像度
 * @param {number} [margin] 余裕。脚・スラスター炎・HPバーなど、機体の矩形の
 *   外へはみ出して描かれるぶんを吸収する
 * @returns {boolean} 掛かっていれば true。判断材料が無いときも true
 */
export function isInView(entity, camera, canvas, margin = 0) {
    // カメラや canvas が無い＝テスト環境や初期化途中。描くほうへ倒す
    if (!entity || !camera || !canvas) return true;

    const c = centerOf(entity);
    // 外接円の半径。長辺で取るので、機体が回っていても欠けない
    const r = Math.max(entity.width || 0, entity.height || 0) / 2 + margin;

    return (
        c.x + r >= camera.x
        && c.x - r <= camera.x + canvas.width
        && c.y + r >= camera.y
        && c.y - r <= camera.y + canvas.height
    );
}
