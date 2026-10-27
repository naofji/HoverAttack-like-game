// ============================================
// タイルの形（4象限）と、形を決める規則・形の幾何（純関数）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md
//
// タイル（16px）を 8px の4象限に分け、各象限を「満ち」「空」「45度の三角（4向き）」から選ぶ。
// 絵と当たり判定が同じ形を共有するための土台。以前は判定を四角のまま、絵だけを坂・くの字に
// 削り、自機の絵を描画オフセットで斜辺へ下げて吸収していたが、壊せる地形では壊した後に
// 絵と判定が食い違って見えた（5面の宙に浮いた板）。
//
// 形は「岩か空か」の並びだけから決まる（乱数を使わない＝週次の決定性に触れない）。

/** 象限の値。「NO_xx」はその象限の、その角の側の半分（斜辺で切った三角）が空 */
export const Q_EMPTY = 0;
export const Q_FULL = 1;
export const Q_TRI_NO_TL = 2;
export const Q_TRI_NO_TR = 3;
export const Q_TRI_NO_BL = 4;
export const Q_TRI_NO_BR = 5;

/** 4象限を 3bit ずつ詰める（TL が下位）。Map が Uint16Array に焼く */
export function packShape(tl, tr, bl, br) {
    return tl | (tr << 3) | (bl << 6) | (br << 9);
}

/** @returns {[number, number, number, number]} [TL, TR, BL, BR] */
export function unpackShape(code) {
    return [code & 7, (code >> 3) & 7, (code >> 6) & 7, (code >> 9) & 7];
}

export const SHAPE_EMPTY = packShape(Q_EMPTY, Q_EMPTY, Q_EMPTY, Q_EMPTY);
export const SHAPE_FULL = packShape(Q_FULL, Q_FULL, Q_FULL, Q_FULL);

/**
 * 1タイルの形。
 *
 * 'snowSlope'（5面）: 各角について、その角をはさむ2辺が両方とも空なら削る（凹角は削らない）。
 * - 段がその角の斜め向こうへ続く（左上の角なら左下の隣 (r+1, c-1) が岩）なら、
 *   タイル1枚ぶんの斜め（対角線で半分）。1段ずつの階段がこれで途切れのない45度の坂になる。
 * - 続かなければ 8px の小さい面取り（その象限だけ三角）。床の縁・崖の上の角・浮いた板の先。
 *
 * 斜めにするには、残りの2辺（左上なら右と下）が空でないことも要求する。斜めの切り口は
 * 隣の2象限に掛かるので、そこへ別の角の切り込みが重なると1象限に三角が2つ入って
 * 形が表せない（自己交差する）。旧 _drawRockyBlock は坂を描いたあと `if (rampTL) cTR = 0`
 * で反対の角を消して避けていたが、こちらは条件で最初から作らない（幅1の柱の上端など）。
 *
 * 磨き仕上げ（外周・基地の金属）は人工物なので削らない。隣から見れば岩として数える。
 *
 * @param {(r: number, c: number) => 'empty'|'rock'|'polished'} cellAt 範囲外は 'polished' を返すこと
 * @param {'square'|'snowSlope'|undefined} rule 面の規則。undefined は 'square'
 */
