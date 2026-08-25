// ============================================
// Screen Layout
// ============================================
//
// 画面をまたいで共有するレイアウトの寸法と、ランキング表の列定義。
// もとは ScreenRenderer の static メンバだったが、画面ごとにファイルを
// 分けたときに各ファイルが ScreenRenderer を import し返す（循環参照に
// なる）ので、ただのモジュールとして下ろした。
//
// **座標の根拠はここのコメントに全部残してある。** 実機で見て動かした値なので、
// 動かすときは理由ごと読むこと。

import { SPACE } from '../theme.js';

/**
 * ランキング表の列。x は表の左端からの相対位置。
 *
 * 以前は1本の文字列に padStart/padEnd で桁を詰めて描いていたが、
 * 見出しと中身が最大4文字ずれていた。さらに国旗の絵文字は等幅フォントでも
 * 送り幅が一定にならないため、国旗の有無でそれ以降の列が動いていた。
 * 列ごとに座標と揃えを決めて独立に描けば、絵文字の幅に左右されない。
 */
// 関連する列は寄せ、グループ間だけ空ける（順位＋スコア / 名前＋地域 / 到達＋時間）。
// 等間隔に散らすと、どの値がどの値と対になるのか読み取りにくい。
export const RANKING_COLUMNS = [
    { key: 'rank', label: 'RANK', x: 31, align: 'right' },
    { key: 'score', label: 'SCORE', x: 130, align: 'right' },
    { key: 'name', label: 'NAME', x: 226, align: 'left' },
    { key: 'flag', label: 'REGION', x: 354, align: 'left' },
    // TRY は「そのランがどう終わったか」の仲間なので MISSION / TIME と並べる。
    // 当初は名前と国旗の隙間（x=346・small）に押し込んでいたが、名前列に
    // ぶら下がって見えて浮いた（実機の指摘）。国旗(354 左揃え)から十分離れた
    // 470 に右揃えで置くと、470→552→632 と 82/80px のほぼ等間隔になり、
    // 3列が1つのまとまりとして読める。
    { key: 'tries', label: 'TRY', x: 470, align: 'right' },
    { key: 'mission', label: 'MISSION', x: 552, align: 'right' },
    { key: 'time', label: 'TIME', x: 632, align: 'right' },
];

export const RANKING_TABLE_WIDTH = 632;

/**
 * 常にこの数だけ枠を描き、記録が無い行は空欄で埋める。
 * 記録が少ないと画面下が大きく空いてしまう（3件のとき下に560px、埋まり10%）。
 * 当時のハイスコア表が固定枠だったのに倣うと、見た目が安定し余白も一定になる。
 */
export const RANKING_SLOTS = 20;

/** Wall of Fame の1週ブロック内の列。ランキング表と同じ理由で座標指定にする。 */
export const FAME_COLUMNS = [
    { key: 'rank', x: 24, align: 'right' },
    { key: 'score', x: 130, align: 'right' },
    { key: 'name', x: 162, align: 'left' },
    { key: 'flag', x: 292, align: 'left' },
    // TRY はブロックの右端。名前(162 左揃え・最大10文字≒258)と
    // 国旗(292 左揃え)の隙間に入れると、週ランキング表で一度やって
    // 「名前にぶら下がって浮く」と言われた形になる。国旗の右へ出すために
    // ブロック幅を 330→366 に広げた（2列で 788px。16:9化 (1366px) の画面は
    // もちろん、当時の 4:3 (1024px) の画面にも収まっていた値なので、
    // 横に広がった今回はさらに余裕がある）。
    { key: 'tries', x: 366, align: 'right' },
];

export const FAME_BLOCK_WIDTH = 366;

/** パネル見出し帯の高さ（theme.drawPanel と揃える）＋内側の余白。 */
export const PANEL_HEAD = 36;
export const PANEL_PAD = SPACE.md;

/** 中身の高さから必要なパネル高を求める。 */
export function panelHeight(contentH) {
    return PANEL_HEAD + PANEL_PAD * 2 + contentH;
}

/** パネル内で中身を書き始める y（1行目のベースライン）。 */
export function panelContentTop(panelY, lineH) {
    return panelY + PANEL_HEAD + PANEL_PAD + Math.round(lineH * 0.75);
}

