// ============================================
// controlsDiagram - 操作を図で示す
// ============================================
//
// 「キー名と説明の対応表」は、実機で試したユーザーから**手をどこに置くのか
// 分からない・頭に入らない**という指摘を受けた。対応表は「Fが武器切替」までは
// 伝えるが、「左手はここに固定、右手はマウス」という体で覚える部分をまったく
// 伝えない。そこで左手のキーを**実際の配列のまま**描き、隣にマウスを置く。
//
// 構成は**手ごとの2列**。左の列がキーボードとその説明、右の列がマウスとその説明。
// 説明を絵の横にまとめて置いていたときは、どちらの手の話なのか目で追えなかった。
// 絵のすぐ下にその手の説明だけを置けば、列を見るだけで片手ぶんが読める。
//
// 説明は**キーにつき1行**しか出さない。最初は絵に短い語を添えたうえで下に詳細も
// 並べていたが、同じキーの説明が2箇所に出るぶん「ごちゃごちゃする」と指摘された。
//
// 色は左手＝シアン／右手＝琥珀／どちらの手でもない＝淡色。キー名だけを染めて
// 説明は本文色に統一する（説明まで染めると色数が増えて読みにくい）。
//
// HOW TO PLAY の2ページ目と設定画面のオーバーレイが**この1つの関数**を呼ぶので、
// 2画面で見た目がずれない。パネル幅は画面ごとに違う（800 / 720）ため、
// 描き始めの x と使える幅を受け取って内側に収める。

import { UI, font, drawFrame } from './theme.js';
import { CONTROLS_ROWS, LEFT_HAND_KEYS, MOUSE_BUTTONS, OFF_MOUSE_KEYS } from './controlsList.js';

/** 群ごとの色。絵と一覧で同じものを使う（食い違うと群が判断できない）。 */
export const DIAGRAM_COLORS = {
    leftHand: UI.info,     // シアン
    rightHand: UI.accent,  // 琥珀
    offMouse: UI.dim,      // どちらの手でもない＝控えめに
};

// ---- 倍率 1.0 のときの寸法 ----
// 設定画面のオーバーレイ（パネル 720）がこの大きさで、実機で見て決めた値。
// HOW TO PLAY の2ページ目だけ倍率 1.5 で呼ぶ（16:9 で横が余っていたため）。
const KEY = 30;
const GAP = 4;
const MOUSE_W = 54;
const MOUSE_H = 76;

const HEAD_H = 24;      // 列の見出しの下まで
const LIST_LINE = 20;
const LIST_KEY_W = 68;  // 説明が始まるまでのキー名の欄
const LIST_MARGIN = 22; // キーの絵の下から一覧の1行目まで
const OFF_GAP = 12;     // マウスの説明と OFF-MOUSE の小見出しの間
const OFF_HEAD = 18;    // 小見出しからその1行目まで

// 右の列の左端の**下限**。左右が近いと「どちらの手の話か目が迷う」と実機で
// 指摘されたので、左の列のいちばん長い説明（MOVE LEFT / RIGHT…で 68+218=286px）
// の右に 36px 空ける。実際の左端は「使える幅の半分」で、これはこの下限と、
// 右の列のいちばん長い説明（GRENADE…で 318px）が収まる上限の**両方**を
// 自動で満たす（いちばん狭いパネル 656 では 328 になり、従来の 322 とほぼ同じ）。
const RIGHT_COL_X = 322;

/**
 * 倍率 s のときの寸法。**文字は ctx.scale で拡大しない。** 変換をかけると
 * 描画座標が変換前の値になり、「パネルからはみ出していないか」を見る既存の
 * テストが意味を失う。theme の文字の段を1つ上げることで大きくする
 * （13→16 の 1.23倍。キーの箱は 1.5倍なので、箱の中が窮屈にならない）。
 */
function metrics(s) {
    const key = Math.round(KEY * s);
    const gap = Math.round(GAP * s);
    const pitch = key + gap;
    return {
        key, gap, pitch,
        clusterH: 4 * pitch,
        mouseW: Math.round(MOUSE_W * s),
        mouseH: Math.round(MOUSE_H * s),
        headH: Math.round(HEAD_H * s),
        listLine: Math.round(LIST_LINE * s),
        listKeyW: Math.round(LIST_KEY_W * s),
        listTop: 4 * pitch + Math.round(LIST_MARGIN * s),
        offGap: Math.round(OFF_GAP * s),
        offHead: Math.round(OFF_HEAD * s),
        // 文字の段。1.3 を境にしているのは、1.25倍程度までなら段を上げると
        // 逆に大きすぎるため（1.5 のときだけ上げたい）
        body: s >= 1.3 ? 'body' : 'small',
        micro: s >= 1.3 ? 'small' : 'micro',
    };
}

/** 左の列（キーボード）に出す行。並びは絵の上から下へ。 */
const LEFT_LIST = ['W', 'A / D', 'S', 'F', 'SHIFT', 'SPACE', 'R'];

// 一覧の開始位置（metrics().listTop）は**左右で同じ**にする。絵の高さは左右で
// 違う（キーボードは4段、マウスは1つ）ので、それに合わせて一覧の高さをずらすと
// 視線が段差を跨ぐことになり読みにくい、というのが実機での指摘。背の高いほう
// （キーボード）に合わせ、マウスの絵はその上の余白の縦中央へ置く

/**
 * 図の高さ。パネルの高さを決めるために描く前に呼ぶ。
 * @param {number} [scale] 1.0 = 設定画面のオーバーレイの大きさ
 */