export function computeTileShape(cellAt, r, c, rule) {
    const self = cellAt(r, c);
    if (self === 'empty') return SHAPE_EMPTY;
    if (self === 'polished' || rule !== 'snowSlope') return SHAPE_FULL;

    const open = (rr, cc) => cellAt(rr, cc) === 'empty';
    const top = open(r - 1, c), bottom = open(r + 1, c);
    const left = open(r, c - 1), right = open(r, c + 1);
    const q = [Q_FULL, Q_FULL, Q_FULL, Q_FULL]; // TL, TR, BL, BR

    // 斜めは隣の2象限にも掛かるので、先に小さい面取りを入れ、斜めがあればそれで上書きする
    // （斜めの条件は残りの2辺が閉じていることなので、上書きで消える面取りは無い）
    if (top && left) q[0] = Q_TRI_NO_TL;
    if (top && right) q[1] = Q_TRI_NO_TR;
    if (bottom && left) q[2] = Q_TRI_NO_BL;
    if (bottom && right) q[3] = Q_TRI_NO_BR;

    if (top && left && !right && !bottom && !open(r + 1, c - 1)) {
        q[0] = Q_EMPTY; q[1] = Q_TRI_NO_TL; q[2] = Q_TRI_NO_TL;
    } else if (top && right && !left && !bottom && !open(r + 1, c + 1)) {
        q[1] = Q_EMPTY; q[0] = Q_TRI_NO_TR; q[3] = Q_TRI_NO_TR;
    } else if (bottom && left && !right && !top && !open(r - 1, c - 1)) {
        q[2] = Q_EMPTY; q[0] = Q_TRI_NO_BL; q[3] = Q_TRI_NO_BL;
    } else if (bottom && right && !left && !top && !open(r - 1, c + 1)) {
        q[3] = Q_EMPTY; q[1] = Q_TRI_NO_BR; q[2] = Q_TRI_NO_BR;
    }
    return packShape(q[0], q[1], q[2], q[3]);
}

// --------------------------------------------
// 形の幾何。座標はタイル内のローカル px（0〜16）、象限の中は (u, v)（0〜8）。
// 三角の象限は斜辺の上を岩とする（閉じている）。四角の判定 isSolidAtPixel と同じく、
// 象限・タイルの右端と下端は隣のものに属する（半開区間）。
// --------------------------------------------

const QS = 8; // 象限の一辺（TILE_SIZE の半分）

/** 象限の中の点が岩か */
function quadContains(q, u, v) {
    switch (q) {
        case Q_FULL: return true;
        case Q_TRI_NO_TL: return u + v >= QS;
        case Q_TRI_NO_BR: return u + v <= QS;
        case Q_TRI_NO_TR: return v >= u;
        case Q_TRI_NO_BL: return u >= v;
        default: return false;
    }
}

/**
 * 象限の中の半開矩形 [u0,u1)×[v0,v1)（u1>u0, v1>v0）に岩が掛かるか。
 * 斜辺の式の値を矩形の上で最大（または最小）にする角だけを見ればよい。
 * 開いた側の角（u1 や v1）は届かない値なので、そちらを使う式は厳密な不等号になる。
 */
function quadOverlaps(q, u0, v0, u1, v1) {
    switch (q) {
        case Q_FULL: return true;
        case Q_TRI_NO_TL: return u1 + v1 > QS;
        case Q_TRI_NO_BR: return u0 + v0 <= QS;
        case Q_TRI_NO_TR: return v1 - u0 > 0;
        case Q_TRI_NO_BL: return u1 - v0 > 0;
        default: return false;
    }
}

/** 象限の列 u で岩が始まる v（0〜8）。岩が無ければ QS */
function quadTop(q, u) {
    switch (q) {
        case Q_FULL: case Q_TRI_NO_BL: case Q_TRI_NO_BR: return 0;
        case Q_TRI_NO_TL: return QS - u;
        case Q_TRI_NO_TR: return u;
        default: return QS;
    }
}

/** 象限の列 u で岩が終わる v（0〜8）。岩が無ければ（または点だけなら）0 */
function quadBottom(q, u) {
    switch (q) {
        case Q_FULL: case Q_TRI_NO_TL: case Q_TRI_NO_TR: return QS;
        case Q_TRI_NO_BL: return u;
        case Q_TRI_NO_BR: return QS - u;
        default: return 0;
    }
}

