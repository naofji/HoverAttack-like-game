// ============================================
// palette - 3面の町の色
// ============================================
//
// 描画専用のパラメータなのでモジュールスコープに置く（LEG_STYLES と同じ例外）。
// 輝度の上下限は tests/town-palette.test.js が縛る:
//   壁: 遠景の rockLight(38.2) 以上、地形の岩 #B8860B(134.9) の 0.85 倍(114.7) 以下
//   描き込み・影: 遠景の空洞(13.1) 以上、114.7 以下
// 2026-10-11 のモックアップ（日干し煉瓦の塔・坑道の小屋）から取り、白壁だけ
// 上限に当たったので #b9a37a(165) → #7c6e54(111) へ落とした。白というより
// 「土より少し白っぽい」だが、隣の土色との差で白壁として読める。

import { lerpColor } from '../../utils/color.js';

export const TOWN_BODY_COLORS = {
    adobe: ['#7d5a2a', '#87622f', '#6f4f24', '#906a36', '#7a5f38'], // 95 / 103 / 84 / 111 / 99
    wash: ['#7c6e54', '#776a50'],                                   // 111 / 107（シバームの上階の白壁）
    wood: ['#5a3d1e', '#694624', '#4f3519'],                        // 66 / 77 / 58
    rust: ['#8a4a22', '#7a5530', '#9a5a2a'],                        // 89 / 92 / 104（錆びたトタン）
    metal: ['#5e5446', '#4f4a42'],                                  // 85 / 75
};

export const TOWN_DETAIL_COLORS = {
    beam: '#3d2a12',    // 45  梁の木口・手すり・柱
    rope: '#4a3418',    // 55  綱
    winDark: '#1c1206', // 20  灯りの無い窓・戸口
    // 114。光らせない。弾（#FFDD33 / #FFCC00、輝度 200 前後の丸）と見間違えないよう、
    // 輝度の上限いっぱいの暗い琥珀の四角にする
    winLit: '#a8652a',
    lantern: '#9a6a32', // 114
};

const SHADE_K = 0.25;

/** 影の側（右の 4px）の色。壁の色を黒へ 25% 寄せる */
export function shade(hex) {
    return lerpColor(hex, '#000000', SHADE_K);
}

// 段2: 穴の縁に残ったかけらに重ねる焦げ（半透明。何度も当たると重なって濃くなる）
export const TOWN_CHAR_EDGE = 'rgba(28, 18, 6, 0.55)';
// 崩壊で残った土台に重ねる焦げ（焦げた骨組み）
export const TOWN_RUIN_SHADE = 'rgba(20, 12, 4, 0.5)';

// 段2: 瓦礫の山と破片の粒の色（材料の番号 → 色）。輝度は TOWN_BODY_COLORS と同じ範囲の色から選んだ
export const TOWN_RUBBLE_COLORS = {
    1: '#6f4f24',   // 土（adobe の暗いほう）
    2: '#4f3519',   // 木
    3: '#4f4a42',   // 金属
    4: '#4f3519',   // 爆発物（段3b。木箱と同じ色）
};
export const TOWN_DUST_COLOR = '#8a7a5a';

// 段3: 炎の粒の色。生まれたて（熱い）→ 昇って冷える の順。角ばった四角で描く（spec 3章「見た目」）。
// 町の層（岩の縁より奥）に描くので、地形の黄色い岩より明るい黄でも岩に被って見えることはない
export const TOWN_FLAME_COLORS = ['#ffd860', '#ff9a2a', '#d8401a'];
// 残り火の火の粉
export const TOWN_EMBER_COLOR = '#ff7a1a';

// 段3b: 爆発物の色。狙って撃てるよう「見て爆発物と分かる」赤にする（spec 3b章）。
// 建物の輝度の上限（地形の岩の 0.85 倍）からは外す。弾（明るい黄色の丸）とは色の距離で離し
// （tests/town-palette.test.js）、形も四角にする
export const TOWN_EXPLOSIVE_COLORS = {
    drum: '#b0301e',            // 燃料のドラム缶
    drumBand: '#5a1a10',        // ドラム缶のたが
    drumRim: '#c84030',         // ドラム缶の縁（上の 1px）。#d0503a は弾の黄色まで 149 で近すぎた
    crateMark: '#c8281a',       // ダイナマイトの木箱の赤い印
    crateMarkInner: '#e8e0d0',  // 印の中の白
    gas: '#a82a22',             // ガスボンベ
    gasBand: '#e0d8c8',         // ボンベの白い帯
    gasCap: '#4f4a42',          // ボンベの口金
    jar: '#5a3a20',             // 油壺
    jarSeal: '#c8281a',         // 油壺の赤い封
};
