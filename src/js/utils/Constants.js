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
export const PLAYER_STUN_DURATION = 20;       // Duration of stun in frames (60 = 1 sec)
export const PLAYER_MAX_HOVER_SPEED = -4.0;   // Maximum upward speed during hover
export const PLAYER_BURST_FORCE = -5.8;
export const HOVER_THRUST = -0.50;
export const HOVER_THRUST_MIN = -0.30; // Weak thrust when fuel is low
export const HOVER_MAX_FUEL = 100;
export const HOVER_FUEL_CONSUMPTION = 0.4; // per frame while hovering
export const BURST_FUEL_CONSUMPTION = 30;  // fuel consumed immediately on burst
export const BURST_MIN_FUEL = 30;          // minimum fuel required to burst (= 1 burst worth)
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
export const ATTACKER_BOOST_MAX_FRAMES = 20; // 'boost' climbStyle thrust frames per airborne leg

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
export const CARRIER_MAX_HP = 80;
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
        jumpForce: -6.5,
        fireInterval: 120,    // 2 seconds
        sightRange: CANVAS_WIDTH * 0.4,
        score: 300,
        spawnWeight: 60,      // 60%
        usesGrenades: false,
        aimAccuracy: 0.6,
        movementType: 'pace_and_jump',
        climbThrust: 0.55,
        climbStyle: 'boost',
        bodyColor: '#55CCDD',
        headColor: '#44AABB',
        visorColor: '#FFFFFF',
        backpackColor: '#338899',
        exhaustColor: '#33DDEE',
    },
    heavy: {
        name: 'heavy',
        hp: 60,
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
export const MISSILE_HIT_KNOCKBACK_VY = -2;
export const MISSILE_HIT_KNOCKBACK_VX = 1.5;
