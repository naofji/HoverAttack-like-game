// 敵アタッカー（型の表 ENEMY_ATTACKER_TYPES・帰還・artillery の煙幕・rival のダッシュと残像・ローラーダッシュ・MG 持ち）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { CANVAS_WIDTH, TILE_SIZE } from './core.js';

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

// --- Rival roller dash（ローラーダッシュ）---
// 設計: docs/superpowers/specs/2026-11-22-rival-roller-dash-design.md
// 近づかれた rival が、自機の方を向いたまま後ろへ高速で滑って距離を取る（撃ちながら）。
// 型の行の `rollerDash: true` で付く。手順は entities/attacker/rollerDash.js。
//
// 最高速 1.20 の3倍＝回避ダッシュの初速と同じ。2.4（2倍）から上げた（2026-11-22、実機の
// 指摘「残像が出現するくらいのスピードに」）。2.4 でも残像のしきい値 1.6 は超えていたが、
// 残像は2フレームおきなので間隔が 4.8px しかなく、手前の残像が幅16pxの本体に隠れて
// 見えなかった。3.6 なら間隔 7.2px・尾の長さ約43px で、回避ダッシュの残像と同じに見える。
// 上り坂（×0.6−0.06）でも 2.1 でしきい値を超える（2.4 のときは 1.38 で坂では出なかった）
export const ROLLER_SPEED = 3.6;            // px/frame
export const ROLLER_ACCEL_FRAMES = 6;       // 止まった状態から ROLLER_SPEED まで線形に乗せるフレーム数（短いほど「一気に」）
// 一定速で滑るフレーム数。始めるときに MIN..MAX から乱数で決める＝**どこで止まるか
// 読めない**のはここ。移動量は加速・減速込みでおよそ 68〜137px。近すぎ(60px)から
// zigzag の推奨距離 80px の外まで確実に出る
// 速さを 2.4 → 3.6 に上げたとき、距離を変えないよう 20〜50 から縮めた（距離を取りすぎて
// 近接戦が成り立たなくなるのを避けるため。距離ごと延ばすならここを戻す）
export const ROLLER_GLIDE_FRAMES_MIN = 12;
export const ROLLER_GLIDE_FRAMES_MAX = 31;
export const ROLLER_STOP_FRAMES = 8;        // 急停止で ROLLER_SPEED → 0 に落とすフレーム数
// 連発防止（約4秒）。滑りっぱなしで近接戦が成り立たなくなるのが一番の失敗なので、
// 一度下がったら暫くは歩きのジグザグで相手をさせる
export const ROLLER_COOLDOWN = 240;
// 足元の火花。滑走中は ROLLER_SPARK_INTERVAL フレームおきに ROLLER_SPARK_COUNT 粒、
// 急停止の瞬間に ROLLER_SPARK_STOP_COUNT 粒。粒は進行と逆（後ろ）へ低く飛ぶ。
// 被弾の火花（createSparks: 3〜5粒、1.5〜4.0px/f、寿命10〜19）より小さく短くして、
// 「被弾した」と取り違えない擦れの火花にする（実機で調整する前提の初期値）
export const ROLLER_SPARK_INTERVAL = 3;
export const ROLLER_SPARK_COUNT = 2;
export const ROLLER_SPARK_STOP_COUNT = 10;
export const ROLLER_SPARK_SPEED_MIN = 0.8;   // px/frame（横）
export const ROLLER_SPARK_SPEED_MAX = 2.2;
export const ROLLER_SPARK_RISE_MAX = 1.2;    // px/frame（上向きの最大）。低く飛ばすため横より小さい
export const ROLLER_SPARK_LIFE_MIN = 6;      // frames
export const ROLLER_SPARK_LIFE_MAX = 12;
export const ROLLER_SPARK_COLORS = ['#FFFFE0', '#FFD700', '#FFA500']; // 被弾の火花（Particle.js の SPARK_COLORS）と同じ黄〜橙

// 滑走音（playRollerDash）。始めた瞬間に1回、滑走の長さぶん鳴る単発音。
// ループ音にしなかったのは、長さが始める時点で決まっているから（ループにすると、
// 撃破・面の移動での止め忘れの面倒を全部抱える）。途中で終わると尾が少し残るのは許容。
// 中身は「回り上がるモーター（三角波）」と「接地の擦れ（帯域ノイズ）」。
// 三角波にしたのは、鋸波だと倍音が回避ダッシュ音（鋸波＋共鳴ローパス）と重なって
// 聞き分けにくくなるため
export const ROLLER_SND_FREQ_FROM = 110;    // Hz: 回り始め
export const ROLLER_SND_FREQ_TO = 180;      // Hz: 回りきった音程（そこで保つ）
export const ROLLER_SND_SPINUP = 0.12;      // 秒: 回り上がる時間（加速 ROLLER_ACCEL_FRAMES=6 ≒ 0.1秒に合わせた）
export const ROLLER_SND_GRIND_FREQ = 2200;  // Hz: 擦れのノイズの帯域の中心
export const ROLLER_SND_GRIND_Q = 1.2;      // バンドパス（WebAudio でも線形の Q）。広めにしてザラつきを出す
export const ROLLER_SND_GRIND_MIX = 0.6;    // モーターに対する擦れの混ぜ量
export const ROLLER_SND_ATTACK = 0.02;      // 秒。短すぎるとクリックノイズ
export const ROLLER_SND_RELEASE = 0.08;     // 秒: 終わり際に抜く長さ（急停止の「キィッ」に場所を譲る）
export const ROLLER_SND_CUT = 0.06;           // 秒: 滑走が途中で終わったときに滑走音を抜く長さ（0 だとクリックノイズ）
export const ROLLER_SND_DEFAULT_DURATION = 0.6; // 秒: 長さを渡されなかったとき（加速6＋滑走22＋減速8 ≒ 36フレームの中ほど）
// A特性の transientLevel で実測して決めた値（tests/rival-roller-sound.test.js）。
// 回避ダッシュ音（playRivalDash）に対して **-2.44dB**（測る長さを 0.8→0.6秒にした後。0.8秒では -3.95dB）。滑っているあいだ鳴り続けるので
// 一瞬の回避ダッシュ音より控えめにした。0.03 では -13.3dB で埋もれた（モーターが
// 110〜180Hz と低く、A特性で大きく削られるため）
export const ROLLER_SND_GAIN = 0.088;

