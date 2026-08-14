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
// key の文字列は図のキーキャップとラベルの両方に出るので、幅に収まる長さで。
//
// short: 図（controlsDiagram.js）に添える短い語。長い説明をそのまま置くと図が
//   読めなくなる。16文字までに収める（テストで縛っている）
// detail: 図では表せない差（タップと長押しの違い、1つのキーに2つの意味）がある行。
//   図の下に action の全文を出す

export const CONTROLS_ROWS = [
    // 矢印キーも等価に効く（Player._updateHorizontal / Carrier）。設定画面の
    // 案内が「AD ←→」と併記しているのに、操作一覧だけ A/D しか書いていなかった
    { key: 'A / D', short: 'MOVE', action: 'MOVE LEFT / RIGHT (← / → ALSO WORK)' },
    { key: 'W', short: 'BURST / HOVER', detail: true, action: 'BURST JUMP (GROUND) / HOVER (HOLD) / UNDOCK' },
    { key: 'SHIFT', short: 'AIM', detail: true, action: 'LOCK-ON AIM (TAP) / AUTO-AIM ON-OFF (HOLD)' },
    // Space は Input.js の PREVENT_DEFAULT_KEYS にも入っていて、意図して用意された
    // 発射キーなのに一覧に無かった。左クリックが主なので括弧で添える
    { key: 'L-CLICK', short: 'FIRE', action: 'FIRE MISSILE OR MACHINE GUN (SPACE ALSO WORKS)' },
    // 長押しの利点は「軌道プレビューを見てから投げられる」こと。以前の
    // 「HOLD + L-CLICK」だけでは、短押しとの使い分けの理由が読めなかった
    { key: 'R-CLICK', short: 'GRENADE', detail: true, action: 'GRENADE (TAP: THROW / HOLD: AIM, L-CLICK: FIRE)' },
    { key: 'F', short: 'SWITCH WEAPON', detail: true, action: 'SWITCH WEAPON / RELOAD (MISSILE ↔ M-GUN)' },
    // しゃがみ（接地中の押しっぱなし）は移動もバーストも止める。載せていないと
    // 「S を押すと動けなくなる」という不具合に見える
    { key: 'S', short: 'DOCK / CROUCH', detail: true, action: 'DOCK WITH CARRIER / HOLD: CROUCH & FAST FUEL CHARGE' },
    // ここから下は表示・設定。ゲームの操作ではないので後ろにまとめる
    { key: 'R', short: 'MINI-MAP', action: 'TOGGLE MINI-MAP OVERLAY' },
    // ゲーム開始時に自動で全画面へ入るので普段は押さずに済むが、
    // 抜けたい／戻したいときの手段として要る
    { key: 'M', short: 'FULLSCREEN', action: 'TOGGLE FULLSCREEN' },
    // HUD にインジケータは出るが、キーの存在はどこにも書かれていなかった。
    // 設定画面を開かずに片手で下げられるのがこのキーの役目なので、一覧に要る
    { key: '- / +', short: 'VOLUME', action: 'MASTER VOLUME DOWN / UP' },
    { key: 'P', short: 'SETTINGS', action: 'SETTINGS / PAUSE' },
];

// ============================================
// 図（controlsDiagram.js）のための配置
// ============================================
//
// キー名と説明を並べた表では「手をどこに置くのか」が読み取れなかった、という
// 実機での指摘を受けて図を足した。要点は**実際のキーボードの相対位置のまま
// 描く**こと。並べ替えると図にした意味（体で覚えている位置と一致する）が消える。
//
// gx/gy はキーの升目。gy=0 が QWERTY 段（W R）、1 がホームポジション（A S D F）、
// 2 が Shift の段、3 がスペースの段。w は升目いくつぶんの幅か。
// 段ごとの横ずれ（実物のキーボードは1段ごとに少しずれている）は描画側で付ける。
//
// rowKey は CONTROLS_ROWS の key。図とリストが同じ文言を使うための紐づけで、
// 「表にあるのに図のどこにも無い」「図にあるのに表に無い」はテストで落ちる。
export const LEFT_HAND_KEYS = [
    { cap: 'W', gx: 1, gy: 0, w: 1, rowKey: 'W' },
    // R はミニマップ。W と同じ段の右にあり、左手のまま押せることが図から読める
    { cap: 'R', gx: 3, gy: 0, w: 1, rowKey: 'R' },
    { cap: 'A', gx: 0, gy: 1, w: 1, rowKey: 'A / D' },
    { cap: 'S', gx: 1, gy: 1, w: 1, rowKey: 'S' },
    { cap: 'D', gx: 2, gy: 1, w: 1, rowKey: 'A / D' },
    { cap: 'F', gx: 3, gy: 1, w: 1, rowKey: 'F' },
    { cap: 'SHIFT', gx: 0, gy: 2, w: 2, rowKey: 'SHIFT' },
    // 左手の親指で届く位置にある＝左クリックの代わりになる理由がここで分かる
    { cap: 'SPACE', gx: 1, gy: 3, w: 2.5, rowKey: 'L-CLICK' },
];

/** マウスの左右ボタン。右手側の群。 */
export const MOUSE_BUTTONS = [
    { cap: 'L', rowKey: 'L-CLICK' },
    { cap: 'R', rowKey: 'R-CLICK' },
];

// 左手のクラスタにもマウスにも入らないキー。**入らないこと自体が情報**で、
// 押すときはマウスから手を離す（＝戦闘中に押すものではない）と伝わる。
// 配列上はいずれも右側にあり、左手を伸ばしても届かない
export const OFF_MOUSE_KEYS = ['M', 'P', '- / +'];
