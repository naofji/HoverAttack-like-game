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

const KEY = 30;
const GAP = 4;
const PITCH = KEY + GAP;

const CLUSTER_W = 5 * PITCH;
const CLUSTER_H = 4 * PITCH;
const MOUSE_W = 54;
const MOUSE_H = 76;

const HEAD_H = 24;      // 列の見出しの下まで
const LIST_LINE = 20;
const LIST_KEY_W = 72;  // 説明が始まるまでのキー名の欄

// 右の列の左端。左の列のいちばん長い説明（MOVE LEFT / RIGHT…で 72+218=290px）
// が届かない位置に置きつつ、右の列のいちばん長い説明（GRENADE…で 72+250=322px）
// が幅 640 でも収まるところ。両側が同時にぎりぎりなので、文言を伸ばすと
// どちらかがはみ出す（テストが落ちる）
const RIGHT_COL_X = 308;

/** 左の列（キーボード）に出す行。並びは絵の上から下へ。 */
const LEFT_LIST = ['W', 'A / D', 'S', 'F', 'SHIFT', 'R'];

/** 図の高さ。パネルの高さを決めるために描く前に呼ぶ。 */
export function controlsDiagramHeight() {
    const leftH = CLUSTER_H + 12 + LEFT_LIST.length * LIST_LINE;
    // 右の列は マウス＋その説明＋（区切り）＋どちらの手でもないキーの説明
    const rightH = MOUSE_H + 12 + MOUSE_BUTTONS.length * LIST_LINE
        + 24 + OFF_MOUSE_KEYS.length * LIST_LINE;
    return HEAD_H + Math.max(leftH, rightH);
}

/** キー1つ。幅を指定したいので theme のキーキャップは使わない。 */
function drawKey(ctx, x, y, w, label, color) {
    drawFrame(ctx, x, y, w, KEY, color, { fill: UI.panelHead, radius: 4 });
    ctx.fillStyle = color;
    ctx.font = font(label.length > 2 ? 'micro' : 'small', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + KEY / 2);
}

/**
 * マウス。左右のボタンだけを塗り分けた輪郭。ホイールは使わないので描かない
 * （使わないものを描くと、押すものだと思われる）。
 */
function drawMouse(ctx, x, y, color) {
    drawFrame(ctx, x, y, MOUSE_W, MOUSE_H, color, { fill: UI.panelFill, radius: 18 });
    // ボタンの区切り。上から 40% までが左右ボタン
    const split = Math.round(MOUSE_H * 0.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + MOUSE_W / 2, y);
    ctx.lineTo(x + MOUSE_W / 2, y + split);
    ctx.moveTo(x, y + split);
    ctx.lineTo(x + MOUSE_W, y + split);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = font('small', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    MOUSE_BUTTONS.forEach((b, i) => {
        ctx.fillText(b.cap, x + MOUSE_W / 4 + (i * MOUSE_W) / 2, y + split / 2);
    });
}

/** 説明の1行。キー名だけを群の色にして、絵のどのキーの話かを結びつける。 */
function drawListLine(ctx, x, y, rowKey, color) {
    const row = CONTROLS_ROWS.find((r) => r.key === rowKey);
    if (!row) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('small', true);
    ctx.fillStyle = color;
    ctx.fillText(row.key, x, y);
    ctx.font = font('small');
    ctx.fillStyle = UI.ink;
    ctx.fillText(row.label, x + LIST_KEY_W, y);
}

/** 列の見出し。 */
function drawColumnHead(ctx, x, y, text, color) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('small', true);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

/**
 * 操作の図を描く。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 使える領域の左端
 * @param {number} y 上端
 * @param {number} w 使える幅
 * @returns {number} 描いた高さ（呼び出し側が続きを置くために返す）
 */
export function drawControlsDiagram(ctx, x, y, w) {
    ctx.save();

    const rightX = x + RIGHT_COL_X;
    const top = y + HEAD_H;

    // ---- 左の列: キーボード ----
    drawColumnHead(ctx, x, y, '■ LEFT HAND', DIAGRAM_COLORS.leftHand);
    for (const k of LEFT_HAND_KEYS) {
        drawKey(ctx, x + k.ux * PITCH, top + k.gy * PITCH,
            k.w * PITCH - GAP, k.cap, DIAGRAM_COLORS.leftHand);
    }
    LEFT_LIST.forEach((rowKey, i) => {
        drawListLine(ctx, x, top + CLUSTER_H + 12 + 10 + i * LIST_LINE,
            rowKey, DIAGRAM_COLORS.leftHand);
    });

    // ---- 右の列: マウス ----
    drawColumnHead(ctx, rightX, y, '■ RIGHT HAND', DIAGRAM_COLORS.rightHand);
    // マウスは列の左端に置く。説明の左端と揃えると、絵と一覧が1つの塊に見える
    drawMouse(ctx, rightX, top, DIAGRAM_COLORS.rightHand);
    const rightListTop = top + MOUSE_H + 12 + 10;
    MOUSE_BUTTONS.forEach((b, i) => {
        drawListLine(ctx, rightX, rightListTop + i * LIST_LINE,
            b.rowKey, DIAGRAM_COLORS.rightHand);
    });

    // ---- 右の列の続き: どちらの手でもないキー ----
    // マウスの下に続けるが、色と小見出しで「マウスの操作ではない」ことを示す。
    // 押すときはマウスから手を離す＝戦闘中に押すキーではない、が伝わる
    const offTop = rightListTop + MOUSE_BUTTONS.length * LIST_LINE + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('micro', true);
    ctx.fillStyle = DIAGRAM_COLORS.offMouse;
    ctx.fillText('□ OFF-MOUSE — TAKE YOUR HAND OFF', rightX, offTop);
    OFF_MOUSE_KEYS.forEach((rowKey, i) => {
        drawListLine(ctx, rightX, offTop + 18 + i * LIST_LINE,
            rowKey, DIAGRAM_COLORS.offMouse);
    });

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return controlsDiagramHeight();
}
