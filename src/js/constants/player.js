// 自機（動き・武器・MG・母艦・ドック補給・オーバードライブ・Auto Aim・破壊の間）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
// --- Player (Attacker) ---
export const PLAYER_WIDTH = 16;
export const PLAYER_HEIGHT = 24;
export const PLAYER_MAX_SPEED = 1.75;
export const PLAYER_MAX_FALLING_SPEED = 7.0;  // Terminal velocity for falling
export const PLAYER_STUN_FALL_SPEED = 6.0;    // Falling speed that triggers landing stun
// 着地音を鳴らすのに必要な滞空フレーム数。自機と敵アタッカーで共通。
// 接地判定は地形の端や動く母艦の甲板の
// 上で途切れるので、遷移をそのまま数えると立っているだけで鳴る（動く甲板の上で
// 3秒間に24回鳴っていた）。実測ではその途切れは必ず1フレームだったので、4なら
// 4倍の余裕がある。一方 4フレームは自由落下で約2px なので、本来の着地は残る。
export const LANDING_MIN_AIRBORNE_FRAMES = 4;
export const PLAYER_STUN_DURATION = 20;       // Duration of stun in frames (60 = 1 sec)
export const PLAYER_MAX_HOVER_SPEED = -4.0;   // Maximum upward speed during hover
export const PLAYER_BURST_FORCE = -5.8;
export const HOVER_THRUST = -0.50;
export const HOVER_THRUST_MIN = -0.30; // Weak thrust when fuel is low
export const HOVER_MAX_FUEL = 100;
export const HOVER_FUEL_CONSUMPTION = 0.4; // per frame while hovering
export const BURST_FUEL_CONSUMPTION = 20;  // fuel consumed immediately on burst（満タンで5回）
export const BURST_MIN_FUEL = 20;          // minimum fuel required to burst (= 1 burst worth)
export const HOVER_FUEL_RECOVERY = 0.5;     // per frame when not hovering
export const HOVER_FUEL_RECOVERY_BOOST = 0.75; // per frame when pressing S solo
export const HOVER_COOLDOWN_AFTER_BURST = 20; // frames (~0.33s at 60fps) before hover activates after burst

// --- スラスターの炎（描画） ---
// 置き換え前は「1〜4px の四角を毎フレーム3個ランダムに置く」だけで、実質 5px ぶんしか
// 見えていなかった。地味に見えた原因は小ささより「毎フレーム形が変わって芯が無い」ことに
// あったので、台形で芯を固定し、先端だけを揺らす形にした。
export const THRUSTER_FLAME_WIDTH = 5;       // px: ノズル直下の幅（自機と、幅を指定しない呼び出しの既定）
export const THRUSTER_FLAME_LEN_MIN = 6;     // px: power=0（燃料切れ間際）の長さ
export const THRUSTER_FLAME_LEN_MAX = 14;    // px: power=1 の長さ。置き換え前の実質 5px の約3倍
export const THRUSTER_FLAME_CORE_RATIO = 0.55; // 芯の長さ（外炎に対する比）
export const THRUSTER_FLAME_CORE_WHITE = 0.7;  // 芯を白へ寄せる量（0=機体色のまま, 1=真っ白）
export const THRUSTER_FLAME_GAP = 3;           // px: ノズル下端から炎の根元までの隙間。
                                               // 0 だと炎が機体にめり込んで見えた（実機判断）
export const THRUSTER_FLAME_FLICKER = 0.35;    // 先端の伸び縮み幅（±35%）。置き換え前の
                                               // 完全ランダムは形が定まらず逆に目に入らなかったので
                                               // 一度 0.15 まで落としたが、今度は大人しすぎたので戻した
export const THRUSTER_FLAME_SWAY = 1.5;        // px: 先端の左右の振れ幅。根元は 0 で、
                                               // 先端へ行くほど比例して振れる。長さの伸び縮みだけだと
                                               // 「息をしている」だけで、噴き出す勢いに見えなかった
export const THRUSTER_FLAME_ALPHA = 0.75;      // 外炎の不透明度
export const THRUSTER_FLAME_CORE_ALPHA = 0.9;  // 芯の不透明度。外炎より濃く出して芯を立てる

// 敵アタッカーの炎の長さは型ごとの climbThrust から作る。0〜1 へ素直に正規化すると
// heavy（0.45 = 最小）の炎がほぼ消えてしまうので、下限を上げて差だけ残す。
//
// 下限は当初 0.6 にしていたが、それだと型ごとの基準長が 10.8〜14.0px の 3.2px しか
// 開かず、揺らぎ（±35% ＝ ±5px 前後）に埋もれて動いている画面では見分けられなかった。
// 0.45 まで下げて 9.6〜14.0px に開いてある。それでも長さだけでは足りないので、
// 型ごとの flameWidth（揺らぎの影響を受けない）と合わせて識別させる。
export const ATTACKER_CLIMB_THRUST_MIN = 0.45; // heavy
export const ATTACKER_CLIMB_THRUST_MAX = 0.75; // standard
export const ATTACKER_FLAME_POWER_MIN = 0.45;

