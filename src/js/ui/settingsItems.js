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
//   choice … 決まった選択肢。A/D で左右に動く（labels に表示名）
//   int    … 整数。A/D で 1 ずつ動く（suffix に単位）
//   action … 値を持たない。Enter で run(game) を呼ぶ
//
// onlyWhenPlaying: プレイ中に開いたときだけ出す（タイトルには「途中終了」が要らない）
// dimWhen: 真を返すとその行を淡色で描く（効いていないことを色で伝える）

import { volumePercent } from '../utils/bgmVolume.js';

export const SETTINGS_ITEMS = [
    { key: 'masterVolume', label: 'MASTER VOLUME', type: 'volume' },
    { key: 'bgmVolume', label: 'BGM VOLUME', type: 'volume' },
    { key: 'seVolume', label: 'SE VOLUME', type: 'volume' },
    { key: 'autoSwitchMissile', label: 'AUTO-SWITCH TO MISSILE ON DOCK', type: 'toggle' },
    {
        key: 'mgAutoReloadMode', label: 'MG AUTO-RELOAD', type: 'choice',
        labels: { off: 'OFF', onSwitch: 'ON WEAPON SWITCH', always: 'ALWAYS' },
    },
    {
        key: 'mgReloadThreshold', label: 'RELOAD AT AMMO', type: 'int', suffix: ' ROUNDS',
        // OFF のときは効かないが**行は消さない**。消すと下の項目の位置が動いて
        // カーソルが飛ぶので、色だけで伝える
        dimWhen: (s) => s.mgAutoReloadMode === 'off',
    },
    { key: 'autoAimRelease', label: 'AUTO-AIM RELEASE', type: 'int' },
    // その場で切り替える action の行はかつてここにあったが、AUTO FULLSCREEN が ON の
    // ときに使うと「今は窓にしたのに、設定画面を閉じた瞬間また全画面に戻る」という
    // 矛盾になるので廃止した。窓に戻したいときは M キー（HOW TO PLAY に記載）が
    // そのまま使える。ON にした瞬間に全画面へ入る配線は main.js の _updateSettings() 側
    { key: 'autoFullscreen', label: 'AUTO FULLSCREEN', type: 'toggle' },
    { key: 'quit', label: 'QUIT MISSION', type: 'action', onlyWhenPlaying: true, confirm: true },
];

/**
 * その場面で出す項目だけを返す。
 * @param {boolean} fromPlaying プレイ中から開いたか
 */
export function visibleSettingsItems(fromPlaying) {
    return SETTINGS_ITEMS.filter((item) => fromPlaying || !item.onlyWhenPlaying);
}

/**
 * 1項目の値を画面に出す文字列にする。描画から切り離しておくと、ctx を作らずに
 * 文字列だけを試せる。
 * @returns {string|null} action は値を持たないので null
 */
export function settingValueText(item, settings) {
    const v = settings[item.key];
    switch (item.type) {
        // すぐ上の音量 HUD が `${pct}%` と描いているのに、こちらだけ数字だけだと
        // 同じ画面内で不揃いに見えるため合わせる
        case 'volume': return `${volumePercent(v)}%`;
        case 'toggle': return v ? 'ON' : 'OFF';
        case 'choice': return item.labels[v] ?? String(v);
        case 'int': return `${v}${item.suffix ?? ''}`;
        default: return null;
    }
}
