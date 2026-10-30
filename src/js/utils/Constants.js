// ============================================
// Game Constants
// ============================================

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

// --- Attacker return-home & climbing ---
export const ATTACKER_RETURN_TRIGGER_Y = 6 * TILE_SIZE;  // start returning when this far BELOW home
export const ATTACKER_RETURN_TRIGGER_X = 20 * TILE_SIZE; // or this far horizontally from home
export const ATTACKER_RETURN_DONE = 2 * TILE_SIZE;       // back home when within this distance (both axes)
export const ATTACKER_CLIMB_MIN_FUEL = 40;               // fuel needed before a climb take-off
export const ATTACKER_CLIMB_MAX_RISE = -4.0;             // upward speed cap while climbing
export const ATTACKER_SLOW_RISE_CAP = -1.5;  // 'jump' climbStyle ascent cap (slow rise)
export const ATTACKER_BOOST_MAX_FRAMES = 34; // 'boost' climbStyle thrust frames per airborne leg

// --- Artillery cover-seeking ---
export const ATTACKER_COVER_CHECK_INTERVAL = 30; // frames between line-of-sight checks
export const ATTACKER_COVER_SCAN_TILES = 6;      // cover candidate scan range (+/- tiles)
export const ATTACKER_COVER_MIN_DIST = 160;      // px: cover must keep at least this range

// --- Artillery smoke screen ---
// 発見された artillery が張る煙幕。設計は
// docs/superpowers/specs/2026-08-11-artillery-smoke-screen-design.md
export const SMOKE_COOLDOWN = 1200;           // tick: 発煙の間隔。煙の寿命(810)の約1.5倍で、時間の 2/3 は煙っていて 1/3 が晴れている（1620=寿命の2倍では半々で、煙が薄すぎた）。これより短くすると晴れ間が無くなり画面がほぼ常時煙る
export const SMOKE_PUFF_COUNT = 19;           // 中心1 ＋ 内側の列9 ＋ 外側の列9。SMOKE_EMISSION_SLOTS の合計と一致していること（テストで縛っている）
export const SMOKE_EMIT_SPAN = 12;            // tick: 撒き終わるまで。一斉に生むと全パフの年齢が揃って湧き上がって見えない
export const SMOKE_PUFF_LIFETIME = 810;       // tick: パフ1個の寿命。うち721 tick が濃さを保つ停滞で、normal モード(0.8x)の実時間で 15.0秒（newtype 1.0x では12.0秒）。実測の隠蔽持続は 15.5〜15.9秒（消滅にかかる間も途中までは隠れているぶん、停滞より少し長い）。雲はパフが全部消えたら死ぬ
export const SMOKE_PUFF_RISE_RATIO = 0.01;    // 寿命のこの割合で 0→1 に立ち上がる（8 tick）。寿命を延ばしても立ち上がりは短いままにする（長いと発煙してから隠れるまで待たされる）
export const SMOKE_PUFF_HOLD_RATIO = 0.90;    // この割合まで濃さを保ち、残りで消える。停滞と消滅の境目
export const SMOKE_PUFF_DECAY_EXPONENT = 1.6; // 消滅は寿命の残り10%(81 tick = 実時間1.7秒)で。指数>1 なので落ち始めは緩く、最後に加速して「スッ」と消える
export const SMOKE_PUFF_RADIUS_START = 44;    // px: 出たての半径。**列の距離（内側 21px / 外側 42.5px）より大きく取ること。** 小さいと扇形の列がただの点の並びになり、隣と繋がらないので壁にならない
export const SMOKE_PUFF_RADIUS_END = 100;     // px: 拡散後
export const SMOKE_PUFF_ALPHA_MAX = 0.62;     // 上限なしで素直に重ねるので1枚は薄く。扇形の配置にしてから、停滞中も判定点の濃さが少しずつ落ちる（列が外へ漂うぶん）。0.50 では停滞が明ける前にしきい値を割る回があったので余裕を持たせた
export const SMOKE_FALLOFF_EXPONENT = 2.5;    // 中心を濃く保ち端で急に落とす形
export const SMOKE_CONCEAL_THRESHOLD = 0.6;   // この濃さを超えるとロック不能（重なり3枚ぶんで越える）
export const SMOKE_ROTATION_SPEED = 0.6;      // 度/frame: 回転の基準速さ。速いと渦に見えて煙から離れる
export const SMOKE_ROTATION_JITTER = 0.7;     // 回転速度のばらつき（±この割合）。全部が同じ速さで回ると、揃って動く硬い機械仕掛けに見える
export const SMOKE_SPREAD_RADIUS = 50;        // px: 外側の列までの基準距離。列ごとの距離はこれに SMOKE_RING_* を掛けたもの
export const SMOKE_ARC_FROM_HOUR = 8;         // 扇形の始まり（時計の文字盤。8時＝左下）
export const SMOKE_ARC_TO_HOUR = 16;          // 終わり（16時＝4時＝右下）。8→12→16 と時計回りに240°ぶん取る。真下の120°を空けているのは、そちらは地面で、煙は上へ回り込むほうが自然なため
export const SMOKE_RING_INNER = 0.42;         // 内側の列の距離（SMOKE_SPREAD_RADIUS に対する比）
export const SMOKE_RING_OUTER = 0.85;         // 外側の列
export const SMOKE_PUFF_RADIUS_JITTER = 0.35; // パフごとの大きさのばらつき（±この割合）。同じ年齢のパフが全部同じ半径だと、位置を散らしても「同じ丸の反復」に見える
// パフが1フレームに太る量。半径と寿命から出るので、どちらを変えても勝手に追随する
export const SMOKE_GROWTH_RATE = (SMOKE_PUFF_RADIUS_END - SMOKE_PUFF_RADIUS_START) / SMOKE_PUFF_LIFETIME;
// 外へ漂う速さは、その成長に対する比で決める。
// **1 を超えさせないこと。** 漂いが成長を追い越すと、煙がまだ濃いうちに雲がばらけて
// 判定点の重なりが崩れ、隠蔽が短くなるうえ走るたびに揺れる。
// この関係は以前 px/frame の実数で持っていたが、半径を変えたときと寿命を変えたときの
// 2回とも手で追随させ忘れかけた（とくに寿命は、半径を触っていないのに成長が変わる）。
// 比で持てば式が守ってくれる。
export const SMOKE_DRIFT_RATIO = 0.5;
export const SMOKE_DRIFT_SPEED = SMOKE_GROWTH_RATE * SMOKE_DRIFT_RATIO;  // px/frame
export const SMOKE_RISE_SPEED = 0.02;         // px/frame: ゆっくり上昇。こちらは成長に縛らず実数のまま持つ（浮力は煙の大きさとは別の性質で、寿命が延びればそのぶん高く昇るのが自然）。中心のパフには効かせない
export const SMOKE_SPRITE_SIZE = 256;         // px: 焼き付けるスプライトの一辺。パフ最大直径(100×1.35×2 = 270px)にほぼ合わせる。焼くのは一度だけなので大きくしても実行時コストは変わらない

// --- Rival alignment avoidance ---
export const RIVAL_ALIGN_THRESHOLD = 24;      // px: closer than this on an axis = aligned
export const RIVAL_ALIGN_TRIGGER_FRAMES = 45; // aligned this long -> evade
export const RIVAL_EVADE_OFFSET_MIN = 60;     // px: evade goal offset from target (min)
export const RIVAL_EVADE_OFFSET_MAX = 120;    // px: evade goal offset from target (max)
export const RIVAL_EVADE_DURATION = 40;       // frames an evade maneuver lasts

// --- Rival dash（回避の立ち上がりだけ瞬間加速する）---
// 「照準を合わせた瞬間に残像を残して横へ消える」ための加速。回避
// （_updateAlignmentAvoidance）の**開始フレームだけ**速く、そこから線形に
// 通常速度へ戻す。一定倍率で切ると、切れた瞬間に急停止して見えた。
//
// 初速は maxSpeed(1.20) × 3.0 = 3.6px/frame。残像のしきい値 1.6 の倍以上あるので、
// ダッシュの瞬間は必ず尾が出て、減速に合わせて尾が短くなって消える。
// **この2つは連動している**（RIVAL_DASH_MULT を 1.4 未満に下げると尾が出なくなる）。
//
// 移動量は 12フレームで約29px。回避の目標オフセット(60〜120px)の内側なので、
// 立ち位置のバランス（standoff distance）は変えない。
export const RIVAL_DASH_FRAMES = 12;   // ダッシュが効くフレーム数。回避の 40 より十分短く保つこと
export const RIVAL_DASH_MULT = 3.0;    // 初速の倍率。ここから 1.0 へ線形に落ちる

// ダッシュ音「ヴーン」。ドローンの移動音（DRONE_MOVE_*）と同じ作り方
// （detune した鋸波＋1オクターブ下のサイン波を共鳴ローパスで掃く）だが、
// あちらは高→低の「ポーーン」。こちらは**低→高**に上げて、短く切る。
// 上げるのは、加速＝速度が乗っていく感じに耳が素直に付いてくるため。
// 音程は2度直している。90→220 は「低すぎる」、120→294 は「他の音に混ざって
// 判別しづらい」（どちらも実機の指摘）。
//
// 後者の正体は音程ではなく**包絡**だった。減衰が先頭から効いていたので、
// 聞こえているのは低い出だしだけで、音程が上がる頃にはほぼ消えていた
// ＝「上がる音」として聞き取れない。そこで
//   - 上昇を後半に寄せる（RIVAL_DASH_SND_RISE_AT まではほぼ平ら）
//   - 音量を RIVAL_DASH_SND_HOLD まで保ってから落とす
//   - 上がり幅を 1.3 → **2オクターブ**に広げる
// の3つで、後半の上昇をはっきり聞かせる形にした。
// 実測: 後半30%のゼロ交差が前半30%の **2.54倍**（前: 1.96倍）、
// 後半30%の RMS が全体の **0.80**（前: 0.52）。どちらもテストで縛ってある。
export const RIVAL_DASH_SND_FREQ_FROM = 120;   // Hz: ここから
export const RIVAL_DASH_SND_FREQ_TO = 480;     // Hz: ここまで上がる（2オクターブ）
export const RIVAL_DASH_SND_RISE_AT = 0.5;     // 全体のどこから本格的に上がるか（0〜1）
export const RIVAL_DASH_SND_KNEE = 1.12;       // それまでに上がる倍率。完全に平らだと「詰まった音」になるので少しだけ動かす
export const RIVAL_DASH_SND_HOLD = 0.8;        // 音量を保つ割合。ここから終端へ落とす
export const RIVAL_DASH_SND_DURATION = 0.40;   // 秒。ダッシュ本体(12フレーム=0.2秒)より長い。後半の上昇を聞かせるために 0.35 から伸ばした
export const RIVAL_DASH_SND_FILTER_Q = 6;      // 共鳴の強さ。高いほど「ヴ」の芯が立つ
export const RIVAL_DASH_SND_FILTER_MULT = 2.2; // 基音の何倍にローパスを置くか。1 を下回ると籠もる
export const RIVAL_DASH_SND_DETUNE = [-9, 9];  // セント。2声を離して厚みを出す
// A特性の transientLevel で実測して決めた値（長さの違う音どうしを比べられる
// 測り方。aWeightedRms を窓ごと使うと、短いこの音だけ不当に小さく出る）。
// ドローンの移動音(-34.1dB)に対して **-3.2dB**。回避のたびに鳴るので、
// 兄弟の音より気持ち控えめにしてある。
// **音程や包絡を変えたらここも取り直すこと。** A特性は低音を大きく削るので
// 音程を上げると聞こえが大きくなるし、音量を保つ区間(HOLD)を伸ばしても
// 大きくなる。この2つをやって据え置いたら +1.7dB まで出た
// （履歴: 90→220Hz の減衰包絡で 0.18 → 120→294Hz で 0.13 → 今の形で 0.04）
export const RIVAL_DASH_SND_GAIN = 0.04;
export const RIVAL_DASH_SND_SUB_GAIN = 0.5;    // 1オクターブ下のサイン波の混ぜ量。低音の「ウ」の成分
export const RIVAL_DASH_SND_ATTACK = 0.02;     // 秒。立ち上がり。短すぎるとクリックノイズになる

// --- Rival afterimage（残像）---
// どの型が残像を出すかは ENEMY_ATTACKER_TYPES の `afterimage` 行で決める。
// ここにあるのは「どう見えるか」の数値だけ。
//
// 速さの判定は hypot(vx, vy)。rival の最高速は 1.20px/frame なので、横移動だけで
// この 1.6 には届かない＝「走っているだけ」では出ない。ジグザグ＋落下や、
// ホバーで突っ込むときのように**縦横が合わさって速いとき**だけ尾が出る。
// 落下でも出るのは意図どおり（高速落下は見た目にも速い）。
export const RIVAL_AFTERIMAGE_SPEED = 1.6;    // px/frame: これを超えたフレームだけ残像の種になる
// 尾の長さは COUNT × INTERVAL フレームぶん。3枚(=6フレーム)では実機で「短い」と
// 出たので 6枚(=12フレーム)にした。枚数で伸ばすのは、間隔を広げて伸ばすと
// 残像どうしが離れて粒に分かれ、「にじんだ尾」ではなくなるため
export const RIVAL_AFTERIMAGE_COUNT = 6;      // 枚数。増やすと尾が長い
export const RIVAL_AFTERIMAGE_INTERVAL = 2;   // 何フレーム前をたどるか。間隔が広いほど残像どうしが離れ、粒が分かれて見える
// 一番濃い（＝一番新しい）残像の不透明度。以降は等差で薄くなり、
// 6枚なら 0.30 → 0.25 → 0.20 → 0.15 → 0.10 → 0.05。枚数を増やしても
// 先頭の濃さは変わらず、末尾が薄く伸びるだけなので、尾を伸ばしても机上が汚れない
export const RIVAL_AFTERIMAGE_ALPHA = 0.30;
export const RIVAL_AFTERIMAGE_COLOR = '#CC3333'; // 機体の赤と同じ。別の色にすると「分身」ではなく「エフェクト」に見えてしまう

export const PLAYER_MAX_HP = 100;
export const PLAYER_INITIAL_LIVES = 3;
export const PLAYER_RESPAWN_INVINCIBLE_FRAMES = 90; // 1.5 seconds at 60fps

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
// --- 母艦のエンジン音（ドッキング中だけ鳴るループ）---
// 停止時が下限、全速で下限＋幅ぶんまで上がる。
// gain は 2026-08-12 に 2段階で下げた。0.060/0.050 → -4dB → さらに -4dB で
// 合計 -8dB（停止時 0.060→0.024、全速 0.110→0.044）。ドッキング中ずっと
// 鳴っていて、この音だけで他の効果音が埋もれるという実機の判断。
// 停止時と全速の比は変えていないので、動かしたときの上がり方は元のまま。
// 回復ハム(240〜460Hz)と帯域が重ならないよう、こちらは低いまま保つこと。
export const CARRIER_ENGINE_FREQ_BASE = 46;      // 停止時の基音
export const CARRIER_ENGINE_FREQ_RANGE = 14;     // 全速で足す量
export const CARRIER_ENGINE_SUB_BASE = 23;       // 1オクターブ下の副音
export const CARRIER_ENGINE_SUB_RANGE = 7;
export const CARRIER_ENGINE_FILTER_BASE = 150;   // ローパス。開くほど荒くなる
export const CARRIER_ENGINE_FILTER_RANGE = 120;
export const CARRIER_ENGINE_GAIN_BASE = 0.024;   // 停止時＝エンジンの唸り
export const CARRIER_ENGINE_GAIN_RANGE = 0.020;  // 全速で足す量＝移動時の上乗せ

export const REPAIR_HUM_FREQ_FROM = 240;    // HP 空
export const REPAIR_HUM_FREQ_TO = 460;      // 満タン直前
export const REPAIR_HUM_GAIN = 0.05;        // 鳴り続けるので単発の効果音より控えめ
export const REPAIR_HUM_WOBBLE_HZ = 7;      // 装置が働いている感じを出す揺れ
export const REPAIR_HUM_WOBBLE_DEPTH = 0.012; // REPAIR_HUM_GAIN 未満を保つこと。上回ると揺れが実効ゲインを負に振り切り位相反転する

// --- Camera ---
export const CAMERA_LERP = 0.08;

// --- HUD ---
export const HUD_TOP_HEIGHT = 60; // Expanded to fit 2 rows
export const HUD_BOTTOM_HEIGHT = 0;
export const HUD_FONT = 'bold 16px "Space Mono", monospace';
export const HUD_COLOR = '#00FF00';
export const HUD_BG_COLOR = 'rgba(0, 0, 0, 0.85)';

// --- Particles ---
export const PARTICLE_LIFETIME = 40; // frames
export const EXPLOSION_PARTICLE_COUNT = 36;

// --- Landmine (Trap) ---
export const LANDMINE_WIDTH = 12;
export const LANDMINE_HEIGHT = 6;
export const LANDMINE_DAMAGE = 25;
export const LANDMINE_KNOCKBACK_VY = -6;  // Upward launch on detonation
export const LANDMINE_KNOCKBACK_VX = 3;   // Sideways push on detonation
export const LANDMINE_BLINK_INTERVAL = 30; // frames per blink cycle
export const LANDMINE_BLAST_RADIUS = 50;   // Area of effect damage radius (~3 tiles)
export const LANDMINE_SCORE = 50;      // Player-detonated landmine
// 敵機が爆発したとき、この距離内の地雷が誘爆する。
// 地雷を起爆できるのは「自機の弾」と「敵機の爆発」だけ（敵の弾では起爆しない）。
// 敵の弾で起爆すると、地雷の爆風は game.enemies 全員に当たるので、敵が敵を巻き
// 添えにする事故が起きていた。倒した敵の爆発で誘爆するのは自機の戦果なので残す。
// 半径は地雷自身の爆風（LANDMINE_BLAST_RADIUS）と同じにしてある＝「爆風が届く
// 距離なら誘爆する」で揃えた
export const LANDMINE_DEATH_TRIGGER_RADIUS = LANDMINE_BLAST_RADIUS;
export const ITEM_PICKUP_SCORE = 200;  // Any item (repair / missile / auto-aim) pickup

// --- Enemy Tank (Hover) ---
export const ENEMY_TANK_WIDTH = 16;
export const ENEMY_TANK_HEIGHT = 12;
export const ENEMY_TANK_HP = 10;
export const ENEMY_TANK_SPEED = 0.5;
export const ENEMY_TANK_SIGHT_RANGE = CANVAS_WIDTH * 0.4;   // px - detection range for player
export const ENEMY_TANK_FIRE_INTERVAL = 90;  // frames between shots (~1.5s)
export const ENEMY_TANK_SCORE = 200;
export const ENEMY_TANK_MAX_FALLING_SPEED = 3;

// --- Enemy Bullet ---
export const ENEMY_BULLET_SPEED = 3;
export const ENEMY_BULLET_RADIUS = 2;
// 自機と母艦で同じ値。以前は PLAYER=15 / CARRIER=10 と分けて書いてあったが
// どちらも読まれておらず、実際には CollisionManager 側の 10 が両方に効いていた
export const ENEMY_BULLET_DAMAGE = 10;
// 16:9 化で伸ばした。速度 3 なので射程 540 -> 720px。
// 4:3 ではタレットの索敵 512 に対し弾 540 と 5% しか余裕が無く、手で詰めた値
// だった。16:9 のタレット索敵は横 683 なので、720 で足りる。
// なお敵のうち EnemyBullet を撃つのはタンク・タレット・ドローンだけで、
// アタッカーは素の Missile を、artillery は EnemyHomingMissile を撃つ。
export const ENEMY_BULLET_LIFETIME = 240;    // frames (4s)

export const ENEMY_HOMING_MISSILE_MAX_SPEED = 3; // Matches player's MISSILE_SPEED
export const ENEMY_HOMING_MISSILE_TURN_RATE = 0.02; // Radians per frame
// 16:9 化で伸ばした。300 * 1.334 = 400.2。速度 3 なので射程 900 -> 1200px。
// artillery の索敵は横 1093 なので、これで届く（4:3 では 819 vs 900 だった）。
export const ENEMY_HOMING_MISSILE_LIFETIME = 400; // Lives longer to find target
export const ENEMY_HOMING_MISSILE_DELAY = 30;     // Frames before tracking starts
export const ENEMY_HOMING_MISSILE_ENGAGE_DISTANCE = 240; // Pixels before tracking starts

export const CRUISE_MISSILE_MAX_SPEED = 3; // Matches player's MISSILE_SPEED
export const CRUISE_MISSILE_TURN_RATE = 0.03; // Slower turn rate
export const CRUISE_MISSILE_ENGAGE_DISTANCE = 240; // Distance in pixels before active homing starts
export const CRUISE_MISSILE_LIFETIME = 1800; // Very long lifetime (30 seconds)
export const CRUISE_MISSILE_HP = 9; // 3 machine gun hits
export const CRUISE_MISSILE_WARNING_TIME = 180; // 3 seconds warning
export const CRUISE_MISSILE_SCORE = 150;
export const CRUISE_MISSILE_MIN_DELAY = 1200; // 20 seconds at 60fps
export const CRUISE_MISSILE_MAX_DELAY = 1800; // 30 seconds at 60fps
export const CRUISE_MISSILE_ACTIVATION_RANGE = 150 * TILE_SIZE; // Engagement range in pixels

// --- Enemy Attacker (Humanoid) ---
// 生成数はマップ面積で決まるので Map.js のコンストラクタが持つ（ここには置かない）
//
// exhaustColor と flameColor は別物。exhaustColor は機体側の部品の色（standard の
// ノズル矩形、artillery のアンテナ）で機体色に馴染ませてある。flameColor は噴射炎だけの色で、
// 機体色の補色寄りに振ってある（standard 水色の機体に赤い炎、heavy 緑にオレンジ、
// rival 赤に水色、artillery 黄にピンク）。炎を機体色にすると機体に溶けて見分けが
// つかなかったため、実機判断で分離した。
//
// flameWidth は炎の根元の太さ（px）。**炎の長さは climbThrust から自動で決まるが、
// 揺らぎ幅のほうが型ごとの差より大きいので、長さだけでは動いている画面で見分けられない。**
// 太さは揺らぎの影響を受けないので、識別はこちらが担う。機体のシルエットに合わせて
// heavy=太く短い（ずんぐり）、rival=細く長い（鋭い）という対比を作ってある。
//
// flameX / flameY はノズルの位置（機体のローカル座標。draw() が向きで反転する前）。
// 2足の3型は背中のバックパック直下だが、artillery は4脚で背中という概念が薄いので
// 胴体の真下から出す。型ごとにスプライトの形が違う以上、ここは表で持つしかない。

