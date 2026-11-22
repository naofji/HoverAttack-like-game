// ============================================
// surfaceCrawl - 床・壁・天井に張り付いて面に沿って進む規則（スパイダー）
// ============================================
//
// 自機とアタッカーが共有している歩く仕組み（entities/walkerBody.js）は「床の上を歩く」前提で、
// 重力も乗り上げも下向きに決め打ちしてある。そこを壁・天井まで曲げると共有部品が揺れて
// 自機の挙動まで変わりかねない（設計書の案2を捨てた理由）ので、這う規則はここに別に持つ。
//
// 体は軸に沿った正方形の箱、地形は四角いタイル（6面に斜面は無い）。状態は
//   surface … 張り付いている面。'floor' | 'ceiling' | 'wallL'（岩が左）| 'wallR'（岩が右）
//   fwd     … 面に沿って進む単位ベクトル（軸に沿う）
// の2つで、面の「下」（岩のある向き）は surface から決まる（downOf）。
//
// 角の規則は2つだけ:
//   へこんだ角（進む先が岩）   … 岩に接する位置で止まり、前の岩へ乗り換える（down = 旧 fwd、fwd = -旧 down）
//   出っ張った角（足場が切れた）… 乗っていたタイルの角を回って側面へ（down = -旧 fwd、fwd = 旧 down）
// 1回に進む距離は箱より短い前提（速さ 1.6 に対して箱 14）。角を回った余りの距離は捨てる
// （1フレームに 1.6px 未満の誤差で、見た目には分からない）。
//
// 純粋関数。引数の body は書き換えず、新しい body を返す。

import { TILE_SIZE } from './Constants.js';

/** -0 を作らない符号反転（deepEqual で {x: -0} と {x: 0} が別物になるため） */
const neg = (v) => (v === 0 ? 0 : -v);

const DOWN = {
    floor: { x: 0, y: 1 },
    ceiling: { x: 0, y: -1 },
    wallL: { x: -1, y: 0 },
    wallR: { x: 1, y: 0 },
};

/** 面の「下」（岩のある向き）の単位ベクトル */
export function downOf(surface) {
    return DOWN[surface];
}

/** 下向きのベクトルから面の名前を引く */
export function surfaceOf(down) {
    if (down.y > 0) return 'floor';
    if (down.y < 0) return 'ceiling';
    return down.x < 0 ? 'wallL' : 'wallR';
}

// 箱の右端・下端ちょうどはそのタイルに入らない（[x, x+w) の半開区間）。浮動小数の誤差で
// ちょうど境界に乗った値が隣のタイルへ食い込んだと判定されないよう、少しだけ内側で見る
const EPS = 1e-6;

/** 矩形 [x, x+w) × [y, y+h) が岩のタイルに掛かるか */
function rectHitsSolid(isSolid, x, y, w, h) {
    const c0 = Math.floor(x / TILE_SIZE);
    const c1 = Math.floor((x + w - EPS) / TILE_SIZE);
    const r0 = Math.floor(y / TILE_SIZE);
    const r1 = Math.floor((y + h - EPS) / TILE_SIZE);
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            if (isSolid(r, c)) return true;
        }
    }
    return false;
}

/** 正方形の箱（左上 x, y・一辺 size）が岩に掛かるか */
export function boxHitsSolid(isSolid, x, y, size) {
    return rectHitsSolid(isSolid, x, y, size, size);
}

/** 箱の「下」側に接する 1px の帯 */
function supportStrip(body) {
    const { x, y, size } = body;
    const d = DOWN[body.surface];
    if (d.y > 0) return [x, y + size, size, 1];
    if (d.y < 0) return [x, y - 1, size, 1];
    if (d.x < 0) return [x - 1, y, 1, size];
    return [x + size, y, 1, size];
}

/** 張り付いている面の側 1px に岩があるか（足場があるか） */
export function hasSupport(isSolid, body) {
    if (!body.surface) return false;
    return rectHitsSolid(isSolid, ...supportStrip(body));
}

/**
 * 面に沿って dist px 進める。
 * @param {(r:number, c:number) => boolean} isSolid 範囲外は呼んだ側が岩として返す
 * @param {{x:number, y:number, size:number, surface:string, fwd:{x:number,y:number}}} body
 * @param {number} dist 進む距離（size 未満）
 * @returns {object} 新しい body。足場が無くなったら surface: null（落ちる。呼んだ側が処理する）
 */
export function stepCrawl(isSolid, body, dist) {
    const { size, fwd } = body;
    // 乗っていた面がもう無い（足場を壊された）なら、角を回るのではなく落ちる
    if (!hasSupport(isSolid, body)) return { ...body, fwd: { ...fwd }, surface: null };

    const down = DOWN[body.surface];
    let nx = body.x + fwd.x * dist;
    let ny = body.y + fwd.y * dist;

    // へこんだ角: 前の岩に接する位置で止めて、その岩へ乗り換える
    if (boxHitsSolid(isSolid, nx, ny, size)) {
        if (fwd.x > 0) nx = Math.floor((nx + size - EPS) / TILE_SIZE) * TILE_SIZE - size;
        else if (fwd.x < 0) nx = (Math.floor(nx / TILE_SIZE) + 1) * TILE_SIZE;
        else if (fwd.y > 0) ny = Math.floor((ny + size - EPS) / TILE_SIZE) * TILE_SIZE - size;
        else ny = (Math.floor(ny / TILE_SIZE) + 1) * TILE_SIZE;
        const next = { ...body, x: nx, y: ny, fwd: { x: neg(down.x), y: neg(down.y) }, surface: surfaceOf(fwd) };
        return boxHitsSolid(isSolid, nx, ny, size) ? { ...next, surface: null } : next;
    }

    const moved = { ...body, x: nx, y: ny, fwd: { ...fwd } };
    if (hasSupport(isSolid, moved)) return moved;

    // 出っ張った角: 乗っていたタイルの端 E（進む向きの軸上のタイル境界）を回って側面へ。
    // 1歩は箱より短いので、箱の後ろの端が旧位置から新位置へ動く間にある境界はちょうど1つ。
    // **E は旧位置から決める。** 新位置から ceil/floor で求めると、0.1 刻みの足し算の誤差で
    // 50.0000001 のように境界をわずかに越えた値が出て、1タイル先へ回り込んでいた（柱の上で実際に起きた）
    const T = TILE_SIZE;
    if (fwd.x > 0) nx = Math.floor(body.x / T) * T + T;
    else if (fwd.x < 0) nx = Math.ceil((body.x + size) / T) * T - T - size;
    else if (fwd.y > 0) ny = Math.floor(body.y / T) * T + T;
    else ny = Math.ceil((body.y + size) / T) * T - T - size;
    // 面の平面の向こう側へ箱1つぶん移す（床なら床の上面より下＝側面の上端に沿う）
    nx += down.x * size;
    ny += down.y * size;
    const wrapped = {
        ...body, x: nx, y: ny,
        fwd: { x: down.x, y: down.y },
        surface: surfaceOf({ x: neg(fwd.x), y: neg(fwd.y) }),
    };
    if (boxHitsSolid(isSolid, nx, ny, size) || !hasSupport(isSolid, wrapped)) return { ...wrapped, surface: null };
    return wrapped;
}
