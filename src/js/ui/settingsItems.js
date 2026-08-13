// ============================================
// settingsItems - 設定画面の項目の表
// ============================================
//
// 項目の違いは**この表の1行**に出る。描画も入力処理も type で分岐するので、
// 項目を足すのは行を1つ足すだけで済む（CLAUDE.md の共通機構の方針）。
//
// type:
//   volume … 0〜1 の値。A/D で増減し、パーセントで表示する
//   toggle … 真偽値。A で OFF、D で ON
//   action … 値を持たない。Enter で run(game) を呼ぶ
//
// onlyWhenPlaying: プレイ中に開いたときだけ出す（タイトルには「途中終了」が要らない）

import { toggleFullscreen } from '../utils/fullscreen.js';

export const SETTINGS_ITEMS = [
    { key: 'masterVolume', label: 'MASTER VOLUME', type: 'volume' },
    { key: 'bgmVolume', label: 'BGM VOLUME', type: 'volume' },
    { key: 'seVolume', label: 'SE VOLUME', type: 'volume' },
    { key: 'autoSwitchMissile', label: 'AUTO-SWITCH TO MISSILE ON DOCK', type: 'toggle' },
    { key: 'mgAutoReload', label: 'MG AUTO-RELOAD', type: 'toggle' },
    { key: 'fullscreen', label: 'FULLSCREEN', type: 'action', run: () => toggleFullscreen() },
    { key: 'quit', label: 'QUIT MISSION', type: 'action', onlyWhenPlaying: true, confirm: true },
];

/**
 * その場面で出す項目だけを返す。
 * @param {boolean} fromPlaying プレイ中から開いたか
 */
export function visibleSettingsItems(fromPlaying) {
    return SETTINGS_ITEMS.filter((item) => fromPlaying || !item.onlyWhenPlaying);
}
