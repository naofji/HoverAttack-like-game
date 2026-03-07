// ============================================
// Game Constants
// ============================================

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// --- Tile / Map ---
export const TILE_SIZE = 16;
export const MAP_COLS = 300;
export const MAP_ROWS = 150;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

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
export const PLAYER_MAX_FALLING_SPEED = 8.0;  // Terminal velocity for falling
export const PLAYER_STUN_FALL_SPEED = 8.0;    // Falling speed that triggers landing stun
export const PLAYER_STUN_DURATION = 40;       // Duration of stun in frames (60 = 1 sec)
export const PLAYER_MAX_HOVER_SPEED = -4.0;   // Maximum upward speed during hover
export const PLAYER_BURST_FORCE = -6.0;
export const HOVER_THRUST = -0.50;
export const HOVER_THRUST_MIN = -0.30; // Weak thrust when fuel is low
export const HOVER_MAX_FUEL = 100;
export const HOVER_FUEL_CONSUMPTION = 0.4; // per frame while hovering
export const BURST_FUEL_CONSUMPTION = 30;  // fuel consumed immediately on burst
export const BURST_MIN_FUEL = 80;          // minimum fuel required to burst (80%)
export const HOVER_FUEL_RECOVERY = 0.5;     // per frame when not hovering
export const HOVER_FUEL_RECOVERY_BOOST = 0.6; // per frame when pressing S solo
export const HOVER_COOLDOWN_AFTER_BURST = 20; // frames (~0.5s at 60fps) before hover activates after burst
export const PLAYER_MAX_HP = 100;
export const PLAYER_INITIAL_LIVES = 3;
export const PLAYER_RESPAWN_INVINCIBLE_FRAMES = 90; // 1.5 seconds at 60fps

// --- Weapons ---
export const MISSILE_SPEED = 8;
export const MISSILE_INITIAL_COUNT = 24;
export const MISSILE_MAX_ON_SCREEN = 10;
export const MISSILE_LIFETIME = 180; // frames

export const GRENADE_SPEED = 5;
export const GRENADE_GRAVITY = 0.10;
export const GRENADE_INITIAL_COUNT = 12;
export const GRENADE_BLAST_RADIUS = 2; // in tiles
export const GRENADE_LIFETIME = 300; // frames
export const GRENADE_EXPLOSION_COUNT = 300;

// --- Carrier ---
export const CARRIER_WIDTH = 64;
export const CARRIER_HEIGHT = 32;
export const CARRIER_SPEED = 0.4;
export const CARRIER_MAX_HP = 200;
export const CARRIER_INITIAL_LIVES = 3;

// --- Camera ---
export const CAMERA_LERP = 0.08;

// --- HUD ---
export const HUD_TOP_HEIGHT = 30;
export const HUD_BOTTOM_HEIGHT = 24;
export const HUD_FONT = '14px "Courier New", monospace';
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
export const ENEMY_TANK_SIGHT_RANGE = 200;   // px - detection range for player
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

// --- Enemy Attacker (Humanoid) ---
export const ENEMY_ATTACKER_TOTAL_COUNT = 40;
export const ENEMY_ATTACKER_TYPES = {
    standard: {
        name: 'standard',
        hp: 15,
        speed: 0.9,
        jumpForce: -6.5,
        fireInterval: 120,    // 2 seconds
        sightRange: 300,
        score: 100,
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
        hp: 80,
        speed: 0.5,
        jumpForce: -3.0,
        fireInterval: 90,     // 1.5 seconds
        sightRange: 500,
        score: 300,
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
        hp: 50,
        speed: 1.75,
        jumpForce: -6.0,
        fireInterval: 75,     // 1.25 seconds
        sightRange: 400,
        score: 500,
        spawnWeight: 15,      // 15%
        usesGrenades: true,
        grenadeChance: 0.25,  // 25% chance to throw grenade instead of missile
        aimAccuracy: 0.8,
        movementType: 'chase_and_jump',
        bodyColor: '#CC3333',
        headColor: '#AA2222',
        visorColor: '#FFCC00',
        backpackColor: '#882222',
        exhaustColor: '#FF6644',
    },
};

// --- Colors ---
export const COLOR_NORMAL_BLOCK = '#8B4513';
export const COLOR_NORMAL_BLOCK_BORDER = '#5c2e0b';
export const COLOR_HARD_BLOCK = '#2a6496';
export const COLOR_HARD_BLOCK_BORDER = '#1a3d5c';
export const COLOR_INDESTRUCTIBLE_BLOCK = '#555555';
export const COLOR_INDESTRUCTIBLE_BLOCK_BORDER = '#3a3a3a';
export const COLOR_CAVE_BG = '#1a0a00';
export const COLOR_CROSSHAIR = 'rgba(255, 255, 0, 0.8)';
export const COLOR_HOVER_EXHAUST = 'rgba(0, 255, 255, 0.6)';