// --- Weapons ---
export const MISSILE_SPEED = 6;
export const MISSILE_INITIAL_COUNT = 24;
export const MISSILE_MAX_ON_SCREEN = 10;
// 16:9 化で索敵の横半径が 1.334 倍になったぶん、射程も同じ倍率で伸ばす。
// 180 * 1.334 = 240.1。速度 6 なので射程 1080 -> 1440px。
// 画面半幅 683 に対する比 2.11 は 4:3 のときと同じ。
export const MISSILE_LIFETIME = 240; // frames

export const GRENADE_SPEED = 5;
export const GRENADE_SPEED_MIN = 0;           // 近距離投擲の最小速度
export const GRENADE_SPEED_MAX = 5;           // 遠距離投擲の最大速度
export const GRENADE_SPEED_MAX_DIST = 200;    // この距離(world px)でMAX速度に達する
export const GRENADE_GRAVITY = 0.20;
export const GRENADE_MAX_FALLING_SPEED = 6;
export const GRENADE_BOUNCE = 0.2;
export const GRENADE_FRICTION = 0.9;
export const GRENADE_INITIAL_COUNT = 12;
export const GRENADE_BLAST_RADIUS = 2; // in tiles for map destruction
// グレネードの爆風がブロックに与えるダメージ。**半径は持ち主で変えない**（変えると
// 「敵のグレネードが当たらない」ように見える）。変えるのはダメージだけ。
//
// 自機は 3 = HARD_BLOCK_HP なので硬い岩も一撃で吹き飛ぶ（今までどおり）。
// **敵は 1。** 後半ほど敵の攻撃が増えて足場そのものが撃ち崩され、遊べなくなるのが
// 元の困りごと（ユーザー報告）。1 なら通常岩（HP 1）は今までどおり一撃で消えるので
// 敵が壁を掘る速度は変わらず、硬い岩（HP 3）だけが足場の骨組みとして残る。
// HARD_BLOCK_CHANCE_BY_STAGE で後半ほど硬い岩を増やしてあるので、後半の面ほど
// 骨組みが多く残る＝困りごとの大きい面ほど効く。
//
// 緊急防衛（EMERGENCY_WILD_FIRE_*）で敵が自分で壁を掘る仕組みは壊れない。
// あれが使うのは Missile.js の damageBlock(…, 1) でグレネードではないし、
// 敵のグレネードも通常岩は一撃で消せるまま。
export const GRENADE_BLOCK_DAMAGE = 3;
export const ENEMY_GRENADE_BLOCK_DAMAGE = 1;
export const GRENADE_DAMAGE_RADIUS = 40; // in pixels for entity damage
export const GRENADE_DAMAGE = 80;
export const GRENADE_LIFETIME = 90; // 1.5 seconds at 60fps
export const GRENADE_EXPLOSION_COUNT = 150;
export const GRENADE_KNOCKBACK_VY = -3.5; // Smaller launch than a landmine
export const GRENADE_KNOCKBACK_VX = 2;    // Smaller sideways push than a landmine

// --- Player Machine Gun (Fallback for missiles) ---
export const PLAYER_MG_SPEED = 4; // a little bit faster than ENEMY_BULLET_SPEED
export const PLAYER_MG_RADIUS = 1.5;
export const PLAYER_MG_DAMAGE = 3;
// 16:9 化に合わせて 180 -> 240（元は 240 で、4:3 のとき 80% に詰めた経緯がある）。
// 速度 4 なので射程 720 -> 960px。画面半幅 683 に対する比 1.41 は 4:3 と同じ。
export const PLAYER_MG_LIFETIME = 240;
export const PLAYER_MG_BURST_SIZE = 16;
export const PLAYER_MG_BURST_DELAY = 4; // Frames between shots in a burst
export const PLAYER_MG_RELOAD_TIME = 60; // Frames after a burst
export const PLAYER_MG_SPREAD = 0.12; // Spread angle in radians (approx ±7 degrees)
// 反動のばらつき（utils/mgSpread.js）。連射の1発目は照準どおりに飛び、2発目から反動でばらつく（ユーザー指定 2026-11-07）。
// 以前は1発目から毎発 ±PLAYER_MG_SPREAD/2 でばらけていた。ばらつきの幅は連射の発数で 0 から
// PLAYER_MG_SPREAD まで RAMP 発かけて広がる（2発目 1/3・3発目 2/3・4発目から全幅）。いきなり全幅にすると
// 1発目との差が唐突で反動に見えないため。初期値で、実機で見て詰める
export const PLAYER_MG_RECOIL_RAMP = 3;
// 引き金を離して（撃たずに）この tick 数たつと反動が収まり、次の1発はまた照準どおりに飛ぶ。
// 押しっぱなしの連射の間隔は PLAYER_MG_BURST_DELAY（4）なので、それより長い間が空いたら「撃ち直し」とみなす。
// 8 は撃ち終わりから約 0.13 秒（1.0x）。指切りで2〜3発ずつ撃てば1発目の精度を保てる
export const PLAYER_MG_RECOIL_RECOVER = 8;