// 撃破時のドロップ率。以前は EnemyAttacker.die() に直書きされていた。
// 6面以降の敵基地に周回シールドが付いて難度が上がったぶん、補給の供給を厚くして
// 釣り合いを戻す（2026-08-22 にユーザーの指示で変更）。
//   ライバル 0.3 → 1.0（倒せば必ずリペアキット）
//   heavy    0.3 → 0.6（2体倒せばだいたい1個）
// heavy をライバルと同率にしないのは、「どちらを狙って落とすか」という選択を
// 残すため。artillery は据え置き。
export const ATTACKER_HEAVY_DROP_CHANCE = 0.6;      // ミサイル・サプライ・キット

// heavy のキットのうち、どれだけが「オーバードライブ付き」のレア版になるか。
// ドロップ率(0.6)は据え置きで、内訳を分けるだけ。ハズレ側も満タン補給として
// 役に立つので、外れても拾う価値が消えない。
//
// 面ごとの実測見込み（アタッカー数はマップ面積から、heavy の割合は spawnWeight から）:
//        3面   4面   5面   6面以降
//  heavy 6.5   8.8   10    5      ← 6面から artillery(重み100)が入って半減する
//  キット 3.9   5.3   6.0   3.0
//  レア   0.98  1.32  1.50  1.80   ← 6面以降だけ 0.6 にして、進むほど厚くなる形にした
//
// 周回シールドが付いて一番きつい6面以降で報酬が一番薄い、という逆進を消すのが狙い。
// 判定は utils/drops.js の overdriveDropChance()。
export const ATTACKER_HEAVY_OVERDRIVE_CHANCE = 0.25;      // 5面まで
export const ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE = 0.60; // 6面以降
// 切り替わる面。周回シールド(BASE_ORBIT_SHIELD_MISSION)と同じ境目だが、
// 別々に動かせるよう定数は分けてある
export const OVERDRIVE_LATE_MISSION = 5;

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
export const ATTACKER_RIVAL_DROP_CHANCE = 1.0;      // リペアキット
export const ATTACKER_ARTILLERY_DROP_CHANCE = 0.5;  // オートエイムユニット

export const ENEMY_ATTACKER_TYPES = {
    standard: {
        name: 'standard',
        hp: 15,
        speed: 0.9,
        jumpForce: -7.5,
        fireInterval: 120,    // 2 seconds
        sightRange: CANVAS_WIDTH * 0.4,
        score: 300,
        spawnWeight: 60,      // 60%
        usesGrenades: false,
        aimAccuracy: 0.6,
        movementType: 'pace_and_jump',
        climbThrust: 0.75,
        climbStyle: 'boost',
        bodyColor: '#55CCDD',
        headColor: '#44AABB',
        visorColor: '#FFFFFF',
        backpackColor: '#338899',
        exhaustColor: '#33DDEE',
        flameColor: '#FF4433',   // 赤（機体は水色）
        flameWidth: 5,           // 標準
        flameX: 4, flameY: 14,   // 背中のバックパック直下
    },
    heavy: {
        name: 'heavy',
        hp: 45,
        speed: 0.5,
        jumpForce: -5.0,
        fireInterval: 90,     // 1.5 seconds
        sightRange: CANVAS_WIDTH * 0.6,
        score: 500,
        spawnWeight: 25,      // 25%
        usesGrenades: false,
        aimAccuracy: 0.4,
        movementType: 'chase_and_jump',
        climbThrust: 0.45,
        climbStyle: 'jump',
        avoidsAlignment: true,
        evadeDuration: 90,
        bodyColor: '#44AA44',
        headColor: '#338833',
        visorColor: '#FFFF66',
        backpackColor: '#226622',
        exhaustColor: '#66FF66',
        flameColor: '#FF9922',   // オレンジ（機体は緑）
        flameWidth: 7,           // 太い。重量級のずんぐりしたシルエットに合わせる
        flameX: 4, flameY: 14,   // 背中のバックパック直下
    },
    rival: {
        name: 'rival',
        hp: 40,
        speed: 1.20,
        jumpForce: -6.0,
        fireInterval: 75,     // 1.25 seconds
        sightRange: CANVAS_WIDTH * 0.5,
        score: 700,
        spawnWeight: 15,      // 15%
        usesGrenades: true,
        grenadeChance: 0.05,  // 5% chance to throw grenade instead of missile
        aimAccuracy: 0.8,
        movementType: 'zigzag_chase',
        climbThrust: 0.65,
        climbStyle: 'hover',
        avoidsAlignment: true,
        evadeDuration: 40,
        bodyColor: '#CC3333',
        headColor: '#AA2222',
        visorColor: '#FFCC00',
        backpackColor: '#882222',
        exhaustColor: '#FF6644',
        flameColor: '#33DDFF',   // 水色（機体は赤）
        flameWidth: 4,           // 細い。速さを出すため鋭く
        flameX: 4, flameY: 14,   // 背中のバックパック直下
        // 速いフレームだけ残像を引く（この型だけ）。見え方の数値は
        // RIVAL_AFTERIMAGE_* 、描画は entities/attacker/afterimage.js
        afterimage: true,
        // 回避の立ち上がりで瞬間加速する（RIVAL_DASH_*）。上の afterimage と
        // 対で効く ── 加速で残像のしきい値を超えるから尾が出る
        dashOnEvade: true,
    },
    artillery: {
        name: 'artillery',
        // 50 → 45 → 30。ミサイル(DAMAGE_PLAYER_MISSILE=15)で**2発ちょうど**。
        // ただし HP を下げただけだと MG でも楽に落ちてしまうので、
        // mgDamageMult で MG にだけ効く軽減を掛けている
        // （「ミサイルなら2発、バルカンではなかなか落ちない」2026-08-22 の指示）
        hp: 30,
        // MG のダメージ倍率。1発 3 → 1.5 になり、落とすのに 20発＝弾倉(16発)を
        // 撃ち切ってリロードを1回挟む必要がある。この行が無い型は等倍のまま
        mgDamageMult: 0.5,
        speed: 0.4,
        jumpForce: -4.5,
        fireInterval: 300,    // 5 seconds between bursts
        sightRange: CANVAS_WIDTH * 0.8, // Very long sight
        score: 900,
        spawnWeight: 100,     // Increased for testing
        usesGrenades: false,
        aimAccuracy: 1.0,
        movementType: 'skirmish',
        climbThrust: 0.5,
        climbStyle: 'jump',
        seeksCover: true,
        usesSmoke: true,      // 見つかったら煙幕を張って居場所を隠す
        bodyColor: '#DDAA00', // Yellow-Orange
        headColor: '#BB8800',
        visorColor: '#FF0000', // Red eye
        backpackColor: '#996600',
        exhaustColor: '#FFEE44',
        flameColor: '#FF44BB',   // ピンク（機体は黄）
        flameWidth: 6,           // やや太い。4脚の大柄な機体
        flameX: 10, flameY: 16,  // 4脚なので胴体 (5,5,11,11) の真下から。背中側から出すと脚の間で浮いて見えた
    },
};

// --- Enemy Drone (Aerial) ---
export const ENEMY_DRONE_HP = 8;            // Weak armor
export const ENEMY_DRONE_SPEED = 4.0;       // Dashing speed
export const ENEMY_DRONE_SPEED_Y_MAX = 3.0; // Dashing vertical speed
export const ENEMY_DRONE_SIGHT_RANGE = CANVAS_WIDTH * 0.7; // Wide sight range
export const ENEMY_DRONE_FIRE_INTERVAL = 120; // 2 seconds
export const ENEMY_DRONE_BURST_COUNT = 5;    // Shots fired per attack
export const ENEMY_DRONE_BURST_INTERVAL = 6; // Frames between burst shots (0.1s)
export const ENEMY_DRONE_SCORE = 250;
export const ENEMY_DRONE_WIDTH = 24;
export const ENEMY_DRONE_HEIGHT = 16;
export const ENEMY_DRONE_HOVER_DIST_Y = 120; // Maintain this vertical distance from player
export const ENEMY_DRONE_HOVER_DIST_X = 180; // Maintain this horizontal distance from player
export const ENEMY_DRONE_GRENADE_CHANCE = 0.10; // 10% chance to drop grenade
export const ENEMY_DRONE_KAMIKAZE_CHANCE = 0.10;   // 10% chance to ram instead of shooting when close
export const ENEMY_DRONE_KAMIKAZE_TRIGGER_RANGE = 240; // Must be within this distance to consider ramming (hover standoff is ~216)
export const ENEMY_DRONE_KAMIKAZE_SPEED = 6.0;     // Ramming charge speed
export const ENEMY_DRONE_KAMIKAZE_DAMAGE_PLAYER = 40;
export const ENEMY_DRONE_KAMIKAZE_DAMAGE_CARRIER = 20; // Carrier (80 HP) dies in 4 hits

// --- Enemy Turret (Stationary) ---
export const ENEMY_TURRET_HP = 30;              // About 2 missiles
export const ENEMY_TURRET_WIDTH = 24;
export const ENEMY_TURRET_HEIGHT = 24;
export const ENEMY_TURRET_SIGHT_RANGE = CANVAS_WIDTH * 0.5;
export const ENEMY_TURRET_SCORE = 200;
export const ENEMY_TURRET_BURST_COUNT = 5;      // Bullets per burst
export const ENEMY_TURRET_BURST_DELAY = 10;     // Ticks between burst shots
export const ENEMY_TURRET_COOLDOWN = 120;       // Ticks between bursts (2 seconds)

// --- Enemy Main Base (Win Condition) ---
export const ENEMY_BASE_SCORE = 10000;
export const ENEMY_BASE_WIDTH = 24;
export const ENEMY_BASE_HEIGHT = 32;
export const ENEMY_BASE_SHIELDS = 3;            // Layers of defense
export const ENEMY_BASE_HP = 1;                 // Final core HP
// 構造物の描画が当たり判定の箱より下へはみ出す量 px。
//
// 基地の絵はコアを中心に上下 28px（合わせて 56px）で描いてあるのに、箱は
// 32px しかない。素直に「箱の下端＝床の表面」で置くと、はみ出す下12px＝
// 土台の支柱と締め具がまるごと床タイルの中に埋まる（実機で「土台がブロックに
// めり込んでいる」と見えていたのがこれ）。Map はこのぶん基地を持ち上げて置く。
// 値は _drawStructure の一番下（coreY + 22 の締め具、高さ6）から来ている。
// tests/base-sits-on-floor.test.js が実際の描画と突き合わせて縛っている
export const ENEMY_BASE_DRAW_OVERHANG = 12;

// --- 周回シールド（6面以降。むき出しになったコアだけを守る） ---
// リング3枚（ENEMY_BASE_SHIELDS）は今までどおり削れる。3枚目が割れて
// コアが露出した瞬間にコアの中心から羽根がせり出し、鉛直軸まわりを回り始める。
// 羽根が軌道の左右の端＝プレイヤーとコアのあいだに入っている間だけ弾く。
// 幾何は utils/orbitShield.js。
//
// 難易度は SPEED（チャンスの間隔）と GUARD_HALF（ガード窓の広さ）の2つで動く。
export const BASE_ORBIT_SHIELD_MISSION = 5;     // 6面以降 = missionsCompleted 5 以上
export const BASE_ORBIT_SHIELD_PANELS = 2;      // 180°対向。左右が同時に閉じ、同時に開く
// 半径はコアの実体(8〜11)より十分外に取る。16 では羽根がコアに貼り付いて見えて
// 「周回している」感じが出なかったので 30 まで広げた。最内リング(25)より外だが、
// 羽根が出るのはリングが全部割れた後なので重ならない。
// ガード判定は dx の符号しか見ない（orbitShield.guardBlocks）ため、
// ここを動かしても難易度は変わらない
export const BASE_ORBIT_SHIELD_RADIUS = 30;
export const BASE_ORBIT_SHIELD_SPEED = 0.030;   // rad/frame。半周 π/0.030 ≈ 105 frame ≈ 1.75秒
export const BASE_ORBIT_SHIELD_GUARD_HALF = 0.70; // ガード窓の半角 rad(≈40°)。全体の約44%が防御中
// 羽根の基準の縦の長さ px。手前に来た羽根はこれの (1 + ORBIT_PANEL.perspective)
// 倍まで伸びる（36 → 46.8）。基地は下端が床タイルの表面にぴったり乗っているので、
// 伸びた羽根が床にめり込まないよう、羽根の縦の中心は EnemyBase 側で
// 「一番大きい羽根の下端が床に接する高さ」に置いている。
// ここを大きくすると羽根は**上へ**伸びる
export const BASE_ORBIT_SHIELD_HEIGHT = 36;
// 展開のあいだは角度に関係なく完全無敵。ここが 0 だと、最後のリングを割った
// 勢いのミサイル連打でシールドが一度も仕事をしないまま基地が落ちる
export const BASE_ORBIT_SHIELD_DEPLOY = 30;     // frames(約0.5秒)

// --- Flag (Capture Condition) ---
export const FLAG_WIDTH = 12;
export const FLAG_HEIGHT = 20;
export const FLAG_SCORE = 5000;

// --- Enemy Base Laser ---
export const BASE_LASER_RANGE = CANVAS_WIDTH * 0.55;
export const BASE_LASER_CHARGE_TIME = 40; // frames
export const BASE_LASER_COOLDOWN = 90;  // frames
export const BASE_LASER_SPEED = 12;
// 15 と書かれていたが読まれておらず、実際に当たっていたのは 50。
// 自機(100HP)なら2発、母艦(120HP)なら3発で落ちる強さ
export const BASE_LASER_DAMAGE = 50;

// --- 反射ビームキャノン（7面。タレットの半分を差し替える） ---
// 母艦レーザー（BASE_LASER_*）とは別物。あちらは速度12の直線で地形を貫通する。
// こちらは遅く跳ね返るのが主眼で、見てから避けられる速さにしてある。

// 実機で「遅い」と言われて 4 → 5。タイル16px に対して3.2倍の余裕があるので
// 1フレームで壁を飛び越すことはない
export const REFLECT_BEAM_SPEED = 5;

// 帯は「節を積み上げ、節ごとに寿命で消える」形にしてある。固定長で切り出す
// 方式だと、節が反射の折れ点をまたいだときに角をショートカットする直線になり、
// 反射のたびに帯が角でがたついて見えた（実機で指摘された）
export const REFLECT_BEAM_SEGMENT_FRAMES = 2;  // 1節を閉じるまでのフレーム数。速度5なので1節=10px
export const REFLECT_BEAM_SEGMENT_LIFE = 16;   // 1節の寿命。80px(8節)ぶん生きる

// 1回の攻撃を2連弾にする。当初は同時に扇型（±15度）で2本撃っていたが、
// ユーザーから「いきなり2本同時ではなく2連弾にして、2発目は撃つ時点の自機の
// 位置へ狙い直してほしい」と指示された。_updateAiming() が毎フレーム
// currentAngle = targetAngle（即時照準）で自機を向いているので、間隔を空けて
// 撃つだけで2発目は自動的にその瞬間の自機の位置を向く。角度の違いは
// 「狙い直し」から生まれるので、固定の扇（SPREAD）はもう要らない
export const REFLECT_BEAM_SHOT_COUNT = 2;  // 扇の本数ではなく連射数（EnemyTurret の burst）

// 2連弾の間隔。自機が意味のある距離を動ける長さにする。短すぎると2発目が
// ほぼ同じ方向になり「狙い直している」感じが出ず、長すぎると2連弾に聞こえない。
// gun 型の連射間隔（ENEMY_TURRET_BURST_DELAY = 10）より意図的に長い
export const REFLECT_BEAM_BURST_DELAY = 24;  // 0.4秒

export const REFLECT_BEAM_WIDTH = 5;            // 母艦レーザーは6

// 実質「制限しない」。地形の隙間に挟まって動けなくなったときの安全弁
// （反射を繰り返しても抜けられない場合）としては、20回＝20フレームぶん粘って
// から消えることになるが、上限があること自体は変わらないので破綻はしない
export const REFLECT_BEAM_MAX_BOUNCES = 20;

// 寿命はフレーム数で決める。以前は距離（進んだpx数）で決めていて、
// 「速度5なら240フレーム、速度8なら150フレーム」のように**速度を上げると
// 寿命（生きている時間）まで短くなり、1つの値が2つの意味（速さと寿命）を
// 持っていた**。ticks なら速度を変えても生きている時間は変わらず、届く距離
// だけが変わるので、調整するときに値の意味が1つに戻る
export const REFLECT_BEAM_MAX_TICKS = 240;      // 4秒
export const REFLECT_BEAM_DAMAGE = 20;          // 敵弾10・ホーミング20。自機HP100で5発
export const REFLECT_BEAM_MUZZLE_FLASH_FRAMES = 12; // 0.2秒
// 砲身の先端から広がる光の半径。ビームの根元に隠れない大きさが要る
export const REFLECT_BEAM_MUZZLE_FLASH_RADIUS = 18;

// 芯が白っぽい紫、外へ向かって暗紫。母艦レーザー（エメラルド #00FFAA）と
// 一目で区別できるようにする。**hex で書くこと**（lerpColor が parseInt する）
export const COLOR_REFLECT_BEAM_CORE = '#F2E6FF';
export const COLOR_REFLECT_BEAM_MID = '#B266FF';
export const COLOR_REFLECT_BEAM_EDGE = '#3B0F6B';

// 被弾スパーク。「レーザーに当たったときの反応が地味で判りづらい」という
// 実機フィードバックへの対応。ビーム本体と同じ色域にして、何に当たったのかが
// 一目で分かるようにする（通常被弾の黄色系スパークと取り違えないため）
// 実機で「もっと明るいスパークの方が良い」と指摘され、3色とも明度を上げた
// （旧: #F2E6FF / #C77DFF / #B266FF）。いちばん暗かった #B266FF は暗い地形の
// 上では沈んで見えなかった。白を1色混ぜて芯の明るさを出しつつ、残り2色で
// 紫であること（＝ビームに当たった）は保つ
// これは**出た瞬間**の色。時間が経つと COLOR_BEAM_SPARK_FADE へ寄っていく
export const BEAM_SPARK_COLORS = ['#FFFFFF', '#FBF0FF', '#F0DDFF'];
// 寿命の終わりに落ち着く色。「拡がるにつれて紫色になっていく」という指定への
// 対応で、出た瞬間は白く熱く、離れるにつれて冷めてビームの紫になる、という
// 見立て。始点の3色を白寄りに振り直したのはこの移り変わりの幅を取るため
// （始点が既に紫だと、どこで紫になったのか読めない）
export const COLOR_BEAM_SPARK_FADE = '#A64DFF';
// 粒の一辺。通常のスパークは 2。明るさは色だけでなく面積でも決まる。
// 3 から更に「もう少し大きめに」という指定で 4。破片(DebrisPart)は最小辺 1.4px
// から数十pxまで幅があるので大きさだけでは区別できないが、破片は回転する
// 多角形で色も機体色なので、紫の正方形とは取り違えない
export const BEAM_SPARK_SIZE = 4;

// --- 装甲に弾かれた跳弾（artillery のように mgDamageMult を持つ敵に MG が当たったとき）---
// 「効いていない感」を音と光で伝えるための演出。ダメージは別に入っている
// （0 ではない）ので、完全に弾く周回シールドの shieldDeflect とは分けてある。
//
// 初回の実装（2本・8px・太さ1.5）は実機で「地味すぎる」と言われた。
// 反射ビームの被弾でまったく同じ指摘を受けたときの手当てをそのまま持ってきて、
// 本数・長さ・太さを上げたうえで**命中点の閃光**を足してある。線は散らばって
// 視界の端では拾えないが、1点で光る閃光は拾えるため。
export const RICOCHET_STREAK_COUNT = 4;      // 1回の命中で走る光の本数（2 → 4）
export const RICOCHET_STREAK_LENGTH = 8;     // 線の長さ px（8 → 14 → 8 に差し戻し。長いと尾を引いて見えた）
export const RICOCHET_STREAK_SPEED = 5;      // 飛ぶ速さ px/frame（3.5 → 5）
export const RICOCHET_STREAK_LIFETIME = 9;   // frames。一瞬で消えないと火花に見える
export const RICOCHET_STREAK_WIDTH = 2;      // 線の太さ px（1.5 → 2.5 → 2）
export const RICOCHET_SPREAD = 1.1;          // 跳ね返る向きのばらつき rad
export const COLOR_RICOCHET = '#FFFFFF';     // 出た瞬間（白く熱い）
export const COLOR_RICOCHET_FADE = '#FFD11A'; // 冷めた先（黄。#FFE066 だと白に近すぎた）
// 命中点の閃光。ImpactFlash を使い回す（反射ビームの被弾と同じ部品）。
// 反射ビームの 14 より大きいのは、あちらが1発ずつなのに対しこちらは
// 連射の中の1発で、周りに MG の弾道が走っていて埋もれやすいため
export const RICOCHET_FLASH_RADIUS = 18;
export const COLOR_RICOCHET_FLASH_CORE = '#FFFFFF';
export const COLOR_RICOCHET_FLASH_RING = '#FFC400';
// 音の間引き。MG は PLAYER_MG_BURST_DELAY(4フレーム) ごとに1発＝毎秒15発なので、
// 当たるたびに鳴らすと雑音になる。0.2秒に1回だと耳には「カン！カン！カン！」と
// 3〜4連に聞こえる。光の方は間引かない（弾は出続けているので毎発光ってよい）
export const RICOCHET_SOUND_INTERVAL_MS = 200;
// 通常のスパークは3〜5個。倍以上にしないと「走った」感じが出なかった。
// 14 でもまだ「地味すぎて見えない」と実機で指摘されたので 28 へ倍増し、
// 速度と寿命も上げた（散る範囲が広がるぶん、1粒あたりの見つけやすさが上がる）
export const BEAM_SPARK_COUNT = 28;
export const BEAM_SPARK_SPEED_MIN = 2.0;   // 通常1.5。勢いよく弾けさせる
export const BEAM_SPARK_SPEED_MAX = 6.5;   // 通常4.0。5.0 から更に上げた
export const BEAM_SPARK_LIFETIME = 22;     // 通常10〜19。18 から更に伸ばして尾を長く見せる