export function controlsDiagramHeight(scale = 1) {
    const m = metrics(scale);
    const leftH = m.listTop + LEFT_LIST.length * m.listLine;
    // 右の列は マウスの説明＋（区切り）＋どちらの手でもないキーの説明
    const rightH = m.listTop + MOUSE_BUTTONS.length * m.listLine
        + m.offGap + m.offHead + OFF_MOUSE_KEYS.length * m.listLine;
    return m.headH + Math.max(leftH, rightH);
}

/** キー1つ。幅を指定したいので theme のキーキャップは使わない。 */
function drawKey(ctx, x, y, w, label, color, m) {
    drawFrame(ctx, x, y, w, m.key, color, { fill: UI.panelHead, radius: 4 });
    ctx.fillStyle = color;
    ctx.font = font(label.length > 2 ? m.micro : m.body, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + m.key / 2);
}

/**
 * マウス。左右のボタンだけを塗り分けた輪郭。ホイールは使わないので描かない
 * （使わないものを描くと、押すものだと思われる）。
 */
function drawMouse(ctx, x, y, color, m) {
    drawFrame(ctx, x, y, m.mouseW, m.mouseH, color, { fill: UI.panelFill, radius: Math.round(18 * m.mouseW / MOUSE_W) });
    // ボタンの区切り。上から 40% までが左右ボタン
    const split = Math.round(m.mouseH * 0.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + m.mouseW / 2, y);
    ctx.lineTo(x + m.mouseW / 2, y + split);
    ctx.moveTo(x, y + split);
    ctx.lineTo(x + m.mouseW, y + split);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = font(m.body, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    MOUSE_BUTTONS.forEach((b, i) => {
        ctx.fillText(b.cap, x + m.mouseW / 4 + (i * m.mouseW) / 2, y + split / 2);
    });
}

/** 説明の1行。キー名だけを群の色にして、絵のどのキーの話かを結びつける。 */
function drawListLine(ctx, x, y, rowKey, color, m) {
    const row = CONTROLS_ROWS.find((r) => r.key === rowKey);
    if (!row) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(m.body, true);
    ctx.fillStyle = color;
    ctx.fillText(row.key, x, y);
    ctx.font = font(m.body);
    ctx.fillStyle = UI.ink;
    ctx.fillText(row.label, x + m.listKeyW, y);
}

/** 列の見出し。 */
function drawColumnHead(ctx, x, y, text, color, m) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(m.body, true);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

/**
 * 操作の図を描く。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 使える領域の左端
 * @param {number} y 上端
 * @param {number} w 使える幅
 * @param {number} [scale] 1.0 = 設定画面のオーバーレイの大きさ
 * @returns {number} 描いた高さ（呼び出し側が続きを置くために返す）
 */
export function drawControlsDiagram(ctx, x, y, w, scale = 1) {
    ctx.save();

    const m = metrics(scale);
    // 右の列は**使える幅の半分**から。パネルが広いほど右手の情報が右へ寄る。
    // 下限を置いているのは、幅の半分が狭すぎるパネルでも左の列に被らないため
    const rightX = x + Math.max(Math.round(RIGHT_COL_X * scale), Math.round(w / 2));
    const top = y + m.headH;

    // ---- 左の列: キーボード ----
    drawColumnHead(ctx, x, y, '■ LEFT HAND', DIAGRAM_COLORS.leftHand, m);
    for (const k of LEFT_HAND_KEYS) {
        drawKey(ctx, x + k.ux * m.pitch, top + k.gy * m.pitch,
            k.w * m.pitch - m.gap, k.cap, DIAGRAM_COLORS.leftHand, m);
    }
    LEFT_LIST.forEach((rowKey, i) => {
        drawListLine(ctx, x, top + m.listTop + i * m.listLine, rowKey, DIAGRAM_COLORS.leftHand, m);
    });

    // ---- 右の列: マウス ----
    drawColumnHead(ctx, rightX, y, '■ RIGHT HAND', DIAGRAM_COLORS.rightHand, m);
    // マウスは列の左端に置く。説明の左端と揃えると、絵と一覧が1つの塊に見える。
    // 縦はキーボードに対して中央（一覧の開始が左右で揃うぶん、上に余白ができる）
    drawMouse(ctx, rightX, top + Math.round((m.clusterH - m.mouseH) / 2), DIAGRAM_COLORS.rightHand, m);
    const rightListTop = top + m.listTop;
    MOUSE_BUTTONS.forEach((b, i) => {
        drawListLine(ctx, rightX, rightListTop + i * m.listLine,
            b.rowKey, DIAGRAM_COLORS.rightHand, m);
    });

    // ---- 右の列の続き: どちらの手でもないキー ----
    // マウスの下に続けるが、色と小見出しで「マウスの操作ではない」ことを示す。
    // 押すときはマウスから手を離す＝戦闘中に押すキーではない、が伝わる
    const offTop = rightListTop + MOUSE_BUTTONS.length * m.listLine + m.offGap;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(m.micro, true);
    ctx.fillStyle = DIAGRAM_COLORS.offMouse;
    ctx.fillText('□ OFF-MOUSE — TAKE YOUR HAND OFF', rightX, offTop);
    OFF_MOUSE_KEYS.forEach((rowKey, i) => {
        drawListLine(ctx, rightX, offTop + m.offHead + i * m.listLine,
            rowKey, DIAGRAM_COLORS.offMouse, m);
    });

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return controlsDiagramHeight(scale);
}