// オートリロードが発動する残弾（発）。既定 8 は従来の PLAYER_MG_RELOAD_THRESHOLD 0.5
// ×弾倉 16 発と同じ値で、設定を触らない人の挙動を変えないため。
// 両端を落として 1〜15 にしてあるのは、0 が「空になるまで装填しない」＝モード OFF と
// 完全に重複し、16 が「満タンでも常に装填」で意味を持たないため。
export const MG_RELOAD_THRESHOLD_DEFAULT = 8;
export const MG_RELOAD_THRESHOLD_MIN = 1;
export const MG_RELOAD_THRESHOLD_MAX = 15;

// --- Carrier ---
export const CARRIER_WIDTH = 64;
export const CARRIER_HEIGHT = 32;
export const CARRIER_SPEED = 0.4;
// 自機で母艦を横から押したときの、母艦の速さ（自機の歩きの最高速に対する倍率）。母艦が敵の射線に
// 入っているのにドッキングする間が無いとき、押して横へずらす（ユーザーの要望）。0.5＝自機の半分
// （ユーザー指定。下から持ち上げるときの「母艦は重いので半分」と同じ手応え）。1.75 × 0.5 = 0.875px/フレーム
// で、ドッキング中に操縦したときの最高速（約 1.82）のおよそ半分
export const CARRIER_PUSH_SPEED_SCALE = 0.5;
export const CARRIER_MAX_HP = 120;  // 敵ミサイル12発ぶん。80(8発)では事故死が多かった
export const CARRIER_INITIAL_LIVES = 1;
export const CARRIER_PROXIMITY_ALERT_RANGE = 80; // Distance in pixels to trigger yellow alert

// 母艦の方向矢印はミニマップより上の面に描くので、不透明のままだと
// 下のミニマップを塗りつぶす。半透明にして両方読めるようにする。
// 薄くしすぎると「母艦がどっちにあるか」という情報が読めなくなるので、
// ミニマップが透ける程度に留める
export const CARRIER_ARROW_ALPHA = 0.7;

// --- リペアキット（rival がドロップ。今は 100%）---
// 拾った瞬間に自機を回復する量。キットは消費されず手元に残り、母艦への
// ドッキング時に今までどおり母艦を修理する（回復はおまけ）。
// 母艦側の量は例外的に RepairKit.js の REPAIR_KIT_HEAL(=50) に直書きされている。
// 30 にしてあるのは、母艦へ帰る必要を残しつつ「もうひとしのぎ」を作るため。
// rival は必ず落とすので、rival を1体倒すたびに +30 効く
// → 2026-10-31 に 40 へ上げた（ユーザー判断「回復率を高めたい」。数値調整だけで済む最小の一歩）。
//   母艦側 REPAIR_KIT_HEAL(=50) を下回る関係は保つ（超えると持ち帰る意味が薄れる）。
//   もっと上げたいなら 45 まで。50 以上は母艦の量も一緒に見直すこと
export const REPAIR_KIT_PLAYER_HEAL = 40;

// --- 残機アイテム（7面の要塞のお宝。拾った瞬間に自機の残機が 1 増える）---
// 自機の残機を増やす手段は今まで無かった（初期 3 機のみ）。要塞は難しいので、その救済として
// お宝に混ぜる。**全区画に置くと最大 +4 機（初期の倍以上）になる**ので、ステージ全体で 1 個にする
// （ユーザー判断 2026-10-31）。置く区画は、スタートの部屋から最も遠い区画。
export const FORTRESS_EXTRA_LIFE_COUNT = 1;
// 区画のお宝は右端から 2 タイルおきに [オーバードライブ, リペア, リペア]。その 2 番目（リペア）を
// 残機に入れ替える（ユーザー判断）。0 番目の稀少なオーバードライブは動かさない
export const FORTRESS_EXTRA_LIFE_SLOT = 1;
// 拾った直後に「1UP」を出す長さ。HUD の残機の数字が小さく、拾ったのに気づけないのを避ける
export const EXTRA_LIFE_FLASH_FRAMES = 120;

