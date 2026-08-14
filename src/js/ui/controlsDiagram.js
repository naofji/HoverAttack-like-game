// ============================================
// controlsDiagram - 操作を図で示す
// ============================================
//
// 「キー名と説明の対応表」は、実機で試したユーザーから**手をどこに置くのか
// 分からない・頭に入らない**という指摘を受けた。対応表は「Fが武器切替」までは
// 伝えるが、「左手はここに固定、右手はマウス」という体で覚える部分をまったく
// 伝えない。そこで左手のキーを**実際の配列のまま**描き、マウスを並べて置く。
//
// 図に載せる語は短くする（CONTROLS_ROWS の short）。タップと長押しの違いのように
// 図では表せないものだけ、下に全文（action）を出す二段構え。
//
// HOW TO PLAY の2ページ目と設定画面のオーバーレイが**この1つの関数**を呼ぶので、
// 2画面で見た目がずれない。パネル幅は画面ごとに違う（800 / 720）ため、
// 描き始めの x と使える幅を受け取って内側に収める。

import { UI, font, drawFrame } from './theme.js';
import { CONTROLS_ROWS, LEFT_HAND_KEYS, MOUSE_BUTTONS, OFF_MOUSE_KEYS } from './controlsList.js';

/** 群ごとの色。凡例と各キーで同じものを使う（食い違うと群が判断できない）。 */
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

// 図の縦の組み立て。パネルの高さを**描く前に**決める必要があるので、
// 描画と同じ式をここ1箇所に置いて両方が使う（別々に持つと必ずずれる）
const LEGEND_H = 24;          // 凡例の下まで
const CLUSTER_H = 4 * PITCH;  // キーの段数
const OTHER_GAP = 14;         // クラスタと OTHER の間
const OTHER_H = 12 + KEY;     // OTHER の見出し＋キー
const DETAIL_GAP = 20;
const DETAIL_LINE = 18;

/** 図の高さ。パネルの高さを決めるために描く前に呼ぶ。 */
export function controlsDiagramHeight() {
    const details = CONTROLS_ROWS.filter((r) => r.detail).length;
    return LEGEND_H + CLUSTER_H + OTHER_GAP + OTHER_H + DETAIL_GAP + 16 + details * DETAIL_LINE;
}

/** キー1つ。drawKeyCap（右揃え・幅固定）では図に使えないので、ここで持つ。 */
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
 * @returns {number} 描いた高さ
 */
function drawMouse(ctx, x, y, color) {
    const w = 54;
    const h = 76;
    drawFrame(ctx, x, y, w, h, color, { fill: UI.panelFill, radius: 18 });
    // ボタンの区切り。上から 40% までが左右ボタン
    const split = Math.round(h * 0.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + split);
    ctx.moveTo(x, y + split);
    ctx.lineTo(x + w, y + split);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = font('small', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    MOUSE_BUTTONS.forEach((b, i) => {
        ctx.fillText(b.cap, x + w / 4 + (i * w) / 2, y + split / 2);
    });
    return h;
}

/** 「キー名 ラベル」の1行。キー名は群の色、ラベルは本文の色。 */
function drawLabelLine(ctx, x, y, rowKey, color) {
    const row = CONTROLS_ROWS.find((r) => r.key === rowKey);
    if (!row) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('small', true);
    ctx.fillStyle = color;
    ctx.fillText(row.key, x, y);
    ctx.font = font('small');
    ctx.fillStyle = UI.ink;
    ctx.fillText(row.short, x + 76, y);
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
    ctx.fillText('■ RIGHT HAND', x + 160, y);

    // ---- 左手のキークラスタ ----
    const clusterTop = y + LEGEND_H;
    for (const k of LEFT_HAND_KEYS) {
        const kx = x + (k.gx + ROW_OFFSET[k.gy]) * PITCH;
        const ky = clusterTop + k.gy * PITCH;
        drawKey(ctx, kx, ky, k.w * PITCH - GAP, k.cap, DIAGRAM_COLORS.leftHand);
    }
    const clusterW = 5 * PITCH;

    // ---- クラスタの右にラベル ----
    // 図のキーと同じ順（上の段から）で並べると、目が行き来しやすい
    const labelX = x + clusterW + 16;
    const labelKeys = ['W', 'A / D', 'S', 'F', 'SHIFT', 'R'];
    labelKeys.forEach((key, i) => {
        drawLabelLine(ctx, labelX, clusterTop + 10 + i * 22, key, DIAGRAM_COLORS.leftHand);
    });

    // ---- マウス ----
    // 右端に寄せる。左手のクラスタと離すことで、両手が別々の場所にあることを見せる。
    // 220 は「マウス54 ＋ ラベルの字下げ76 ＋ 一番長い短ラベル」がぎりぎり収まる幅
    const mouseX = x + w - 220;
    drawMouse(ctx, mouseX, clusterTop + 8, DIAGRAM_COLORS.rightHand);
    MOUSE_BUTTONS.forEach((b, i) => {
        drawLabelLine(ctx, mouseX + 70, clusterTop + 26 + i * 22, b.rowKey, DIAGRAM_COLORS.rightHand);
    });

    // ---- どちらの手でもないキー ----
    const otherY = clusterTop + CLUSTER_H + OTHER_GAP;
    ctx.textAlign = 'left';
    ctx.font = font('micro', true);
    ctx.fillStyle = DIAGRAM_COLORS.offMouse;
    ctx.fillText('OTHER — TAKE YOUR HAND OFF THE MOUSE', x, otherY);

    let ox = x;
    for (const key of OFF_MOUSE_KEYS) {
        const row = CONTROLS_ROWS.find((r) => r.key === key);
        const capW = Math.max(key.length * 8 + 14, 30);
        drawKey(ctx, ox, otherY + 12, capW, key, DIAGRAM_COLORS.offMouse);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = font('small');
        ctx.fillStyle = UI.ink;
        ctx.fillText(row.short, ox + capW + 8, otherY + 12 + KEY / 2);
        ox += capW + 12 + row.short.length * 8;
    }

    // ---- 図では表せない差 ----
    const detailTop = otherY + OTHER_H + DETAIL_GAP;
    const details = CONTROLS_ROWS.filter((r) => r.detail);
    ctx.textAlign = 'left';
    ctx.font = font('micro', true);
    ctx.fillStyle = DIAGRAM_COLORS.offMouse;
    ctx.fillText('DETAILS', x, detailTop);
    details.forEach((row, i) => {
        const dy = detailTop + 16 + i * DETAIL_LINE;
        ctx.font = font('small', true);
        ctx.fillStyle = UI.info;
        ctx.fillText(row.key, x, dy);
        ctx.font = font('small');
        ctx.fillStyle = UI.dim;
        ctx.fillText(row.action, x + 76, dy);
    });

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return controlsDiagramHeight();
}
