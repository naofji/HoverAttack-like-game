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
    LANDMINE_BLAST_RADIUS,
    PLAYER_MG_BURST_DELAY, PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME, PLAYER_MG_SPREAD
} from './utils/Constants.js';
import { Map } from './world/Map.js';
import { Camera } from './world/Camera.js';
import { Player } from './entities/Player.js';
import { Carrier } from './entities/Carrier.js';
import { Missile } from './entities/Missile.js';
import { PlayerBullet } from './entities/PlayerBullet.js';
import { Grenade } from './entities/Grenade.js';
import { Particle, TrailParticle, createExplosion, createSparks } from './entities/Particle.js';
import { Flag } from './entities/Flag.js';
import { HUD } from './ui/HUD.js';
import { Crosshair } from './ui/Crosshair.js';
import { ScreenRenderer } from './ui/ScreenRenderer.js';
import { CollisionManager } from './systems/CollisionManager.js';
import { SpawnManager } from './systems/SpawnManager.js';
import { GameStateManager } from './systems/GameStateManager.js';
import { HighScoreManager } from './systems/HighScoreManager.js';
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
    highScoreManager: null,

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
    gameState: 'title', // 'title', 'playing', 'gameover', 'mission_clear', 'game_clear', 'ranking_entry', 'ranking_display'
    showMiniMap: false,
    stateTimer: 0,
    playerNameInput: "",
    
    // Time & Bonus Tracking
    totalTime: 0,
    missionTimer: 0,
    currentTimeBonus: 0,
    targetTimeBonus: 0,
    slotRunning: false,
    lastRankIndex: -1,

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
        this.highScoreManager = new HighScoreManager();

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
        // Toggle Lock-on with Shift key
        if (this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight')) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }

        if (this.gameState === 'title') {
            this.stateTimer += deltaTime;
            if (this.stateTimer > 8000) {
                this.gameState = 'ranking_display';
                this.stateTimer = 0;
                this.lastRankIndex = -1; // Clear highlight for idle loop
            } else {
                const typed = this.input.getTypedChars();
                if (typed.length > 0 || this.input.isLeftClickPressed() || this.input.isRightClickPressed()) {
                    this.stateManager.restart();
                    this.gameState = 'playing';
                    audioManager.startBGM();
                }
            }
            return;
        }

        if (this.gameState === 'ranking_display') {
            this.stateTimer += deltaTime;
            if (this.stateTimer > 10000) {
                this.gameState = 'title';
                this.stateTimer = 0;
                audioManager.stopBGM(); 
            } else {
                const typed = this.input.getTypedChars();
                if (typed.length > 0 || this.input.isLeftClickPressed() || this.input.isRightClickPressed()) {
                    this.stateManager.restart();
                    this.gameState = 'playing';
                    audioManager.startBGM();
                }
            }
            return;
        }

        if (this.gameState === 'ranking_entry') {
            const chars = this.input.getTypedChars();
            for (let c of chars) {
                if (c === 'Backspace') {
                    this.playerNameInput = this.playerNameInput.slice(0, -1);
                } else if (c === 'Enter') {
                    if (this.playerNameInput.trim().length === 0) {
                        this.playerNameInput = 'AAA';
                    }
                    const displayMission = Math.min(7, this.missionsCompleted + 1);
                    let formattedTime = null;
                    if (this.missionsCompleted >= 7) {
                        const mm = Math.floor(this.totalTime / 60000).toString().padStart(2, '0');
                        const ss = Math.floor((this.totalTime % 60000) / 1000).toString().padStart(2, '0');
                        const xx = Math.floor((this.totalTime % 1000) / 10).toString().padStart(2, '0');
                        formattedTime = `${mm}:${ss}.${xx}`;
                    }
                    this.lastRankIndex = this.highScoreManager.addScore(this.playerNameInput, this.score, displayMission, formattedTime);
                    this.gameState = 'ranking_display';
                    this.stateTimer = 0;
                } else if (this.playerNameInput.length < 10) {
                    this.playerNameInput += c.toUpperCase();
                }
            }
            return;
        }

        if (this.gameState === 'gameover') {
            this.stateTimer += deltaTime;
            if (this.stateTimer > 4000) {
                if (this.highScoreManager.isHighScore(this.score)) {
                    this.gameState = 'ranking_entry';
                    this.playerNameInput = "";
                    audioManager.playRankingBGM();
                } else {
                    this.gameState = 'title';
                    this.stateTimer = 0;
                    audioManager.stopBGM();
                }
            }
            return;
        }

        if (this.gameState === 'game_clear') {
            this.stateTimer += deltaTime;

            if (this._updateTimeBonusSlot(true)) return; // returns true while slot is running

            if (this.stateTimer > 7000) {
                if (this.highScoreManager.isHighScore(this.score)) {
                    this.gameState = 'ranking_entry';
                    this.playerNameInput = "";
                    audioManager.playRankingBGM();
                } else {
                    this.gameState = 'title';
                    this.stateTimer = 0;
                    audioManager.stopBGM();
                }
            }
            return;
        }

        if (this.gameState === 'mission_clear') {
            if (this._updateTimeBonusSlot(false)) return; // returns true while slot is running

            if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed() || this.input.getTypedChars().length > 0) {
                this.gameState = 'playing';
                this.stateManager.nextMission();
                audioManager.startBGM(this.missionsCompleted);
            }
            return;
        }

        if (this.gameState !== 'playing') {
            return;
        }

        // --- Timers ---
        this.totalTime += deltaTime;
        this.missionTimer += deltaTime;

        // --- MiniMap Toggle ---
        if (this.input.isKeyPressed('KeyM')) {
            this.showMiniMap = !this.showMiniMap;
        }

        // --- Weapon Switch ---
        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.switchWeapon();
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
                    this.missionsCompleted++;
                    
                    // Calculate Time Bonus: max 10000, drops by 50 every second, min 0
                    const seconds = Math.floor(this.missionTimer / 1000);
                    this.targetTimeBonus = Math.max(0, 10000 - (seconds * 50));
                    this.currentTimeBonus = 0;
                    this.slotRunning = true;

                    if (this.missionsCompleted >= 7) {
                        this.gameState = 'game_clear';
                        this.stateTimer = 0;
                    } else {
                        this.gameState = 'mission_clear';
                    }
                    audioManager.stopBGM();
                    audioManager.playSuccess();
                }
            }
        }

        // --- Collision detection (centralized) ---
        this.collisionManager.update();
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

        // Left click or Space: Fire current weapon
        const fireRequested = this.input.mouse.left || this.input.isKeyDown('Space');
        
        if (fireRequested) {
            if (player.currentWeapon === 'missile') {
                // Missile logic
                if (player.missiles > 0 && player.missileCooldown <= 0) {
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
            } else if (player.currentWeapon === 'mg') {
                // Machine Gun logic
                if (player.mgReloadTimer <= 0 && player.mgFireTimer <= 0) {
                    const muzzleX = px + Math.cos(angle) * 12;
                    const muzzleY = py + Math.sin(angle) * 12;
                    
                    // Add random spread
                    const spread = (Math.random() - 0.5) * PLAYER_MG_SPREAD;
                    const finalAngle = angle + spread;
                    
                    this.projectiles.push(new PlayerBullet(this, muzzleX, muzzleY, finalAngle));
                    
                    player.mgFireTimer = PLAYER_MG_BURST_DELAY;
                    player.mgBurstLeft--;
                    
                    if (player.mgBurstLeft <= 0) {
                        player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
                        player.mgBurstLeft = PLAYER_MG_BURST_SIZE;
                    }
                }
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
        if (this.gameState === 'ranking_display') {
            this.screenRenderer.drawRankingDisplay(ctx, this.highScoreManager.getTop10(), this.lastRankIndex);
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

        // Pop-up Health bars for player and carrier
        // (Enemy health bars are drawn in the enemies loop below)
        if (this.player && this.player.hp !== undefined && this.player.maxHp !== undefined && this.player.alive && this.player.hp < this.player.maxHp) {
            this._drawEnemyHealthBar(ctx, this.player);
        }
        if (this.carrier && this.carrier.hp !== undefined && this.carrier.maxHp !== undefined && this.carrier.alive && this.carrier.hp < this.carrier.maxHp) {
            this._drawEnemyHealthBar(ctx, this.carrier);
        }

        // Enemies
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
            if (enemy.hp !== undefined && enemy.maxHp !== undefined && enemy.alive && enemy.hp < enemy.maxHp) {
                if (enemy.constructor.name !== 'EnemyBase' && enemy.constructor.name !== 'Landmine') {
                    this._drawEnemyHealthBar(ctx, enemy);
                }
            }
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
        } else if (this.gameState === 'game_clear') {
            this.screenRenderer.drawGameClear(ctx);
        } else if (this.gameState === 'mission_clear') {
            this.screenRenderer.drawMissionClear(ctx);
        } else if (this.gameState === 'ranking_entry') {
            this.screenRenderer.drawRankingEntry(ctx, this.playerNameInput, this.score);
        } else if (this.showMiniMap) {
            this.screenRenderer.drawMiniMap(ctx);
        }
    },

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * Advance the time-bonus count-up slot animation by one frame.
     * @param {boolean} resetTimerOnComplete - If true, resets stateTimer when slot finishes (used by game_clear).
     * @returns {boolean} true while the slot is still running (caller should return early).
     */
    _updateTimeBonusSlot(resetTimerOnComplete) {
        if (!this.slotRunning) return false;

        if (this.currentTimeBonus < this.targetTimeBonus) {
            const step = Math.max(Math.ceil((this.targetTimeBonus - this.currentTimeBonus) * 0.1), 10);
            const increase = Math.min(step, this.targetTimeBonus - this.currentTimeBonus);
            this.currentTimeBonus += increase;
            this.score += increase;
            if (this.currentTimeBonus >= this.targetTimeBonus) {
                this.currentTimeBonus = this.targetTimeBonus;
                this.slotRunning = false;
                if (resetTimerOnComplete) {
                    // Reset timer so the player can see the final score before advancing
                    this.stateTimer = 0;
                }
            }
        } else {
            this.slotRunning = false;
        }

        return true; // Still in slot (or just finished — caller checks next frame)
    },

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
        if (this.gameState === 'gameover' || this.gameState === 'game_clear') return;
        this.gameState = 'gameover';
        this.stateTimer = 0;
        audioManager.stopBGM();
        audioManager.playGameOver();
    },

    /** Draw a small callout health bar for an enemy */
    _drawEnemyHealthBar(ctx, enemy) {
        if (enemy.hp <= 0) return;
        const hpRatio = enemy.hp / enemy.maxHp;
        
        ctx.save();
        ctx.translate(enemy.x + enemy.width - 4, enemy.y - 4);

        // Draw diagonal line and horizontal line (unobtrusive)
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0); // Start near top right of enemy
        ctx.lineTo(8, -8); // Diagonal up-right
        ctx.lineTo(24, -8); // Horizontal right
        ctx.stroke();

        // Draw the gauge on the horizontal line
        const barW = 16;
        const barH = 3;
        const bx = 8;
        const by = -12; // Put it right above the horizontal line
        ctx.fillStyle = '#FF0000'; // Damage (red)
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#00FF00'; // Remaining (green)
        ctx.fillRect(bx, by, barW * hpRatio, barH);
        
        ctx.restore();
    },

    // ==========================================
    // GAME LOOP
    // ==========================================
    loop(timestamp) {
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiraling (e.g. tab was hidden)
        if (deltaTime > 50) deltaTime = 50;

        this.update(deltaTime);
        this.draw();

        // Clear one-shot input flags at end of each frame
        this.input.endFrame();

        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
Game.init();