// --- Docking Resupply (gradual replenishment per frame while docked) ---
// HP: 100 / 60 ≈ 1.67/frame → full heal in ~3.6 seconds (at 60fps)
export const DOCK_HP_RATE = 100 / 216; // ~0.46 HP/frame → full in ~3.6s
// Missiles: 24 / (6 * 60) = 0.0667/frame → full in 6 seconds
export const DOCK_MISSILE_RATE = 24 / 360;  // ~0.067 missiles/frame → full in 6s
// Grenades: 12 / (6 * 60) = 0.0333/frame → full in 6 seconds
export const DOCK_GRENADE_RATE = 12 / 360;  // ~0.033 grenades/frame → full in 6s
// Hover fuel: 100 / (4 * 60) → full in 4 seconds (faster, quality-of-life)
export const DOCK_FUEL_RATE = 100 / 240; // ~0.417 fuel/frame → full in 4s

// 回復ハム：ドッキング中に HP が満ちるまで鳴り続ける。進むほど音程が上がるので、
// あと何秒で満ちるかが耳で分かる。母艦のエンジン（46〜60Hz）と被らない中域に置く。

// --- オーバードライブ（レア版キットの効果）---
// 拾ってから一定時間、ミサイルと MG の弾が減らない。グレネードは対象外
// （「ここぞで使う切り札」の役を残すため）。
//
// タイマーは autoAimTimer と同じくシムティックで減る。実時間ではモードで
// 伸び縮みするが、30〜45秒という狙いは両モードとも満たしている:
//   newtype (1.0x, 60tick/秒) → 36秒
//   normal  (0.8x, 48tick/秒) → 45秒
export const OVERDRIVE_DURATION = 2160;
// 重ね取りの上限。ちょうど2本ぶん。レア版がそう続けて出ないので実際は稀
export const OVERDRIVE_MAX_DURATION = 4320;
// 残りこれを切ったら「金色が抜けていく」演出に入る。無限だと思って撃っていた
// 弾が予告なく減り始めるのが一番きついので、3秒前から知らせる
export const OVERDRIVE_WARN_TICKS = 180;
// 点滅の1位相の長さ ms。効いている間はずっと金と赤を往復する。
// 200ms → 120ms → 60ms と実機で詰めた。120ms でもまだ「ゆっくり切り替わって
// いる」に見え、瞬いている感じにならなかった。60ms（往復120ms ≒ 8Hz）だと
// 2色が混ざりきらずにちらつき、機体が唸っているように見える。
// フレーム（16.7ms）の整数倍から意図的に外してあるので、描画のたびに
// 切り替わる位置がずれて、機械的な明滅にならない
export const OVERDRIVE_BLINK_MS = 60;
// 機体まわりの輝きの半径（自機の幅 16px に対する倍率）。2.2 = 半径 35px。
// 3.0 では洞窟の狭い通路が丸ごと赤くなって地形が読めなくなった
export const OVERDRIVE_GLOW_RADIUS = 2.2;

// --- Auto Aim: 偏差射撃 ---
// 自機の武器は直進弾なので、動く敵には「弾が届くころに敵がいる場所」を狙わせる。
export const AUTO_AIM_LEAD_STRENGTH = 0.5;   // 偏差の強さ 0..1。1 で完全に合わせる
export const AUTO_AIM_LEAD_MAX_TICKS = 60;   // 予測してよい最大の飛行時間（1秒ぶん）
export const AUTO_AIM_LEAD_ITERATIONS = 3;   // 飛行時間の収束計算の反復回数

// 敵の速度は「窓のあいだの平均」で測る。
// 地上の戦車は着地スナップの都合で中心Yが +0.3 / +0.6 / -0.9 の3tick周期で
// 揺れており（実際には上下していない）、1tickの差分や指数平滑ではこれが残る。
// 飛行時間（最大60tick）で増幅されると照準が激しく振動するため、
// 周期の倍数を含む長さの窓で平均して往復を相殺する。
export const AUTO_AIM_LEAD_WINDOW = 13;      // 速度を測る窓（サンプル数。区間は12）
export const AUTO_AIM_LEAD_DEADZONE = 0.15;  // これ未満の速度は止まっているとみなす

// リードマーカー（戦闘機の HUD 風）。照準は敵に据えたまま、着弾予定地点は
// 破線と○で示す。照準ごと動かすと敵から外れて目障りなため分けている。
export const LEAD_MARKER_MIN_OFFSET = 4;     // これ未満のずれならマーカーを出さない
export const LEAD_MARKER_RADIUS = 5;         // リードサークルの半径
export const LEAD_MARKER_DASH = [3, 3];      // 破線のパターン

// --- Death Hold ---
// 自機・母艦の破壊時、演出を見せるためにリスポーン／ゲームオーバー遷移／
// カメラの切り替えを止める長さ。破片の寿命が最長 75 tick なので、
// 破片が消えきるところまで見える 90 tick（60fps で 1.5 秒）とする。
export const DEATH_HOLD_FRAMES = 90;