/** @param {number} lx @param {number} ly いずれも [0, 16) */
export function shapeContainsPoint(code, lx, ly) {
    if (code === SHAPE_FULL) return true;
    if (code === SHAPE_EMPTY) return false;
    const qx = lx < QS ? 0 : 1, qy = ly < QS ? 0 : 1;
    const q = (code >> (3 * (qy * 2 + qx))) & 7;
    return quadContains(q, lx - qx * QS, ly - qy * QS);
}

/** 半開矩形 [x0,x1)×[y0,y1)（0 ≦ x0 < x1 ≦ 16）に岩が掛かるか。矩形を象限で切り分けて調べる */
export function shapeOverlapsRect(code, x0, y0, x1, y1) {
    if (code === SHAPE_FULL) return true;
    if (code === SHAPE_EMPTY) return false;
    for (let qy = 0; qy < 2; qy++) {
        const v0 = Math.max(y0 - qy * QS, 0), v1 = Math.min(y1 - qy * QS, QS);
        if (v1 <= v0) continue;
        for (let qx = 0; qx < 2; qx++) {
            const u0 = Math.max(x0 - qx * QS, 0), u1 = Math.min(x1 - qx * QS, QS);
            if (u1 <= u0) continue;
            const q = (code >> (3 * (qy * 2 + qx))) & 7;
            if (quadOverlaps(q, u0, v0, u1, v1)) return true;
        }
    }
    return false;
}

/**
 * 列 lx（[0, 16)）で岩が始まる y。岩が無ければ null。
 * computeTileShape が作る形は正方形の角を削ったものなので、どの列も岩が1本につながっていて、
 * 上端と下端の2つで列の岩を表せる。
 */
export function shapeTopY(code, lx) {
    const qx = lx < QS ? 0 : 1, u = lx - qx * QS;
    const top = quadTop((code >> (3 * qx)) & 7, u);
    if (top < QS) return top;
    const bottom = quadTop((code >> (3 * (2 + qx))) & 7, u);
    return bottom < QS ? QS + bottom : null;
}

/** 列 lx（[0, 16)）で岩が終わる y。岩が無ければ null。満ちなら 16 */
export function shapeBottomY(code, lx) {
    const qx = lx < QS ? 0 : 1, u = lx - qx * QS;
    const lower = quadBottom((code >> (3 * (2 + qx))) & 7, u);
    if (lower > 0) return QS + lower;
    const upper = quadBottom((code >> (3 * qx)) & 7, u);
    return upper > 0 ? upper : null;
}

/**
 * 列 lx（[0, 16)）の上面の傾き。+1 = 右へ上る、-1 = 左へ上る、0 = 平ら（自機の slopeDir と同じ符号）。
 * 上の象限（空なら下の象限）の三角の向きで決まる。坂の加速と、斜面に当たった
 * ときに流す向きはここだけから読む（機体ごとに導出しない）
 */
export function shapeFloorSlope(code, lx) {
    const qx = lx < QS ? 0 : 1;
    // 上の象限が空のときだけ下の象限を見る。三角の象限は、列が斜辺の端（象限の角）に
    // 掛かって岩が点になる列でも三角として読む。そうしないと 45度の坂の lx = 8 の列だけ
    // 下の満ちた象限を読んで「平ら」になり、坂の真ん中で向きが途切れる（実測）
    let q = (code >> (3 * qx)) & 7;
    if (q === Q_EMPTY) q = (code >> (3 * (2 + qx))) & 7;
    return q === Q_TRI_NO_TL ? 1 : q === Q_TRI_NO_TR ? -1 : 0;
}

/** 列 lx の下面の傾き。+1 = 右へ下がる（右ほど天井が低い）、-1 = 左へ下がる、0 = 平ら */
export function shapeCeilingSlope(code, lx) {
    const qx = lx < QS ? 0 : 1;
    // 下の象限が空のときだけ上の象限を見る（理由は shapeFloorSlope と同じ）
    let q = (code >> (3 * (2 + qx))) & 7;
    if (q === Q_EMPTY) q = (code >> (3 * qx)) & 7;
    return q === Q_TRI_NO_BL ? 1 : q === Q_TRI_NO_BR ? -1 : 0;
}