// 被弾点の閃光。粒を増やすだけでは「一瞬の出来事」が視界の端で拾えないので、
// 既存の ImpactFlash（命中の合図に使う小さく硬い光）を紫で1つ出す。
// 爆発(playBlast)ではないので音は付いてこない ＝ 効果音は別に選べる。
// 半径はミサイル着弾(IMPACT_FLASH_RADIUS=18)より小さく、マシンガン(6)より
// 大きい 14。自機を覆い隠さず、それでいて必ず目に入る大きさ
export const BEAM_SPARK_FLASH_RADIUS = 14;
// リングは砲台のランプの明るい紫。被弾の光と、撃ってきた砲台とが同じ色域で
// 結びつく。芯は当初ビーム本体と同じ #F2E6FF にしていたが、「もっと明るく」
// という指摘を受けて純白へ。加算合成(lighter)で描くので芯は白がいちばん強い
export const COLOR_BEAM_HIT_FLASH_CORE = '#FFFFFF';
export const COLOR_BEAM_HIT_FLASH_RING = '#C77DFF';

// タレットの半分を差し替える反射ビームキャノン本体（EnemyTurret の beam 型）
export const REFLECT_BEAM_CANNON_HP = 40;        // タレット30より硬い（自機ミサイル3発）
export const REFLECT_BEAM_CANNON_SCORE = 350;    // タレット200より高い

// 冷却時間は廃止した。ユーザーから「冷却時間は不要で、充填で連続して打ってくる
// ような感じにしてほしい」と指示され、`cooldown` 状態そのものを通らなくした
// （EnemyTurret.js の beam 型は撃ち終わったら 'idle' に戻り、cooldownTimer を
// 「次弾までの充填」として使い回す）。パイロットランプで進み具合を見せることで
// 「そろそろ撃つ」が読めるようにし、待ち時間そのものに意味を持たせる方針にした。
//
// 固定の周期だとリズムを読み切られるため、1発ごとにこの範囲から選び直す
// （Math.random() を使う。game.rng を使うと週次の決定性が壊れるため厳禁）。
// 中央値は旧・冷却時間だった180に合わせ、そこから REFLECT_BEAM_CHARGE_MIN/MAX の
// 幅を持たせた
export const REFLECT_BEAM_CHARGE_MIN = 180;  // 3.0秒
export const REFLECT_BEAM_CHARGE_MAX = 240;  // 4.0秒

// 2連弾の2発目だけに足す、小さな角度のずれ。自機が止まっていると
// _updateAiming() の「狙い直し」が効かず、2発とも同じ線に乗ってしまう
// （実機で「2連射目は少しずらした方がいい」と指摘された）。以前の同時2本の
// 扇型は±15度だったが、こちらは狙い直しと重なるぶん小さくてよい
export const REFLECT_BEAM_SECOND_SHOT_OFFSET = 8 * Math.PI / 180;  // 8度

// 2発目には小さなブレを足す。左右交互のずれ(REFLECT_BEAM_SECOND_SHOT_OFFSET)だけだと
// 反射の経路が2通りに固定されてしまい、跳ね返り先が読めてしまうため（実機で
// 「2発目のブレを微妙に加えた方が反射角度が変わっていい」と指摘された）。既存の
// タレットの弾が持つ不正確さ((Math.random() - 0.5) * 0.1)と同じ大きさに揃えてある
export const REFLECT_BEAM_SECOND_SHOT_JITTER = 0.05;  // ±0.05rad ≒ ±2.9度

// 既存のタレット（#555555 / #888888 / #667788）より明るい灰色。並んだときに
// 新型だと分かるようにする
export const COLOR_BEAM_CANNON_BASE = '#AAB2BA';
export const COLOR_BEAM_CANNON_BARREL = '#D8DEE4';
// ピボット（回転軸の円）と砲口のエミッタが引く色。
// #C0C8D0 → #DDE4EB → #F2F6FA → #C8D0D8 と動かした。ほぼ白まで上げたのは
// 「もっと白く」という指摘に沿ったものだが、実機で見ると円だけが浮いて
// 砲台が「白い円に部品が生えたもの」に見えた（「白さを落として他のパーツと
// 同程度に」）。base(#AAB2BA) と barrel(#D8DEE4) の中間に置き直し、3つの
// パーツが同じ金属の別の面に見えるようにした。
// なお、白くした際にあらわになった「暗い座がピボットを塗り潰す」問題は
// BEAM_LAMP_BACK_RADIUS の側で直してある（白さを戻しても再発しない）
export const COLOR_BEAM_CANNON_PIVOT = '#C8D0D8';

// パイロットランプ（充填の進み具合を示す）。撃った直後は暗紫、充填が高まるほど
// 明るい紫に輝く。暗紫は COLOR_REFLECT_BEAM_EDGE（ビームの外周）と同じ値にして、
// 「撃ち終わった直後の砲台＝ビームの外周色」で統一感を持たせた。
// **色は必ず hex 形式で書くこと**（lerpColor() が parseInt するため。rgba() を
// 入れると '#NaNNaNNaN' になり実 canvas では無言で劣化する）
export const COLOR_BEAM_CANNON_LAMP_DIM = '#3B0F6B';
// 一度「機体の明るい灰色に埋もれるので彩度を上げる」として #B026FF（青紫寄り）に
// 変えたが、実機で「以前の白っぽい色の方が良い」と指摘され #C77DFF（白っぽい紫）
// へ戻した。埋もれる問題は COLOR_BEAM_CANNON_LAMP_BACK（暗い座）を敷くことで
// 別途解決済みなので、色そのものの彩度を上げる必要は無かった
export const COLOR_BEAM_CANNON_LAMP_BRIGHT = '#C77DFF';
// ランプ本体・輪を描く前に敷く暗い座。COLOR_BEAM_CANNON_BASE/_PIVOT が明るい灰色
// なので、紫を直接その上に乗せてもコントラストが出ない（実機フィードバック）。
// ほぼ黒に近い紫を先に塗って、その上へランプの色を重ねることでインパクトを出す
export const COLOR_BEAM_CANNON_LAMP_BACK = '#1A0A2E';

// 充填リングの軌道。ランプの中（半径6px）では動く距離が短すぎて「波が中心へ
// 寄る」と読めず、ただの明滅に見えた（実機で指摘された）。砲台の外側から
// 胴体の縁まで収束させることで、距離を稼いで動きを読めるようにする
// 22→16→13 と詰めてきた。22 は機体(24x24)より外まで輪が広がるため、砲台より
// 大きな光の輪が地形の上に重なり、「砲台の形がヘン」に見える一因になっていた
// （実機フィードバック）。
// 13 にしたのは3回目のフィードバック「リングが大きすぎて形が見えにくい」への
// 対応。ただし**主因は大きさではなく描画順**だったので、輪を砲台の実体より先に
// 描くように変えてある（EnemyTurret._drawChargeRings()）。輪は機体に隠れ、
// 機体の半径12のすぐ外へはみ出した弧だけが見える。13 はその「はみ出し」を
// 1px の細い弧に留める値で、これ以上大きいと隠れる意味が薄れる。
// 6 はランプの座(半径7)の内側で、輪が最後にランプへ吸い込まれて見える終点
export const BEAM_LAMP_RING_OUTER = 13;
export const BEAM_LAMP_RING_INNER = 6;
// 砲身より一段暗くして、線として見えるようにする。冷却フィン（ラジエーター）で
// 輪郭に凹凸を出し、既存のタレットと形でも見分けられるようにするためのもの
export const COLOR_BEAM_CANNON_FIN = '#8A939C';

// --- Enemy Base Additional Weapons ---
export const ENEMY_BASE_TURRET_COOLDOWN = 120;
export const ENEMY_BASE_TURRET_BURST_COUNT = 5;
export const ENEMY_BASE_TURRET_BURST_DELAY = 10;
export const ENEMY_BASE_MISSILE_COOLDOWN = 180;
export const ENEMY_BASE_HOMING_COOLDOWN = 240;

// --- Enemy Base Emergency Defense Mode ---
export const EMERGENCY_DEFENSE_BASE_RADIUS = 120;
export const EMERGENCY_DEFENSE_SPEED_MULT = 1.15;
export const EMERGENCY_DEFENSE_SIGHT_RANGE = 250;

// 総攻撃中の「見境なしの発砲」。緊急防衛に入ると敵は基地の周囲へ向かう return
// 状態になるが、_handleShooting() は chase のときしか撃たないので、**通路が無くて
// 基地に辿り着けない敵は壁の前で足踏みしたまま一発も撃たない置物になっていた**
// （実機で頻発するとの報告）。自機を見つけていなくても基地の方向へ撃たせる。
//
// 基地の方向へ撃たせるのは絵のためだけではない。**敵のミサイルも地形を壊す**
// （Missile.js の damageBlock() は自機の弾かどうかを見ていない）ので、
// 足止めされた敵が自分で壁を掘り、やがて基地へ近づけるようになる。
// 「通路が無くて近寄れない」という根本原因そのものが時間とともに解消される。
export const EMERGENCY_WILD_FIRE_SPREAD = 20 * Math.PI / 180;  // ±20度
// 発射間隔の倍率。1.0 = 交戦中と同じペース。ユーザーの判断は「その頃には敵の数も
// 減っているはずなので通常と同じかそれ以上の頻度でよい」。**下げると頻度が上がる。**
// 逆に実機で弾が多すぎる／重い場合は、まずここを上げて間引く
export const EMERGENCY_WILD_FIRE_INTERVAL_MULT = 1.0;

// 総攻撃中のドローンのグレネード率。**通常時と同じに戻してある。**
//
// もとの狙いはこうだった: ドローンは飛ぶので「通路が無くて基地に辿り着けない」
// ことは起きない。代わりに総攻撃中はグレネードを落としやすくして、上空から壁を
// 開ける役をやらせる（グレネードは map.destroyArea() で面＝半径2タイルを
// 吹き飛ばすので、1タイルずつしか削れない単発ミサイルより効率が桁違いに高い）。
//
// これを 0.35（通常の3.5倍。1回の攻撃 = ENEMY_DRONE_BURST_COUNT(5) 発ごとに
// 抽選するので期待値 0.5個 → 1.75個）にしたところ、実機で**マップが壊れて
// 足場が無くなり、進めなくなった**（2026-08-23 ユーザー報告）。
// 面で消える攻撃を総攻撃の密度で降らせると、「壁を開ける」を通り越して床まで
// 消える。壁を掘る役は地上ユニットの流れ弾（EMERGENCY_WILD_FIRE_*）に任せ、
// ドローンは弾幕だけに戻す。
//
// 定数と分岐は残してある。上げたくなったら 0.15 あたりから試すこと。
// tests/emergency-wild-fire.test.js が「通常時と同率」を縛っているので、
// 上げるならテストの意図ごと書き換えることになる（＝この判断を踏み直せる）
export const EMERGENCY_DRONE_GRENADE_CHANCE = ENEMY_DRONE_GRENADE_CHANCE;

// --- Per-stage block palettes (stage 1..7) ---
// Shared by Map rendering and the stage-ranking attract screen so each stage shows in its own colour.
export const STAGE_PALETTES = [
    { fill: '#8B4513', border: '#5c2e0b' }, // 1: Brown
    { fill: '#A0522D', border: '#70381d' }, // 2: Sienna
    { fill: '#B8860B', border: '#825e07' }, // 3: DarkGoldenrod
    { fill: '#2E8B57', border: '#1e5c39' }, // 4: SeaGreen
    { fill: '#4682B4', border: '#2e5677' }, // 5: SteelBlue
    { fill: '#4B3621', border: '#2b1e12' }, // 6: Cafe Noir
    { fill: '#483D8B', border: '#2e2759' }, // 7: DarkSlateBlue
];

// --- 面ごとの環境（霧・雪・地底湖） ---
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
// 面に固定する（面別ランキングがタイムアタックなので、同じ面は常に同じ条件）。
// kind = 動きと画面に重ねる描画、backdrop = 遠景の装飾（kind から導けない行がある:
// 7面は動きは今のままで遠景だけ機械）、terrain = 地形の生成規則
// （'fortress' は Map._generateFortress() が読む。設計:
//  docs/superpowers/specs/2026-09-06-stage7-fortress-design.md）。
// props = 地形の上に置く飾り（'town' は3面の壊せる町並み。設計:
//  docs/superpowers/specs/2026-10-11-stage3-town-design.md。'ferns' は4面の苔とシダ、'snow' は5面の雪をかぶった木と
//  天井のつらら。設計: docs/superpowers/specs/2026-10-11-stage5-snowtrees-design.md ・ 2026-10-11-stage5-icicles-design.md）。無ければ置かない。
// tileShape = タイルの形を決める規則（utils/tileShape.js の computeTileShape）。'snowSlope' は5面の
//  段を45度の坂に、角を面取りにする（絵と当たり判定が同じ形を共有する。設計:
//  docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md）。無ければ 'square'（今までどおり四角）。
export const ENV_KINDS = ['none', 'water', 'snow', 'fog'];
export const ENV_BACKDROPS = ['cave', 'wet', 'snow', 'fog', 'machine'];
export const STAGE_ENVIRONMENTS = [
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 1
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 2
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave', props: 'town' }, // 3: 洞窟の町（壊せる町並み）
    { kind: 'water', backdrop: 'wet',     terrain: 'cave', props: 'ferns' }, // 4: 地底湖（苔とシダ）
    { kind: 'snow',  backdrop: 'snow',    terrain: 'cave', props: 'snow', tileShape: 'snowSlope' }, // 5: 雪と氷（雪をかぶった木・天井のつらら）
    { kind: 'fog',   backdrop: 'fog',     terrain: 'cave' }, // 6: 霧（砲兵の煙幕と見分けにくくする）
    { kind: 'none',  backdrop: 'machine', terrain: 'fortress', tileShape: 'metalSlope' }, // 7: 洞窟を改造した要塞（施設エリアの金属の斜面）
];

// --- 7面の要塞区画（terrain: 'fortress'）---
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md
// 洞窟を掘り終えたあとに矩形の区画を選び、中を「直線の廊下の格子」で書き潰す。
// 7面は 150x300 タイル、画面は 86x48 タイル。区画を 26〜35 x 18〜25 にすると
// 画面の 1/3 ほどになり、「入った」と分かる大きさになる。
export const FORTRESS_ZONE_COUNT = 4;      // 上限。置けなければ少なくてよい
export const FORTRESS_ZONE_W_MIN = 26;
export const FORTRESS_ZONE_W_RANGE = 9;    // 26〜35
// 天井高を 6 にして階のピッチが 7 になったので、区画の高さ 18〜25（内側 14〜21）では 2階が大半になった
// （3階に要る内側の高さは 20）。階が少ないと廊下の仕掛けを置く段が減るので、3階になる高さへ上げた
export const FORTRESS_ZONE_H_MIN = 24;
export const FORTRESS_ZONE_H_RANGE = 7;    // 24〜31
export const FORTRESS_ZONE_MARGIN = 3;     // 盤面の縁からこれだけ離す（BORDER_THICKNESS=2 の外側）
// 外壁の厚さ。上帯と左帯（自機が来る正面）は装甲＝掘れない、下帯と右帯（背面）は
// 硬い岩＝時間をかければ抄える。「回り込めば抄えるが、正面は口を通るしかない」に
// なる。背面が必ず掘れるので詰みは起きない
export const FORTRESS_WALL_THICKNESS = 2;
// 区画の中は「階層構造」。**縦横同じピッチの格子にしてはいけない** — このゲームは
// 横視点なので、格子は真上から見た間取り図に見えてしまう（実機の指摘）。横に長い階を
// 縦に積み、シャフトでつなぐ建物の断面にする。
// 自機は 16x24px = 1x1.5 タイル。天井高5（80px）は「幅3の廊下が若干窮屈」という
// 実機の指摘を受けた値。区画の高さ 18〜25 から外壁2層を引くと 2〜3階になる
export const FORTRESS_CEILING_H = 6;   // 室の天井高（タイル）。5 → 6: 廊下を4に下げたとき、室との差を1行でなく2行にするため
// 床は**金属1層**（= METAL_BLOCK_HP = 6発）。硬い岩1層（3発）では掘るほうが速すぎて
// シャフトの意味が薄く、金属2層（12発）にしたら重すぎた。6発が実機で決めた着地点で、
// 「シャフトのほうが速いが、掘るのも現実的」という線に置いてある
export const FORTRESS_FLOOR_H = 1;     // 床の厚さ。階のピッチは 5+1=6
export const FORTRESS_SHAFT_W = 4;     // 階をつなぐ縦穴の幅
// 階の中は「室 → 廊下 → 室」。設計書 §7 の元案（廊下の交点＝室）を、格子ではなく断面で実現する
// （格子は真上から見た間取り図に見えた）。交点は、シャフトが階に着く・階から出る所、入り口、お宝の奥。
// そこを天井高のまま残した「室」にして、室と室のあいだは天井に金属の梁を足して「廊下」にする。
// 廊下の高さは自機（1.5タイル）に余裕のある 4。3 は「若干窮屈」と実機で言われた
export const FORTRESS_CORRIDOR_H = 4;
export const FORTRESS_ROOM_MARGIN = 2;     // シャフト・入り口の縦穴の左右に、室をこれだけ広げる
export const FORTRESS_ROOM_W = 8;          // 入り口の室とお宝の室の幅（縦穴を持たないので幅で決める）
// 室と室のあいだがこれより狭いと廊下ではなく切り欠きに見えるので、室を併合して1つの広間にする
export const FORTRESS_CORRIDOR_MIN_W = 4;
// バリアの列から左右にこれだけは敵を湧かせない。バリアの中に砲台が居ると、
// 開ける前に一方的に撃たれるうえ、撃ち返した弾はバリアに吸われて届かない
export const FORTRESS_BARRIER_CLEARANCE = 2;
// 入り口の大きさ（タイル）。左辺・上辺とも同じ。3 → 5 に戻した（実機の指摘）。
// 3では狭かった。5でも「壁が崩れている」に見えないのは、**開口の上下に守衛の
// タレットを置いて「守られた門」だと分かるようにした**から（下の GATE_GUARD）
export const FORTRESS_GATE_SIZE = 5;
// 入り口を守るタレット。開口の上端（天井付け）と下端（床置き）に1基ずつ。
// **ノーマル（gun）に固定する** — 7面はビーム砲台が混ざる面なので、放っておくと
// 入り口の守衛がビームになり、入る前に削られて理不尽になる
export const FORTRESS_GATE_GUARD_TYPE = 'gun';
export const FORTRESS_GATE_GUARD_INSET = 1;   // 開口から内側へ何タイル入れるか
// 開口から区画の外の空洞まで掘るトンネルの最大長。7面は空洞が 42% あるので
// 数タイルで当たる。当たらないまま尽きたらそこで止める（掘った穴は残る）
export const FORTRESS_OPENING_TUNNEL_MAX = 24;
// 区画の奥（最下階の右端）に置くお宝。オーバードライブキットは今までアタッカーの
// 撃破ドロップでしか出ない稀少品なので、要塞の奥という置き場所が意味を持つ
export const FORTRESS_TREASURE_COUNT = 3;

// --- 格納塔（お宝を入れておく塔。設計 2026-10-31-stage7-storage-towers-design.md）---
// むき出しのお宝は着いた時点で中身が全部見えた。塔に入れて「何かあるのは分かるが中身は分からない」にする。
// 大きさは自機（PLAYER_WIDTH × PLAYER_HEIGHT）と同じ（ユーザー指定）
export const STORAGE_TOWER_W = 16;
export const STORAGE_TOWER_H = 24;
// ミサイル（DAMAGE_PLAYER_MISSILE 15）ちょうど1発（ユーザー指定「ミサイル1発程度」）。
// 機関砲（PLAYER_MG_DAMAGE 3）なら5発、グレネード（80）なら爆風の内側で1発
export const STORAGE_TOWER_HP = 15;
// 絵（ユーザー指定「黄白色っぽい円筒形のタンクが足台の上に載った形、オレンジの横縞の光が明滅」）。
// 色は面ごとに変えない: ほかの面（雪・水・霧）に置いても目立つように
export const STORAGE_TOWER_BODY_COLOR = '#E8DFB0';       // 円筒の地（黄白色）
export const STORAGE_TOWER_LIGHT_COLOR = '#FAF4D8';      // 円筒の中央寄りの照り（丸みを出す）
export const STORAGE_TOWER_SHADE_COLOR = '#A89E74';      // 円筒の左右の端・ふた（暗い黄土色）
export const STORAGE_TOWER_STAND_COLOR = '#4A4E56';      // 足台（暗い金属。要塞のパネルと同じ系統）
export const STORAGE_TOWER_STAND_H = 5;                  // 足台の高さ（px）。下の数 px を脚と横板にする
export const STORAGE_TOWER_STRIPE_COLOR = '#FF8A1E';     // 横縞の光（オレンジ）
// 横縞の上下に1pxずつ接する暗い帯（明滅しない）。黄白色の地の上ではオレンジが沈んで明滅が分かりにくかった
// （実機の指摘）。暗い縁で挟むと、消え際でも帯の位置が読め、光ったときの差がはっきりする（ユーザー案）
export const STORAGE_TOWER_STRIPE_EDGE_COLOR = '#5C4A2A';
// 帯は太い1本。2px の細い縞3本では明滅が分かりにくく、上下に暗い縁を足すとしましまが多すぎて
// 汚く見えた（実機の指摘2回）。1本にして、暗い縁で挟む（ユーザー案）
export const STORAGE_TOWER_STRIPE_COUNT = 1;
export const STORAGE_TOWER_STRIPE_H = 2;                 // 帯の太さ（px）。4px は太すぎた（ユーザー判断）
// 帯を円筒のまん中からこれだけ上げる（px）。まん中では低く見えた（ユーザー判断「もう少しだけ高めに」）
export const STORAGE_TOWER_STRIPE_LIFT = 2;
export const STORAGE_TOWER_BLINK_PERIOD = 60;            // 明滅の周期（フレーム、約1秒）
export const STORAGE_TOWER_STRIPE_ALPHA_MIN = 0.25;      // 消え際でも縞が分かる程度に残す
export const STORAGE_TOWER_STRIPE_ALPHA_MAX = 1.0;
// 位相を1タイルあたりこれだけずらす（周期に対する割合）。お宝は2タイルおきなので隣とは 0.34 周ずれ、
// 3本が同時に点滅せず林立して見える。位置から決めるので乱数を使わない
export const STORAGE_TOWER_PHASE_STEP = 0.17;

