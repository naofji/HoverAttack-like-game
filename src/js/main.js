// ============================================
// Main Game Entry Point - v1.0
// ============================================

window.onerror = function (msg, url, loc) {
    const div = document.createElement('div');
    div.style.position = 'absolute'; div.style.zIndex = '9999'; div.style.background = 'red';
    div.style.color = 'white'; div.style.padding = '10px'; div.style.fontSize = '20px';
    div.textContent = `ERROR: ${msg.toString()} at ${loc}`;
    document.body.appendChild(div);
};

import { Input } from './utils/Input.js';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE,
    MISSILE_MAX_ON_SCREEN, COLOR_CAVE_BG,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    LANDMINE_BLAST_RADIUS
} from './utils/Constants.js';
import { Map } from './world/Map.js';
import { Camera } from './world/Camera.js';
import { Player } from './entities/Player.js';
import { Carrier } from './entities/Carrier.js';
import { Missile } from './entities/Missile.js';
import { Grenade } from './entities/Grenade.js';
import { createExplosion, createSparks } from './entities/Particle.js';
import { Flag } from './entities/Flag.js';
import { HUD } from './ui/HUD.js';
import { Crosshair } from './ui/Crosshair.js';
import { ScreenRenderer } from './ui/ScreenRenderer.js';
import { CollisionManager } from './systems/CollisionManager.js';
import { SpawnManager } from './systems/SpawnManager.js';
import { GameStateManager } from './systems/GameStateManager.js';
import { audioManager } from './audio/AudioManager.js';

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

    // Managers
    collisionManager: null,
    spawnManager: null,
    stateManager: null,
    screenRenderer: null,

    // Entities
    player: null,
    carrier: null,
    projectiles: [],  // missiles + grenades
    particles: [],
    landmines: [],
    enemies: [],
    enemyBullets: [],
    flag: null,

    // Game state
    score: 0,
    missionsCompleted: 0,
    gameState: 'title', // 'title', 'playing', 'gameover', 'paused', 'mission_clear'
    showMiniMap: false,

    // ==========================================
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        console.log('Hover Attack v1.0 Initializing...');

        // Initialize systems
        this.input = new Input(this.canvas);
        this.map = new Map(this, this.missionsCompleted);
        this.camera = new Camera(this);
        this.hud = new HUD(this);
        this.crosshair = new Crosshair(this);

        // Initialize managers
        this.collisionManager = new CollisionManager(this);
        this.spawnManager = new SpawnManager(this);
        this.stateManager = new GameStateManager(this);
        this.screenRenderer = new ScreenRenderer(this);

        // Find safe spawn position in the start area
        const spawnPos = this.spawnManager.findSpawnPosition(5, 5, 12, 10);

        // Create carrier first (player spawns on top)
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);

        // Create player (docked on carrier)
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;

        // Create landmines and enemies from map spawn data
        this.spawnManager.spawnLandmines();
        this.spawnManager.spawnEnemies();

        // Camera follows player
        this.camera.follow(this.player);
        this.camera.snapToTarget();

        console.log('Hover Attack v1.0 Ready!');
        window.Game = this;

        // Start game loop
        requestAnimationFrame(this.loop.bind(this));
    },

    // ==========================================
    // UPDATE
    // ==========================================
    update(deltaTime) {
        // --- Always update input state even if not playing ---
        // Toggle Lock-on with Shift key
        if (this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight')) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }

        // --- Title Screen Input ---
        if (this.gameState === 'title') {
            if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed()) {
                this.gameState = 'playing';
                audioManager.startBGM();
            }
            return;
        }

        if (this.gameState !== 'playing') {
            return;
        }

        // --- MiniMap Toggle ---
        if (this.input.isKeyPressed('KeyM')) {
            this.showMiniMap = !this.showMiniMap;
        }

        // --- Docking / Undocking ---
        this._handleDocking();

        // --- Shooting ---
        this._handleShooting();

        // --- Update carrier ---
        if (this.carrier) {
            this.carrier.update();

            if (!this.carrier.alive && this.carrier.lives > 0) {
                this.stateManager.respawnCarrier();
            } else if (!this.carrier.alive && this.carrier.lives <= 0) {
                this._triggerGameOver();
            }
        }

        // --- Update player ---
        if (this.player) {
            this.player.update();
            if (!this.player.alive && this.player.lives > 0) {
                this.stateManager.respawnPlayer();
            } else if (!this.player.alive && this.player.lives <= 0) {
                this._triggerGameOver();
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

        // --- Update landmines ---
        for (let i = this.landmines.length - 1; i >= 0; i--) {
            const mine = this.landmines[i];
            mine.update();

            // Player collision
            if (this.player && this.player.alive && !this.player.docked &&
                this.player.invincibleTimer <= 0 && mine.collidesWith(this.player)) {
                mine.detonate();
            }

            // Projectile collision (missiles/grenades can trigger mines)
            if (mine.alive) {
                for (const proj of this.projectiles) {
                    if (proj.alive && !proj.exploded && mine.collidesWithPoint(proj.x, proj.y)) {
                        mine.detonate();
                        proj.alive = false;
                        proj.exploded = true;
                        break;
                    }
                }
            }

            if (!mine.alive) {
                this.landmines.splice(i, 1);
            }
        }

        // --- Update map ---
        this.map.update();

        // --- Update enemies ---
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update();
            if (!this.enemies[i].alive) {
                this.enemies.splice(i, 1);
            }
        }

        // --- Check Mission Clear Condition ---
        if (this.base && !this.base.alive && !this.flag && this.gameState === 'playing') {
            this.flag = new Flag(this, this.base.x + this.base.width / 2 - 6, this.base.y + this.base.height - 20);
        }

        if (this.flag) {
            this.flag.update();
            if (this.player && this.player.alive && !this.player.docked) {
                if (this.flag.collidesWith(this.player)) {
                    this.score += this.flag.scoreValue;
                    this.flag = null;
                    this.gameState = 'mission_clear';
                    this.missionsCompleted++;
                    audioManager.stopBGM();
                    audioManager.playSuccess();
                }
            }
        }

        // --- Collision detection (centralized) ---
        this.collisionManager.update();

        // --- End of frame input cleanup ---
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
            let headClear = true;
            const checkY = player.y - 4;

            if (this.map.isSolidAtPixel(player.x + 2, checkY) ||
                this.map.isSolidAtPixel(player.x + player.width - 2, checkY)) {
                headClear = false;
            }

            if (headClear) {
                player.docked = false;
                player.vy = -3;
                player.walkFrame = 2;
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

        const targetWorld = this.input.getTargetWorld(this.camera);
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);

        // Left click or Space: Missile
        const fireMissile = this.input.mouse.left || this.input.isKeyDown('Space');
        if (fireMissile && player.missiles > 0 && player.missileCooldown <= 0) {
            const activeMissiles = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
            if (activeMissiles < MISSILE_MAX_ON_SCREEN) {
                const muzzleX = px + Math.cos(angle) * 12;
                const muzzleY = py + Math.sin(angle) * 12;
                this.projectiles.push(new Missile(this, muzzleX, muzzleY, angle, true));
                player.missiles--;
                player.missileCooldown = 15;
                audioManager.playMissile();
            }
        }

        // Right click: Grenade
        if (this.input.isRightClickPressed() && player.grenades > 0) {
            const muzzleX = px + Math.cos(angle) * 10;
            const muzzleY = py + Math.sin(angle) * 10;
            this.projectiles.push(new Grenade(this, muzzleX, muzzleY, angle));
            player.grenades--;
            audioManager.playExplosion(false);
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

        if (this.gameState === 'title') {
            this.screenRenderer.drawTitleScreen(ctx);
            return;
        }

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

        // Landmines
        for (const mine of this.landmines) {
            mine.draw(ctx);
        }

        // Enemies
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
        }

        // Enemy bullets
        for (const bullet of this.enemyBullets) {
            bullet.draw(ctx);
        }

        // Flag
        if (this.flag) {
            this.flag.draw(ctx);
        }

        ctx.restore();

        // --- Draw HUD (screen-space) ---
        this.hud.draw(ctx);

        // --- Draw crosshair (screen-space) ---
        this.crosshair.draw(ctx);

        // --- Overlays ---
        if (this.gameState === 'gameover') {
            this.screenRenderer.drawGameOver(ctx);
            if (this.input.isKeyPressed('KeyR')) {
                this.stateManager.restart();
                audioManager.startBGM();
            }
        } else if (this.gameState === 'mission_clear') {
            this.screenRenderer.drawMissionClear(ctx);
            if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed()) {
                this.gameState = 'playing';
                this.stateManager.nextMission();
                audioManager.startBGM();
            }
        } else if (this.showMiniMap) {
            this.screenRenderer.drawMiniMap(ctx);
        }
    },

    // ==========================================
    // HELPERS
    // ==========================================

    /** Spawn explosion particles at position */
    spawnExplosion(x, y, size) {
        const newParticles = createExplosion(x, y, size);
        this.particles.push(...newParticles);

        // Play explosion sound (large if size > 10)
        audioManager.playExplosion(size > 10);

        // Any explosion triggers nearby mines
        if (this.landmines) {
            for (const mine of this.landmines) {
                if (mine.alive) {
                    const ex = mine.x + mine.width / 2;
                    const ey = mine.y + mine.height / 2;
                    const dx = ex - x;
                    const dy = ey - y;
                    if (dx * dx + dy * dy <= LANDMINE_BLAST_RADIUS * LANDMINE_BLAST_RADIUS) {
                        mine.detonate();
                    }
                }
            }
        }
    },

    /** Spawn damage sparks at position */
    spawnSparks(x, y) {
        const newParticles = createSparks(x, y);
        this.particles.push(...newParticles);
    },

    /** Spawn heavy damage sparks and sound */
    spawnHeavyDamage(x, y) {
        this.spawnSparks(x, y);
        audioManager.playHeavyDamage();
    },

    /** Add to score */
    addScore(points) {
        this.score += points;
    },

    /** Transition to game over state (idempotent) */
    _triggerGameOver() {
        if (this.gameState === 'gameover') return;
        this.gameState = 'gameover';
        audioManager.stopBGM();
        audioManager.playGameOver();
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

        // Clear input state after drawing (which might process input for menus/screens)
        this.input.endFrame();

        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
Game.init();
