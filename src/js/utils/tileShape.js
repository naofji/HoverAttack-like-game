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
