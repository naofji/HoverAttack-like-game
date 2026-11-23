// ============================================
// 開始地点の安全圏 - 内側に置かれた敵を、外の「その敵が置ける一番近い場所」へ移す
// ============================================
//
// 2026-11-23 ユーザー指定「ステージ開始地点から半径 200px には敵を配置しない（地雷は別）」。
// 初めは内側の敵を外していたが、週によって敵の数が減るので「移すほうがいい」（同日ユーザー）。
//
// 開始地点（母艦）は地図を作った後に決まるので、SpawnManager.spawnEnemies が置き終えた後に移す。
// 移し先は地図だけで決める（乱数を使わない）。game.rng を引くと、同じ週なのに敵の構成が変わる（週次の決定性）。
//
// 置ける場所の規則は、地図の生成（world/mapgen/spawns.js）の候補の条件と同じ形にした:
//   ground  … 空いたタイルとその上も空き、真下が岩（タンク・アタッカー。_hasHeadroomOnFloor）
//   air     … 3×3 タイルが空き（ドローン。_isAreaEmpty）
//   turret  … 横3タイルと、付け根と反対側の横3タイルが空き、付け根が岩（砲台。床置き・天井付けは元のまま）
//   spider  … 空いたタイルの、元と同じ面の側が岩（スパイダー）
// 足場の岩は形の無い（四角い）タイルに限る。斜面・面取りの上だと、タイルの上端に置いた機体が浮いて見える
// （地図の生成は形を焼く前に置いて _seatSpawnsOnShapes で合わせ直すが、ここは形を焼いた後なので最初から避ける）。

import { TILE_SIZE } from '../utils/Constants.js';
import { SHAPE_FULL } from '../utils/tileShape.js';

// 元の場所から探す範囲（タイル）。安全圏の半径 200px ＝ 12.5 タイルの外まで届けばよいので、余裕を見て 40
const SEARCH_TILES = 40;

/**
 * @param {object} map isSolid / tileShapeAt を持つ地図
 * @param {{kind:'ground'|'air'|'turret'|'spider', w:number, h:number, isCeiling?:boolean, surface?:string}} spec
 * @param {{x:number, y:number}} from 元の場所（機体の左上）
 * @param {{x:number, y:number}} start 開始地点（自機の中心）
 * @param {number} radius 安全圏の半径
 * @param {(box:{x:number,y:number,w:number,h:number}) => boolean} isFree 置いてよいか（ほかの敵・地雷・建物と重ならない）
 * @returns {{x:number, y:number}|null} 機体の左上。見つからなければ null
 */
export function findSpotOutside(map, spec, from, start, radius, isFree) {
    const T = TILE_SIZE;
    const fr = Math.floor((from.y + spec.h / 2) / T);
    const fc = Math.floor((from.x + spec.w / 2) / T);
    // 近い順（元の場所からの距離、同じなら行・列の順）に並べる。乱数は使わない
    const tiles = [];
    for (let dr = -SEARCH_TILES; dr <= SEARCH_TILES; dr++) {
        for (let dc = -SEARCH_TILES; dc <= SEARCH_TILES; dc++) tiles.push([dr * dr + dc * dc, fr + dr, fc + dc]);
    }
    tiles.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [, r, c] of tiles) {
        const spot = spotAt(map, spec, r, c);
        if (!spot) continue;
        const cx = spot.x + spec.w / 2;
        const cy = spot.y + spec.h / 2;
        if (Math.hypot(cx - start.x, cy - start.y) < radius) continue;
        if (!isFree({ x: spot.x, y: spot.y, w: spec.w, h: spec.h })) continue;
        return spot;
    }
    return null;
}

/** タイル (r, c) にこの敵を置けるなら機体の左上を返す */
function spotAt(map, spec, r, c) {
    const T = TILE_SIZE;
    const empty = (rr, cc) => !map.isSolid(rr, cc) && !(map.isWater && map.isWater(rr, cc));
    // 足場: 四角い岩（斜面・面取りのタイルは、上端に置くと浮いて見える）
    const footing = (rr, cc) => map.isSolid(rr, cc) && map.tileShapeAt(rr, cc) === SHAPE_FULL;
    const midX = c * T + (T - spec.w) / 2;
    switch (spec.kind) {
        case 'ground':
            if (!empty(r, c) || !empty(r - 1, c) || !footing(r + 1, c)) return null;
            return { x: midX, y: (r + 1) * T - spec.h };
        case 'air':
            for (let rr = r - 1; rr <= r + 1; rr++) {
                for (let cc = c - 1; cc <= c + 1; cc++) if (!empty(rr, cc)) return null;
            }
            return { x: midX, y: r * T + (T - spec.h) / 2 };
        case 'turret': {
            // 砲台は 24px でタイルより 8px 高いので、付け根と反対側の隣の行にもはみ出す（spawns.js の overhangClear）
            const away = spec.isCeiling ? r + 1 : r - 1;
            for (let cc = c - 1; cc <= c + 1; cc++) if (!empty(r, cc) || !empty(away, cc)) return null;
            if (spec.isCeiling) return footing(r - 1, c) ? { x: midX, y: r * T } : null;
            return footing(r + 1, c) ? { x: midX, y: (r + 1) * T - spec.h } : null;
        }
        case 'spider': {
            if (!empty(r, c)) return null;
            const S = spec.w;
            switch (spec.surface) {
                case 'ceiling': return footing(r - 1, c) ? { x: midX, y: r * T } : null;
                case 'floor': return footing(r + 1, c) ? { x: midX, y: (r + 1) * T - S } : null;
                case 'wallL': return footing(r, c - 1) ? { x: c * T, y: r * T + (T - S) / 2 } : null;
                case 'wallR': return footing(r, c + 1) ? { x: (c + 1) * T - S, y: r * T + (T - S) / 2 } : null;
                default: return null;
            }
        }
        default:
            return null;
    }
}