/**
 * 絵の輪郭で4つの角をどれだけ削るか（px）。0 = 削らない、8 = 小さい面取り、16 = タイル1枚ぶんの斜め。
 * computeTileShape が作る形は、正方形の角をこの3通りで削ったものしか無いので、この4つの値だけで
 * 輪郭の多角形が決まる（Map._drawRockyBlock の面取りの頂点列にそのまま入る）。
 * 角の象限が空になるのはタイル1枚ぶんの斜めのときだけ（その角の向きの斜めは、隣の2象限も
 * 同じ向きの三角にする）。角を向いた三角なら小さい面取り
 */
export function shapeCornerCuts(code) {
    const cut = (quadIndex, cornerTri) => {
        const q = (code >> (3 * quadIndex)) & 7;
        return q === Q_EMPTY ? 2 * QS : q === cornerTri ? QS : 0;
    };
    return { tl: cut(0, Q_TRI_NO_TL), tr: cut(1, Q_TRI_NO_TR), bl: cut(2, Q_TRI_NO_BL), br: cut(3, Q_TRI_NO_BR) };
}

/**
 * 三角の象限の斜辺に、直前の点 (px, py) の側から触れたときの外向きの法線。符号の組 (±1, ±1) で返す
 * （45度の斜辺しか無いので、正規化した √½ を持つより、反射を `vx' = −vy·sx·sy` のように整数の符号で
 * 書ける方が反射ビームの速さが浮動小数の誤差でずれない）。
 * (lx, ly) はタイル内の岩の点、(px, py) は同じタイル基準の直前の空の点。(lx, ly) が三角の象限に無いか、
 * 直前の点が斜辺の直線の開いた側に無い（象限の垂直・水平な辺から入った）ときは null。
 * 直線の延長で見るので、直前の点は象限の外でもよい。
 */
export function hypotenuseNormal(code, lx, ly, px, py) {
    const qx = lx < QS ? 0 : 1, qy = ly < QS ? 0 : 1;
    const q = (code >> (3 * (qy * 2 + qx))) & 7;
    const u = px - qx * QS, v = py - qy * QS;
    switch (q) {
        case Q_TRI_NO_TL: return u + v < QS ? { sx: -1, sy: -1 } : null;
        case Q_TRI_NO_BR: return u + v > QS ? { sx: 1, sy: 1 } : null;
        case Q_TRI_NO_TR: return v < u ? { sx: 1, sy: -1 } : null;
        case Q_TRI_NO_BL: return u < v ? { sx: -1, sy: 1 } : null;
        default: return null;
    }
}

/**
 * hypotenuseNormal の裏から見たもの: 直前の空の点 (plx, ply) が三角の象限の削れた側にいて、次の点
 * (slx, sly)（同じタイル基準。タイルの外でもよい）がその斜辺の直線を越えたら法線。坂のタイルの
 * 境目ちょうどの列では、斜辺の端の点から真下に入ると最初の岩が隣（下）の満ちたタイルになり、
 * 次の点の側からは斜辺と分からない（グレネードが坂の途中の境目で止まって転がらなかった。実測）
 */
export function hypotenuseAhead(code, plx, ply, slx, sly) {
    const qx = plx < QS ? 0 : 1, qy = ply < QS ? 0 : 1;
    const q = (code >> (3 * (qy * 2 + qx))) & 7;
    if (q === Q_EMPTY || q === Q_FULL) return null;
    if (!quadContains(q, slx - qx * QS, sly - qy * QS)) return null;
    switch (q) {
        case Q_TRI_NO_TL: return { sx: -1, sy: -1 };
        case Q_TRI_NO_BR: return { sx: 1, sy: 1 };
        case Q_TRI_NO_TR: return { sx: 1, sy: -1 };
        default: return { sx: -1, sy: 1 };
    }
}