// --- 施設エリア（区画の外の地形をメタルパネルにする。設計 2026-10-31-stage7-facility-metal-design.md）---
// 要塞の区画（最大4つ）の外は洞窟の岩のままで、基地らしさが薄かった。区画の外に矩形の「施設」を置き、
// 中の岩を絵だけパネルにする（硬さはそのまま）。縁の1層の岩と金属の斜面だけ本物の金属（ユーザー判断）。
// 個数・大きさは実測で決めた（8シードの平均。割合は区画の外の空でないタイルのうち施設エリアに入ったもの）:
//   8個・10〜20×8〜14 → 1.0%（部屋の空洞の中に収まって、壁も床もほとんど含まない。浮いた板と階段だけになった）
//   8個・24〜40×16〜26 → 6.0% / 16個 → 10.8%（置けたのは 14.8 個）
//   12個・32〜48×20〜30 → 14.5%（置けたのは 10.6 個）← 採用。部屋の周りの壁・床まで含み、洞窟の岩もまだ大半残る
//   20個・同 → 14.8%（置ける場所が尽きて増えない）
// 本物の金属になる縁の帯は 1 面あたり平均 617 タイル（1 エリア約 58）
// → エリア同士を接しないようにした後（帯が2層にならない）: 置けたのは 9.1 個、割合 12.5%、帯 519 タイル、斜面 97 枚
export const FACILITY_AREA_COUNT = 12;     // 上限。置けなければ少なくてよい
export const FACILITY_AREA_W_MIN = 32;
export const FACILITY_AREA_W_RANGE = 16;   // 32〜48 タイル
export const FACILITY_AREA_H_MIN = 20;
export const FACILITY_AREA_H_RANGE = 10;   // 20〜30 タイル
// 施設エリアの中に盛る金属の階段。洞窟の地形には1段ずつの段がほとんど無く、盛らないと斜面が出ない。
// 段は本物の金属（6発）なので、5面の雪の階段（5〜9段）より短くして、掘り進む重さを抑える
export const FACILITY_STAIRS_COUNT = 8;
export const FACILITY_STAIRS_LENGTH_MIN = 3;
export const FACILITY_STAIRS_LENGTH_RANGE = 3;  // 3〜6段
// 区画に追加で湧かせる守備隊。実機で「敵がもう少しいてもいい」と出た指摘への対応で、
// 7面だけに効く。既存の湧きに足す形なので、面全体の上限（maxTurrets など）は触らない
export const FORTRESS_GARRISON_TURRETS = 2;
export const FORTRESS_GARRISON_TANKS = 2;

// --- 電磁パルスのバリア（要塞の各階に1本）---
// 天井と床の2基のユニットが対で立ち、その間に縦のバリアが張られる。**両方**壊すと
// 消える。壁を壊して進むのではなく装置を倒して進む形にすることで、横視点の遊びとして
// 成立させる（真上から見た間取り図に見える、という実機の指摘への答えでもある）。
// ユニットの硬さ。**ミサイル2発、マシンガン5発**で壊れるように置いてある（実機の指定）。
// 30 = DAMAGE_PLAYER_MISSILE(15) x 2 = PLAYER_MG_DAMAGE(3) x BARRIER_UNIT_MG_MULT(2) x 5。
// マシンガンに倍率を掛けているのは、素の 3 だと10発かかって「撫でて壊す」には
// 長すぎるため。敵の mgDamageMult と同じ考え方（あちらは装甲で減らす向き）
export const BARRIER_EMITTER_HP = 30;
export const BARRIER_UNIT_MG_MULT = 2;
export const BARRIER_UNIT_W = 12;            // ユニットの見た目の幅（px）
export const BARRIER_UNIT_H = 8;             // 同、高さ
export const BARRIER_FIELD_W = 6;            // バリアの幅（px）。細いほど「すり抜けられそう」に見えない程度
// 接触時。**ダメージだけでは強行突破できてしまう**ので押し戻しとセットにする。
// 押し戻しは「来た方向へ」返す（貫通しかけて向こう側に出るのを防ぐ）
export const BARRIER_TOUCH_DAMAGE = 6;       // 毎フレーム。触れ続けると一気に減る
export const BARRIER_KNOCKBACK_VX = 4;
export const BARRIER_KNOCKBACK_VY = -2;
// **敵はダメージを受けない。** 守備隊が自分のバリアに触れて自滅すると、
// 「開けた瞬間に出てくる」という狙いが成立しなくなる。押し戻すだけにする
export const BARRIER_PULSE_PERIOD = 24;      // 明滅の周期（フレーム）
export const BARRIER_COLOR = '#7FD8FF';      // 電磁パルスの芯
export const BARRIER_GLOW_COLOR = 'rgba(127, 216, 255, 0.35)';
// **被弾対象であることを色で明示する**（実機の指摘）。地形の金属（#383e51 など）に
// 埋もれない白っぽさにして、「これは撃つものだ」と分かるようにする。
// 輝度 186 に抑えてあるのは、ランプ（#7FD8FF・輝度194）が本体より明るく見える
// ようにするため。真っ白（#D6DEE8・221）にすると点灯のほうが暗くなって逆転する
export const BARRIER_UNIT_COLOR = '#AEBCCB';
// ランプ。**鮮やかな空色に戻した**（実機の指摘。一度 #3FC8FF に濃くしたが、
// 以前のほうが印象が良かった）。本体の輝度を 221 → 186 に下げることで、
// この色が本体より明るく見えるようにしてある。消灯は暗いスレートで、
// 暗→シアンの点滅として読ませる
export const BARRIER_UNIT_LAMP_COLOR = '#7FD8FF';
export const BARRIER_UNIT_LAMP_OFF_COLOR = '#4A5A6B';
// バリアの音。**細く高い持続音**にする。最初は 72Hz の低い唸り＋矩形波の倍音で
// 作ったが、実機で「うざい」と出た（低い唸りは常時鳴ると圧が強く、母艦エンジンとも
// 帯域が近い）。三角波1本に絞って高い方へ寄せ、ローパスも上げて細くしてある。
// AM も浅く遅くして「ジジジ」を弱め、蛍光灯の唸りくらいの存在感に留める
export const BARRIER_HUM_FREQ = 320;         // 芯（Hz）。低い唸りをやめて高い方へ
export const BARRIER_HUM_HARMONIC = 0;       // 倍音の矩形波は廃止（0 で無効）
export const BARRIER_HUM_FILTER = 1800;      // ローパス。芯より上に置いて角を丸める程度に
export const BARRIER_HUM_AM_HZ = 7;          // 振幅変調。11 → 7 で落ち着かせる
export const BARRIER_HUM_AM_DEPTH = 0.25;    // 0.45 → 0.25。揺れを浅く
export const BARRIER_HUM_GAIN = 0.032;       // A特性で -48.1dB。回復ハムより 6dB 低い（実機の「うざい」への対応）       // 満音量のときの gain
// 弾を吸ったときの単発。短いノイズのバースト＋落ちるブリップ
export const BARRIER_ABSORB_FILTER = 2200;
export const BARRIER_ABSORB_DECAY = 0.07;
export const BARRIER_ABSORB_GAIN = 0.27;     // A特性で -43.7dB。唸りより 4dB 上（狭いバンドパスで捨てたぶんを補正した値）
// 2基目のユニットが壊れてバリアが落ちたときの合図。電源が落ちる下降音
export const BARRIER_DOWN_FREQ_FROM = 420;
export const BARRIER_DOWN_FREQ_TO = 55;
export const BARRIER_DOWN_TIME = 0.38;
export const BARRIER_DOWN_GAIN = 0.20;       // A特性で -37.4dB。唸りより 4dB 上げて、開いたことが分かるように
// 吸収の見た目。**弾が消えるだけだとバグに見える**（実機の指摘）。当たった高さに
// 光の輪を残し、バリアが受け止めたことを見せる。輪は横に広がりながら薄くなる
// **爆発とは向きが逆**でなければならない（実機の指摘）。爆発は外へ撒くが、吸収は
// 内へ吸い寄せる。粒はバリアの周りから中心へ集まって消え、光の輪は広がるのではなく
// 縮んでいく。ここを逆にすると「弾が爆発した」に見えて吸収に読めない
export const BARRIER_FLARE_FRAMES = 14;      // 輪が消えるまで
export const BARRIER_FLARE_WIDTH = 26;       // 輪の**最初**の横幅（px）。ここから縮む
export const BARRIER_FLARE_HEIGHT = 5;       // 同、縦の厚み
export const BARRIER_SUCK_COUNT = 6;         // 吸い寄せられる粒の数
export const BARRIER_SUCK_RADIUS = 20;       // どれだけ外から集まってくるか（px）
export const BARRIER_SUCK_FRAMES = 9;        // 集まりきるまで。短いほど「吸われた」が鋭く出る
export const BARRIER_SUCK_SIZE = 2;
// 片方のユニットを壊すと、残った1基が**空中が続く限りバリアを伸ばす**（実機の案）。
// 半端に壊すと危険が増すので「両方壊せ」の圧になる。**床は硬い岩＝自機が壊せる**ので、
// 先に床へ穴を開けてから片方を壊すと、その穴を通って上下の階まで塞がる。
// だから長さは毎フレーム地形から測り直す（固定にすると穴を開けても伸びない）
export const BARRIER_EXTEND_MAX = 40;        // 伸びる上限（タイル）。暴走の歯止め

// --- 要塞の電流の床（廊下の床を走る放電。設計 2026-10-29-stage7-fortress-hazards-design.md）---
// 置き場所: 各階の廊下は1本ずつで、そこにはもうバリアが立っている（実測で全階）。別の廊下を探すと
// 置ける所が無いので、**バリアのある廊下の、長いほうの側の床**に敷く。
// 8シード（99階）で試した置き方の比較: バリアから3列離し端も1列空けると20本（5シードにしか無い）、
// 2列離して端を空けないと53本（全シードに有、1シード平均6.6本、長さ平均4.2タイル）。後者にした。
// 2列離す = バリアの支柱（幅12px）の両隣に1タイルの空きが残るので、放電と支柱が重ならない。
export const ELECTRIC_FLOOR_BARRIER_GAP = 2;   // バリアの列から、床の一番近いタイルまでの列数
export const ELECTRIC_FLOOR_MIN_LEN = 3;       // これより短い床は敷かない（1〜2タイルでは「踏まない」だけで罠にならない）
// 周期は 予兆 → 放電 → 休み。予兆は火花だけでダメージは無く、「次に来る」を読ませる。
// 休みを放電より長く取り、通り抜けるタイミングを待てるようにする（低い所を這う必要が出ないように）
export const ELECTRIC_FLOOR_WARN_FRAMES = 30;
export const ELECTRIC_FLOOR_ACTIVE_FRAMES = 50;
export const ELECTRIC_FLOOR_REST_FRAMES = 70;
export const ELECTRIC_FLOOR_H = 20;            // 放電の高さ（px）。自機（24px）が床に降りていれば必ず触れ、
                                               // 廊下の高さ 64px の3割なので、上を飛べば避けられる
export const ELECTRIC_FLOOR_TOUCH_DAMAGE = 5;  // 1回あたり。バリアの毎フレーム6と違い、離れなくても刻みで入る
export const ELECTRIC_FLOOR_HIT_INTERVAL = 15; // 同じ相手に入る間隔（フレーム）。放電50フレームの中で最大4回=20
export const ELECTRIC_FLOOR_KICK_VY = -3;      // 触れたときに上へ弾く速さ。居座りづらくする（バリアの押し戻しの床版）
export const ELECTRIC_FLOOR_COLOR = '#FFE066';       // 放電の芯。バリアの水色と取り違えない黄
export const ELECTRIC_FLOOR_CORE_COLOR = '#FFFBE0';       // 放電の芯（ほぼ白）
export const ELECTRIC_FLOOR_GLOW_COLOR = 'rgba(255, 210, 80, 0.28)';
export const ELECTRIC_FLOOR_ELECTRODE_COLOR = '#6B7686';   // 床に埋めた電極の頭
export const ELECTRIC_FLOOR_ELECTRODE_LAMP = '#FFB000';    // 予兆・放電中に点く
export const ELECTRIC_FLOOR_ELECTRODE_LAMP_OFF = '#3A4553';
// 放電が始まる瞬間の「バチッ」。バリアの吸収音（ジッ）と区別できるよう高めの帯域・長めの減衰
export const ELECTRIC_ZAP_FILTER = 3400;
export const ELECTRIC_ZAP_DECAY = 0.14;
export const ELECTRIC_ZAP_GAIN = 0.2;           // A特性で -42.0dB。吸収音（-43.7dB）より 1.7dB 上げて、床の放電が聞き分けられるように

// --- 面ごとの硬い岩（BLOCK_HARD。灰色・HARD_BLOCK_HP 発で壊れる）の割合 ---
// _placeHardBlocks() が破壊可能タイル1つごとに引く確率。STAGE_ENVIRONMENTS と同じ7行で、
// missionLevel は剰余で丸める（debugStartMission で面数を超えた値が来るため）。
// 前半3面は元の一律 0.06 のまま据え置き（序盤の手応えを変えない）。4面から立ち上げ、
// **5面だけ特別に8割**（雪の岩山。掘って抜けるより地形を読んで飛ぶ面にする）、6→7で更に上げる。
//
// なぜ増やすのか（ユーザーの動機。数値を動かす前にここを読むこと）:
// 後半ほど敵のミサイルが増え、**足場そのものが撃ち崩されて遊べなくなる**。
// 敵のミサイルとホーミングはブロックへのダメージが 1 なので、通常岩（HP 1）は
// 被弾1発で消えるが、硬い岩（HARD_BLOCK_HP = 3）は3発耐える。つまりこの表は
// 「後半の面の足場が何発もつか」の表でもある。
// **5面が突出しているのは雪で滑るため。** 足場が減ると滑って立て直せず、
// 他の面より遊びづらさが跳ね上がるので思い切って上げてある（6・7面より高い）。
//
// 効かない相手: グレネードと巡航ミサイルは destroyArea() で3ダメージなので、
// 硬い岩も一撃で消える。そちらまで耐えさせたいなら HARD_BLOCK_HP を 4 に上げる
// （自機が掘るコストも上がる）。
// 注意: 割合を変えても rng の消費数は変わらない（確率に関係なく必ず1回引くため）ので、
// 週次の決定性（同じ週なら同じ敵配置）は壊れない。tests/hard-block-ratio.test.js が縛る。
// 行は数値か **[左端, 右端] の対**。対のときは列で線形に補間する（7面だけ）。
// 7面は「マップの右に進むに従って硬い岩が増える」（実機の指摘）。基地は右下に
// あるので、近づくほど地形が固くなる＝要塞の外郭に踏み込んだ感じが出る。
// 平均は 0.55 で、一律だった 0.40 からの底上げも兼ねている
export const HARD_BLOCK_CHANCE_BY_STAGE = [0.06, 0.06, 0.10, 0.18, 0.80, 0.28, [0.35, 0.75]];
// 硬い岩の耐久。1発では壊れず、途中経過はひび割れの本数で見せる（Map._drawTile）
export const HARD_BLOCK_HP = 3;

// 水中の動き。speed は位置更新と推力に掛ける倍率、gravity は重力の倍率。
// 浮力は持たない（重力が弱いだけで、沈めば底を歩く）。実機で詰める前の初期値。
export const WATER_SPEED_SCALE = 0.5;
export const WATER_GRAVITY_SCALE = 0.3;
// 水中での最大落下速度の倍率（空気中 MAX_FALLING_SPEED に対する係数）。
// 0.42 を掛けることで、実移動量は空気中の約 0.21倍（現行の半分以下）に抑えられ、
// 自機(実速度 約1.47)・グレネード(実速度 約1.26)ともに心地よい浮力と沈降感になる。
export const WATER_FALL_SPEED_SCALE = 0.42;
// マシンガン弾（Bullet.js、自機・敵共通）が水中で受ける抗力。1フレームごとに
// vx/vy へ掛けて速度そのものを弱める（motion.speed のような「その場だけ遅くなる」
// 倍率ではない）。水中に入ったら減速し続け、水中→空中へ出た瞬間は減速済みの速度の
// まま飛び続ける（実機の指摘: 出た瞬間に元の速さへ戻るのは不自然）。
// 0.85 は減速が急すぎた（実機の指摘）ので 0.96 に緩和。初速4px/frameが
// BULLET_WATER_MIN_SPEED を下回るまで約51フレーム(0.85秒)かかる
export const BULLET_WATER_DRAG = 0.96;
// これを下回ったら「止まって漂う」のではなく自然消滅させる（実機の指摘:
// 寿命が尽きるまで水中に静止したままなのは不自然）。0.5 だと消えるまで
// 約51フレームかかり長すぎた（実機の指摘）ので 1.0 に引き上げ、約34フレーム(0.57秒)で消える
export const BULLET_WATER_MIN_SPEED = 1.0;
// 水中を進む弾の白い尾。Missile の TrailParticle と同じ仕組みに乗る（実機の指摘）
export const BULLET_WATER_TRAIL_INTERVAL = 2; // フレームおきに1個
// 雪の地上で入力を離したときの速度の残存率（陸上は 0 = 即停止）。
export const ICE_SLIDE = 0.94;  // 実機: もう少し滑る（0.9 → 0.94。止まるまでの距離が約1.7倍）
export const ICE_MAX_SLIDE_SPEED = 3.0;    // 斜面で加速し続けても超えない
export const SLOPE_DOWNHILL_ACCEL = 0.06;  // 斜面に立っているあいだ毎フレーム下り方向へ
export const SLOPE_UPHILL_SCALE = 0.6;     // 上り方向の入力の最高速の倍率
// タイル形状つき当たり判定（docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md）の坂。
// 坂を上る・下るとき、1フレームに体を上下へ動かしてよい量は「横の移動量 + この余裕」。45度の坂は
// 横に動いた分だけ高さが変わるので、余裕 1px で坂には吸い付き、8px の面取りの先の垂直な落差には届かない
export const SLOPE_CLIMB_MARGIN = 1;
// 縦に動いていて斜辺に当たったとき、縦の速さのうち斜辺に沿った横の速さへ移す割合。
// 45度の斜辺へ速度を射影すると縦の速さの半分が横に残るので 0.5（初期値。実機で調整する）
export const SLOPE_DEFLECT = 0.5;
// 霧で索敵の横半径に掛ける倍率（縦は SIGHT_ASPECT 経由で同じ比率で縮む）。自機の Auto Aim も同じ。
export const FOG_SIGHT_SCALE = 0.5;

// 地底湖の生成。低い位置のチャンバーを選び、部屋の底から数段を水にする。
export const WATER_POOL_COUNT = 3;
export const WATER_POOL_DEPTH_MIN = 3;      // 段（タイル）
export const WATER_POOL_DEPTH_RANGE = 2;    // 3〜5段（depthMin + floor(rng*(range+1)) なので range=2）
export const WATER_POOL_MAX_TILES = 600;    // これを超える塗り広がりは「部屋に閉じていない」とみなして捨てる
// 水流セル・オートマトン。1タイルを 8 段階の水量（mass）で管理する。
export const MAX_WATER_MASS = 8;
export const MIN_WATER_MASS = 1;
// 落下。以前は 4フレームに1回・最大2 で、横の流れ（毎フレーム最大4）の 1/8 しかなく、水の塊が
// 落ちきる前に横へ広がって宙に浮いた四角になり、階段や棚に居座った（2026-10-10 実機の指摘）。
// 4面・6シード×2400フレームの実測で、浮いた満水の四角は 4f/2: 682、毎フレーム/2: 206、
// 毎フレーム/4: 208、毎フレーム/8: 171。効くのは間隔で量ではないので、量は 2 のまま
export const WATER_MAX_FALL_FLOW = 2;   // 1回の落下で下のセルへ移せる最大量
export const WATER_FALL_INTERVAL = 1;   // 落下の間隔（フレーム）
export const WATER_MAX_SPREAD_FLOW = 4; // 1ステップあたりの最大水平流出量（初期のスムーズな流出速度）
// 細い流れの記録（world/waterStream.js）。落下が毎フレームだと、湧き水の粒（4フレームおきに水量1）は
// 1マス/フレームで落ち、粒と粒のあいだが3マス空く。セルの中身だけで滝を判定すると点線になって
// 点滅した（4面・6シード×2400フレームで、滝⇄滝以外の入れ替わり 43,995 → 820,474）。
// 量1で落ちたセルに記録を残し、そのあいだは空でも滝とみなす（試作で 2,770 まで減った）。
// 保持 4・5・6 で点滅は 2,774・2,778・2,780 と差が無い。記録が長いほど流れが止んだ後も滝が
// 残るので、最短の 4。湧き水の周期（WATER_SPRING_INTERVAL）より短くしてはいけない: 水源の口の
// マスは「ここから落ちた」の記録しか付かず（落ちて来る粒が無い）、それも湧き水の周期に1回だけ。
// 保持 3 だと口のマスが点滅し、点滅は 2,966→17,420、描いた帯の点滅は 4,162→18,745 に戻った
export const WATER_STREAM_HOLD_FRAMES = 4;
// 記録するのは1回に落ちた量がこれ以下のときだけ。塊は2ずつ落ちるので、絞らないと塊の通り道に
// 滝の尾が残った（幅3の縦穴を落ちる塊の上に、延べ195セル×フレーム）。絞っても細い流れの点滅は
// 2,774 → 2,770 で変わらない（細い流れはどれも量1で落ちる）
export const WATER_STREAM_MAX_FLOW = 1;
// 水圧（連通管、world/waterPressure.js）。水面より下でつながった池どうしで、高い方から低い方へ
// 1ステップ（WATER_PRESSURE_INTERVAL に1回）あたり「接続部の太さ（セル数）× round(GAIN × √水位差)」を運ぶ。
// 水位差は 1/8タイル単位。GAIN の初期値は、水位差4タイル（√32 ≈ 5.7）で 1経路あたり 2単位/4フレーム
// ＝ 0.5単位/フレームになるように選んだ。水面より上の穴1段から滝で流れ落ちる速さ（実測 0.52単位/
// フレーム、2026-10-10）とほぼ同じで、水面の上の穴と下の穴とで流れる速さの感覚が揃う。実機未確認
export const WATER_PRESSURE_GAIN = 0.35;
// これ未満の水位差では運ばない。1単位運ぶと差は2縮むので、2未満で運ぶと逆転して行き来する
export const WATER_PRESSURE_MIN_DIFF = 2;
// 1経路・1ステップあたりの上限（WATER_MAX_SPREAD_FLOW と同じ）。太い穴を開けた直後の勢いの頭打ち
export const WATER_PRESSURE_MAX_FLOW = 4;
// 水圧で運ぶ間隔（フレーム）。以前は落下と同じフレーム（WATER_FALL_INTERVAL = 4 に1回）に運んでいて、
// GAIN などはその速さで実機確認した（「いい感じ」）。落下を毎フレームにしたとき水圧まで4倍速く
// ならないよう、間隔を切り離して 4 のまま保つ
export const WATER_PRESSURE_INTERVAL = 4;
// 水源（湧水）と滝の仕様
// 湧き出る周期と量。湖の満ちる速さ（面のバランス）を決めるので、落下を毎フレームにしたときも
// 変えていない（ユーザー判断 2026-10-10）。粒は4フレームおきに出て1マス/フレームで落ちるので
// 中身だけ見ると3マスおきの点線になるが、滝としては流れの記録（waterStream.js）でつながる。
// （以前は落下も4フレームに1回で、周期を落下の間隔と揃えて中身だけで隙間なく連ねていた。
// 実機で「FallingWater が途切れ途切れ」と指摘されたのは周期15のとき）
export const WATER_SPRING_INTERVAL = 4;        // 湧き出る周期（フレーム）
// 水量は 1。周期を 15→4 に縮めたぶん、1回あたりを 2→1 に減らして流入量の
// 増加を 1.9 倍に抑える（2 のままだと 3.8 倍で水没がかなり速くなる）
export const WATER_SPRING_MASS = 1;            // 1回あたりの湧出水量
export const WATER_SPRING_COUNT = 2;           // 水源の数
export const WATER_SPRING_MAX_ROW_RATIO = 0.5; // マップ上半分から水源を選ぶ
// 滝（落下水流）の中の物理
// 滝・床を流れる水の見た目（environment/waterfallRuns.js）。どれも見た目だけの値で、
// 当たり判定（isWaterfallAtPixel）はタイル単位のまま。
//
// 以前は「滝の描き始めを一番上の落下セルの上辺から WATERFALL_HEAD_DROP(16px) 下げる」で
// 岩の縁から滑り落ちる感じを出していたが、水源の口の下が1タイル空いて点々だけに見えた
// （実機の指摘）。今は滝を1本の区間として扱い、どこから出たかで描き始めを決める:
// 岩の口からなら岩の下面から細く、床の縁からなら床を流れる水の上面から。
export const WATERFALL_BAND_WIDTH = 8;         // px。滝の帯の幅
// 岩の口から出る滝が、この高さ(px)をかけて WATERFALL_MOUTH_WIDTH から帯の幅まで広がる
export const WATERFALL_MOUTH_TAPER = 8;
export const WATERFALL_MOUTH_WIDTH = 2;        // px。口の真下での幅
// 床を流れる水（着水点から次の落ち際まで）の厚み。シミュレーションでは床の上の水は
// 同じフレームのうちに落ち口まで運ばれてしまい、セルとしてはほとんど見えないので、
// 着水点と落ち口の位置から描く
export const RUNNING_WATER_THICKNESS = 3;      // px
// 床の縁から落ちる滝（spill）の上端で、水の進む側の角を丸める四分円の半径。
// 床の水（厚み3px）と帯（幅8px）が直角の L 字でつながるだけだと、水が縁を回り込む感じが
// 出なかった。帯の幅と同じ 8px なら円弧は床の水の上面から帯の外縁まで届いて、
// ちょうど角が丸まる（帯の幅を超えても広がらないよう spillArcRows 側で切る）。
// 実機で見て大きすぎ／小さすぎならここだけ動かす
export const WATERFALL_SPILL_ARC_RADIUS = 8;   // px

