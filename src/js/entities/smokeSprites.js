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

import { SMOKE_SPRITE_SIZE } from '../utils/Constants.js';
import { falloff } from '../utils/concealment.js';
import { lerpColor } from '../utils/color.js';

/**
 * 瘤の並び。座標と半径はスプライトの半径に対する比。
 * 中心に大きいのを1つ置き、そこから外れた位置に小さいのを2つ足す。
 * 完全に対称にすると回転が見えなくなるので、必ずどちらかに寄せている。
 */
export const SMOKE_SHAPES = [
    [{ dx: 0.00, dy: 0.00, r: 1.00 }, { dx: 0.26, dy: -0.20, r: 0.60 }, { dx: -0.22, dy: 0.22, r: 0.52 }],
    [{ dx: -0.06, dy: 0.04, r: 0.94 }, { dx: 0.30, dy: 0.16, r: 0.56 }, { dx: -0.18, dy: -0.26, r: 0.62 }],
    [{ dx: 0.04, dy: -0.06, r: 0.98 }, { dx: -0.30, dy: 0.08, r: 0.58 }, { dx: 0.20, dy: 0.28, r: 0.50 }],
    [{ dx: 0.00, dy: 0.08, r: 0.90 }, { dx: 0.16, dy: -0.30, r: 0.64 }, { dx: -0.28, dy: -0.04, r: 0.54 }],
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
export function gradientStops(coreColor, midColor, edgeColor) {
    const stops = [];
    for (let i = 0; i < STOP_COUNT; i++) {
        const offset = i / (STOP_COUNT - 1);
        const alpha = falloff(offset, 1);
        // 色は中心→中間→縁の2区間で補間する
        const color = offset < 0.5
            ? lerpColor(coreColor, midColor, offset * 2)
            : lerpColor(midColor, edgeColor, (offset - 0.5) * 2);
        const s = color.replace('#', '');
        const r = parseInt(s.slice(0, 2), 16);
        const g = parseInt(s.slice(2, 4), 16);
        const b = parseInt(s.slice(4, 6), 16);
        stops.push([offset, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`]);
    }
    return stops;
}

let _sprites = null;

/** 1枚焼く。 */
function _bake(shape, tint) {
    const canvas = document.createElement('canvas');
    canvas.width = SMOKE_SPRITE_SIZE;
    canvas.height = SMOKE_SPRITE_SIZE;
    const ctx = canvas.getContext('2d');

    const half = SMOKE_SPRITE_SIZE / 2;
    const stops = gradientStops(tint.core, tint.mid, tint.edge);

    for (const lobe of shape) {
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
    _sprites = SMOKE_SHAPES.map((shape) => SMOKE_TINTS.map((tint) => _bake(shape, tint)));
    return _sprites;
}

/** テスト専用。焼いたものを捨てて、次の呼び出しで焼き直させる。 */
export function _resetSmokeSprites() {
    _sprites = null;
}
