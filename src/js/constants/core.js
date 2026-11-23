// 画面・タイル・物理・カメラ・描画の範囲・色・遠景・途中セーブなど、どの系統にも属さない土台の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
// 16:9。高さ 768 を保つ真の 16:9 は幅 1365.33 で整数にならないので、
// WXGA の実標準 1366 を採る（1366/768 = 1.7786、16:9 の 1.7778 との差は 0.05%）。
// style.css の黒帯計算をこの比で書けば歪みは出ない。
// TILE_SIZE(16) の倍数である必要はない。カメラは px 単位の任意位置を取り、
// 地形描画は startCol/endCol で切っているため。
export const CANVAS_WIDTH = 1366;
export const CANVAS_HEIGHT = 768;

// --- 索敵楕円の基準 ---
// 索敵は「横だけ画面幅に比例する楕円」。横半径は各敵の sightRange
// (= CANVAS_WIDTH * k) をそのまま使い、縦半径はそれに SIGHT_ASPECT を掛ける。
//
// なぜ縦を画面幅に比例させないか:
// 16:9 化は横に広げる方向なので、CANVAS_WIDTH に紐づけたままだと画面の高さは
// 768 で変わらないのに索敵円だけ 1.334 倍になり、「真上・真下の見えない敵に
// 撃たれる」が一律 33% 悪化する。上下移動が主軸のホバー機ではこれが効く。
//
// SIGHT_VERTICAL_BASE を 4:3 時代の幅 (1024) に固定すると、
//   横: 半径/半幅 の比が 4:3 と同じ（0.80 など）
//   縦: 絶対値が 4:3 と同じ（タンクなら 410px）
// の両方が同時に成り立つ。4:3 では SIGHT_ASPECT が厳密に 1.0 になり
// 楕円が真円に退化するので、移行でバランスが動いていないことを証明できる。
//
// ここを CANVAS_WIDTH と同じ値にすると SIGHT_ASPECT = 1 に戻り、
// 「CANVAS_WIDTH を変えただけ」＝縦も等方的に拡大する挙動になる。
// 実機で縦が緩すぎると感じたときの調整点はここ 1 箇所。
export const SIGHT_VERTICAL_BASE = 1024;
export const SIGHT_ASPECT = SIGHT_VERTICAL_BASE / CANVAS_WIDTH;

// --- Tile / Map Base Constants ---
export const TILE_SIZE = 16;
export const MIN_MAP_COLS = 150;
export const MIN_MAP_ROWS = 75;
export const MAX_MAP_COLS = 300;
export const MAX_MAP_ROWS = 150;

// Block types
export const BLOCK_EMPTY = 0;
export const BLOCK_NORMAL = 1;   // Destructible (brown)
export const BLOCK_HARD = 2;     // Takes multiple hits (blue/cyan)
export const BLOCK_INDESTRUCTIBLE = 3; // Cannot be destroyed (gray)
// 7面の要塞の壁。HardRock(HP 3)より硬く、絵は機械加工されたパネル。
// **壊せないわけではない** — 外壁は厚さ2層なので 6x2 = 12発で抜ける（実質難攻不落）。
// 壊せないブロックを使わずに同じ効果を出すのが要点で、副産物として要塞が
// マップを分断する危険が原理的に消える（設計 2026-09-06-stage7-fortress-design.md 節3）
export const BLOCK_METAL = 4;

// --- Physics ---
export const GRAVITY = 0.30;
export const FRICTION = 0.82;
export const AIR_FRICTION = 0.95;
export const CARRIER_MAX_FALLING_SPEED = 5;

// --- Camera ---
export const CAMERA_LERP = 0.08;

