// ============================================
// smokeSprites - 煙のパフを起動時に焼いておく
// ============================================
//
// 形の複雑さの代金を、起動時に一度だけ払うための仕掛け。焼いてしまえば
// 実行時は drawImage 1回で済むので、瘤をいくつ重ねてもパフ1個のコストは
// 変わらない。毎フレームの createRadialGradient も消える
// （Map の tileCacheCanvas と同じ手口）。
//
// 形を4種にしているのは、1種を回転させただけだと重なったときに反復が
// 目に付くため。色を3段にしているのは、出たては白っぽく、古くなるにつれ
// 紫がかった灰へ冷えていくのを、実行時の色計算なしで出すため。
//
// なめらかなグラデーションを選んだので回転は原理的に見えない。瘤を
// 非対称に置くことで回っていると分かるようにしてある。
//
// 注意: gradientStops() の停止点は falloff() と一致する（瘤1個ぶんは判定と同じ
// 濃さ）が、_bake() は瘤を3つ source-over で重ねて焼くため、合成後の実効 alpha は
// 中間半径で falloff の2〜3倍濃くなる（レビュー時の実測値。d/r=0.3 で実効 0.933 対
// falloff 0.410 など）。ズレの向きは「描画のほうが濃い」＝判定（falloff を直接読む）
// は保守側。縁のあたりでは見た目にはまだ煙が残って見えていても、coverage は
// しきい値を先に割り込んで既にロックできてしまう場合がある。逆向き（透明なのに
// 隠れている）ではないので実害は薄いと判断し、見た目は変えていない。

import { SMOKE_SPRITE_SIZE } from '../utils/Constants.js';
import { falloff } from '../utils/concealment.js';
import { lerpColor, withAlpha } from '../utils/color.js';

/**
 * 瘤の並び。1枚のパフは、これらを重ねて焼いたもの。
 *
 * - `dx` / `dy` / `r`: 位置と半径。スプライトの半径に対する比
 * - `a`: その瘤の不透明度の倍率
 * - `t`: 色段のずらし幅（-1 / 0 / +1）。隣の色段へ半分だけ寄せる
 *
 * **`a` と `t` を瘤ごとに散らしているのが、模様を作っている当のもの。**
 * 全部の瘤を同じ色・同じ濃さで焼くと、重なりが単なる同心円の膨らみにしか
 * ならず、拡大したときに「大きな丸」に見えてしまう。濃さと色をばらすと、
 * 濃い芯・薄い裾・冷えた縁が1枚の中に同居して、煙の塊らしい斑が出る。
 * 焼き付けなので、瘤をいくつ足しても実行時のコストは drawImage 1回のまま。
 *
 * 完全に対称にすると回転が見えなくなるので、必ずどちらかに寄せている。
 */
export const SMOKE_SHAPES = [
    [
        { dx: 0.00, dy: 0.00, r: 0.92, a: 1.00, t: 0 },   // 芯
        { dx: 0.24, dy: -0.18, r: 0.56, a: 0.80, t: -1 }, // 明るい膨らみ
        { dx: -0.20, dy: 0.20, r: 0.50, a: 0.65, t: +1 }, // 冷えた影
        { dx: 0.30, dy: 0.26, r: 0.34, a: 0.45, t: +1 },  // ほつれ
        { dx: -0.32, dy: -0.14, r: 0.30, a: 0.50, t: 0 },
    ],
    [
        { dx: -0.06, dy: 0.04, r: 0.88, a: 1.00, t: 0 },
        { dx: 0.28, dy: 0.14, r: 0.52, a: 0.75, t: +1 },
        { dx: -0.16, dy: -0.24, r: 0.58, a: 0.85, t: -1 },
        { dx: 0.10, dy: -0.34, r: 0.30, a: 0.45, t: 0 },
        { dx: -0.34, dy: 0.22, r: 0.28, a: 0.50, t: +1 },
    ],
    [
        { dx: 0.04, dy: -0.06, r: 0.94, a: 1.00, t: 0 },
        { dx: -0.28, dy: 0.08, r: 0.54, a: 0.80, t: +1 },
        { dx: 0.18, dy: 0.26, r: 0.46, a: 0.60, t: -1 },
        { dx: -0.12, dy: -0.32, r: 0.32, a: 0.50, t: -1 },
        { dx: 0.34, dy: -0.10, r: 0.26, a: 0.45, t: 0 },
    ],
    [
        { dx: 0.00, dy: 0.08, r: 0.86, a: 1.00, t: 0 },
        { dx: 0.14, dy: -0.28, r: 0.60, a: 0.85, t: -1 },
        { dx: -0.26, dy: -0.04, r: 0.50, a: 0.70, t: +1 },
        { dx: 0.30, dy: 0.20, r: 0.30, a: 0.45, t: +1 },
        { dx: -0.20, dy: 0.30, r: 0.28, a: 0.55, t: 0 },
    ],
];

