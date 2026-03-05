// ============================================
// Main Game Entry Point
// ============================================

import { Input } from './utils/Input.js';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE,
    MISSILE_MAX_ON_SCREEN, COLOR_CAVE_BG,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT
} from './utils/Constants.js';
import { Map } from './world/Map.js';
import { Camera } from './world/Camera.js';
import { Player } from './entities/Player.js';
import { Carrier } from './entities/Carrier.js';
import { Missile } from './entities/Missile.js';
import { Grenade } from './entities/Grenade.js';
import { Particle, createExplosion } from './entities/Particle.js';
import { HUD } from './ui/HUD.js';
import { Crosshair } from './ui/Crosshair.js';

// ============================================
// Game Object
// ============================================
const Game = {
    canvas: null,
    ctx: null,
    lastTime: 0,

    // Core systems
    input: null,
    map: null,
    camera: null,
    hud: null,
    crosshair: null,

    // Entities
    player: null,
    carrier: null,
    projectiles: [],  // missiles + grenades
    particles: [],

    // Game state
    score: 0,
    missionsCompleted: 0,
    gameState: 'playing', // 'playing', 'gameover', 'paused'

    // ==========================================
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        console.log('Hover Attack Initializing...');

        // Initialize systems
        this.input = new Input(this.canvas);
        this.map = new Map(this);
        this.camera = new Camera(this);
        this.hud = new HUD(this);
        this.crosshair = new Crosshair(this);

        // Find safe spawn position in the start area
        const spawnPos = this._findSpawnPosition(5, 5, 12, 10);

        // Create carrier first (player spawns on top)
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);

        // Create player (docked on carrier)
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;

        // Camera follows player
        this.camera.follow(this.player);
        this.camera.snapToTarget();

        console.log('Hover Attack Ready!');

        // Start game loop
        requestAnimationFrame(this.loop.bind(this));
    },

    // ==========================================
    // Find empty spawn position within a tile region
    // ==========================================
    _findSpawnPosition(startC, startR, searchW, searchH) {
        for (let r = startR; r < startR + searchH; r++) {
            for (let c = startC; c < startC + searchW; c++) {
                // Need 3 wide x 2 tall empty space with floor below
                if (!this.map.isSolid(r, c) &&
                    !this.map.isSolid(r, c + 1) &&
                    !this.map.isSolid(r, c + 2) &&
                    !this.map.isSolid(r - 1, c) &&
                    !this.map.isSolid(r - 1, c + 1) &&
                    !this.map.isSolid(r - 1, c + 2) &&
                    this.map.isSolid(r + 1, c) &&
                    this.map.isSolid(r + 1, c + 1)) {
                    return {
                        x: c * TILE_SIZE,
                        y: (r - 1) * TILE_SIZE
                    };
                }
            }
        }
        // Fallback: just place in the carved start area
        return { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };
    },

    // ==========================================
    // UPDATE
    // ==========================================
    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        // --- Docking / Undocking ---
        this._handleDocking();

        // --- Shooting ---
        this._handleShooting();

        // --- Update carrier ---
        if (this.carrier) this.carrier.update();

        // --- Update player ---
        if (this.player) {
            if (!this.player.docked) {
                this.player.update();
            }
            // Check respawn
            if (!this.player.alive && this.player.lives > 0) {
                this._respawnPlayer();
            } else if (!this.player.alive && this.player.lives <= 0) {
                // Check if carrier also dead
                if (!this.carrier.alive && this.carrier.lives <= 0) {
                    this.gameState = 'gameover';
                }
            }
        }

        // --- Update camera target ---
        if (this.player && !this.player.docked && this.player.alive) {
            this.camera.follow(this.player);
        } else if (this.carrier && this.carrier.alive) {
            this.camera.follow(this.carrier);
        }
        this.camera.update();

        // --- Update projectiles ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update();
            if (!this.projectiles[i].alive) {
                this.projectiles.splice(i, 1);
            }
        }

        // --- Update particles ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (!this.particles[i].alive) {
                this.particles.splice(i, 1);
            }
        }

        // --- Update map ---
        this.map.update();

        // --- End frame input tracking ---
        this.input.endFrame();
    },

    // ==========================================
    // DOCKING LOGIC
    // ==========================================
    _handleDocking() {
        const player = this.player;
        const carrier = this.carrier;
        if (!player || !carrier || !player.alive || !carrier.alive) return;

        // Dock (S key)
        if (this.input.isKeyPressed('KeyS') && !player.docked) {
            if (carrier.canDock(player)) {
                player.docked = true;
                player.vx = 0;
                player.vy = 0;
                player.resupply();
                player.x = carrier.x + carrier.width / 2 - player.width / 2;
                player.y = carrier.y - player.height;
            }
        }

        // Undock (W key)
        if (this.input.isKeyPressed('KeyW') && player.docked) {
            // Check if standing up would immediately collide with ceiling
            // The player's visual height expands, but logical height is always PLAYER_HEIGHT
            // We give a small upward boost (-3 vy). Check if space above is clear.
            let headClear = true;
            const checkY = player.y - 4; // Check just above the player

            // Check top-left and top-right corners for the space they are about to occupy
            if (this.map.isSolidAtPixel(player.x + 2, checkY) ||
                this.map.isSolidAtPixel(player.x + player.width - 2, checkY)) {
                headClear = false;
            }

            if (headClear) {
                player.docked = false;
                player.vy = -3; // Small upward boost on launch
                player.walkFrame = 2; // Standing straight
            }
        }
    },

    // ==========================================
    // SHOOTING LOGIC
    // ==========================================
    _handleShooting() {
        const player = this.player;
        if (!player || !player.alive || player.docked) return;

        // Cannot fire weapons while crouching or stunned
        if (player.crouching || player.stunTimer > 0) return;

        const mouseWorld = this.input.getMouseWorld(this.camera);
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(mouseWorld.y - py, mouseWorld.x - px);

        // Left click or Space: Missile
        const fireMissile = this.input.mouse.left || this.input.isKeyDown('Space');
        if (fireMissile && player.missiles > 0 && player.missileCooldown <= 0) {
            const activeMissiles = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
            if (activeMissiles < MISSILE_MAX_ON_SCREEN) {
                const muzzleX = px + Math.cos(angle) * 12;
                const muzzleY = py + Math.sin(angle) * 12;
                this.projectiles.push(new Missile(this, muzzleX, muzzleY, angle, true));
                player.missiles--;
                player.missileCooldown = 15; // 0.25s cooldown between shots
            }
        }

        // Right click: Grenade
        if (this.input.isRightClickPressed() && player.grenades > 0) {
            const muzzleX = px + Math.cos(angle) * 10;
            const muzzleY = py + Math.sin(angle) * 10;
            this.projectiles.push(new Grenade(this, muzzleX, muzzleY, angle));
            player.grenades--;
        }
    },

    // ==========================================
    _respawnPlayer() {
        if (this.carrier && this.carrier.alive) {
            this.player.respawn(
                this.carrier.x + this.carrier.width / 2 - this.player.width / 2,
                this.carrier.y - this.player.height
            );
        }
    },

    // ==========================================
    // DRAW
    // ==========================================
    draw() {
        const ctx = this.ctx;

        // Clear entire canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- Draw game world (camera-transformed) ---
        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // Cave background
        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);

        // Map
        this.map.draw(ctx);

        // Carrier
        if (this.carrier) this.carrier.draw(ctx);

        // Player
        if (this.player) this.player.draw(ctx);

        // Projectiles
        for (const proj of this.projectiles) {
            proj.draw(ctx);
        }

        // Particles
        for (const particle of this.particles) {
            particle.draw(ctx);
        }

        ctx.restore();

        // --- Draw HUD (screen-space) ---
        this.hud.draw(ctx);

        // --- Draw crosshair (screen-space) ---
        this.crosshair.draw(ctx);

        // --- Game Over overlay ---
        if (this.gameState === 'gameover') {
            this._drawGameOver(ctx);
        }
    },

    _drawGameOver(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText(`FINAL SCORE: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);

        ctx.fillStyle = '#888888';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Press R to Restart', this.canvas.width / 2, this.canvas.height / 2 + 60);
        ctx.textAlign = 'left';

        // Restart on R
        if (this.input.isKeyPressed('KeyR')) {
            this._restart();
        }
    },

    _restart() {
        this.score = 0;
        this.missionsCompleted = 0;
        this.projectiles = [];
        this.particles = [];
        this.gameState = 'playing';

        // Regenerate map
        this.map = new Map(this);
        this.hud = new HUD(this);

        const spawnPos = this._findSpawnPosition(5, 5, 12, 10);
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;
        this.camera.follow(this.player);
        this.camera.snapToTarget();
    },

    // ==========================================
    // HELPERS
    // ==========================================

    /** Spawn explosion particles at position */
    spawnExplosion(x, y, count) {
        const newParticles = createExplosion(x, y, count);
        this.particles.push(...newParticles);
    },

    /** Add to score */
    addScore(points) {
        this.score += points;
    },

    // ==========================================
    // GAME LOOP
    // ==========================================
    loop(timestamp) {
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiraling
        if (deltaTime > 50) deltaTime = 50;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
Game.init();
