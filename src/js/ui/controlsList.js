// ============================================
// controlsList - 操作一覧の表
// ============================================
//
// HOW TO PLAY の2ページ目と、設定画面から開くオーバーレイの**両方**がこの表を
// 読む。以前は HOW TO PLAY の描画関数の中にベタ書きしてあり、キーを足したのに
// 載せ忘れる事故が実際に起きていた（M キーの全画面が、あるのに一覧に無く、
// プレイヤーからは存在しない機能だった）。写しを2つ作らないためにここへ出した。
//
// 並びは「移動・攻撃」→「補給」→「表示・設定」の順。押す頻度が高いものほど上。
//
// **Escape はわざと載せていない。** 全画面中の Escape はブラウザが全画面解除に
// 使い、その keydown がページへ渡ってこない（main.js の update() のコメント参照）。
// 「1回目で全画面が解けて、2回目でメニュー」という挙動を説明するより、全画面を
// 保ったまま開ける P だけを案内するほうが混乱が少ない。
//
// キーキャップの文字列（key）はそのまま drawKeyCap に渡るので、幅に収まる長さで。

export const CONTROLS_ROWS = [
    // 矢印キーも等価に効く（Player._updateHorizontal / Carrier）。設定画面の
    // 案内が「AD ←→」と併記しているのに、操作一覧だけ A/D しか書いていなかった
    { key: 'A / D', action: 'MOVE LEFT / RIGHT (← / → ALSO WORK)' },
    { key: 'W', action: 'BURST JUMP (GROUND) / HOVER (HOLD) / UNDOCK' },
    { key: 'SHIFT', action: 'LOCK-ON AIM (TAP) / AUTO-AIM ON-OFF (HOLD)' },
    // Space は Input.js の PREVENT_DEFAULT_KEYS にも入っていて、意図して用意された
    // 発射キーなのに一覧に無かった。左クリックが主なので括弧で添える
    { key: 'L-CLICK', action: 'FIRE MISSILE OR MACHINE GUN (SPACE ALSO WORKS)' },
    // 長押しの利点は「軌道プレビューを見てから投げられる」こと。以前の
    // 「HOLD + L-CLICK」だけでは、短押しとの使い分けの理由が読めなかった
    { key: 'R-CLICK', action: 'GRENADE (TAP: THROW / HOLD: AIM, L-CLICK: FIRE)' },
    { key: 'F', action: 'SWITCH WEAPON / RELOAD (MISSILE ↔ M-GUN)' },
    // しゃがみ（接地中の押しっぱなし）は移動もバーストも止める。載せていないと
    // 「S を押すと動けなくなる」という不具合に見える
    { key: 'S', action: 'DOCK WITH CARRIER / HOLD: CROUCH & FAST FUEL CHARGE' },
    // ここから下は表示・設定。ゲームの操作ではないので後ろにまとめる
    { key: 'R', action: 'TOGGLE MINI-MAP OVERLAY' },
    // ゲーム開始時に自動で全画面へ入るので普段は押さずに済むが、
    // 抜けたい／戻したいときの手段として要る
    { key: 'M', action: 'TOGGLE FULLSCREEN' },
    // HUD にインジケータは出るが、キーの存在はどこにも書かれていなかった。
    // 設定画面を開かずに片手で下げられるのがこのキーの役目なので、一覧に要る
    { key: '- / +', action: 'MASTER VOLUME DOWN / UP' },
    { key: 'P', action: 'SETTINGS / PAUSE' },
];