// --- Colors ---
// 硬い岩の「寄せ先の灰色」。この色そのものは描画に出ない（下の2つの係数で面の
// パレットと混ぜてから使う。HARD_BLOCK_TINT = 1.0 にすればこの灰色一色に戻る）
export const COLOR_HARD_BLOCK = '#555555';
export const COLOR_HARD_BLOCK_BORDER = '#3a3a3a';
// 硬い岩の色を面のパレットから作るときの2つの係数（Map の constructor で使う）。
// 灰色一色だった頃は、5面を岩8割にすると画面の大半が灰色になって面のテーマ色が
// 消えてしまった。かといって単純に灰色へ寄せるだけでは駄目で、面1は通常岩との
// 輝度差が 0、面7で 8 しかなくなり、彩度だけが手がかりになる。硬い岩は3発かかる
// ので**撃つ前に見分けられること**が要る。そこで2段構えにしている:
//   1) 面のパレットを COLOR_HARD_BLOCK へ TINT だけ寄せる（色味を残す）
//   2) その色の輝度を「通常岩の輝度 × DARKEN」に合わせる
// 2 を係数の掛け算ではなく通常岩に対する**比**にしたのが要点。一律の係数だと
// 面6（Cafe Noir、元の輝度 58）だけ黒へ潰れて洞窟の背景と見分けがつかなくなる。
// 実測の輝度差（通常岩 → 硬い岩）: 32 / 38 / 51 / 40 / 45 / 22 / 28
export const HARD_BLOCK_TINT = 0.65;    // 0 = 面の色そのまま、1.0 = 灰色一色（元の見た目）
export const HARD_BLOCK_DARKEN = 0.62;  // 硬い岩の輝度 ÷ 通常岩の輝度
export const COLOR_INDESTRUCTIBLE_BLOCK = '#2a6496';
export const COLOR_INDESTRUCTIBLE_BLOCK_BORDER = '#1a3d5c';
// 要塞の金属。硬い岩と同じく面のパレットから作るが、寄せ先を青みの強い鋼にして
// 岩と見分けられるようにする。硬い岩より明るいのは「磨かれた面」に見せるため
export const COLOR_METAL_BLOCK = '#6B7A8C';
export const COLOR_METAL_BLOCK_BORDER = '#3D4753';
export const METAL_BLOCK_TINT = 0.75;   // 硬い岩(0.65)より寄せ先に近い＝面の色より素材感を優先
export const METAL_BLOCK_DARKEN = 0.85; // 硬い岩(0.62)ほど暗くしない。金属は光を返す
// 金属の被弾。**ひび割れさせない**（金属が割れるのは絵としておかしい、という実機の指摘）。
// 代わりに熱で赤茶け、同時に鏡面ハイライトが落ちて艶が飛ぶ
export const METAL_BLOCK_HP = 6;
export const METAL_HEAT_COLOR = '#8C3A1E';   // 焼けた赤茶
export const METAL_HEAT_GLOSS_LOSS = 0.85;   // 満身創痍でハイライトをこの割合まで削る
// 7面の施設エリアの薄い板（中身は通常の岩、1発）。金属の色の輝度をこの割合にする。
// 同じ鋼の系統のまま暗くして、艶のある本物の金属（6発）と見分ける
export const FACILITY_PLATE_DARKEN = 0.72;
export const COLOR_CAVE_BG = '#1a0a00';

// --- Far cave backdrop (parallax) ---
// 遠景がカメラに追従する割合。0 = 完全固定、1 = 前景と等速。
// 見た目が弱すぎ/強すぎる場合はこの1値だけを調整する。
export const FAR_BG_PARALLAX = 0.25;

