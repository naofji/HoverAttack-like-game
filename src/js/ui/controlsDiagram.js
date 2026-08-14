// ============================================
// controlsDiagram - 操作を図で示す
// ============================================
//
// 「キー名と説明の対応表」は、実機で試したユーザーから**手をどこに置くのか
// 分からない・頭に入らない**という指摘を受けた。対応表は「Fが武器切替」までは
// 伝えるが、「左手はここに固定、右手はマウス」という体で覚える部分をまったく
// 伝えない。そこで左手のキーを**実際の配列のまま**描き、隣にマウスを置く。
//
// 構成は「左＝絵、右＝一覧」の2列だけ。**説明はキーにつき1行**しか出さない。
// 最初は絵に短い語を添えたうえで下に詳細も並べていたが、同じキーの説明が
// 2箇所に出るぶん「ごちゃごちゃする」と指摘されて1本にまとめた。
// 絵と一覧は**色**で結びつける（左手＝シアン／右手＝琥珀／どちらでもない＝淡色）。
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

// キーの升目。実際のキーボードは1段ごとに横へずれるので、その量も持つ。
// ずれが無いと格子に見えてしまい、配列を写した図に見えない
const KEY = 30;
const GAP = 4;
const PITCH = KEY + GAP;
const ROW_OFFSET = [0, 0.25, 0.5, 0.75];

const CLUSTER_W = 5 * PITCH;
const CLUSTER_H = 4 * PITCH;
const MOUSE_W = 54;
const MOUSE_H = 76;

// 一覧の組み立て。絵と高さを揃えたいので、行送りは絵の高さから決めずに固定する
const LEGEND_H = 26;   // 凡例の下まで
const LIST_LINE = 20;
const LIST_X = CLUSTER_W + 24 + MOUSE_W + 28; // 絵（キーボード＋マウス）の右
const LIST_LABEL_X = 84;                      // 一覧の中で説明が始まる位置

/** 一覧に出す順。群ごとにまとめる（手の単位で読めるように）。 */
const LIST_ORDER = [
    ...['W', 'A / D', 'S', 'F', 'SHIFT', 'R'],
    ...MOUSE_BUTTONS.map((b) => b.rowKey),
    ...OFF_MOUSE_KEYS,
];

/** 一覧の各行を何色で描くか。キーがどの群のものかで決まる。 */
function groupColorOf(rowKey) {
    if (MOUSE_BUTTONS.some((b) => b.rowKey === rowKey)) return DIAGRAM_COLORS.rightHand;
    if (OFF_MOUSE_KEYS.includes(rowKey)) return DIAGRAM_COLORS.offMouse;
    return DIAGRAM_COLORS.leftHand;
}

/** 図の高さ。パネルの高さを決めるために描く前に呼ぶ。 */
export function controlsDiagramHeight() {
    // 絵と一覧の高い方。行が増えれば一覧が伸びる
    const listH = LIST_ORDER.length * LIST_LINE;
    return LEGEND_H + Math.max(CLUSTER_H, listH);
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
 * キーボードのすぐ右に置く＝実際の机の上と同じ位置関係にする。
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

    // ---- 凡例 ----
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('small', true);
    ctx.fillStyle = DIAGRAM_COLORS.leftHand;
    ctx.fillText('■ LEFT HAND', x, y);
    ctx.fillStyle = DIAGRAM_COLORS.rightHand;
    ctx.fillText('■ RIGHT HAND', x + 150, y);
    // 「どちらの手でもない」は、押すときにマウスから手を離すという意味。
    // 戦闘中に押すキーではないことがこれで分かる
    ctx.fillStyle = DIAGRAM_COLORS.offMouse;
    ctx.font = font('micro', true);
    ctx.fillText('□ OFF-MOUSE', x + 310, y);

    const top = y + LEGEND_H;

    // ---- 左手のキークラスタ ----
    for (const k of LEFT_HAND_KEYS) {
        const kx = x + (k.gx + ROW_OFFSET[k.gy]) * PITCH;
        const ky = top + k.gy * PITCH;
        drawKey(ctx, kx, ky, k.w * PITCH - GAP, k.cap, DIAGRAM_COLORS.leftHand);
    }

    // ---- マウス ----
    // キーボードのすぐ右。机の上の位置関係をそのまま見せることで、
    // どちらの手のものかを説明せずに伝える
    drawMouse(ctx, x + CLUSTER_W + 24, top + PITCH, DIAGRAM_COLORS.rightHand);

    // ---- 一覧（キーにつき1行だけ） ----
    LIST_ORDER.forEach((rowKey, i) => {
        const row = CONTROLS_ROWS.find((r) => r.key === rowKey);
        if (!row) return;
        const ly = top + 10 + i * LIST_LINE;
        const color = groupColorOf(rowKey);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = font('small', true);
        ctx.fillStyle = color;
        ctx.fillText(row.key, x + LIST_X, ly);

        ctx.font = font('small');
        // 説明は本文の色。キー名だけを群の色にすることで、色が「どの手か」
        // だけを意味する（説明まで染めると色数が増えて読みにくい）
        ctx.fillStyle = UI.ink;
        ctx.fillText(row.label, x + LIST_X + LIST_LABEL_X, ly);
    });

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return controlsDiagramHeight();
}