// 下方向への押し下げ加速度。GRAVITY(0.30) に**足す**。滝が水中と同じ弱い重力
// (0.09) だった頃の 0.18 は、空気と同じ重力(0.30)に直すと合計 0.48 になり、
// ホバーの推力 0.50 とほぼ釣り合って滝が登れない壁になる。合計 0.36（空気の1.2倍）
// にして、「重いが登れる」ようにした。上昇の実効加速度は空気中 -0.20 に対し -0.14。
// 滝の押しをもっと強くしたいならここだけ上げる（0.20 でホバーがほぼ釣り合う）
export const WATERFALL_DOWNFORCE = 0.06;
// 滝の中での落下速度上限スケール。1.0 ＝ 空気中と同じ（滝に浮力は無い）
export const WATERFALL_FALL_SPEED_SCALE = 1.0;
// 地底湖の描画。塗りは半透明（水セルは前景1枚、境界ブロックの面取り隙間は下層水で完全に同色同濃度）。
export const WATER_FILL = 'rgba(40, 120, 200, 0.45)';
export const WATER_BEHIND_FILL = WATER_FILL; // 境界ブロックの隙間埋め用（前景水と同一濃度）
// 泡の粒。泡のマス（棚から棚へ流れ落ちる満水のセルの真下の隙間）から生まれ、水の中を昇って水の外で消える。
// 泡のマスは1か所に3フレームも続かない（落下の4フレーム周期で出たり消えたりする）ので、マスに粒を描くと
// 点滅するだけだった。粒はマスが消えても寿命まで昇り続ける（2026-10-10 ユーザー要望「白い泡が上に上がる」）
export const WATER_BUBBLE_COLOR = 'rgba(240, 250, 255, 0.85)';
export const WATER_BUBBLE_RISE_MIN = 0.4;      // px/フレーム。1タイル（16px）を 20〜40 フレームで昇る
export const WATER_BUBBLE_RISE_MAX = 0.8;
export const WATER_BUBBLE_EMIT_CHANCE = 0.35;  // 泡のマス1つが1フレームに粒を生む確率
export const WATER_BUBBLE_LIFETIME = 40;       // フレーム。最後の8フレームで薄れる
export const WATER_BUBBLE_MAX = 150;           // 粒の数の上限（実マップの泡のマスは同時に多くて7つ）
// ジェットの噴射と水中の爆発が撒く泡の粒（2026-10-11 ユーザー要望「水中でジェット噴射したら水泡が舞う」
// 「水中でグレネードが爆発したら水泡が舞い上がっていく」）。見た目は上の泡の粒そのもの（同じ色・同じ描き方で、
// 水の描画の bubbles に相乗りする。粒子(particles)にすると水の塗りの下に描かれて泡だけ色がくすむ）。
// 泡のマスの粒との違いは、初めに勢い（噴流に押される・爆発で飛び散る）を持ち、浮力で昇る速さへ
// 寄っていくことと、水面まで昇り切れるよう速く長生きなこと（泡のマスの粒は 40 フレームで 16〜32px しか昇らない）。
//   count         1回に撒く数（blast だけは爆発の大きさから BLAST_BUBBLES_* で決める）
//   speedMin/Max  初速 px/フレーム。angle の向きを中心に spread の扇
//   angle         初速の向き（ラジアン、画面座標。π/2 が真下）
//   jitter        出る位置の散らばり px（中心から ±jitter/2）
//   riseMin/Max   浮力で落ち着く昇る速さ px/フレーム
//   sizes         粒の大きさ px。ここから一様に選ぶ（1 を重ねると小さい粒が多くなる）
//   life          寿命フレーム。ほとんどはその前に水面へ出て消える
export const BUBBLE_BURSTS = {
    // ホバーの噴射。HOVER_JET_BUBBLE_INTERVAL おきに、炎の先あたりから噴流に押されて下へ。
    // 初速 -2 前後・浮力 0.08 だと 10px ほど下がってから昇りに転じる（噴流が水を押す感じ）
    jet:   { count: 2, speedMin: 1.0, speedMax: 2.5, angle: Math.PI / 2, spread: 0.9, jitter: 4,
             riseMin: 0.8, riseMax: 1.6, sizes: [1, 1, 2], life: 120 },
    // バーストジャンプ（敵はジャンプ）の一吹き。噴射と同じ向きで、多く・強く・横にも広く
    burst: { count: 10, speedMin: 1.5, speedMax: 3.5, angle: Math.PI / 2, spread: 1.6, jitter: 8,
             riseMin: 0.8, riseMax: 1.6, sizes: [1, 2, 2], life: 120 },
    // 水中の爆発。全方向へ飛び散り、大きい粒ほど目立つよう 3px も混ぜる
    blast: { count: 0, speedMin: 1.5, speedMax: 4.0, angle: 0, spread: Math.PI * 2, jitter: 10,
             riseMin: 1.0, riseMax: 2.2, sizes: [1, 2, 2, 3], life: 150 },
};
export const WATER_BUBBLE_DRAG = 0.9;          // 横の初速が毎フレーム残る割合（水の抵抗）
export const WATER_BUBBLE_BUOYANCY = 0.08;     // 昇る速さが毎フレーム rise へ寄る割合
export const WATER_BUBBLE_SPAWNED_MAX = 300;   // 撒いた泡の数の上限（泡のマスの粒とは別に数える。噴射が泡のマスの粒を締め出さない）
export const HOVER_JET_BUBBLE_INTERVAL = 3;    // フレーム。噴射の泡を撒く間隔（BUBBLE_BURSTS.jet.count 粒ずつ）
// 水中の爆発の泡の数 = 爆発の粒の数 × PER（上限 MAX）。グレネード(150粒)で 38、敵機の破壊(20〜36粒)で 5〜9、
// マシンガンの着弾(4粒)で 1。爆発の大きさが泡の量でも分かるように比例させる
export const BLAST_BUBBLES_PER_PARTICLE = 0.25;
export const BLAST_BUBBLES_MAX = 40;
export const WATER_SURFACE_COLOR = 'rgba(180, 220, 255, 0.45)'; // 実機: もっと淡く（0.9 → 0.45）
export const WATER_SURFACE_LINE_WIDTH = 1;  // 実機: 細い線（2 → 1）
export const WATER_WAVE_AMPLITUDE = 1.5;    // 実機: 波を細かく（2.5 → 1.5）。px。当たり判定は波打たない
export const WATER_WAVE_LENGTH = 24;        // 実機: 波を細かく（48 → 24。1.5 タイル）
export const WATER_WAVE_SPEED = 0.05;       // rad/frame
export const WATER_RIPPLE_DECAY = 0.94;     // しぶきが落ちた場所の波の減衰（毎フレーム）
export const WATER_RIPPLE_MAX = 2.5;        // しぶきの波紋の強さの上限（実機: 爆発の波動は穏やかに。6 → 2.5）
export const WATER_RIPPLE_MIN = 0.2;        // これ未満になった波紋は捨てる
// 水中での爆発（グレネード・ミサイル・敵機の破壊。すべて spawnExplosion() に相乗り）の波紋。
// しぶき(spawnSplash)の最大と同じ強さにしてある。爆発はしぶきよりずっと激しい現象だが、
// 波紋の見た目自体の上限が WATER_RIPPLE_MAX なので、それ以上強くしても変わらない（実機の指摘）
export const EXPLOSION_RIPPLE_STRENGTH = WATER_RIPPLE_MAX;
// 水中爆発の水柱。SplashParticle をそのまま流用し、しぶき(SPLASH_*)よりずっと
// 勢いよく・まっすぐ上向きに多く打ち上げて「水柱が上がった」印象にする（実機の指摘:
// グレネードが敵機の爆発より地味に見える）
export const WATER_COLUMN_PARTICLE_COUNT = 40;
export const WATER_COLUMN_SPEED_MIN = 4;
export const WATER_COLUMN_SPEED_MAX = 9;
export const WATER_COLUMN_SPREAD = 0.5; // rad。SPLASH(1.2)よりだいぶ狭く、まっすぐ上に近い
// しぶき。粒の数は |vy| に比例（速く落ちるほど盛大）。
export const SPLASH_PARTICLES_PER_VY = 3;
export const SPLASH_MAX_PARTICLES = 24;
export const SPLASH_LIFETIME = 28;
// 滝の着水点のしぶき（SplashParticle）と水煙（WaterMistParticle）。以前は帯より少し広い泡の線と
// 3px しか跳ねない点3つだけで地味だった（2026-10-11 実機の指摘「もっと派手に」）。水面に落ち込む滝も
// 床に落ちる滝も同じ。強さ（0〜1）は落差に比例し、WATERFALL_SPLASH_FULL_DROP で頭打ち。
// 出すのは描画が組み立てた画面内の滝だけ（画面外で particles を食い潰さない）。数は実機で見て調整する
export const WATERFALL_SPLASH_INTERVAL = 3;              // フレーム。この間隔で1回ぶん出す
export const WATERFALL_SPLASH_FULL_DROP = TILE_SIZE * 6; // px。この落差で強さ1
export const WATERFALL_SPLASH_SPRAY_MIN = 1;             // しぶきの粒（1回あたり、強さ0のとき）
export const WATERFALL_SPLASH_SPRAY_MAX = 5;             //                 （強さ1のとき）
export const WATERFALL_SPLASH_SPRAY_SPEED_MIN = 1.5;     // 強さ0のときの最大初速
// 散らばる範囲は「派手すぎ。狭く」（2026-10-11 実機の指摘）で絞った。落差最大で95%の粒が届く範囲:
//   調整前 SPEED_MAX 4.5・SPREAD 1.4・水煙の倍率1 → しぶき横±64px・高さ45px、水煙は床の上で横±102px
//   調整後 → tests/waterfall-splash.test.js が しぶき横±32・高さ32、水煙横±40 以内を縛る
export const WATERFALL_SPLASH_SPRAY_SPEED_MAX = 3.2;     // 強さ1のときの最大初速（高さ v²/(2×0.18) ≈ 28px）
export const WATERFALL_SPLASH_SPRAY_SPREAD = 0.7;        // rad。真上を中心にした扇の広さ
export const WATERFALL_SPLASH_MIST_MIN = 1;              // 水煙の粒（1回あたり、強さ0のとき）
export const WATERFALL_SPLASH_MIST_MAX = 4;              //               （強さ1のとき）
export const WATERFALL_SPLASH_MIST_SPREAD = 0.3;         // 水煙の散らばりの倍率（ホバーの水滴を1として）
// 水面に落ち込む滝の着水点の波紋（12フレームおき）。以前は 0.4 で、しぶきを派手にしても
// 水面がほとんど揺れなかった。上限は WATER_RIPPLE_MAX
export const WATERFALL_SPLASH_RIPPLE = 0.9;

// マシンガンの薬莢。当たり判定を持たない純粋な演出で、DebrisPart と同じく
// 地形は無視して落下するが、水中かどうかだけは motionFor で見てゆっくり沈める
// （水面をまたいだ瞬間のしぶきは isDebris フラグに乗せて StageEnvironment に任せる）。
export const CASING_COLOR = '#D4A537';      // 真鍮色
export const CASING_LENGTH = 3;             // 排出方向を向く長辺
export const CASING_WIDTH = 1.5;
export const CASING_GRAVITY = 0.18;         // DebrisPart(0.1〜)より軽い金属片なので少し強め
export const CASING_MAX_FALL_SPEED = 4;
export const CASING_SPIN = 0.5;             // 転がりながら落ちる回転（rad/frame、±半分）
export const CASING_LIFETIME = 50;          // 約0.83秒でフェードアウトしながら消える
// 地形に当たったときの跳ね返り。GRENADE_BOUNCE と同じ考え方（速度を反転させつつ減衰）
// だが薬莢は軽い金属片なのでより弾む（0.5弱→0.55）。何度か跳ねてから転がって止まる見た目にする
export const CASING_BOUNCE = 0.55;
export const CASING_FRICTION = 0.6;         // 地面に着いてから転がる速度の残存率（毎フレーム）
export const CASING_FADE_START = 0.6;       // 経過60%(DebrisPartのDEBRIS_FADE_STARTと同じ考え方)からフェード開始
// 排出口は発射角の右直角（実銃の排出方向）。EJECT_SPREAD でばらつかせる
export const CASING_EJECT_SPREAD = 0.9;
export const CASING_EJECT_SPEED_MIN = 1.2;
export const CASING_EJECT_SPEED_MAX = 2.6;
// 排出方向は狙いの角度ではなく自機の向き（facingRight）基準。真上から
// この角度だけ背中側へ傾けた方向へ飛ぶ（実機の指摘: 狙いの角度に追従すると
// 上を向いて撃ったときに変な方向へ飛ぶ。自機の左右反転にだけ追従してほしい）
export const CASING_EJECT_ANGLE_FROM_UP = Math.PI / 4; // 45°: 右斜め上後方 / 左斜め上後方

// 降雪。板（オフスクリーン）を層ごとにスクロールする。粒を個別に描かないのは
// 縮尺（タイル16px）に見合う 1〜2px の粒を数千出したいから。
export const SNOW_SHEET_SIZE = 512;
// 実機: 3px の粒は大きすぎて雪に見えなかったので廃止。代わりに 2px を2枚重ね、
// 落下速度と横揺れだけを「若干」変えて奥行きを出す（1.5倍を超えると大きさが同じぶん
// 速さの差だけが目について2枚に見える）。板は層ごとに別のシードで撒かれ、横揺れの
// 位相も層番号でずれるので、同じ大きさでも模様が重ならない（snow.js の buildSheet と sway）。
//
// 2枚目は**手前ではなく「遠い」と「中」の間**に置く（実機の指摘）。手前に置くと
// 一番速い層が2枚あることになって騒がしく、欲しいのは奥行きの中途半端な段だった。
// speed 1.15 の層はこれで無くなり、全体がゆっくり降るようになる。
export const SNOW_LAYERS = [
    { count: 320, size: 1, speed: 0.5,  sway: 0.25, alpha: 0.55 }, // 遠い
    { count: 90,  size: 2, speed: 0.7,  sway: 0.38, alpha: 0.62 }, // 中途半端（遠いと中の間）
    { count: 180, size: 2, speed: 0.9,  sway: 0.5,  alpha: 0.7 },  // 中
];
// 実機: 岩の奥（遠景と地形の間）に降るので弾とは層が違う。暗すぎたので明るくした（輝度 143 → 190。白 255 には寄せない）
export const SNOW_COLOR = '#B6BFCB';
// 足元で舞う雪。手前で短時間しか出ないので、降る雪より明るくする（輝度 220）。実機の指摘
export const SNOW_KICK_COLOR = '#D5DDE8';
// 舞う雪。既存の TrailParticle と同じ fillRect 1回の粒。
export const SNOW_KICK_WALK = 1;     // 雪の地上を動いているあいだ、毎フレーム
export const SNOW_KICK_LAND = 10;    // 着地
export const SNOW_KICK_SLIDE = 3;    // 斜面を滑っているあいだ、毎フレーム
// 敵が雪を蹴り始める速さ。自機は |vx| > 0.1 で蹴るが、敵は巡回で微速のまま
// 長く動くので、同じ値だと画面内の敵全員が常時撒き続けることになる
export const ENEMY_SNOW_KICK_MIN_SPEED = 0.4;
// 機体ごとの滑りやすさ（床の滑りに掛ける）。戦車は履帯なので雪でも滑らない。
// 滑らせたら実機で「坂を上れない」となった ── _applySnowSlope の下り加速
// (-0.06/frame) が、以前は毎フレーム巡回速度で上書きされて消えていたのに、
// 速度追従を入れたことで前フレームへ持ち越され、約 -0.94px/frame の定常
// ドリフトになって上り速度(0.5)を食い潰していた。
// **雪煙は別物**（床の性質なので floorSlide が決める）。滑らないが煙は上がる
export const ENEMY_TANK_SLIDE_SCALE = 0;
export const SNOW_KICK_LIFETIME = 30;
// ホバーで雪面の少し上を漂っているときに地表で舞う粉雪（SNOW_KICK とは別の粒。
// 接地していないので「蹴る」のではなく「舞い上がる」見た目にする）。
// 0.5〜3ブロック上空 = TILE_SIZE*0.5(8) 〜 TILE_SIZE*3(48)px。それより低ければ普通の
// SNOW_KICK（着地・滑走）の対象になり、高ければただ飛んでいるだけに見える
// （実機の指摘: 1〜2ブロック(16〜32px)は範囲が狭すぎたので緩めた）
// 下限は 0（足元から雪面まで 0〜48px なら出す。2026-10-11 ユーザー指定「雪が舞う条件のアタッカーと地面の距離の下限を0に」）。
// 以前は半タイル（8px）で、バーストで飛び立つとき（最初の 1 フレームで足元から 6px 上がる）の噴射が雪面を叩く瞬間が
// 条件の外だった。接地中（onTerrain）は SNOW_KICK の担当のまま変わらない（下限を 0 にしても、歩いているあいだは出ない）。
// キャリアは元から下限なし（Carrier._kickHoverSnowMistSide）
export const HOVER_SNOW_MIST_MIN_ALT = 0;
export const HOVER_SNOW_MIST_MAX_ALT = TILE_SIZE * 3;
// 発生間隔(F)。歩行の SNOW_KICK_WALK と違い滞空は何秒も続きうるので、毎フレーム
// 撒くと粒が多すぎる。4F(≈0.07秒 @60fps) おきにまとめて
// （実機の指摘: 自機ほどの図体を持ち上げるスラスターなので、もっと派手に巻き上げていい。
// 初期値の8F/2粒は控えめすぎた）
export const HOVER_SNOW_MIST_INTERVAL = 4;
// 地面との当たり判定を付けたぶん、下向きに飛んだ粒の半分近くが着地直後に
// 吸収されて消える（実機の指摘: 見た目の量が半減した）。その分を見込んで増量
export const HOVER_SNOW_MIST_COUNT = 12;
// バースト（自機のバーストジャンプ・敵アタッカーのジャンプ）で飛び立つ瞬間に、足元の雪面へ出す粉雪の数。
// ホバー中は INTERVAL(4F) おきの間引きで、バーストの 1 フレーム目に当たるかは位相次第だった（実測: 4 通りの位相で最初の粉雪が
// 0〜3 フレーム目にばらけた）。水面の水滴は「バーストの直後は出す」（HOVER_WATER_MIST_BURST_FRAMES）が、雪面にも同じことを
// 求められ、飛び立つ瞬間に必ず 1 回出す形にした。ホバーの粉雪（12）の 1.5 倍を出発点にした。実機で見て調整する
export const HOVER_SNOW_MIST_BURST_COUNT = 18;
export const HOVER_SNOW_MIST_LIFETIME = 75;
// SNOW_KICK より少し暗めにして重ならず見分けやすく（実測ではなく既存の雪色からの派生）
export const HOVER_SNOW_MIST_COLOR = '#C7D2DF';