// 急停止の「キィッ」（playRollerStop）。滑り切って stop 相に入った瞬間だけ鳴る
export const ROLLER_STOP_SND_DURATION = 0.18;    // 秒
export const ROLLER_STOP_SND_FREQ_FROM = 3200;   // Hz: 擦れの帯域が高い所から
export const ROLLER_STOP_SND_FREQ_TO = 1600;     // Hz: 下がって止まる（速度が落ちていく）
export const ROLLER_STOP_SND_Q = 3;              // バンドパス。狭めにして「キィ」の芯を出す
export const ROLLER_STOP_SND_TONE_FROM = 1700;   // Hz: 鳴きのサイン波
export const ROLLER_STOP_SND_TONE_TO = 1100;
export const ROLLER_STOP_SND_TONE_MIX = 0.3;
// 同じく実測で回避ダッシュ音に対して **-0.62dB**（一瞬なので同じくらいにした）。
// 0.05 では -18.0dB。Q 3 のバンドパスで帯域外のノイズが大半捨てられ、しかも頭から
// 減衰するので、数字の見た目より大きく取らないと聞こえない（ピークは 0.19 で歪まない）
export const ROLLER_STOP_SND_GAIN = 0.37;

export const PLAYER_MAX_HP = 100;
export const PLAYER_INITIAL_LIVES = 3;
export const PLAYER_RESPAWN_INVINCIBLE_FRAMES = 90; // 1.5 seconds at 60fps

// --- Enemy Attacker (Humanoid) ---
// 生成数はマップ面積で決まるので Map.js のコンストラクタが持つ（ここには置かない）
export const ENEMY_ATTACKER_MISSION = 1;   // 2面から（1面は戦車・地雷だけ）
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
        firstMission: 0,      // 制限なし（アタッカー自体が出るのは ENEMY_ATTACKER_MISSION から）
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
        firstMission: 2,      // 3面から（missionsCompleted。SpawnManager がこれ未満の面では抽選に入れない）
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
        firstMission: 4,      // 5面から（missionsCompleted。SpawnManager がこれ未満の面では抽選に入れない）
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
        // 近づかれたら後ろへ滑って距離を取る（ROLLER_*、手順は entities/attacker/rollerDash.js）
        rollerDash: true,
    },
    artillery: {
        name: 'artillery',
        // 50 → 45 → 30。ミサイル(PLAYER_MISSILE_DAMAGE=15)で**2発ちょうど**。
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
        firstMission: 5,      // 6面から（missionsCompleted。SpawnManager がこれ未満の面では抽選に入れない）
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

// --- standard アタッカーのマシンガン持ち ---
// standard だけ、面が進むほど「ミサイル1発」ではなく「マシンガン3連射」を撃つ機体が
// 混ざる（ユーザー指定 2026-11-03: 1面はミサイルのみ、2面から増え、7面で
// ミサイル:マシンガン = 1:3）。2〜7面は 0 → 0.75 を等間隔に刻んだ。
// 添字は missionsCompleted（0 = 1面）。表より先の面は最後の行を使う。
//
// **割り当ては乱数を引かない**（utils/attackerWeapon.js）。standard の並び順で
// 端数を繰り越して決めるので、各面の比率がその面の機体数の中で正確に出るうえ、
// game.rng を消費しない＝週次の決定性（tests/MapDeterminism.test.js）を壊さない
export const STANDARD_MG_SHARE_BY_MISSION = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75];
// 1回の射撃で撃つ弾数。弾は砲台・ドローンと同じ EnemyBullet。
// 5 → 3（ユーザー指定 2026-11-05。最初の指定は「5連射」だった）
export const ATTACKER_MG_BURST_COUNT = 3;
// 発と発の間隔（フレーム）。ドローンの5連射（ENEMY_DRONE_BURST_INTERVAL）と同じ 6
export const ATTACKER_MG_BURST_DELAY = 6;
// 1発ごとのばらつき（ラジアン、全幅）。ドローンの連射と同じ 0.1。
// 狙いの外れ（aimAccuracy）は連射の頭で1回だけ引き、連射の全弾で共有する
// ── 1発ごとに引くと standard（0.6）では弾が扇状に散って「連射」に見えないため
export const ATTACKER_MG_SPREAD = 0.1;
// MG 持ちの standard の色（ユーザー指定 2026-11-03「系統は一緒で見分けられるように」）。
// standard の水色(#55CCDD)を、同じ青緑の系統のまま**暗く・青寄り**にした。
// 明るさで差を付けたのは、色相だけずらすと小さな機体では見分けにくいため。
// 噴射の色(flameColor)とバイザーは standard のまま ── 「同じ機種の別装備」に見せる。
// ここに無い項目（形・脚・数値）は standard の行をそのまま使う（utils/attackerWeapon.js）
export const STANDARD_MG_COLORS = {
    bodyColor: '#3A8FCC',
    headColor: '#2E74A8',
    backpackColor: '#235A85',
    exhaustColor: '#4FB0FF',
};
