// ============================================
// Game Constants
// ============================================

export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 768;

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

export const PLAYER_MAX_HP = 100;
export const PLAYER_INITIAL_LIVES = 3;
export const PLAYER_RESPAWN_INVINCIBLE_FRAMES = 90; // 1.5 seconds at 60fps

// --- Weapons ---
export const MISSILE_SPEED = 6;
export const MISSILE_INITIAL_COUNT = 24;
export const MISSILE_MAX_ON_SCREEN = 10;
export const MISSILE_LIFETIME = 180; // frames

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
export const PLAYER_MG_LIFETIME = 180; // 80% of original 240 (192 * 3 = 576px)
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
export const LANDMINE_COUNT = 60;          // Number to scatter across the map
export const LANDMINE_SCORE = 50;      // Player-detonated landmine
export const ITEM_PICKUP_SCORE = 200;  // Any item (repair / missile / auto-aim) pickup

// --- Enemy Tank (Hover) ---
export const ENEMY_TANK_WIDTH = 16;
export const ENEMY_TANK_HEIGHT = 12;
export const ENEMY_TANK_HP = 10;
export const ENEMY_TANK_SPEED = 0.5;
export const ENEMY_TANK_SIGHT_RANGE = CANVAS_WIDTH * 0.4;   // px - detection range for player
export const ENEMY_TANK_FIRE_INTERVAL = 90;  // frames between shots (~1.5s)
export const ENEMY_TANK_SCORE = 200;
export const ENEMY_TANK_COUNT = 30;          // Number to scatter across the map
export const ENEMY_TANK_MAX_FALLING_SPEED = 3;

// --- Enemy Bullet ---
export const ENEMY_BULLET_SPEED = 3;
export const ENEMY_BULLET_RADIUS = 2;
// 自機と母艦で同じ値。以前は PLAYER=15 / CARRIER=10 と分けて書いてあったが
// どちらも読まれておらず、実際には CollisionManager 側の 10 が両方に効いていた
export const ENEMY_BULLET_DAMAGE = 10;
export const ENEMY_BULLET_LIFETIME = 180;    // frames (3s)

export const ENEMY_HOMING_MISSILE_MAX_SPEED = 3; // Matches player's MISSILE_SPEED
export const ENEMY_HOMING_MISSILE_TURN_RATE = 0.02; // Radians per frame
export const ENEMY_HOMING_MISSILE_LIFETIME = 300; // Lives longer to find target
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
    },
    artillery: {
        name: 'artillery',
        hp: 50,
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

// --- Colors ---
export const COLOR_HARD_BLOCK = '#555555';
export const COLOR_HARD_BLOCK_BORDER = '#3a3a3a';
export const COLOR_INDESTRUCTIBLE_BLOCK = '#2a6496';
export const COLOR_INDESTRUCTIBLE_BLOCK_BORDER = '#1a3d5c';
export const COLOR_CAVE_BG = '#1a0a00';

// --- Mini-map (実際の地形を縮小して焼く。tile cache を drawImage で縮小するだけなので
// 見た目は本編と一致する。彩度・明度だけここで落として背景に沈める) ---
export const MINIMAP_SATURATION = 0.55;   // 彩度を落として背景に沈める
export const MINIMAP_BRIGHTNESS = 0.65;   // 明度も落とす。前景の自機・敵の点を目立たせるため
// ミニマップ全体の不透明度 (開いたときの半透明さ)。0.85 は地形の上に重ねると
// 前景が読めなくなるとの実機フィードバックで 0.55 へ下げた
export const MINIMAP_ALPHA = 0.55;
// 画面四隅から置き場所を選ぶときの、画面端／HUD帯からの余白
export const MINIMAP_MARGIN = 16;
// 画面幅に対するミニマップの上限。大きいマップ（最大600x300）だと
// 画面の大半を覆ってしまうため、焼く解像度は変えずに描画時だけ縮小する。
// 外枠を無くして薄く見えるようになったぶん、1/3 だと小さすぎるとの
// フィードバックで引き上げた。1/2（画面幅1024に対して512px）だと、
// 四隅に置いても左右の候補が完全に重なり（512×2＝1024＝画面幅）実質
// 「上か下か」の2択になってしまう。避ける対象が3つ（自機・クロスヘア・
// 母艦の方向矢印）ある状況では上下とも塞がってフォールバックに落ちる場面が
// 増えるため、0.4（約410px）にして左右の候補にずれを残した
export const MINIMAP_MAX_WIDTH_RATIO = 0.4;
// 隅から隅への切り替えを「消える→切り替わる→現れる」でつなぐときの
// 1フレームあたりのフェード量。0.08 で消えて現れるまで約0.4秒
export const MINIMAP_FADE_SPEED = 0.08;
// 自機・クロスヘアが「近づいたら」避け始めるための余白。矩形に実際に
// 重なってからでは動き出しが遅く感じるため、少し手前で反応させる
export const MINIMAP_AVOID_PADDING = 48;

// ミニマップは「カーソルがいる側の反対側」に置く。その左右／上下を切り替える
// 中心線に置く不感帯の幅（隅と隅の間隔に対する比）。カーソルが中心付近で
// 揺れるたびにミニマップが往復しないようにするためのヒステリシス。
// 0.15 で 1024x768 のとき横 ±87px / 縦 ±71px。0.3 まで上げると今度は
// 「カーソルを反対側へ振っても付いてこない」と感じる領域が広くなりすぎた
export const MINIMAP_SIDE_HYSTERESIS = 0.15;

// --- Far cave backdrop (parallax) ---
// 遠景がカメラに追従する割合。0 = 完全固定、1 = 前景と等速。
// 見た目が弱すぎ/強すぎる場合はこの1値だけを調整する。
export const FAR_BG_PARALLAX = 0.25;

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
export const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwziaAIPlNhCDeFo4OFJhhcgBQzySfRp6g-7wC0w9vFEsKCV0nEjYncvPr8n_5Zjrbv/exec';

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
// 「いちばん近くでホバーしている敵」の距離で駆動する。
// 「画面内なら満音量、画面外は半分」という割り切り。距離の2乗で減衰させて
// いたときは可聴範囲(480px)が画面の半分(512px)より狭く、画面に映っている敵が
// 既にほぼ無音だった（中心から256pxで22%）。見えている敵は聞こえるべき。
export const ENEMY_HOVER_OFFSCREEN_GAIN = 0.5;
// 画面外に出てからこれだけ離れると聞こえなくなる。0 にしないと、マップの
// どこかに敵がいる限り低い唸りが鳴り続ける。
export const ENEMY_HOVER_OFFSCREEN_FADE = 512;
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
// 破片は当たり判定を持たない純粋な演出。地形も無視して落下し続ける。
export const DEBRIS_GRAVITY = GRAVITY / 6; // 通常の1/6。吹き飛んで舞う時間を長く取る
export const DEBRIS_MAX_FALL_SPEED = 4;    // 落下速度の上限。これ以上は速くならない
export const DEBRIS_DRAG = 0.985;          // 毎フレーム vx に乗算する空気抵抗
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