// --- View culling ---
// 画面外の敵と地雷を描かないときの余裕（px）。機体の外接円をこのぶん広げて判定する。
//
// 実測(2026-08-16)で敵は平均 99.6 体いるのに画面内は約11%しかおらず、
// `enemies` の描画 0.433ms/フレームの9割近くが捨て仕事だった。
//
// 128px の根拠: 機体の矩形の**外へ描かれるもの**を全部飲み込める幅にしてある。
// 効いているのは敵基地で、**当たり判定は 24x32（半径16）しかないのに、
// 緊急防衛のパルスは中心から半径 120px まで広がる**（EnemyBase の
// `20 + progress * 100`。シールドも半径45で回っている）。16 + 128 = 144 で覆える。
// 最初 64 にして書いたテストが、まさにこのパルスのポップを捕まえた。
// 他はもっと小さい: アタッカーの脚、ホバーとスラスターの炎、頭上のHPバー。
//
// 広げる側に倒すのが安全で、費用もほぼ無い。1366x768 の視界に対し
// 64→128 で判定矩形の面積は約1.24倍にしかならず（4:3 の 1024x768 では
// 約1.27倍だった。画面が横に広がったぶん、margin を広げたときの相対的な
// 面積増加率がわずかに薄まる）、間引ける敵の割合は実測の 89% から
// 数ポイント落ちるだけ。逆に切り詰めると縁で部品がちらつく。
export const VIEW_CULL_MARGIN = 128;

export const COLOR_CROSSHAIR = 'rgba(255, 255, 0, 0.8)';
export const COLOR_HOVER_EXHAUST = '#00FFFF';

// Auto-Aim Unit
export const AUTO_AIM_DURATION = 3600;         // 60秒 (60fps)
export const AUTO_AIM_MAX_DURATION = 10800;    // 上限3分 (60fps)
export const AUTO_AIM_SNAP_RADIUS = 120;      // スナップ判定半径 (world px)
// キャンセルに必要なマウス移動量 (canvas px/frame。input.mouse.x/y の差分がこの単位)。
// canvas は CSS で表示サイズに拡大されるようになったので、この値が要求する
// 物理的なマウスの動きは表示の拡大率に比例して変わる（2560x1440 で canvas が
// 1920 幅に拡大＝倍率1.875なら、この4は物理7.5px/frame 相当。ウィンドウを
// 小さくすれば逆に緩くなる）。値はあえてそのままにしてある — 実機で感触を
// 見てから決める、という判断（低リスクな数値調整を後回しにしただけで、
// スケール補正を入れていないのは意図的）。
export const AUTO_AIM_CANCEL_THRESHOLD_DEFAULT = 4;
// 設定で動かせる幅。1 は「わずかでも動かせば外れる」、20 は「振り回さないと外れない」。
// 上限を 20 で止めているのは、これ以上は事実上「外れない」と変わらないため。
export const AUTO_AIM_RELEASE_MIN = 1;
export const AUTO_AIM_RELEASE_MAX = 20;

// Auto Aim の解除／再開を切り替える Shift 長押しの時間（1/10 秒単位で持つ）。
// 設定の int 型は整数しか刻めないので 1/10 秒で保存し、表示だけ「0.3 SEC」に直す。
// 既定 3（0.3秒）は、タップと取り違えない最短で、かつ待たされる感じもしない長さ。
// 下限 0.1 秒はタップと区別できる最小、上限 2.0 秒は「押し間違い防止」を超えて
// 操作として重くなる手前で止めた。
export const AUTO_AIM_HOLD_TENTHS_DEFAULT = 3;
export const AUTO_AIM_HOLD_TENTHS_MIN = 1;
export const AUTO_AIM_HOLD_TENTHS_MAX = 20;

// --- 途中セーブ ---
// セーブ1回のコスト。HighScoreManager の MIN_SCORE も偶然 10000 だが、
// あちらは「ランキングに載る下限」で別物。連動させないため定数を分けている。
export const SAVE_COST = 10000;
// ゲームオーバーで CONTINUE? を出しておく時間。従来の自動遷移は 4 秒
// (GAMEOVER_WAIT_MS)。選択肢を読んで decide する時間として倍以上を取った。
export const CONTINUE_COUNTDOWN_MS = 9000;
// セーブが無いときの従来どおりの待ち時間（main.js に直書きされていた 4000）。
export const GAMEOVER_WAIT_MS = 4000;
