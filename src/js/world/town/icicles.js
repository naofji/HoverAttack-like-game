// ============================================
// icicles - 5面の天井のつらら
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// 絵は多角形（4面の植物・5面の木と同じ。plants.js の冒頭を参照）。当たり・支え・壊れ方は 4px のかけらの表のまま
// （chunks.js の rasterizeParts が、多角形が掛かるかけらを全部 MAT_ICE の厚い壁にする）。
//
// 座標は建物の canvas の px。天井向き: 上端 y = 0 で、上の 4px は天井の岩に埋まる（根元の段が支えのかけら）。
// 下へ y を正に。先は y = h（h = 見える長さ + 4）。中心は x = footX。
// 輪郭は、根元から先へ細くなる帯に、少しの揺れ（直線の三角形に見えないように）。先は少しだけ横へ曲がる。

import { CHUNK, MAT_ICE } from './chunks.js';
import { ringPart } from './shapes.js';
import { ICICLE_COLORS as COL } from './palette.js';
import { ICICLE_LENGTH, ICICLE_WIDTH, ICICLE_DAMAGE } from '../../utils/Constants.js';

const rand = (rng, lo, hi) => lo + rng.next() * (hi - lo);

/** 見える長さ（px）から、落ちたときのダメージ。長さに比例して四捨五入 */
export function icicleDamage(length) {
    const [l0, l1] = ICICLE_LENGTH;
    const [d0, d1] = ICICLE_DAMAGE;
    return Math.round(d0 + ((length - l0) / (l1 - l0)) * (d1 - d0));
}

/**
 * つらら 1 本の絵。
 * @param {{maxLength:number}} o 吊るせる長さ（px。見える長さ。天井の空きから床までの余白を引いたもの）
 * @returns {{kind:'icicle', parts:Array, w:number, h:number, footX:number, length:number, damage:number}|null}
 *   maxLength が ICICLE_LENGTH の下限に満たなければ null
 */
export function buildIcicle(rng, { maxLength }) {
    const [l0, l1] = ICICLE_LENGTH;
    const hi = Math.min(l1, Math.floor(maxLength / CHUNK) * CHUNK);
    if (hi < l0) return null;
    // 4px 刻みで引く（かけらの大きさに揃える）
    const length = l0 + CHUNK * Math.floor(rng.next() * ((hi - l0) / CHUNK + 1));
    const width = Math.round(rand(rng, ICICLE_WIDTH[0], ICICLE_WIDTH[1]));
    const half = width / 2;
    // 輪郭の揺れの余白と、先の曲がりの分を、左右に 2px ずつ取る
    const w = Math.ceil(width / CHUNK) * CHUNK + CHUNK;
    const cx = w / 2;
    const h = length + CHUNK;

    // 輪郭: 4px おきの段。幅は先へ向かって (1 - t)^1.1 で細くなり、先の 0.3px まで
    const n = h / CHUNK;
    const bend = rand(rng, -1.2, 1.2);   // 先の横ずれ（t² で効く）
    const left = [], right = [], lightEdge = [], darkEdge = [];
    for (let k = 0; k <= n; k++) {
        const t = k / n;
        const y = (h * k) / n;
        const hw = k === n ? 0.3 : Math.max(0.5, half * Math.pow(1 - t, 1.1) + (k === 0 ? 0 : rand(rng, -0.5, 0.5)));
        const c = cx + bend * t * t;
        left.push([c - hw, y]);
        right.push([c + hw, y]);
        lightEdge.push([c - hw * 0.15, y]);   // 左の明るい面は、中心線の少し左まで
        darkEdge.push([c + hw * 0.45, y]);    // 右の影の筋は、右の縁から 55% の所から
    }
    const parts = [];
    ringPart(parts, [[...left, ...right.slice().reverse()]], COL.body, MAT_ICE, true);
    ringPart(parts, [[...left, ...lightEdge.slice().reverse()]], COL.light, MAT_ICE, true);
    ringPart(parts, [[...darkEdge, ...right.slice().reverse()]], COL.dark, MAT_ICE, true);
    return { kind: 'icicle', parts, w, h, footX: cx, length, damage: icicleDamage(length) };
}
