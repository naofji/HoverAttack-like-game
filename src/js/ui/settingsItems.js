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
//   int    … 整数。A/D で 1 ずつ動く（suffix に単位、format があれば表示を任せる）
//   action … 値を持たない。Enter で run(game) を呼ぶ
//
// onlyWhenPlaying: プレイ中に開いたときだけ出す（タイトルには「途中終了」が要らない）
// dimWhen: 真を返すとその行を淡色で描く（効いていないことを色で伝える）
// danger: 進行を捨てる操作。警告色で描いて、設定を変える行と取り違えないようにする

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
    // 「RELEASE」だけだと何の解除か読めない。ロックが外れる境界値だと分かる名前にする
    { key: 'autoAimRelease', label: 'AUTO-AIM RELEASE THRESHOLD', type: 'int' },
    {
        key: 'autoAimHoldTenths', label: 'AUTO-AIM HOLD TO TOGGLE', type: 'int',
        // int は整数しか刻めないので 1/10 秒で持ち、表示だけ秒に直す。
        // 「3」と出しても何の単位か読めないため
        format: (v) => `${(v / 10).toFixed(1)} SEC`,
    },
    { key: 'autoAimResumeOnPickup', label: 'RESUME AUTO-AIM ON PICKUP', type: 'toggle' },
    // その場で切り替える action の行はかつてここにあったが、AUTO FULLSCREEN が ON の
    // ときに使うと「今は窓にしたのに、設定画面を閉じた瞬間また全画面に戻る」という
    // 矛盾になるので廃止した。窓に戻したいときは M キー（HOW TO PLAY に記載）が
    // そのまま使える。ON にした瞬間に全画面へ入る配線は main.js の _updateSettings() 側
    { key: 'autoFullscreen', label: 'AUTO FULLSCREEN', type: 'toggle' },
    // 値を持たない読み物の行。ゲーム中は HOW TO PLAY をタイトルまで戻らないと
    // 見られなかったので、ポーズしたその場で操作を確かめられるようにする。
    // 表の中身は controlsList.js と共有（HOW TO PLAY と同じ表を読む）
    { key: 'viewControls', label: 'VIEW CONTROLS', type: 'action', run: (game) => { game.showingControls = true; } },
    // 唯一「設定を変える」ではなく進行を捨てる行。同じ色で並んでいると設定項目だと
    // 思って Enter を押しかねないので、確認ダイアログと同じ警告色で異質さを見せる
    { key: 'quit', label: 'QUIT MISSION', type: 'action', onlyWhenPlaying: true, confirm: true, danger: true },
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
        case 'int': return item.format ? item.format(v) : `${v}${item.suffix ?? ''}`;
        default: return null;
    }
}
