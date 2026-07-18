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
export const PLAYER_BURST_FORCE = -6.0;
export const HOVER_THRUST = -0.50;
export const HOVER_THRUST_MIN = -0.30; // Weak thrust when fuel is low
export const HOVER_MAX_FUEL = 100;
export const HOVER_FUEL_CONSUMPTION = 0.4; // per frame while hovering
export const BURST_FUEL_CONSUMPTION = 30;  // fuel consumed immediately on burst
export const BURST_MIN_FUEL = 80;          // minimum fuel required to burst (80%)
export const HOVER_FUEL_RECOVERY = 0.5;     // per frame when not hovering
export const HOVER_FUEL_RECOVERY_BOOST = 0.75; // per frame when pressing S solo
export const HOVER_COOLDOWN_AFTER_BURST = 20; // frames (~0.33s at 60fps) before hover activates after burst
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

// --- Player Machine Gun (Fallback for missiles) ---
export const PLAYER_MG_SPEED = 4; // a little bit faster than ENEMY_BULLET_SPEED
export const PLAYER_MG_RADIUS = 1.5;
export const PLAYER_MG_DAMAGE = 3;
export const PLAYER_MG_LIFETIME = 180; // 80% of original 240 (192 * 3 = 576px)
export const PLAYER_MG_BURST_SIZE = 16;
export const PLAYER_MG_BURST_DELAY = 4; // Frames between shots in a burst
export const PLAYER_MG_RELOAD_TIME = 60; // Frames after a burst
export const PLAYER_MG_SPREAD = 0.12; // Spread angle in radians (approx ±7 degrees)

// --- Carrier ---
export const CARRIER_WIDTH = 64;
export const CARRIER_HEIGHT = 32;
export const CARRIER_SPEED = 0.4;
export const CARRIER_MAX_HP = 200;
export const CARRIER_INITIAL_LIVES = 1;
export const CARRIER_PROXIMITY_ALERT_RANGE = 80; // Distance in pixels to trigger yellow alert

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
export const LANDMINE_BLINK_INTERVAL = 30; // frames per blink cycle
export const LANDMINE_BLAST_RADIUS = 50;   // Area of effect damage radius (~3 tiles)
export const LANDMINE_COUNT = 60;          // Number to scatter across the map

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
        movementType: 'stop_and_shoot',
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
        movementType: 'stop_and_shoot',
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
export const ENEMY_DRONE_SCORE = 250;
export const ENEMY_DRONE_COUNT = 15;        // Number to spawn in air spaces
export const ENEMY_DRONE_WIDTH = 24;
export const ENEMY_DRONE_HEIGHT = 16;
export const ENEMY_DRONE_HOVER_DIST_Y = 120; // Maintain this vertical distance from player
export const ENEMY_DRONE_HOVER_DIST_X = 180; // Maintain this horizontal distance from player
export const ENEMY_DRONE_GRENADE_CHANCE = 0.10; // 10% chance to drop grenade

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
export const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwoVuhM8nA4VYbkWzJed-XwVri3yHYCefMZ3IUpfKSpJ3KKqvSCLbvnzoLbG3usS6Ry/exec';
