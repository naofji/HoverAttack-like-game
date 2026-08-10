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
export const PLAYER_SPEED = 0.3; // acceleration (currently unused, reserved)
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
export const PLAYER_MG_RELOAD_THRESHOLD = 0.5; // Reload only when ammo <= 50% of the magazine
export const PLAYER_MG_SPREAD = 0.12; // Spread angle in radians (approx ±7 degrees)

// --- Carrier ---
export const CARRIER_WIDTH = 64;
export const CARRIER_HEIGHT = 32;
export const CARRIER_SPEED = 0.4;
export const CARRIER_MAX_HP = 120;  // 敵ミサイル12発ぶん。80(8発)では事故死が多かった
export const CARRIER_INITIAL_LIVES = 1;
export const CARRIER_PROXIMITY_ALERT_RANGE = 80; // Distance in pixels to trigger yellow alert

// --- Docking Resupply (gradual replenishment per frame while docked) ---
// HP: 100 / 60 ≈ 1.67/frame → full heal in ~3.6 seconds (at 60fps)
export const DOCK_HP_RATE = 100 / 216; // ~0.46 HP/frame → full in ~3.6s
// Missiles: 24 / (6 * 60) = 0.0667/frame → full in 6 seconds
export const DOCK_MISSILE_RATE = 24 / 360;  // ~0.067 missiles/frame → full in 6s
// Grenades: 12 / (6 * 60) = 0.0333/frame → full in 6 seconds
export const DOCK_GRENADE_RATE = 12 / 360;  // ~0.033 grenades/frame → full in 6s
// Hover fuel: 100 / (4 * 60) → full in 4 seconds (faster, quality-of-life)
export const DOCK_FUEL_RATE = 100 / 240; // ~0.417 fuel/frame → full in 4s

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
export const ENEMY_BULLET_DAMAGE_PLAYER = 15;
export const ENEMY_BULLET_DAMAGE_CARRIER = 10;
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
export const ENEMY_ATTACKER_TOTAL_COUNT = 40;
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
        bodyColor: '#DDAA00', // Yellow-Orange
        headColor: '#BB8800',
        visorColor: '#FF0000', // Red eye
        backpackColor: '#996600',
        exhaustColor: '#FFEE44',
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
export const ENEMY_DRONE_COUNT = 15;        // Number to spawn in air spaces
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
export const ENEMY_TURRET_COUNT = 10;           // Number to spawn
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
export const FLAG_COLOR = '#FF0000';

// --- Enemy Base Laser ---
export const BASE_LASER_RANGE = CANVAS_WIDTH * 0.55;
export const BASE_LASER_CHARGE_TIME = 40; // frames
export const BASE_LASER_COOLDOWN = 90;  // frames
export const BASE_LASER_SPEED = 12;
export const BASE_LASER_DAMAGE = 15;

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
export const COLOR_NORMAL_BLOCK = '#8B4513';
export const COLOR_NORMAL_BLOCK_BORDER = '#5c2e0b';
export const COLOR_HUD_TEXT = '#00CCFF';
export const COLOR_LASER = '#00FFAA';
export const COLOR_HARD_BLOCK = '#555555';
export const COLOR_HARD_BLOCK_BORDER = '#3a3a3a';
export const COLOR_INDESTRUCTIBLE_BLOCK = '#2a6496';
export const COLOR_INDESTRUCTIBLE_BLOCK_BORDER = '#1a3d5c';
export const COLOR_CAVE_BG = '#1a0a00';

// --- Far cave backdrop (parallax) ---
// 遠景がカメラに追従する割合。0 = 完全固定、1 = 前景と等速。
// 見た目が弱すぎ/強すぎる場合はこの1値だけを調整する。
export const FAR_BG_PARALLAX = 0.25;

export const COLOR_CROSSHAIR = 'rgba(255, 255, 0, 0.8)';
export const COLOR_HOVER_EXHAUST = 'rgba(0, 255, 255, 0.6)';

// Auto-Aim Unit
export const AUTO_AIM_DURATION = 3600;         // 60秒 (60fps)
export const AUTO_AIM_MAX_DURATION = 10800;    // 上限3分 (60fps)
export const AUTO_AIM_SNAP_RADIUS = 120;      // スナップ判定半径 (world px)
export const AUTO_AIM_CANCEL_THRESHOLD = 4;   // キャンセルに必要なマウス移動量 (screen px/frame)

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

// --- BGM の音量調節 ---
// 「+」で上げ「-」で下げる。0〜100% を10%刻み（11段）にしてあるので、
// 端から端まで10回。刻みを細かくすると押す回数が増えて煩わしい。
export const BGM_VOLUME_STEP = 0.1;
export const BGM_VOLUME_DEFAULT = 1.0;
export const BGM_VOLUME_STORAGE_KEY = 'hoverAttack.bgmVolume';
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
