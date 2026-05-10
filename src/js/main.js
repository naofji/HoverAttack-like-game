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
    PLAYER_MG_BURST_DELAY, PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME, PLAYER_MG_SPREAD,
    CARRIER_PROXIMITY_ALERT_RANGE
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
    projectiles: [],
    particles: [],
    landmines: [],
    enemies: [],
    enemyBullets: [],
    flag: null,

    // Game state
    score: 0,
    missionsCompleted: 0, // Set to 6 to start from Mission 7 for debug
    gameState: 'title', // 'title' | 'playing' | 'gameover' | 'mission_clear' | 'game_clear' | 'ranking_entry' | 'ranking_display'
    showMiniMap: false,
    miniMapAlpha: 0,
    stateTimer: 0,
    playerNameInput: "",
    proximityAlertActive: false,

    // Time & Bonus Tracking
    totalTime: 0,
    missionTimer: 0,
    currentTimeBonus: 0,
    targetTimeBonus: 0,
    slotRunning: false,
    lastRankIndex: -1,

    // ==========================================
    // INITIALIZATION
    // ==========================================
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        console.log('Hover Attack v1.0 Initializing...');

        this.input = new Input(this.canvas);
        this.map = new Map(this, this.missionsCompleted);
        this.camera = new Camera(this);
        this.hud = new HUD(this);
        this.crosshair = new Crosshair(this);

        this.collisionManager = new CollisionManager(this);
        this.spawnManager = new SpawnManager(this);
        this.stateManager = new GameStateManager(this);
        this.screenRenderer = new ScreenRenderer(this);
        this.highScoreManager = new HighScoreManager();

        const spawnPos = this.spawnManager.findSpawnPosition(5, 5, 12, 10);
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);
        this.player = new Player(this, this.carrier.x + this.carrier.width / 2 - 10, this.carrier.y - 24);
        this.player.docked = true;

        this.spawnManager.spawnLandmines();
        this.spawnManager.spawnEnemies();

        this.camera.follow(this.player);
        this.camera.snapToTarget();

        console.log('Hover Attack v1.0 Ready!');
        window.Game = this;

        audioManager.playTitleBGM();
        requestAnimationFrame(this.loop.bind(this));
    },

    // ==========================================
    // UPDATE
    // ==========================================
    update(deltaTime) {
        // Lock-on toggle works in all states
        if (this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight')) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }

        this._updateGameState(deltaTime);
    },

    // ==========================================
    // GAME STATE MACHINE
    // ==========================================
    _updateGameState(deltaTime) {
        switch (this.gameState) {
            case 'title': return this._updateTitle(deltaTime);
            case 'ranking_display': return this._updateRankingDisplay(deltaTime);
            case 'ranking_entry': return this._updateRankingEntry();
            case 'gameover': return this._updateGameOver(deltaTime);
            case 'game_clear': return this._updateGameClear(deltaTime);
            case 'mission_clear': return this._updateMissionClear();
            case 'playing': return this._updatePlaying(deltaTime);
        }
    },

    _updateTitle(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 8000) {
            this.gameState = 'ranking_display';
            this.stateTimer = 0;
            this.lastRankIndex = -1;
            audioManager.playTitleBGM();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM();
        }
    },

    _updateRankingDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM();
        }
    },

    _updateRankingEntry() {
        const chars = this.input.getTypedChars();
        for (const c of chars) {
            if (c === 'Backspace') {
                this.playerNameInput = this.playerNameInput.slice(0, -1);
            } else if (c === 'Enter') {
                if (this.playerNameInput.trim().length === 0) this.playerNameInput = 'AAA';
                const displayMission = Math.min(7, this.missionsCompleted + 1);
                const formattedTime = this.missionsCompleted >= 7 ? this._formatTime(this.totalTime) : null;
                this.lastRankIndex = this.highScoreManager.addScore(
                    this.playerNameInput, this.score, displayMission, formattedTime
                );
                this.gameState = 'ranking_display';
                this.stateTimer = 0;
                audioManager.playTitleBGM();
            } else if (this.playerNameInput.length < 10) {
                this.playerNameInput += c.toUpperCase();
            }
        }
    },

    _updateGameOver(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 4000) this._tryGoToRanking();
    },

    _updateGameClear(deltaTime) {
        this.stateTimer += deltaTime;
        if (this._updateTimeBonusSlot(true)) return;
        if (this.stateTimer > 7000) this._tryGoToRanking();
    },

    _updateMissionClear() {
        if (this._updateTimeBonusSlot(false)) return;
        if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed() || this.input.getTypedChars().length > 0) {
            this.gameState = 'playing';
            this.stateManager.nextMission();
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    // ==========================================
    // PLAYING STATE UPDATE
    // ==========================================
    _updatePlaying(deltaTime) {
        this.totalTime += deltaTime;
        this.missionTimer += deltaTime;

        this._updateMiniMap();

        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.switchWeapon();
        }

        this._handleDocking();
        this._handleShooting();
        this._updateCarrier();
        this._updatePlayer();
        this._updateCamera();
        this._updateProjectiles();
        this._updateParticles();
        this._updateLandmines();
        this.map.update();
        this._updateEnemies();
        this._checkMissionClear();
        this.collisionManager.update();
        this._updateProximityAlert();
    },

    _updateMiniMap() {
        if (this.input.isKeyPressed('KeyR')) this.showMiniMap = !this.showMiniMap;

        // Auto-close on movement input
        if (this.showMiniMap && (this.input.isKeyDown('KeyA') || this.input.isKeyDown('KeyD') || this.input.isKeyDown('KeyW'))) {
            this.showMiniMap = false;
        }

        const fadeSpeed = 0.08;
        this.miniMapAlpha = this.showMiniMap
            ? Math.min(1.0, this.miniMapAlpha + fadeSpeed)
            : Math.max(0, this.miniMapAlpha - fadeSpeed);
    },

    _updateCarrier() {
        if (!this.carrier) return;
        this.carrier.update();
        if (!this.carrier.alive && this.carrier.lives > 0) {
            this.stateManager.respawnCarrier();
        } else if (!this.carrier.alive && this.carrier.lives <= 0) {
            this._triggerGameOver();
        }
    },

    _updatePlayer() {
        if (!this.player) return;
        this.player.update();
        if (!this.player.alive && this.player.lives > 0) {
            this.stateManager.respawnPlayer();
        } else if (!this.player.alive && this.player.lives <= 0) {
            this._triggerGameOver();
        }
    },

    _updateCamera() {
        if (this.player && !this.player.docked && this.player.alive) {
            this.camera.follow(this.player);
        } else if (this.carrier && this.carrier.alive) {
            this.camera.follow(this.carrier);
        }
        this.camera.update();
    },

    _updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update();
            if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
        }
    },

    _updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (!this.particles[i].alive) this.particles.splice(i, 1);
        }
    },

    _updateLandmines() {
        for (let i = this.landmines.length - 1; i >= 0; i--) {
            const mine = this.landmines[i];
            mine.update();

            if (this.player && this.player.alive && !this.player.docked &&
                this.player.invincibleTimer <= 0 && mine.collidesWith(this.player)) {
                mine.detonate();
            }

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

            if (!mine.alive) this.landmines.splice(i, 1);
        }
    },

    _updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update();
            if (!this.enemies[i].alive) this.enemies.splice(i, 1);
        }
    },

    _checkMissionClear() {
        if (this.base && !this.base.alive && !this.flag && this.gameState === 'playing') {
            this.flag = new Flag(this, this.base.x + this.base.width / 2 - 6, this.base.y + this.base.height - 20);
        }

        if (!this.flag) return;
        this.flag.update();

        if (this.player && this.player.alive && !this.player.docked && this.flag.collidesWith(this.player)) {
            this._onFlagCaptured();
        }
    },

    _onFlagCaptured() {
        this.score += this.flag.scoreValue;
        this.flag = null;
        this.missionsCompleted++;

        // Time bonus: proportional to map area, decays 50pts/sec
        const totalTiles = this.map.cols * this.map.rows;
        const baseBonus = Math.floor(totalTiles / 100) * 100;
        const seconds = Math.floor(this.missionTimer / 1000);
        this.targetTimeBonus = Math.max(0, baseBonus - (seconds * 50));
        this.currentTimeBonus = 0;
        this.slotRunning = true;

        this.gameState = this.missionsCompleted >= 7 ? 'game_clear' : 'mission_clear';
        this.stateTimer = 0;
        audioManager.stopBGM();
        audioManager.playSuccess();
    },

    // ==========================================
    // DOCKING LOGIC
    // ==========================================
    _handleDocking() {
        const player = this.player;
        const carrier = this.carrier;
        if (!player || !carrier || !player.alive || !carrier.alive) return;

        // Dock
        if (this.input.isKeyPressed('KeyS') && !player.docked && carrier.canDock(player)) {
            player.docked = true;
            player.vx = 0;
            player.vy = 0;
            player.resupply();
            player.x = carrier.x + carrier.width / 2 - player.width / 2;
            player.y = carrier.y - player.height;
        }

        // Undock — check head clearance before launching
        if (this.input.isKeyPressed('KeyW') && player.docked) {
            const checkY = player.y - 4;
            const headClear = !this.map.isSolidAtPixel(player.x + 2, checkY) &&
                !this.map.isSolidAtPixel(player.x + player.width - 2, checkY);
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
        if (player.crouching || player.stunTimer > 0) return;

        const targetWorld = this.input.getTargetWorld(this.camera);
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);

        // Primary fire
        if (this.input.mouse.left || this.input.isKeyDown('Space')) {
            if (player.currentWeapon === 'missile') this._fireMissile(player, px, py, angle);
            else if (player.currentWeapon === 'mg') this._fireMachineGun(player, px, py, angle);
        }

        // Secondary fire: Grenade
        if (this.input.isRightClickPressed() && player.grenades > 0) {
            this.projectiles.push(new Grenade(this, px + Math.cos(angle) * 10, py + Math.sin(angle) * 10, angle));
            player.grenades--;
            audioManager.playExplosion(false);
        }
    },

    _fireMissile(player, px, py, angle) {
        if (player.missiles <= 0) {
            player.currentWeapon = 'mg';
            player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
            audioManager.playSwitch();
            return;
        }
        if (player.missileCooldown > 0) return;

        const active = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
        if (active >= MISSILE_MAX_ON_SCREEN) return;

        this.projectiles.push(new Missile(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, angle, true));
        player.missiles--;
        player.missileCooldown = 15;
        audioManager.playMissile();

        if (player.missiles <= 0) {
            player.currentWeapon = 'mg';
            player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
            audioManager.playSwitch();
        }
    },

    _fireMachineGun(player, px, py, angle) {
        if (player.mgReloadTimer > 0 || player.mgFireTimer > 0) return;

        const finalAngle = angle + (Math.random() - 0.5) * PLAYER_MG_SPREAD;
        this.projectiles.push(new PlayerBullet(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, finalAngle));

        player.mgFireTimer = PLAYER_MG_BURST_DELAY;
        player.mgBurstLeft--;

        if (player.mgBurstLeft <= 0) {
            player.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
            player.mgBurstLeft = PLAYER_MG_BURST_SIZE;
        }
    },

    // ==========================================
    // DRAW
    // ==========================================
    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Full-screen states — skip world rendering
        if (this.gameState === 'title') {
            this.screenRenderer.drawTitleScreen(ctx);
            return;
        }
        if (this.gameState === 'ranking_display') {
            this.screenRenderer.drawRankingDisplay(ctx, this.highScoreManager.getTop10(), this.lastRankIndex);
            return;
        }

        this._drawWorld(ctx);
        this.hud.draw(ctx);
        this.crosshair.draw(ctx);
        this._drawOverlays(ctx);
    },

    _drawWorld(ctx) {
        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);

        this.map.draw(ctx);
        if (this.carrier) this.carrier.draw(ctx);
        if (this.player) this.player.draw(ctx);

        for (const proj of this.projectiles) proj.draw(ctx);
        for (const particle of this.particles) particle.draw(ctx);
        for (const mine of this.landmines) mine.draw(ctx);

        // HP bars for player and carrier
        this._drawHpBarIfDamaged(ctx, this.player);
        this._drawHpBarIfDamaged(ctx, this.carrier);

        // Enemies and their HP bars
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
            if (enemy.alive && enemy.constructor.name !== 'EnemyBase' && enemy.constructor.name !== 'Landmine') {
                this._drawHpBarIfDamaged(ctx, enemy);
            }
        }

        for (const bullet of this.enemyBullets) bullet.draw(ctx);
        if (this.flag) this.flag.draw(ctx);

        ctx.restore();
    },

    _drawOverlays(ctx) {
        if (this.gameState === 'gameover') {
            this.screenRenderer.drawGameOver(ctx);
        } else if (this.gameState === 'game_clear') {
            this.screenRenderer.drawGameClear(ctx);
        } else if (this.gameState === 'mission_clear') {
            this.screenRenderer.drawMissionClear(ctx);
        } else if (this.gameState === 'ranking_entry') {
            this.screenRenderer.drawRankingEntry(ctx, this.playerNameInput, this.score);
        } else if (this.showMiniMap || this.miniMapAlpha > 0) {
            this.screenRenderer.drawMiniMap(ctx, this.miniMapAlpha);
        }
    },

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * Advance the time-bonus count-up animation by one frame.
     * @param {boolean} resetTimerOnComplete - If true, resets stateTimer when done (used by game_clear).
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
                if (resetTimerOnComplete) this.stateTimer = 0;
            }
        } else {
            this.slotRunning = false;
        }

        return true;
    },

    /** Navigate to ranking entry if high score, otherwise return to title */
    _tryGoToRanking() {
        if (this.highScoreManager.isHighScore(this.score)) {
            this.gameState = 'ranking_entry';
            this.playerNameInput = "";
            audioManager.playRankingBGM();
        } else {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        }
    },

    /** Returns true if any key/click input was pressed this frame */
    _anyKeyOrClick() {
        return this.input.getTypedChars().length > 0
            || this.input.isLeftClickPressed()
            || this.input.isRightClickPressed();
    },

    /** Format milliseconds to "MM:SS.XX" string */
    _formatTime(ms) {
        const mm = Math.floor(ms / 60000).toString().padStart(2, '0');
        const ss = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
        return `${mm}:${ss}.${xx}`;
    },

    /** Spawn explosion particles and chain-detonate nearby landmines */
    spawnExplosion(x, y, size) {
        this.particles.push(...createExplosion(x, y, size));
        audioManager.playExplosion(size > 10);

        for (const mine of this.landmines) {
            if (!mine.alive) continue;
            const dx = (mine.x + mine.width / 2) - x;
            const dy = (mine.y + mine.height / 2) - y;
            if (dx * dx + dy * dy <= LANDMINE_BLAST_RADIUS * LANDMINE_BLAST_RADIUS) mine.detonate();
        }
    },

    /** Spawn damage sparks at position */
    spawnSparks(x, y) {
        this.particles.push(...createSparks(x, y));
    },

    /** Spawn heavy damage effect (sparks + sound) */
    spawnHeavyDamage(x, y) {
        this.spawnSparks(x, y);
        audioManager.playHeavyDamage();
    },

    /** Add points to the score */
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

    /** Draw HP bar only if the entity exists and is damaged */
    _drawHpBarIfDamaged(ctx, entity) {
        if (!entity || entity.hp === undefined || entity.maxHp === undefined) return;
        if (!entity.alive || entity.hp >= entity.maxHp) return;
        this._drawEnemyHealthBar(ctx, entity);
    },

    /** Draw a small callout health bar above an entity */
    _drawEnemyHealthBar(ctx, enemy) {
        if (enemy.hp <= 0) return;
        const hpRatio = enemy.hp / enemy.maxHp;

        ctx.save();
        ctx.translate(enemy.x + enemy.width - 4, enemy.y - 4);

        // Callout line: diagonal → horizontal
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, -8);
        ctx.lineTo(24, -8);
        ctx.stroke();

        // HP gauge
        const barW = 16, barH = 3, bx = 8, by = -12;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(bx, by, barW * hpRatio, barH);

        ctx.restore();
    },

    // ==========================================
    // GAME LOOP
    // ==========================================

    _updateProximityAlert() {
        if (!this.carrier || !this.carrier.alive || this.gameState !== 'playing') {
            this.proximityAlertActive = false;
            return;
        }

        const cx = this.carrier.x + this.carrier.width / 2;
        const cy = this.carrier.y + this.carrier.height / 2;
        const rangeSq = CARRIER_PROXIMITY_ALERT_RANGE * CARRIER_PROXIMITY_ALERT_RANGE;

        let foundThreat = false;

        // Check for enemies
        for (const e of this.enemies) {
            if (!e.alive) continue;
            const ex = e.x + (e.width || 0) / 2;
            const ey = e.y + (e.height || 0) / 2;
            const dSq = (cx - ex) ** 2 + (cy - ey) ** 2;
            if (dSq < rangeSq) {
                foundThreat = true;
                break;
            }
        }

        if (!foundThreat) {
            // Check for enemy bullets, missiles, etc.
            for (const b of this.enemyBullets) {
                if (!b.alive) continue;
                const dSq = (cx - b.x) ** 2 + (cy - b.y) ** 2;
                if (dSq < rangeSq) {
                    foundThreat = true;
                    break;
                }
            }
        }

        this.proximityAlertActive = foundThreat;

        // Play alarm sound periodically while threat is near
        if (this.proximityAlertActive) {
            if (Math.floor(this.totalTime / 16) % 30 === 0) {
                audioManager.playAlarm();
            }
        }
    },

    loop(timestamp) {
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiral-of-death when tab was hidden
        if (deltaTime > 50) deltaTime = 50;

        this.update(deltaTime);
        this.draw();

        this.input.endFrame();
        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
Game.init();
