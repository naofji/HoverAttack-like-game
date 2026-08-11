// ============================================
// 飛翔体の障害物回避
// ============================================

/** 左右を見るときの振り分け角。前方から ±45°。 */
const PROBE_SPREAD = Math.PI / 4;

/**
 * 前方に壁があれば、左右のどちらが空いているかを見て避ける向きを返す。
 *
 * 誘導ミサイルと巡航ミサイルが、この判定を同じ制御構造・違う数値で
 * それぞれ持っていた。構造は1つにして、性格の違いは数値で渡す。
 *
 * 戻り値は2つに分かれる。
 *  - driftAngle: 今フレームの見た目の傾き。軌道は変えない
 *  - turn:       進行方向そのものを曲げる量
 * 巡航ミサイルは経路(path)を辿っている間 turn を当てない（経路から
 * 外れてしまうため）ので、呼び出し側が turn を捨てられるよう分けてある。
 *
 * 逃げ方は2通りあり、それぞれ効き具合が違う。
 *  - 片側だけ塞がっている: 空いているほうへ寄せる（side*）
 *  - 行き止まり／狭い通路: とにかくどちらかへ振る（deadEnd*）。
 *    こちらのほうが強く振る（誘導 0.15→0.20 / 巡航 0.12→0.10 と、
 *    機種によって強弱の向きも違うので、まとめずに別の数値で持つ）
 *
 * @param {object} o
 * @param {number} o.x 現在位置
 * @param {number} o.y
 * @param {number} o.angle 現在の進行方向（ラジアン）
 * @param {object} o.map isSolidAtPixel(x, y) を持つ
 * @param {number} o.lookAhead 前方を見る距離（px）
 * @param {number} o.sideDrift 片側回避のときの傾き
 * @param {number} o.sideTurn 片側回避のときに進路を曲げる量
 * @param {number} o.deadEndDrift 行き止まりのときの傾き
 * @returns {{driftAngle:number, turn:number}} 前方が空いていれば両方 0
 */
export function avoidObstacle({
    x, y, angle, map, lookAhead, sideDrift, sideTurn, deadEndDrift,
}) {
    const ahead = (a) => map.isSolidAtPixel(
        x + Math.cos(a) * lookAhead,
        y + Math.sin(a) * lookAhead,
    );

    // 正面が空いていれば何もしない
    if (!ahead(angle)) return { driftAngle: 0, turn: 0 };

    const leftSolid = ahead(angle - PROBE_SPREAD);
    const rightSolid = ahead(angle + PROBE_SPREAD);

    if (leftSolid && !rightSolid) {
        return { driftAngle: sideDrift, turn: sideTurn };     // 右へ逃げる
    }
    if (!leftSolid && rightSolid) {
        return { driftAngle: -sideDrift, turn: -sideTurn };   // 左へ逃げる
    }

    // 行き止まり、あるいは左右とも空いている狭い通路。
    // どちらへ逃げるかを位置で決める（毎フレーム乱数を引くと震えるため、
    // 同じ場所では同じ判断になるようにしておく）。
    // 進路の曲げは傾きの半分。振り切って戻れなくなるのを防ぐ。
    const jitter = (Math.floor(x) % 2 === 0) ? deadEndDrift : -deadEndDrift;
    return { driftAngle: jitter, turn: jitter * 0.5 };
}