/**
 * 色段。パフの年齢が進むにつれて 0 → 2 へ移る。
 * core はほぼ白（わずかに青紫寄り）、edge は紫がかった灰。
 */
export const SMOKE_TINTS = [
    { core: '#F7F5FA', mid: '#D6CFE2', edge: '#A99FBB' }, // 出たて
    { core: '#EFEDF5', mid: '#B4A9C4', edge: '#8B819C' },
    { core: '#D8D3E2', mid: '#9C93AE', edge: '#7A7089' }, // 冷えた
];

/** 停止点の数。少ないと段差が見え、多いと焼き付けが遅くなる。6段で段差は見えない */
const STOP_COUNT = 6;

/**
 * グラデーションの停止点を falloff から作る。
 *
 * **ここが隠蔽判定との接点。** alpha は falloff(offset, 1) そのもので、
 * concealment.js の判定も同じ関数を読む。片方だけ変えると
 * 「濃く見えるのに隠れない」が起きるので、対で直すこと。
 * @returns {Array<[number, string]>} [offset, rgba文字列]
 */
export function gradientStops(coreColor, midColor, edgeColor, alphaScale = 1) {
    const stops = [];
    for (let i = 0; i < STOP_COUNT; i++) {
        const offset = i / (STOP_COUNT - 1);
        const alpha = falloff(offset, 1) * alphaScale;
        // 色は中心→中間→縁の2区間で補間する
        const color = offset < 0.5
            ? lerpColor(coreColor, midColor, offset * 2)
            : lerpColor(midColor, edgeColor, (offset - 0.5) * 2);
        // hex→rgba の組み立ては utils/color.js の withAlpha に既にある（CLAUDE.md の
        // 「まず既存の共通機構を見る」）。手書きの parseInt 3行より短く、対で使う
        // lerpColor と同じ場所から来るので保守も1箇所で済む。
        stops.push([offset, withAlpha(color, alpha)]);
    }
    return stops;
}

let _sprites = null;

/**
 * 瘤の色。その色段から、隣の段へ半分だけ寄せた色を作る。
 * 段をまたいで丸ごと差し替えるのではなく半分に留めるのは、1枚のパフの中で
 * 色がばらけつつ、パフ全体としてはその年齢の色段に属して見えるようにするため
 * （寄せ切ると、若いパフの中に古い色の瘤が混じって年齢が読めなくなる）。
 * @param {number} tintIndex この瘤が属する色段
 * @param {number} shift -1 / 0 / +1
 */
function _lobeTint(tintIndex, shift) {
    const base = SMOKE_TINTS[tintIndex];
    if (!shift) return base;
    const target = SMOKE_TINTS[Math.max(0, Math.min(SMOKE_TINTS.length - 1, tintIndex + shift))];
    if (target === base) return base;   // 両端では寄せる先が無い
    return {
        core: lerpColor(base.core, target.core, 0.5),
        mid: lerpColor(base.mid, target.mid, 0.5),
        edge: lerpColor(base.edge, target.edge, 0.5),
    };
}

/** 1枚焼く。 */
function _bake(shape, tintIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = SMOKE_SPRITE_SIZE;
    canvas.height = SMOKE_SPRITE_SIZE;
    const ctx = canvas.getContext('2d');

    const half = SMOKE_SPRITE_SIZE / 2;

    for (const lobe of shape) {
        const tint = _lobeTint(tintIndex, lobe.t);
        const stops = gradientStops(tint.core, tint.mid, tint.edge, lobe.a);
        const cx = half + lobe.dx * half;
        const cy = half + lobe.dy * half;
        const r = lobe.r * half;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        for (const [offset, color] of stops) grad.addColorStop(offset, color);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SMOKE_SPRITE_SIZE, SMOKE_SPRITE_SIZE);
    }
    return canvas;
}

/**
 * 12枚のスプライト。初回だけ焼き、以降は同じ配列を返す。
 * モジュール読み込み時ではなく最初の描画で焼くのは、DOM の無い
 * テスト環境で import しただけでは落ちないようにするため。
 * @returns {Array<Array<HTMLCanvasElement>>} [形][色段]
 */
export function getSmokeSprites() {
    if (_sprites) return _sprites;
    _sprites = SMOKE_SHAPES.map((shape) => SMOKE_TINTS.map((_tint, i) => _bake(shape, i)));
    return _sprites;
}

/** テスト専用。焼いたものを捨てて、次の呼び出しで焼き直させる。 */
export function _resetSmokeSprites() {
    _sprites = null;
}