// ホバーで水面の少し上を漂っているときに水面で舞う水滴（HOVER_SNOW_MIST の水面版）。
// 「床の性質(slide)」で判定していた雪と違い、水は env.kind === 'water' と
// waterClearance（水面までの距離）で判定する。範囲・間隔・個数は雪と同じ値を出発点にし、
// 実機で見て調整する（このファイルの他の値と同じ流儀）
// 下限は 0（足元から水面まで 0〜48px なら出す。2026-10-11 ユーザー指定）。以前は雪の値を写した
// 半タイルで、雪では「歩いている（SNOW_KICK）／浮いている」の住み分けに要ったが、水の上は歩けない
export const HOVER_WATER_MIST_MIN_ALT = 0;
export const HOVER_WATER_MIST_MAX_ALT = TILE_SIZE * 3;
export const HOVER_WATER_MIST_INTERVAL = 2; // より連続して湧き出るように間隔を短縮
// バーストジャンプ（敵アタッカーは _jump）の直後、ホバーしていなくても水滴を出すフレーム数。
// バーストの噴射も水面を叩くはず、という実機の指摘（2026-10-11）。出発点はバースト後に
// ホバーが効かない時間（HOVER_COOLDOWN_AFTER_BURST = 20）と同じ。実機で見て調整する
export const HOVER_WATER_MIST_BURST_FRAMES = 20;
export const HOVER_WATER_MIST_MIN_COUNT = 6;  // 水面から離れているとき（最遠付近）の最小粒数
export const HOVER_WATER_MIST_MAX_COUNT = 24; // 水面に最も近いときの最大粒数
export const HOVER_WATER_MIST_COUNT = 18;    // 互換・中間値（固定指定用）
// キャリアの水滴の粒の数に掛ける倍率。キャリアは浮力で水面にぴったり浮くので距離はほぼ0＝粒の数は
// いつも最大（24）になり、左・中央・右の3か所で出るので1フレームあたり36粒・同時に約1,800粒浮いて
// 派手すぎた（2026-10-11 実機の指摘「少し控えめに」）。半分から始めて実機で見て調整する
export const CARRIER_WATER_MIST_SCALE = 0.5;
// 水滴は雪の粉より重く早く落ちるので、SnowMist(75F)より短命にする
export const HOVER_WATER_MIST_LIFETIME = 50;
// SPLASH_PARTICLE と同じ水色（水しぶきと同系に見せる）
export const HOVER_WATER_MIST_COLOR = '#BFE3FF';
// 積雪の帯（地形キャッシュに焼く。生成時に露出していた上面だけ）。
export const SNOW_CAP_THICKNESS = 5;
export const SNOW_CAP_COLOR = '#EEF4FB';
// 雪の面の階段。部屋の縁に意図的に作り、滑れる長さを保証する。
export const SNOW_STAIRS_COUNT = 8;
export const SNOW_STAIRS_LENGTH_MIN = 5;
export const SNOW_STAIRS_LENGTH_RANGE = 5;  // 5〜9段

// 霧。層は事前に描いた板を視差付きでずらすだけ。粒は出さない。
export const FOG_COLOR = '#8A96A8';
export const FOG_OVERLAY_ALPHA = 0.22;      // 全画面の薄塗り
// 板は画面（1366×768）より大きくして、継ぎ目が横方向にだけ1回入る形にする
// （drawImage が層×2回で済む。1024×512 だと横2×縦2＝層×4回になる）
export const FOG_SHEET_WIDTH = 2048;
export const FOG_SHEET_HEIGHT = 1024;
export const FOG_BLOB_COUNT = 220;          // 実機: ムラを増やす（160 → 220。雲は小さくする）
// 実機の指摘: 円を並べると幾何学的に見える。煙幕と同じ瘤の並び（SMOKE_SHAPES）で
// 雲形にし、横に押し潰して有機的に見せる
export const FOG_BLOB_RADIUS_MIN = 18;      // 実機: 小さめ（40〜130 → 18〜60）
export const FOG_BLOB_RADIUS_RANGE = 42;
export const FOG_BLOB_ASPECT = 2.0;         // 横長。円だと幾何学的に見える（実機の指摘）
export const FOG_BLOB_ALPHA_MIN = 0.05;     // 雲ごとの濃さの幅でムラを出す
export const FOG_BLOB_ALPHA_RANGE = 0.30;
export const FOG_LAYERS = [
    { speed: 0.12, alpha: 0.30 },
    { speed: 0.28, alpha: 0.22 },
];

// デモ画面（面別ランキング・面セレクト・タイトル）では文字の可読性のために薄くする。
export const DEMO_OVERLAY_ALPHA_SCALE = 0.5;

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

// --- Mini-map (実際の地形を縮小して焼く。tile cache を drawImage で縮小するだけなので
// 見た目は本編と一致する。彩度・明度だけここで落として背景に沈める) ---
export const MINIMAP_SATURATION = 0.55;   // 彩度を落として背景に沈める
// 2026-08-22: 「ミニマップが見づらい」の正体は透明度ではなく明度だった。
// 先に α を 0.6→0.75→0.85 と上げたが手応えが薄く、実機の判断で明度側へ切り替え。
// 0.65 → 0.9。1.0 を超えてはいけない（ctx.filter が無い環境のフォールバックが
// `1 - この値` を globalAlpha に入れるため。tests/minimap-position.test.js が縛る）
export const MINIMAP_BRIGHTNESS = 0.9;
// ミニマップ全体の不透明度 (開いたときの半透明さ)。この値が掛かるのは**地形だけ**で、
// 自機・敵の点には掛けていない（ScreenRenderer の該当箇所を参照）。
// 0.85 は地形の上に重ねると前景が読めなくなるとの実機フィードバックで 0.55 へ下げ、
// その後 0.6 に戻していた。2026-08-22 に「見づらい」との指摘で 0.75 へ。
// そこから 0.85 まで上げても手応えが薄く、原因は透明度ではなく明度
// （MINIMAP_BRIGHTNESS）だと分かったので 0.75 に戻してある。
// 上げるほど地形は読みやすく、下の本編は隠れる。1.0 にすると
// tests/minimap-position.test.js の「0 < α < 1」を緩める必要がある
export const MINIMAP_ALPHA = 0.75;
// 画面四隅から置き場所を選ぶときの、画面端／HUD帯からの余白
export const MINIMAP_MARGIN = 16;
// 画面幅に対するミニマップの上限。大きいマップ（最大600x300）だと
// 画面の大半を覆ってしまうため、焼く解像度は変えずに描画時だけ縮小する。
// 外枠を無くして薄く見えるようになったぶん、1/3 だと小さすぎるとの
// フィードバックで引き上げた。1/2（画面幅1366に対して683px）だと、
// 四隅に置いても左右の候補が完全に重なり（683×2＝1366＝画面幅）実質
// 「上か下か」の2択になってしまう。避ける対象が3つ（自機・クロスヘア・
// 母艦の方向矢印）ある状況では上下とも塞がってフォールバックに落ちる場面が
// 増えるため、0.4（約546px）にして左右の候補にずれを残した
// （16:9化 (1366px) での再計算: 0.4×1366＝546、546×2＝1093＜1366。
// 左右の候補が重ならないという狙いは、4:3 のとき (410×2＝820<1024) より
// むしろ余裕を持って成立している）
export const MINIMAP_MAX_WIDTH_RATIO = 0.4;
// 隅から隅への切り替えを「消える→切り替わる→現れる」でつなぐときの
// 1フレームあたりのフェード量。0.08 で消えて現れるまで約0.4秒
export const MINIMAP_FADE_SPEED = 0.08;
// 自機・クロスヘアが「近づいたら」避け始めるための余白。矩形に実際に
// 重なってからでは動き出しが遅く感じるため、少し手前で反応させる
// 「今この画面に映っている範囲」のハイライト。ミニマップの表示サイズを
// マップの広さによらず一定にした結果「全体マップがどれくらい広いのか
// 分かりにくい」となったための追加。可視領域は常に 64x48 タイル固定なので、
// **それがミニマップに占める割合がそのまま縮尺になる**（最小マップで
// 43%x64%、最大マップで 21%x32% ＝ 面積で4倍の差がひと目で分かる）。
//
// 「外を暗くする」ではなく「中を明るくする」を選んだのはユーザー判断。
// ミニマップは既に彩度・明度を落として沈めてあり、これ以上暗い部分を作ると
// マップとして読めなくなる。
//
// 白を重ねる方式なのは、ミニマップがライブのゲーム画面の上に半透明で乗って
// いるから。地形をもう一度重ねて不透明度を上げる方式だと、背後に何が映って
// いるかでコントラストが変わって狙った差が出る保証がない。白を足すのは
// 背後に依存せず必ず明度が上がる。
export const COLOR_MINIMAP_VIEWPORT = '#FFFFFF';
export const MINIMAP_VIEWPORT_HIGHLIGHT = 0.15;

export const MINIMAP_AVOID_PADDING = 48;
// 自機（ドッキング中は母艦）側の余白。クロスヘアより大きく取る。
// 以前は 0 で、**実際にミニマップの矩形へ入るまで動き出さなかった**ため
// 「近づいているのに位置が変わらない。重なってしまう」と実機で指摘された。
// 隅の切り替えはフェード（MINIMAP_FADE_SPEED=0.08 ＝ 消えるまで約13フレーム）を
// 挟むので、入ってから動き始めたのでは必ず重なる。自機の移動速度でその13
// フレームぶん先回りできる距離が要る。64 = 自機の半分(8px)＋フェード中の
// 移動ぶん(速度3で約38px)＋余裕
export const MINIMAP_AVOID_PADDING_UNIT = 64;

// ミニマップは「カーソルがいる側の反対側」に置く。その左右／上下を切り替える
// 中心線に置く不感帯の幅（隅と隅の間隔に対する比）。カーソルが中心付近で
// 揺れるたびにミニマップが往復しないようにするためのヒステリシス。
// 0.15 で 1366x768 のとき横 ±118px / 縦 ±60px（4:3 の 1024x768 では
// 横 ±87px / 縦 ±71px だった。横はミニマップ幅が画面幅に比例して広がった
// ぶん拡大し、縦はミニマップの縦幅（cols:rows は常に 2:1 なので横幅の半分）
// も一緒に広がった影響で縮んでいる。HUD帯を除いた縦の使える範囲そのものは
// CANVAS_HEIGHT が変わっていないので変化していない）。0.3 まで上げると今度は
// 「カーソルを反対側へ振っても付いてこない」と感じる領域が広くなりすぎた
export const MINIMAP_SIDE_HYSTERESIS = 0.15;

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

// --- Online leaderboard (GAS Web App). Paste your deployed /exec URL here. ---
// Leave empty to run fully offline (local ranking only). See docs gas-setup.md.
export const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbyVQ4loEQENSOV3f6zv4lZ-_Z4HxDT3xDh4IJjQiW1INdtTt6qOaLsN5FdJTI7FjWHD/exec';

// --- Enemy missile hit knockback (smaller than a grenade) ---
// --- ホバー音の音作り ---
// 自機・敵とも「共鳴させたノイズ」が主体。回転翼の風切り音に近い。
// 自機は RPM に追従して最大 PLAYER_HOVER_MAX_FREQ*2 = 1200Hz まで上がる。
export const PLAYER_HOVER_MAX_FREQ = 600;

// 敵は同じ音作りだが、自機と混ざっても区別できるよう性格を変えてある。
// (1) 中心を 600Hz に下げる（自機の 1200Hz のちょうど半分。耳では別物）
// (2) Q を緩めて痩せさせる（自機は 5。細く鋭いほど「自分の機体」らしい）
// (3) 中心周波数をゆっくり揺らす。自機の音は揺れないため、この「ふらつき」
//     だけで鳴っているのが敵だと分かる。ただし目立たせすぎない。
//     速さも幅も控えめにして、音色の癖として感じる程度に留める。
export const ENEMY_HOVER_NOISE_FREQ = 600;
export const ENEMY_HOVER_NOISE_Q = 3.5;
export const ENEMY_HOVER_WOBBLE_HZ = 4.5;   // 揺れの速さ
export const ENEMY_HOVER_WOBBLE_DEPTH = 70; // 揺れの幅（Hz）。中心の約12%
// 高域だけだと軽いので、低い唸りを薄く足して機体の重さを出す
export const ENEMY_HOVER_BODY_FREQ = 200;
export const ENEMY_HOVER_BODY_GAIN = 0.35;
// 主体をノコギリ波からバンドパスノイズに変えた時点で、聞こえる大きさが
// 8.9dB(A) 落ちて事実上無音になった。狭い帯域を通すと白色ノイズの
// エネルギーの大半が捨てられるため。その補正。
// 倍率は A特性の実測から決めている。中心を 760Hz から 600Hz へ下げた際に
// 聴感が 1.9dB 落ちたぶんも、ここで戻してある（2.8 → 3.5）。
// tests/hover-timbre.test.js が自機のホバー音との差を監視している。
export const ENEMY_HOVER_MAKEUP = 3.5;

// ホバー音の立ち上がりと減衰（秒）。左右非対称にしてある。
//
// 敵の hovering フラグは推進を噴いた瞬間だけ立ち、実測では滞空中の
// 12〜39% の時間、7〜45フレームの細切れでしか true にならない。左右対称の
// 0.08 秒だと噴射の切れ目ごとに音がしぼみ、平均音量が満音量の 6〜29% まで
// 落ちて「鳴っていない」ように聞こえる。
// 立ち上がりを速く、減衰を遅くすると 40〜49% まで上がる（+4〜16dB）。
export const ENEMY_HOVER_ATTACK = 0.03;
export const ENEMY_HOVER_RELEASE = 0.35;

// --- 敵アタッカーのジャンプ・着地音 ---
// 自機と同じ作り（ジャンプは掃引するノイズ、着地はノイズ＋低い一撃）だが、
// ホバー音と同じ理由で一段低くしてある。自機の音と混ざっても区別できるように。
// 自機: ジャンプ 1000→3000Hz / 着地の一撃 110〜150Hz
export const ENEMY_BURST_FREQ_FROM = 700;
export const ENEMY_BURST_FREQ_TO = 1800;
export const ENEMY_BURST_GAIN = 0.1;
// 着地音は一撃だけでなくノイズの帯域も下げる。一撃だけ下げても、上に載る
// ノイズが自機と同じままだと「低くなった」と感じにくい。
// 自機: ノイズ 700/1100Hz、一撃 110/150Hz
export const ENEMY_LANDING_NOISE_HARD = 500;
export const ENEMY_LANDING_NOISE_SOFT = 800;
export const ENEMY_LANDING_THUMP_HARD = 70;
export const ENEMY_LANDING_THUMP_SOFT = 95;

// --- ドローンの移動音 ---
// 停止・ホバリング中は無音で、突進を始めた瞬間だけ「プーーン」と鳴る。
// 高い方から低い方へ滑り落ちる下降のうなりで、AKIRA のフライング
// プラットフォームの登場音が下敷き。
//
// 音の作り: 少しずつ音程をずらした3本のノコギリ波を同時に鳴らし
// （うねりと厚みが出る＝あの独特の「ホロウ」な質感）、共鳴の強い
// ローパスを音程より一段速く下降させる。
//
// 母音は「ポ」。フィルタを常に基音の 1.8倍に置くことで第2倍音が生き残り、
// 開いた「オ」になる。基音より下まで閉じると倍音が消えて籠もった「ウ」に
// なってしまう。共鳴を Q=6.5 に留めているのも同じ理由で、Q が高いほど
// 細く詰まった音に寄る。
//
// フィルタは音程と同じ比率で下がるので、音色は最初から最後まで変わらない。
// 「ポーーン」の印象は音程が 2オクターブ落ちること自体から出ている。
// 候補を書き出して聴き比べたうえで選んだ設定（tools/render-drone-sound.mjs）。
export const DRONE_MOVE_FREQ_FROM = 620;    // 開始の音程
export const DRONE_MOVE_FREQ_TO = 160;      // 終わりの音程
export const DRONE_MOVE_DURATION = 0.9;     // 秒
export const DRONE_MOVE_FILTER_Q = 6.5;     // 共鳴の強さ。うなりの芯を作る
export const DRONE_MOVE_FILTER_MULT = 1.8;  // フィルタは音程の何倍の高さから始めるか
export const DRONE_MOVE_FILTER_END_MULT = 1.8;  // 終端。1を超えると「オ」寄りになる
export const DRONE_MOVE_DETUNE = [-11, 0, 13];  // セント。3本のずれ
// 音程を下げたぶんの聴感差を戻した値
export const DRONE_MOVE_GAIN = 0.098;
export const DRONE_MOVE_SUB_GAIN = 0.8;     // 1オクターブ下のサイン波（丸みと重さ）
// 連続で突進したときに音が重ならないよう、1体あたりの最短間隔を設ける
export const DRONE_MOVE_COOLDOWN = 40;      // フレーム
// 大きく動くときだけ鳴らす。少し動いただけで鳴ると耳につく。
// 突進距離の実測は中央値 117px（8〜243px）で、150px なら長い突進の
// 3割ほどに絞られる。
export const DRONE_MOVE_MIN_DISTANCE = 150; // px

// --- 左右の振り分け（ステレオパン） ---
// 画面端の音源がほぼ振り切るよう、可聴範囲は画面の半分に合わせる。
// ただし振り切りすぎない。等パワー則で pan=0.85 だと片側の成分が 0.118 まで
// 落ち、モノラル環境では -2.1dB 目減りして「遠くなった」と感じる。
// 0.6 なら目減りは -1.0dB で、左右差は依然 10dB あって方向は分かる。
export const AUDIO_PAN_RANGE = CANVAS_WIDTH / 2;
export const AUDIO_PAN_MAX = 0.6;

// --- 効果音のマスター ---
// 効果音は29箇所が個別に destination へ繋がっており、全体を上げる場所が
// 無かった。1本のバスに集約し、そこで持ち上げてからリミッタを通す。
// 素で 1.0 を超える音（ホバー音は 1.2）があるので、圧縮なしに上げると割れる。
export const SE_MASTER_GAIN = 1.8;
export const SE_COMP_THRESHOLD = -20;   // dB。ここから上を抑える
export const SE_COMP_KNEE = 15;
export const SE_COMP_RATIO = 4;
export const SE_COMP_ATTACK = 0.004;    // 秒。爆発の立ち上がりを潰さない速さ
export const SE_COMP_RELEASE = 0.18;
// ゲームオーバーで効果音を引くのにかける時間。ぶつ切りにすると事故に
// 聞こえるので、短く滑らかに落とす。
export const SE_FADE_OUT_SECONDS = 0.5;

// --- BGM の音量調節 ---
// 音量の刻み。役割で2段に分ける。
// 粗いほう（-/+ キー用）が 10% なのは、Input.isCharPressed() が押した瞬間しか拾わず
// 押しっぱなしで連射しないため。5% にすると最大から最小まで20回押すことになる。
// 細かいほう（設定画面用）は数字を見ながら合わせるので 5%。
export const VOLUME_STEP_COARSE = 0.1;
export const VOLUME_STEP_FINE = 0.05;
export const BGM_VOLUME_DEFAULT = 1.0;
export const BGM_VOLUME_STORAGE_KEY = 'hoverAttack.bgmVolume';
// 設定はまとめて1キーに入れる。項目を足すたびにキーが増えるのを避けるため。
export const SETTINGS_STORAGE_KEY = 'hoverattack.settings';
// 変更した瞬間だけ表示する。常時出しているとプレイの邪魔になる。
export const VOLUME_HUD_FRAMES = 120;      // 約2秒
export const VOLUME_HUD_FADE_FRAMES = 30;  // 最後の0.5秒で消える

// --- 敵のホバー音 ---
// 敵ごとにオシレーターを持つと数が増えるほど破綻するので、共有の1ループを
// **位置を持つ効果音すべてに効く**（敵ホバー音・ジャンプ音・着地音・武器の発射音）。
// 以前は ENEMY_HOVER_OFFSCREEN_* という名前だったが、敵ホバー音のために導入した
// あと共有されるようになり、名前が実態と食い違っていたので改名した。
//
// 「画面内なら満音量、画面外は縁でこの値」という割り切り。距離の2乗で減衰させて
// いたときは可聴範囲(480px)が画面の半分(512px)より狭く、画面に映っている敵が
// 既にほぼ無音だった（中心から256pxで22%）。見えている敵は聞こえるべき。
export const AUDIO_OFFSCREEN_GAIN = 0.4;
// 画面外に出てからこれだけ離れると聞こえなくなる。0 にしないと、マップの
// どこかに敵がいる限り低い唸りが鳴り続ける。
export const AUDIO_OFFSCREEN_FADE = 512;
// 画面外の減衰カーブの指数。1 = 従来の直線、2 = 下に凸（離れるほど急に落ちる）。
//
// 「画面外の音についてはもっと減衰してもいい」という実機フィードバックへの対応。
// 総攻撃モードで画面外の発砲が同時多発するようになり、1発あたりは控えめでも
// 重なると耳につくようになった。
// **縁の音量(AUDIO_OFFSCREEN_GAIN)を下げるだけにしなかったのは、画面の境界での
// 段差が広がって「画面に入った瞬間に急に鳴る」が目立つため。** 指数を上げれば
// 境界の段差はほぼそのままで、少し離れただけで大きく落ちる。
// 実測（画面の縁から外へ出た距離→dB。縁ちょうどはまだ「画面内」＝0dB で、
// 1px 外に出た時点でこの値になる）:
//   変更後 1px -8.0 / 100px -11.7 / 256px -20.0 / 384px -32.0
//   変更前 1px -6.0 / 100px -7.9  / 256px -12.0 / 384px -18.1
// **行き過ぎたと感じたら、まずここを 1 に戻せば従来の直線に戻る**（縁の音量は
// 0.4 のままなので、それでも変更前より一律 2dB 小さい）
export const AUDIO_OFFSCREEN_FALLOFF_EXP = 2;
export const ENEMY_HOVER_MAX_GAIN = 0.055;     // 最接近時の音量。自機のホバー音より控えめ

// --- 着弾の閃光 ---
// createExplosion が入れる FlashParticle は柔らかいグラデーションで、粒子に紛れて
// 「命中した」瞬間が読み取りにくい。輪郭のはっきりした小さな閃光を別に重ねる。
export const IMPACT_FLASH_LIFETIME = 8;   // 短く。爆発本体を邪魔しない
export const IMPACT_FLASH_RADIUS = 18;    // ミサイル着弾。マシンガンとの差が出る大きさ
export const IMPACT_FLASH_RADIUS_MG = 6;  // マシンガンなど軽い着弾用

// 機体の破壊時は、ミサイル着弾と同じくらいの閃光を時間差で連ねて瞬かせる。
// 1発の大きな光より、複数が次々に走るほうが「誘爆している」感じが出る。
export const DEATH_FLASH_COUNT = 5;
export const DEATH_FLASH_STAGGER = 4;     // 1つあたりの遅延の刻み（tick）

// --- 敵の被弾ノックバック（反動） ---
// 敵AIは毎tick自分で vx/vy を代入し直す型が多い（EnemyTank の巡回など）。
// 速度を書き換えるだけでは次のフレームで消えるので、この時間だけ敵側の
// 移動制御を止めて反動を成立させる。射撃は止めない（自機の着地スタンと同じ考え方）。
export const ENEMY_RECOIL_FRAMES = 18;

// 機体ごとの吹き飛び方。重い機体ほど動かない。破片の weight と同じ考え方。
export const ENEMY_RECOIL_PROFILES = {
    drone: { vx: 3.0, vy: -2.5 },      // 軽い。よく飛ぶ
    rival: { vx: 2.6, vy: -2.4 },
    standard: { vx: 2.0, vy: -2.0 },
    artillery: { vx: 1.6, vy: -1.6 },
    tank: { vx: 1.0, vy: -1.0 },       // 重い
    heavy: { vx: 0.8, vy: -0.8 },      // 最も重い
};

export const MISSILE_HIT_KNOCKBACK_VY = -2;
export const MISSILE_HIT_KNOCKBACK_VX = 1.5;

// --- 命中時のダメージ ---
// CollisionManager が当たり判定と一緒に private な定数として抱えていたもの。
// 弾の速さや射程は上のほうに、威力だけが別ファイルにある状態だったので、
// 火力を触るのに2箇所を見る必要があった。実際に効いている値をそのまま移す。
export const DAMAGE_CRUISE_MISSILE = 40;         // 巡航ミサイルの直撃
export const DAMAGE_HOMING_MISSILE = 20;         // 誘導ミサイルの直撃
export const DAMAGE_PLAYER_MISSILE = 15;         // 自機ミサイル → 敵
export const DAMAGE_ENEMY_MISSILE_PLAYER = 15;   // 敵ミサイル → 自機（rival は2倍）
export const DAMAGE_ENEMY_MISSILE_CARRIER = 10;  // 敵ミサイル → 母艦（同上）

// --- 飛来するミサイルの迎撃 ---
// 自機の弾で撃ち落とせる距離と、成功したときの得点。
// 距離は二乗で持つ（毎フレーム全弾ぶん比較するので平方根を取らない）。
export const HOMING_INTERCEPT_RADIUS_SQ = 144;   // 12px
export const CRUISE_INTERCEPT_RADIUS_SQ = 400;   // 20px。巡航ミサイルは大きいので広め
export const SCORE_HOMING_INTERCEPT = 20;        // 誘導ミサイルは1発で消える
export const SCORE_CRUISE_DESTROY = 100;         // 巡航ミサイルは HP を削り切ったときだけ

// --- 敵基地破壊のフィナーレ演出 ---
// 閃光 → 集中線 → 衝撃波リング の順に効き、寿命もこの順に長くなる。
export const FINALE_FLASH_LIFETIME = 5;    // 閃光（爆発の起点を作る）
export const FINALE_FLASH_RADIUS = 90;     // 閃光の最大半径
export const FINALE_LINE_COUNT = 40;       // 集中線の本数
export const FINALE_LINE_LIFETIME = 10;    // 集中線
export const FINALE_LINE_INNER_MIN = 40;   // 線の内側の始点までの距離（下限）
export const FINALE_LINE_INNER_MAX = 140;  // 同（上限）。1本ずつばらつかせる
export const FINALE_RING_MAX_RADIUS = 320; // 衝撃波リングの到達半径
export const FINALE_RING_LIFETIME = 30;    // 衝撃波リング
export const FINALE_RING_WIDTH = 9;        // リングの初期の線幅（細くなっていく）
export const FINALE_SHAKE_INTENSITY = 20;  // 小爆発の shake(8,3) より明確に強く
export const FINALE_SHAKE_DURATION = 24;

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

// --- Destruction Debris ---
// 破片は当たり判定を持たない純粋な演出。ただし薬莢(CasingParticle)と同じく、
// 地形には Grenade 相当の2Dバウンスで跳ね返り、水中では motionFor の
// gravity 倍率でゆっくり沈む（実機の指摘: 薬莢と同じように障害物・水の
// 影響を受けてほしい）。game.map が無い（テストのスタブ等）ときは
// CasingParticle と同じく素通りするフォールバックにしてある。
export const DEBRIS_GRAVITY = GRAVITY / 6; // 通常の1/6。吹き飛んで舞う時間を長く取る
export const DEBRIS_MAX_FALL_SPEED = 4;    // 落下速度の上限。これ以上は速くならない
export const DEBRIS_DRAG = 0.985;          // 毎フレーム vx に乗算する空気抵抗
// 跳ね返り。薬莢(CASING_BOUNCE=0.55)より重く大きいパーツなので、
// より多くの運動エネルギーを失う想定で弱めにしてある
export const DEBRIS_BOUNCE = 0.4;
export const DEBRIS_FRICTION = 0.5;        // 地面に着いてから転がる速度の残存率（毎フレーム）
export const DEBRIS_LIFETIME = 55;         // frames
export const DEBRIS_LIFETIME_JITTER = 20;  // 寿命に加算する乱数の幅
// 回転は爆風のトルクから決める。破片の長辺が爆心方向となす角が45度のとき最大。
// この値がそのときの角速度（rad/tick）。
export const DEBRIS_SPIN_TORQUE = 0.38;
export const DEBRIS_SPEED_JITTER = 0.45;   // 初速に加える乱数の幅
// 1機あたりの破片数は 32〜81 片（最多は artillery の4脚型）。
// 上限 800 はおよそ10機ぶんで、地雷の誘爆による同時多数撃破でも足りる。
export const DEBRIS_MAX_ACTIVE = 800;      // 同時に存在できる破片の上限
export const DEBRIS_FLASH_COLOR = '#FFFFFF'; // ホールド中の白熱色
export const DEBRIS_FADE_START = 0.75;     // 寿命のこの割合を過ぎたら alpha を落とし始める

// パーツはさらに 2x2 に割って飛ばす。「飛びながら砕ける」ように、4片は
// 元パーツの速度を共有したうえで、パーツ中心から外向きへわずかに開く。
// 4片が同じ動きをすると単調に見えるので、分割片ごとに散らしを効かせる。
// 散らすのは速度と角速度だけで、初期位置には乗せない（飛び出しの瞬間は
// 元のパーツのかたちを保ち、飛びながらばらけて見せるため）。
// パーツは「長い辺をランダムな比率で割る」を繰り返して砕く（ギロチン分割）。
// 均等な格子と違って大きさがまちまちになり、かつ元のパーツを隙間なく埋める。
export const DEBRIS_SPLIT_PIECES = 8;      // 1パーツを最大この数まで割る

// 切るたびに軸を選ぶ。長い辺を割ると正方形へ寄り、短い辺を割ると細長くなる。
// パーツ単位で決めるとそのパーツが全部同じ形になってしまうので、1回ごとに選ぶ。
export const DEBRIS_SLAT_CHANCE = 0.4;     // 短い辺を割る（＝細長くする）確率
export const DEBRIS_SLAT_SPIN_BOOST = 2.4; // 細長い破片は回りやすい

// 破片の飛ぶ向き。機体中心からの放射だけで決めると、機体の輪郭に沿って
// 平たく広がる（横長の母艦だと横一直線になる）。等方なランダム方向を混ぜて
// 球状に散らす。0で放射のみ、1で完全にランダム。
export const DEBRIS_ISOTROPIC_MIX = 0.55;

// 爆発なので上へ吹き上がる。方向ベクトルの y に足してから正規化する。
export const DEBRIS_UPWARD_BIAS = 0.3;   // 上向き約75%。上げすぎると放射に見えなくなる

// 初速のばらつき。全部が同じ速さで飛ぶと単調に見える。
// 1 を中心に ±SPEED_VARY/2 の倍率がかかる。
export const DEBRIS_SPEED_VARY = 0.9;
export const DEBRIS_SPLIT_MIN_SIZE = 1.4;  // これ以下の辺になる分割はしない（点にならないように）
export const DEBRIS_SPLIT_RATIO_JITTER = 0.5; // 分割位置の比率 0.5±JITTER/2（大きさのばらつき）
export const DEBRIS_SPLIT_SPREAD = 0.55;   // 分割片がパーツ中心から離れる初速（基準値）
export const DEBRIS_SPLIT_SPREAD_JITTER = 0.7; // 上の倍率のばらつき幅（1±JITTER/2 倍）
export const DEBRIS_SPLIT_JITTER = 0.5;    // 分割片ごとに速度へ加える等方な散らし
export const DEBRIS_SPLIT_SPIN_JITTER = 0.16;  // トルクが立たない向きの破片が完全に止まって見えないための最低限

// 爆発の広がり。本物のパーツ破片を撒く機体では、爆発が破片を覆い隠さないよう
// 粒子の初速と中央フラッシュを縮める（粒子数は減らさないので密度は保たれる）。
export const EXPLOSION_SPREAD_WITH_DEBRIS = 0.6;

// 自機の死だけは別格に扱う。全機体で最小(15)だったうえ広がりも 0.6 倍だったため、
// 中央フラッシュが自機(16x24px)より小さくなり、破片の白熱シルエットに埋もれて
// 「爆発が無い」ように見えていた。死亡ホールドで90tick見せる作りとも釣り合わない。
export const PLAYER_DEATH_EXPLOSION_COUNT = 45;   // 他機体の最大(36)より多い
export const PLAYER_DEATH_EXPLOSION_SPREAD = 0.9; // 破片は隠さないが確実に見える広さ

// 母艦も同じ理由で別格。しかも自機より深刻だった — 64x32px と最大の機体なのに
// 粒子25・フラッシュ半径9.8px で、船体を囲む円(35.8px)の 0.27 倍しかなかった。
// 自機と母艦だけが死亡ホールドで90tick寄りで見せられるので、この2つは体格に見合わせる。
export const CARRIER_DEATH_EXPLOSION_COUNT = 100;
export const CARRIER_DEATH_EXPLOSION_SPREAD = 1.3;

// --- 途中セーブ ---
// セーブ1回のコスト。HighScoreManager の MIN_SCORE も偶然 10000 だが、
// あちらは「ランキングに載る下限」で別物。連動させないため定数を分けている。
export const SAVE_COST = 10000;
// ゲームオーバーで CONTINUE? を出しておく時間。従来の自動遷移は 4 秒
// (GAMEOVER_WAIT_MS)。選択肢を読んで decide する時間として倍以上を取った。
export const CONTINUE_COUNTDOWN_MS = 9000;
// セーブが無いときの従来どおりの待ち時間（main.js に直書きされていた 4000）。
export const GAMEOVER_WAIT_MS = 4000;

// --- 3面の町並み（props: 'town'）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 段1（置いて描く）の数値。初期値で、実機で見て詰める。
// かけらの大きさは地形の一番細かい描き込み（4px）に揃える。
export const TOWN_CHUNK = 4;
// 床から天井までの空きがこれ未満の区間には建てない（タイル）。小屋の最小の高さ 24px に
// 天井との空き TOWN_CEILING_CLEARANCE を足すと 3.5 タイル要る
export const TOWN_MIN_HEADROOM = 4;
// 建物の一番上と天井のあいだに必ず空けるタイル数。天井にくっついて見えないように
export const TOWN_CEILING_CLEARANCE = 2;
// 土台を床の岩に埋める深さ（px）。町は地形の奥に描くので、埋めた分は岩の縁に隠れて
// 「建っている」に見える。浮いて見える隙間を作らないためのもの
export const TOWN_FOUNDATION_SINK = 4;
// 5面: 支えのかけらが形の岩に「触れている」とみなす距離（px。town/chunks.js の chunkTouchesRock）。
// 隣のブロックが壊れて根元のタイルが坂・面取りに削れたとき、これより離れた木は倒れ、つららは落ちる。
// 0（かけらの縁まで見る）だと、45度の坂で根元の角が 0.5〜2px 離れただけの、見た目は床に着いている木まで
// 倒れた（seed 1・2 で根元の隣を壊した 1102 例のうち倒れた 266 本の 167 本が隙間 2px 以下）。2 だと倒れるのは
// 88 本で、どれも隙間 4px 超。立っている木の隙間は 2.5px まで
export const TOWN_SHAPE_SUPPORT_REACH = 2;
// この段差（タイル）までの床はつないで1本の区間にする（placement.js の chainFloors）。
// 洞窟の床は細かい段だらけで、つながないと広い部屋でも幅1タイルの区間ばかりになり塔が建たない。
// 低いほうの床を地面にするので、高い段の上では土台がこの高さぶん岩に隠れる。
// 2 にすると小屋（壁 12〜20px）の戸口まで隠れるので 1
export const TOWN_FLOOR_STEP_MAX = 1;
// 村（villages.js）。床の区間を左から歩くとき、そこに建てる確率を近くの村で変える。
// 最初は面全体で一律 0.75（TOWN_FLOOR_FILL）にしていたが、実機で「建物が想定より多い、
// まばらな所と密集した所の村があっていい」と言われ、村の中心からの距離で決める形にした。
// 面を TOWN_VILLAGE_GRID_COLS × _ROWS の升に分け、升ごとに村を1つ置くか決める
// （面全体に散らばる。縦の列ごとに少なくとも1つは置く）
export const TOWN_VILLAGE_GRID_COLS = 5;
export const TOWN_VILLAGE_GRID_ROWS = 2;
export const TOWN_VILLAGE_DENSE_CHANCE = 0.45;   // 升に密集した村を置く確率
export const TOWN_VILLAGE_SPARSE_CHANCE = 0.35;  // まばらな集落を置く確率（残りは村なし）
// 3つの確率は実機で 0.9 / 0.3 / 0.05 から今の値へ（ユーザー調整、2026-10-11。8種の平均 202 棟）
export const TOWN_VILLAGE_DENSE_FILL = 0.8;      // 密集した村の中心で建てる確率
export const TOWN_VILLAGE_SPARSE_FILL = 0.4;     // まばらな集落の中心で建てる確率
export const TOWN_VILLAGE_OUTSIDE_FILL = 0.1;   // どの村にも入らない所（ぽつんと1軒くらい）
// 半径（タイル）の範囲。中心から半径の半分までは村の密度のまま、縁で村の外の密度まで下がる。
// 棟数（8種の平均）で決めた: [12,22]/[16,28] は 96棟、[18,30]/[22,34] は 150棟、
// この値で 195棟（一律 0.75 のときの 411棟の約半分）。広げると村どうしがつながって差が薄れる
export const TOWN_VILLAGE_RADIUS_DENSE = [22, 36];
export const TOWN_VILLAGE_RADIUS_SPARSE = [26, 40];
// 最後の敵基地の周り（タイル、基地の中心から）。INNER 以内には何も建てず、OUTER までで村の密度に戻る。
// 実機で「敵基地の周辺には街がない方が自然」と言われた。基地の部屋だけ避けていたときは、
// 部屋の壁のすぐ外まで家が並んでいた。基地は面の右端にあるので、右端の小部屋は岩肌だけになる
export const TOWN_BASE_QUIET_INNER = 24;
export const TOWN_BASE_QUIET_OUTER = 40;
// 日干し煉瓦（A）の割合は、天井までの空きで決める（広い所は A、狭い所は坑道の小屋 C）
export const TOWN_ADOBE_HEADROOM_WIDE = 12;
export const TOWN_ADOBE_SHARE_WIDE = 0.8;
export const TOWN_ADOBE_HEADROOM_NARROW = 5;
export const TOWN_ADOBE_SHARE_NARROW = 0.1;
// 隣り合う塔の上の階を橋でつなぐ確率（シバームの塔は上の階どうしを橋や綱で結ぶ）
export const TOWN_TOWER_BRIDGE_CHANCE = 0.4;
// 壁に張り付く家。壁が縦にこれだけ続き、前にこれだけの空きがあるところに置く（タイル）
export const TOWN_WALL_MIN_RUN = 4;
export const TOWN_WALL_MIN_REACH = 4;
export const TOWN_WALL_SPACING = 8;        // 壁の長さこれごとに1軒の候補
export const TOWN_WALL_HOUSE_CHANCE = 0.5; // 候補ごとに建てる確率
// 天井から吊るもの。天井がこれだけ続き、下にこれだけの空きがあるところに吊る（タイル）
export const TOWN_CEIL_MIN_RUN = 6;
export const TOWN_CEIL_MIN_DROP = 8;
// 吊るしたものの下に残す空き（タイル）。自機（1.5タイル）が下をくぐれる高さ＋余裕
export const TOWN_CEIL_KEEP_BELOW = 4;

// --- 3面の町並み 段2（壊れ方）---
// 爆発で欠ける半径 = K × √(粒の数)。マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、
// グレネード 150粒 → 約40px（spec 2章）
export const TOWN_BLAST_RADIUS_K = 3.3;
// 穴の縁のぎざぎざの幅（px）。かけらごとに ±半分だけ半径を揺らす
export const TOWN_CHIP_JAGGED = 3;
// 残ったかけらがこの割合を下回ったら崩壊する
export const TOWN_COLLAPSE_FRACTION = 0.4;
// 崩壊で残す土台の深さ（支えのかけらから何かけら＝4px 何段ぶんまで）。3 で 12px ＝ A の1階ぶん。
// spec の「下の1〜2段」を、床・壁・天井のどれにも同じ規則で効くよう「支えからの距離」で言い直した
export const TOWN_RUIN_DEPTH = 3;
// 崩壊の粒の数（createExplosion の count。ミサイルの爆発 36 より小さく、着弾 4 より大きい）
export const TOWN_COLLAPSE_PARTICLES = 24;
// 同時に落ちている破片の上限。超えたら古いものから土煙になって消える（spec 2章）
export const TOWN_FALLING_MAX = 24;
// 落ちる破片の動き。重力は Grenade（GRENADE_GRAVITY）と同じ桁。回りは 1 フレーム最大 0.05rad
export const TOWN_FALL_GRAVITY = 0.25;
export const TOWN_FALL_MAX_SPEED = 7;     // 1 tick に 7px。描画補間の瞬間移動の閾値 64px より十分小さい
export const TOWN_FALL_SPIN_MAX = 0.05;
export const TOWN_FALL_DRIFT_MAX = 0.3;   // 横へ流れる初速（±px/tick）
// 落ちる破片が下の建物を欠かせる半径（px）。1棟1回
export const TOWN_FALL_CHIP_RADIUS = 6;
// 砕けたときの粒（破片の色の欠片＋土煙）の数
export const TOWN_SHATTER_PARTICLES = 10;
// 瓦礫の山の高さの上限（px）。重なるたびに 1px ずつ高くなる
export const TOWN_RUBBLE_MAX_H = 10;
// 弾の種類ごとの、建物への当たり方（spec 2章の表）。弾のクラスが townKind でここの行を選ぶ。
//   chip:   当たった所を欠かせる半径（px）。ミサイル・グレネードの欠けは、爆発（blast）の側で大きく開く
//   thin:   細い部品（厚い壁の印の無いかけら）に当たったら 'chip'＝1棟1回欠かせて飛び続ける / 'pass'＝すり抜ける
//   pierce: 厚い壁も貫通する（反射ビーム）
//   ignite: 当たった所に、かけらの材料の bulletIgnite の確率で火をつける（段3）
// 厚い壁で止まったときの反応は、弾ごとの onTownWall(x, y)（岩に当たったときと同じ。岩は壊さない）
export const TOWN_PROJECTILE_IMPACT = {
    bullet: { chip: 4, thin: 'chip', ignite: true },
    missile: { chip: 4, thin: 'chip', ignite: true },
    grenade: { chip: 0, thin: 'pass' },
    beam: { chip: 6, thin: 'chip', pierce: true },
};
// 弾の通り道を調べる刻み（px）。かけら 4px と同じにして、速い弾が薄い壁をすり抜けないように
export const TOWN_SWEEP_STEP = 4;

// --- 3面の町並み 段3（火）---
// 燃え進みを計算する間隔（フレーム）。燃料・確率はこの1回ごとに数える（spec 3章）
export const TOWN_FIRE_TICK = 6;
// 面全体で同時に燃える火元の上限と、1棟あたりの上限。上限のあいだは新しく火がつかない
export const TOWN_FIRES_MAX = 60;
export const TOWN_FIRES_PER_BUILDING = 4;
// 材料ごとの燃え方（spec 3章の表）。キーはかけらの材料の番号（chunks.js の MAT_*）。
//   burns:        燃えるか（金属は燃えない。熱で焦げるだけで、燃え移りを中継しない）
//   bulletIgnite: マシンガンの弾が当たって火がつく確率（spec の初期値 木 15%・土 3%）
//   spread:       燃え進みの1回に、隣のかけらへ火が進む確率
//   catch:        別の建物の燃えているかけらから TOWN_FIRE_JUMP_RANGE 以内のとき、燃え進みの1回に燃え移る確率
//   fuel:         火元の燃料（フレーム）。spec の初期値 木 12〜20秒・土 5〜8秒
//   crumble:      燃えている建物の焦げたかけらが、燃え進みの1回に崩れて抜ける確率
// 爆発物（4）は段3b で爆発の規則を足すまで木と同じに燃やす
export const TOWN_MATERIALS = {
    1: { burns: true, bulletIgnite: 0.03, spread: 0.1, catch: 0.02, fuel: [300, 480], crumble: 0.004 },
    2: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
    3: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    4: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
    // 植物（苔・シダ。4面）。燃えない・火を中継しない（金属と同じ行）。ユーザーの指定: 誘爆も延焼もしない
    5: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    // つらら（5面）。燃えない・火を中継しない（植物と同じ行）
    6: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
};
// 火が隣へ進むとき、元の火元を残したまま新しい火元を増やす確率（それ以外は火元が移る）。
// 増やしすぎると 1棟の上限 4 にすぐ届く
export const TOWN_FIRE_BRANCH = 0.15;
// 別の建物へ燃え移る距離（px。spec 3章）
export const TOWN_FIRE_JUMP_RANGE = 8;
// 燃えている火元の隣の金属が熱で焦げる確率（燃え進みの1回）。焦げるだけで火元にはならない
export const TOWN_METAL_SCORCH = 0.2;
// 残り火（燃え尽きた所・燃えて砕けた破片の所）が細い煙と火の粉を出し続けるフレーム数と、同時の上限
export const TOWN_EMBER_FRAMES = 480;   // 8秒
export const TOWN_EMBERS_MAX = 40;
// 炎・煙の粒。燃え進みの1回に火元1つから出す数と、同時の上限（画面の中の火だけが出す）
export const TOWN_FLAMES_PER_FIRE = 2;
export const TOWN_FLAMES_MAX = 360;
export const TOWN_SMOKE_EVERY = 3;      // 燃え進み何回に1回、火元から煙を1つ出すか
export const TOWN_SMOKE_MAX = 60;
export const TOWN_SMOKE_ALPHA = 0.35;   // 煙幕（SmokeScreen）より薄く。町の煙は見通しを遮らない
export const TOWN_EMBER_SMOKE_EVERY = 40; // 残り火が細い煙を出す間隔（フレーム）

// --- 3面の町並み 段3b（爆発物と誘爆）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3b章）
// 床の建物何棟に1つ、脇に爆発物を置こうとするか。置けない所（盤面の端・段の岩・隣の建物の足元）が
// 約4割あるので、8 だと実際は 13 棟に1つ（40週の実測 547 / 7234）。spec の「8 棟に1つくらい」に合わせて 5
export const TOWN_EXPLOSIVE_EVERY = 5;
// 機体へのダメージは地雷（LANDMINE_DAMAGE / LANDMINE_BLAST_RADIUS）と同じから始める。
// グレネード（80）より弱い。別に持つのは、実機で町の爆発物だけを詰められるように（spec 3b章）
export const TOWN_EXPLOSIVE_DAMAGE = 25;
export const TOWN_EXPLOSIVE_RADIUS = 50;   // 機体へのダメージと誘爆の届く半径（px）
// 爆発の粒の数。町を欠かせる半径は K×√80 ≒ 30px（ミサイル 36粒の 20px とグレネード 150粒の 40px のあいだ）
export const TOWN_EXPLOSIVE_BLAST_COUNT = 80;
// 火が届いてから爆発するまで（フレーム）。燃えているのが見えてから爆発する（spec 3b章）。0.75秒
export const TOWN_EXPLOSIVE_COOKOFF = 45;
// 爆風の中の別の爆発物が爆発するまで 8〜15 フレーム。一斉に爆発させず、連鎖が見えるように
export const TOWN_CHAIN_DELAY_MIN = 8;
export const TOWN_CHAIN_DELAY_RANGE = 7;
// 60 フレームあたりの爆発物の爆発の上限。超えた分は消さずに後ろへずらす
// （消すと「撃ったのに爆発しない」に見える）
export const TOWN_EXPLOSIONS_PER_SECOND = 6;

// --- 3面の町並み 段4（音）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（4章）。音量は A特性で実測して
// tests/town-sounds.test.js が爆発・バリアの唸りとの相対 dB で縛る（tools/render-town-sounds.mjs で測れる）
// 崩れる音の大きさ k = (崩れたかけら / REF)^EXP を MIN〜1 に収める。REF は塔1棟の崩壊。
// 平方根（0.5 乗）だと 20 かけらの破片が小さい爆発とほぼ同じ大きさになる（差 0.2dB の実測）。
// 0.75 乗で小さい爆発より約 5dB 小さい
export const TOWN_COLLAPSE_SOUND_REF = 160;
export const TOWN_COLLAPSE_SOUND_EXP = 0.75;
export const TOWN_COLLAPSE_SOUND_MIN = 0.1;
export const TOWN_COLLAPSE_SOUND_MERGE_MS = 80;   // これより近く続いた崩れる音は、大きいほうだけ鳴らす
// 実測（2026-10-11、tools/render-town-sounds.mjs。ローパスの Q を dB で読む再現）: 崩壊 160 かけら -47.1dB
// （大きい爆発 -43.4dB の -3.7dB）、破片 20 かけら -62.8dB（小さい爆発 -57.3dB より小さい）
// 低い地鳴り: ローパスしたノイズを FROM → TO へ掃引しながら TIME 秒で落とす（k で長さが半分まで縮む）
export const TOWN_COLLAPSE_RUMBLE_GAIN = 0.5;
export const TOWN_COLLAPSE_RUMBLE_TIME = 1.2;
export const TOWN_COLLAPSE_RUMBLE_FROM = 400;
export const TOWN_COLLAPSE_RUMBLE_TO = 60;
// 瓦礫のガラガラ: 短いバンドパスのノイズを RATTLES 発（k 倍）、SPREAD 秒の中にばらまく
export const TOWN_COLLAPSE_RATTLES = 10;
export const TOWN_COLLAPSE_RATTLE_SPREAD = 0.6;
export const TOWN_COLLAPSE_RATTLE_GAIN = 0.15;
export const TOWN_COLLAPSE_RATTLE_FREQ_MIN = 1200;
export const TOWN_COLLAPSE_RATTLE_FREQ_RANGE = 2400;
export const TOWN_COLLAPSE_RATTLE_Q = 3;
// 炎のループ: 低いゴーッ（ノイズのループを ROAR_FILTER でローパス）＋パチパチ（まばらなクリックを並べた
// CRACKLE_SECONDS 秒のバッファをループ、CRACKLE_FILTER でハイパス）。最大でもバリアの唸り（-48dB）以下
// ゲインは最初 0.2 / 0.25 だった。WebAudio のローパス・ハイパスの Q が dB で読まれることを再現に入れたら
// 最大 -48.6dB（唸りの -0.5dB）まで詰まったので、両方 1割下げた（最終レビュー指摘）。
// 実測: 最大 -49.5dB（唸り -48.1dB の -1.4dB）。ゴーッだけ -51.6dB、パチパチだけ -53.6dB
export const TOWN_FIRE_ROAR_GAIN = 0.18;
export const TOWN_FIRE_ROAR_FILTER = 300;
export const TOWN_FIRE_CRACKLE_GAIN = 0.225;
export const TOWN_FIRE_CRACKLE_FILTER = 1800;
export const TOWN_FIRE_CRACKLE_RATE = 14;        // 1秒あたりのクリックの数
export const TOWN_FIRE_CRACKLE_SECONDS = 3.7;    // 繰り返しが耳につかない長さ（2秒だと周期が分かる）
export const TOWN_FIRE_CRACKLE_SEED = 0x7F1E;
// 炎のループの強さ = √(Σ 火元ごとの位置の音量 / FULL) を 1 で頭打ち。√ にしたのは火元1つでも聞こえるように
// （1つで -10dB）。位置の音量は positionalVolume（画面の中 1、外は下がって1画面ぶんで 0）
export const TOWN_FIRE_SOUND_FULL = 10;

// --- 4面の植物（苔とシダ）---
// 3面の町の仕組み（world/town/）に、燃えない・誘爆しない壊せる植物を載せる。絵は world/town/plants.js、
// 置き場所は world/town/generatePlants.js。STAGE_ENVIRONMENTS の props: 'ferns' の面だけに置く。
// 弾の止まり方・欠け方・落ち方は町と同じ（TOWN_PROJECTILE_IMPACT の表、TOWN_CHIP_JAGGED など）。
// 植物は全部「厚い壁」にした: 弾がすり抜けるのに欠けるのでは、壊れることに筋が通らない（ユーザーの指摘）。
// 床の植物の混ぜ方。tall 以外の残りが苔。自機・アタッカーの高さは 24px（PLAYER_HEIGHT）で、
// 苔は 4〜8px、低いシダは 24px 未満、高いシダは 24px を超える（絵は地面に 4px 埋まるので、見える高さは 1段ぶん引く）
export const PLANT_FLOOR_MIX = { tall: 0.15, low: 0.3 };
// 高いシダの幹の高さ（px、2px 刻み）。冠の葉が上に 20px ほど乗る。置ける高さが足りなければ幹を切り詰める
export const PLANT_TALL_TRUNK = [32, 72];
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる
export const PLANT_FILL_SCALE = 1;
// 壁の植物は、壁の長さこれごとに1つの候補を置く。候補ごとに置く確率
export const PLANT_WALL_SPACING = 6;
export const PLANT_WALL_CHANCE = 0.6;
// 壁・天井に置ける最小の広さ（タイル）。町（TOWN_WALL_MIN_* / TOWN_CEIL_*）は大きな家を掛けるので
// 壁 4 タイル・天井の空き 8 タイルを要るが、植物は小さいので緩める。町と同じ値では 4面の天井に
// 2 本、壁に 2 つしか置けなかった（実測）。KEEP_BELOW は垂らした先と床のあいだに残す空き
export const PLANT_WALL_MIN_RUN = 3;
export const PLANT_WALL_MIN_REACH = 2;
export const PLANT_CEIL_MIN_RUN = 3;
export const PLANT_CEIL_MIN_DROP = 3;
export const PLANT_CEIL_KEEP_BELOW = 1;
// 天井の垂れ下がりの候補は、連続した天井の 1 タイルごとに、この確率 × 村の濃さ（密集の中心で 1）
export const PLANT_CEIL_CHANCE = 0.35;
// 当たったとき・落ちた破片が砕けたときに出す葉の粒の数（画面の中だけ）
export const PLANT_LEAF_PARTICLES_HIT = 4;
export const PLANT_LEAF_PARTICLES_FALL = 8;

// --- 5面の雪の木 ---
// 4面の植物（上）と同じ Town の仕組み（燃えない・誘爆しない・壊せる・弾が止まる）に、雪をかぶった木を載せる。
// 絵は world/town/snowTrees.js、置き場所は world/town/generateSnowTrees.js。STAGE_ENVIRONMENTS の props: 'snow' の面だけ（つららと同じ面）。
// 高さは「見える高さ」（根元の 4px は地面に埋まる）。ユーザー指定（2026-10-11）: 機体（PLAYER_HEIGHT 24px）の
// 8割（19.2px → 4px 刻みで 20）から 3倍（72px）まで。4面のシダ（見える高さ 24〜約 90px、半分以上は 24px 未満の
// 苔と低いシダ）より背の高い木が中心になる。枯れ木は枝が横に張って背が伸びないので、上限を低く取る
export const SNOWTREE_HEIGHT = { fir: [20, 72], bare: [20, 56] };
// 床に立てるときに枯れ木になる割合。残りは針葉樹（雪の面らしい絵が針葉樹なので多めに）
export const SNOWTREE_BARE_SHARE = 0.25;
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる。隣と重なる所には置かない（placer.js）ので、
// 詰めても重ならず、置ける足場が埋まるだけ。最初は 1・間隔 4〜24px で、今週の5面で 232 本（床 100 タイルあたり 8.6 本）
// しかなく、ユーザーに「もっとたくさん木があった方がいい」と言われた（村の外は 10% しか置かないため）。
// 実測（今週の5面、床 2,702 タイル）: 濃さ 2 → 369 本、3 → 456 本、3＋間隔 0〜8 → 534 本（19.8 本）、5＋間隔 0〜8 → 648 本。
// 5 は足場がほぼ埋まるので、森に見える 3 と間隔 0〜8 にした
export const SNOWTREE_FILL_SCALE = 3;
// 隣の木との間隔（px、4px 刻みで引く）。木の幅に足す
export const SNOWTREE_GAP = [0, 8];
// 木 1 本の幅の上限（px）。20000 通りの乱数で測った最大は針葉樹 56・枯れ木 52（tests/snowtrees-build.test.js が超えないことを縛る）。
// 床に置くとき、この幅ぶんの列の天井までの空きを測る（枝の先が天井に刺さらないように）
export const SNOWTREE_MAX_WIDTH = 56;
// 雪の木の倒壊。幹が切れて切り離された塊は、根元（切れ目の中心）を軸に傾きながら倒れる（ユーザー指定:
// 「傾きながら下に落ちていく様な感じで倒壊する」。それまでは根元で切れた塊が落ち始めた最初のコマで床に触れ、
// その場で雪の粒になって消えていた）。傾きの角加速度は ACCEL × (sinθ + SEED): 真っ直ぐ立った状態から始まるので
// SEED が最初の傾きの種。実測（tools の数値実験）: ACCEL 0.005・SEED 0.2 で 90° まで 41 tick（0.68秒。15° まで 21 tick
// とゆっくり傾き始め、45° で 32 tick、70° で 38 tick と加速する）。0.01・0.3 だと 25 tick で、ぱたんと倒れて重みが出なかった
export const SNOWTREE_TOPPLE_ACCEL = 0.005;
export const SNOWTREE_TOPPLE_SEED = 0.2;
// 倒れきった（床に横たわった）あと、薄れて消えるまでの tick。この間に雪の粒を PUFFS 回、木の長さに沿って出す
export const SNOWTREE_TOPPLE_LIE_TICKS = 30;
export const SNOWTREE_TOPPLE_PUFFS = 3;
export const SNOWTREE_TOPPLE_PUFF_PARTICLES = 10;
// これより小さい塊（かけらの数）は倒れず、ふつうの破片として落ちて砕ける（枝先の欠片が90°倒れるのは不自然）
export const SNOWTREE_TOPPLE_MIN_CELLS = 8;
// 倒れる向きは、撃たれた位置と塊の真ん中の x の差が DEADZONE（px）以上あれば撃たれた側と反対、未満なら（幹をまっすぐ撃った）
// 位置から決めた向き
export const SNOWTREE_TOPPLE_LEAN_DEADZONE = 1;
// 雪の木が欠ける・倒れるときに舞う雪（SnowFlurryParticle。ユーザー指定: 「木が倒れたり削れたりするときに雪が舞う様に」）。
// それまでは葉と同じ短命（20〜40 tick）の小さな粒がぱっと散るだけだった。舞う雪は、出た勢いで飛んだあと
// 空気抵抗で止まり、ゆっくり左右に揺れながら落ちて、地面に触れたら消える（ホバーの粉雪 SnowMistParticle と同じ消え方）。
// 最初は全部「上半分の向きへ 0.5〜2.2px/tick で飛ばす」で、実機で「やや舞い上がりすぎ。弾が当たって欠けるときはもう少し控えめに。
// 木が倒れるときは雪が振り落とされて、倒れた後に雪が舞うのが理想」と言われた。出来事ごとに動きを分ける（MODES）:
//   hit   弾・爆風が欠かした。少なく（HIT 5 粒）、勢いも弱い（飛ぶ高さは puff の約 1/3）
//   shake 木が倒れ始めた（START 14 粒。木が雪を振るい落とす）・倒れているあいだ TRICKLE_EVERY tick ごとに木に沿って（TRICKLE 3 粒）。
//         下へ向けて、ほとんど勢い無しに落ちる（地面に触れたら消える）
//   puff  横たわったとき（PUFF_PARTICLES を PUFFS 回）と、そのあと消えるまで LIE_EVERY tick ごとに（LIE_PARTICLES）。倒れた木から
//         舞い上がる主役。勢いは最初の版と同じ桁で、上半分の向き
// 1 本が倒れきるまでに合わせて約 110 粒、寿命は 50〜90 tick。角度は画面座標の rad（真上 = -π/2、真下 = +π/2）
export const SNOWTREE_FLURRY_HIT = 5;
export const SNOWTREE_FLURRY_START = 14;
export const SNOWTREE_FLURRY_TRICKLE_EVERY = 3;
export const SNOWTREE_FLURRY_TRICKLE = 3;
export const SNOWTREE_FLURRY_LIE_EVERY = 6;
export const SNOWTREE_FLURRY_LIE_PARTICLES = 4;
export const SNOWTREE_FLURRY_LIFE = [50, 90];
// size は [ふつうの粒, 大きい粒（BIG_SHARE の割合）]（px）。倒れる木の雪（shake / puff）は、ユーザー指定「木が倒れた際の雪の粒子を
// 小さめに」で 2px / 3px から 1px / 2px にした。欠けたとき（hit）は 2px / 3px のまま
export const SNOWTREE_FLURRY_MODES = {
    hit: { speed: [0.2, 0.7], angle: [-Math.PI * 0.8, -Math.PI * 0.2], size: [2, 3] },     // 上向きの扇。勢いは puff の約 1/3（空気抵抗で飛ぶのは最大でも約 14px）
    shake: { speed: [0.05, 0.4], angle: [Math.PI * 0.1, Math.PI * 0.9], size: [1, 2] },    // 下向き。ほぼ勢い無し
    puff: { speed: [0.6, 2.0], angle: [-Math.PI, 0], size: [1, 2] },                       // 上半分すべて
};
export const SNOWTREE_FLURRY_DRAG = 0.95;            // 毎 tick 速度に掛ける。落ちる速さは GRAVITY / (1 - DRAG) = 0.4px/tick に収まる
export const SNOWTREE_FLURRY_GRAVITY = 0.02;         // ホバーの粉雪（0.02）と同じ軽さ
export const SNOWTREE_FLURRY_SWAY = 0.3;             // 左右に揺れる幅（px/tick）
export const SNOWTREE_FLURRY_SWAY_FREQ = 0.14;       // 揺れの速さ（rad/tick。周期約 45 tick）
export const SNOWTREE_FLURRY_NEEDLE_EVERY = 6;       // 6 粒に 1 粒は、雪ではなく針葉の欠片（暗い緑）
// 出る位置の散らばり（px。出来事の点から上へ、横へはこの幅で）。上だけにしたのは、点が床の線にある（横たわった木・床で砕けた欠片）と
// 下に散った粒が岩の中で生まれ、最初の更新で消えたため（実測: 20 本を切って 819 粒のうち 139 粒＝17% が即死）
export const SNOWTREE_FLURRY_SPREAD = { hit: 4, trickle: 5, puff: 6 };
// 倒れ始めの雪を出す高さ（倒れる塊の上端から、塊の高さの何割下か）
export const SNOWTREE_FLURRY_START_HEIGHT = 0.4;
// 倒れているあいだにこぼれる位置を、木の長さの何割の所にするか。毎回この割合ずつ進めて 1 で折り返す（黄金比 0.382:
// 木の上を満遍なく行き来して、同じ位置に何度も出ない。乱数を使わずに位置を散らす）
export const SNOWTREE_FLURRY_TRICKLE_STEP = 0.382;
// 大きい粒（MODES の size の大きい方）の割合。残りは小さい方
export const SNOWTREE_FLURRY_BIG_SHARE = 0.25;

// --- 5面のつらら ---
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// 3面の町の仕組み（world/town/）に、天井に吊るした「もろい」建物として載せる。絵は world/town/icicles.js、
// 置き場所は generateIcicles.js、落ちる塊は IcicleFall.js。STAGE_ENVIRONMENTS の props: 'snow' の面だけ。
// 数値は spec の初案で、実機で見て調整する前提の出発点（ユーザー決定: 震えて落ちる約 0.4 秒・ダメージは大きさに比例 15〜35・
// 開始の部屋と基地の部屋を避けて面全体の天井）。
// 見える長さ・根元の幅（px。長さは 4px 刻み）
// 最初は長さ [24, 64]・幅 [8, 12] で、実機で「つららの最大サイズをもう少し小さく」と言われて [24, 48]・[8, 10] にした
export const ICICLE_LENGTH = [24, 48];
export const ICICLE_WIDTH = [8, 10];
// ダメージ [最短, 最長]。長さに比例（短い → 長い）。自機・母艦・敵に同じ数値。参考: 自機 HP 100、敵アタッカー 15〜45、地雷 25
export const ICICLE_DAMAGE = [15, 35];
// 当たってから落ちるまで（tick。0.4 秒）。震えている間の追加の当たりは時間を延ばさない。揺れる幅（px。描画だけ）
export const ICICLE_SHAKE_TICKS = 24;
export const ICICLE_SHAKE_AMPLITUDE = 1;
// 当たった機体の vy を、少なくともこの値（下向き）にする。vx は変えない（applyKnockback は vx を上書きするので使わない）
export const ICICLE_KNOCK_VY = 2;
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる
export const ICICLE_FILL_SCALE = 1;
// 天井の空きから、床まで残す余白（タイル）。吊るす長さは (空き - この値) × タイルまで
export const ICICLE_KEEP_BELOW = 3;
// 隣のつららとの間隔（px、4px 刻みで引く）。つららの幅に足す
export const ICICLE_GAP = [4, 20];
// 震えているあいだ、先から水滴の粒を 1 つ落とす間隔（tick。予兆）
export const ICICLE_DRIP_EVERY = 6;
// 氷の粒の数。hit: 当たって震え始めるとき、land: 落ちて砕けるとき
export const ICICLE_SHARDS = { hit: 4, land: 14 };
// 落ちている間、つららの体から粉雪を舞わせる間隔（tick）と 1 回の粒数（実機で「落ちるときに粉雪が舞う方がいい」と言われて足した。
// 小さい粒がほとんど動かずに残り、落ちたつららの跡が粉雪の筋になる）
export const ICICLE_TRAIL_EVERY = 2;
export const ICICLE_TRAIL_COUNT = 2;
// 先が床に触れたら、消えずに先からめり込んでいく（実機で「いきなり消えるのではなくて、先からめり込んでいって大きめの粉雪に変わる方がいい」
// と言われた）。めり込む速さ（px/tick。重力は使わない）。全体が地面の線の下に入るまで（長さ 48px で約 0.35 秒）。
// 最初は 1.5（約 0.6 秒）で、実機で「めり込む速度をもう少し速く」と言われて 2.5 にした
export const ICICLE_SINK_SPEED = 2.5;
// 地面の線から出る大きめの粉雪の数。land: 触れた瞬間、sink: めり込んでいる間の毎 tick、end: 潜りきって消えるとき。
// 大きさ [最小, 最大]（px。落ちている間の粉雪や木の雪より大きめ。大きい方は ICICLE_POWDER_BIG_SHARE の割合）
export const ICICLE_POWDER = { land: 8, sink: 2, end: 6 };
export const ICICLE_POWDER_SIZE = [2, 4];
export const ICICLE_POWDER_BIG_SHARE = 0.4;

// --- 5面のつららの音（段 2）---
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md（音の節）。部品の並びは audio/sounds/icicleSounds.js の純関数、
// オフライン再現と A特性の実測は tools/render-icicle-sounds.mjs（tests/icicle-sounds.test.js が音量を爆発との相対 dB で縛る）。
// 震え（きしみ）・落下（風を切る）・床に刺さる（ザクッ＋サーッ）の 3 つ。数値は最初の出発点で、実機で聴いて調整する前提
// 同じ種類の音が MERGE_MS 以内に重なったら 1 つだけ鳴らす（グレネードで十数本が同時に震えても 1 回）
export const ICICLE_SOUND_MERGE_MS = 80;
// 震え: 高い帯域の小さなクリックを spread 秒（震えの 0.4 秒より少し短く）のあいだに clicks 回ばらまく。
// freq はバンドパスの中心（下限〜上限）、dur は 1 回の長さ（最短〜最長）
export const ICICLE_SOUND_SHAKE = { clicks: 4, spread: 0.34, gain: 0.018, freq: [2800, 4800], Q: 4, dur: [0.012, 0.024] };
// 落下: 帯域を絞ったノイズの下降（風を切る）
export const ICICLE_SOUND_FALL = { gain: 0.014, dur: 0.26, from: 3600, to: 1400, Q: 4 };
// 床に刺さる: crunch（ザクッ。ローパスのノイズの一撃）と swish（サーッ。めり込む時間に合わせた粉雪のノイズ）
export const ICICLE_SOUND_SINK = {
    crunch: { gain: 0.021, dur: 0.09, from: 3500, to: 700 },
    swish: { gain: 0.0085, dur: 0.35, from: 2400, to: 1100, Q: 1.5 },
};
