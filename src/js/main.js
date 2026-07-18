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
    LANDMINE_BLAST_RADIUS, LANDMINE_SCORE,
    PLAYER_MG_BURST_DELAY, PLAYER_MG_BURST_SIZE, PLAYER_MG_RELOAD_TIME, PLAYER_MG_SPREAD,
    CARRIER_PROXIMITY_ALERT_RANGE,
    GRENADE_SPEED_MIN, GRENADE_SPEED_MAX, GRENADE_SPEED_MAX_DIST,
    STAGE_PALETTES
} from './utils/Constants.js';
import { SeededRNG } from './utils/SeededRNG.js';
import { getCurrentWeek, stageSeed } from './utils/WeekSeed.js';
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
import { StageRankingManager } from './systems/StageRankingManager.js';
import { OnlineLeaderboard } from './systems/OnlineLeaderboard.js';
import { audioManager } from './audio/AudioManager.js';
import { REPAIR_KIT_HEAL } from './entities/RepairKit.js';
import { AUTO_AIM_SNAP_RADIUS, AUTO_AIM_CANCEL_THRESHOLD } from './utils/Constants.js';
import { LEADERBOARD_URL } from './utils/Constants.js';
import { getCountryCode } from './utils/geo.js';
import { MODES, cycleMode } from './utils/modes.js';
import { computeTimeBonus, buildStageResult, TIME_BONUS_BASE_MULT } from './utils/scoring.js';
import { advanceAccumulator, SIM_STEP, MAX_TICKS } from './utils/timestep.js';

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
    repairKits: [],
    autoAimUnits: [],
    missileKits: [],
    autoAimTarget: null,       // world coords {x,y} of snapped enemy, or null
    autoAimLockedEnemy: null,  // 現在ロック中の敵エンティティ参照
    grenadeTrajectory: null,   // 長押し中のグレネード軌道プレビュー {points, landX, landY}
    leftClickSuppress: false,  // グレネード投擲時の左クリック誤射防止用フラグ
    flag: null,

    // Options
    options: {
        carrierLift: true, // false = 持ち上げ無効 & 横当たり無効（上に乗るのみ可）
    },

    // Game state
    score: 0,
    debugStartMission: 0, // デバッグ用開始ミッション（0=Mission1, 6=Mission7）。本番は 0 に戻す
    missionsCompleted: 0,
    mode: 'normal',       // 'normal' | 'newtype'
    gameSpeed: MODES.normal.gameSpeed,
    simAccumulator: 0,
    simAlpha: 1,
    gameState: 'title', // 'title' | 'playing' | 'gameover' | 'mission_clear' | 'game_clear' | 'ranking_entry' | 'local_ranking_display' | 'global_ranking_display' | 'stage_ranking_display' | 'wall_of_fame_display'
    showMiniMap: false,
    miniMapAlpha: 0,
    stateTimer: 0,
    stageDisplayIndex: 0,   // which stage (0..6) the attract screen is showing
    stageDisplayTimer: 0,   // sub-timer for auto-advance
    playerNameInput: "",
    proximityAlertActive: false,

    // Time & Bonus Tracking
    totalTime: 0,
    missionTimer: 0,
    currentTimeBonus: 0,
    targetTimeBonus: 0,
    slotRunning: false,
    localRankIndex: -1,
    globalRankIndex: -1,
    stageStartScore: 0,
    stageResults: [],
    stageTop5Time: false,
    stageTop5Score: false,

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

        // Weekly deterministic seed: same ISO week => same stages for everyone.
        this.week = getCurrentWeek();
        this.weekSeed = this.week.seed;
        this.rng = new SeededRNG(stageSeed(this.weekSeed, this.missionsCompleted));

        this.map = new Map(this, this.missionsCompleted);
        this.camera = new Camera(this);
        this.hud = new HUD(this);
        this.crosshair = new Crosshair(this);

        this.collisionManager = new CollisionManager(this);
        this.spawnManager = new SpawnManager(this);
        this.stateManager = new GameStateManager(this);
        this.screenRenderer = new ScreenRenderer(this);
        this.highScoreManager = new HighScoreManager(this.week.weekId);
        this.stageRankingManager = new StageRankingManager(this.week.weekId);
        this.onlineLeaderboard = new OnlineLeaderboard(LEADERBOARD_URL);
        this.onlineData = null;                       // { weekId, ranking, fame } when loaded
        this.onlineStatus = LEADERBOARD_URL ? 'loading' : 'offline';

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
            case 'how_to_play': return this._updateHowToPlay(deltaTime);
            case 'local_ranking_display': return this._updateLocalRanking(deltaTime);
            case 'global_ranking_display': return this._updateGlobalRanking(deltaTime);
            case 'stage_ranking_display': return this._updateStageRankingDisplay(deltaTime);
            case 'wall_of_fame_display': return this._updateWallOfFameDisplay(deltaTime);
            case 'ranking_entry': return this._updateRankingEntry();
            case 'gameover': return this._updateGameOver(deltaTime);
            case 'game_clear': return this._updateGameClear(deltaTime);
            case 'mission_clear': return this._updateMissionClear();
            case 'playing': return this._updatePlaying(deltaTime);
        }
    },

    _updateTitle(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.input.isKeyPressed('ArrowLeft')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.input.isKeyPressed('ArrowRight')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
        } else if (this.input.isKeyPressed('Tab')) {
            this.options.carrierLift = !this.options.carrierLift;
        } else if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline(); // prefetch online data during how_to_play + local so GLOBAL/FAME are ready
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateHowToPlay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this.gameState = 'local_ranking_display';
            this.stateTimer = 0;
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateLocalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            if (this.onlineStatus === 'ok' && this.onlineData) {
                this.gameState = 'global_ranking_display';
            } else {
                this.gameState = 'title';
                audioManager.playTitleBGM();
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateGlobalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'stage_ranking_display';
            this.stateTimer = 0;
            this.stageDisplayIndex = 0;
            this.stageDisplayTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateStageRankingDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        this.stageDisplayTimer += deltaTime;
        if (this.stageDisplayTimer > 3000) {
            this.stageDisplayTimer = 0;
            this.stageDisplayIndex++;
            if (this.stageDisplayIndex >= 7) {
                this.gameState = 'wall_of_fame_display';
                this.stateTimer = 0;
                return;
            }
        }
        if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateWallOfFameDisplay(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    async _refreshOnline() {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) {
            this.onlineStatus = 'offline';
            return;
        }
        this.onlineStatus = 'loading';
        const res = await this.onlineLeaderboard.fetchData();
        if (res.ok) {
            this.onlineData = res;
            this.onlineStatus = 'ok';
        } else {
            this.onlineStatus = 'offline';
        }
    },

    async _submitOnline(name, score, mission, clearTime, country) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime, country });
        if (res.ok) {
            this.globalRankIndex = res.rank;
            await this._refreshOnline();
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
                const country = getCountryCode();
                // Overall weekly ranking: only recorded when it's an actual high score.
                // (A stage-only qualifier reaches naming to save per-stage records, but
                // must not be inserted into the overall ranking.)
                this.globalRankIndex = -1; // clear until this submission's own rank comes back (avoids stale highlight)
                if (this.highScoreManager.isHighScore(this.score)) {
                    this.localRankIndex = this.highScoreManager.addScore(
                        this.playerNameInput, this.score, displayMission, formattedTime, country
                    );
                    this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country);
                } else {
                    this.localRankIndex = -1;
                }
                // Persist this run's per-stage results locally (and online in Task 6).
                for (const r of this.stageResults) {
                    this.stageRankingManager.addStageResult(r.stage, {
                        name: this.playerNameInput,
                        timeMs: r.timeMs,
                        score: r.score,
                        country,
                    });
                }
                if (this.stageResults.length > 0 && this.onlineLeaderboard && this.onlineLeaderboard.url) {
                    this.onlineLeaderboard.submitStages({
                        name: this.playerNameInput,
                        country,
                        stages: this.stageResults.map((r) => ({ stage: r.stage, timeMs: r.timeMs, score: r.score })),
                    });
                }
                this.gameState = 'local_ranking_display';
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
        // Timers advance in real time (mode does not slow the clock).
        this.totalTime += deltaTime;
        this.missionTimer += deltaTime;

        // Per-frame input / one-shots (run once regardless of tick count).
        // ロック中: 内部マウス座標をクロスヘアのスクリーン位置に固定
        if (this.input.crosshairLocked) {
            this.input.mouse.x = this.input.lockedWorldX - this.camera.x;
            this.input.mouse.y = this.input.lockedWorldY - this.camera.y;
        }
        this._updateMiniMap();
        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.switchWeapon();
        }
        this._handleDocking();
        this._handleShooting();

        // Fixed-timestep physics, scaled by gameSpeed.
        const { ticks, remainder, alpha } = advanceAccumulator(
            this.simAccumulator, deltaTime * this.gameSpeed, SIM_STEP, MAX_TICKS
        );
        for (let t = 0; t < ticks; t++) this._simulationTick();
        this.simAccumulator = remainder;
        this.simAlpha = alpha;
    },

    _simulationTick() {
        this._updateCarrier();
        this._updatePlayer();
        this._updateCamera();
        this._updateProjectiles();
        this._updateParticles();
        this._updateLandmines();
        this._updateRepairKits();
        this._updateAutoAimUnits();
        this._updateMissileKits();
        this._updateAutoAim();
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
                        if (proj.isPlayerOwned) this.addScore(LANDMINE_SCORE);
                        break;
                    }
                }
            }

            if (!mine.alive) this.landmines.splice(i, 1);
        }
    },

    _updateRepairKits() {
        for (let i = this.repairKits.length - 1; i >= 0; i--) {
            this.repairKits[i].update();
            if (!this.repairKits[i].alive) this.repairKits.splice(i, 1);
        }
    },

    _updateAutoAimUnits() {
        for (let i = this.autoAimUnits.length - 1; i >= 0; i--) {
            this.autoAimUnits[i].update();
            if (!this.autoAimUnits[i].alive) this.autoAimUnits.splice(i, 1);
        }
    },

    _updateMissileKits() {
        for (let i = this.missileKits.length - 1; i >= 0; i--) {
            this.missileKits[i].update();
            if (!this.missileKits[i].alive) this.missileKits.splice(i, 1);
        }
    },

    _updateAutoAim() {
        const player = this.player;
        this.autoAimTarget = null;

        // 常にマウス位置を記録しておく（ピックアップ直後に古い位置と比較して即キャンセルされるのを防ぐ）
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        const dx = Math.abs(mx - (this._prevMouseX ?? mx));
        const dy = Math.abs(my - (this._prevMouseY ?? my));
        this._prevMouseX = mx;
        this._prevMouseY = my;

        if (!player || !player.alive || player.docked || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            return;
        }

        player.autoAimTimer--;

        // マウスを動かしている間はスナップを抑制してロックも解除（タイマーは継続）
        if (dx + dy > AUTO_AIM_CANCEL_THRESHOLD) {
            this.autoAimLockedEnemy = null;
            return;
        }

        // ロック中の敵が生存していればそのまま追跡
        if (this.autoAimLockedEnemy && this.autoAimLockedEnemy.alive) {
            const e = this.autoAimLockedEnemy;
            this.autoAimTarget = {
                x: e.x + (e.width || 0) / 2,
                y: e.y + (e.height || 0) / 2
            };
            return;
        }

        // ロック対象なし: マウスのワールド座標に最も近い敵を新規検索
        const mouseWorld = this.input.getMouseWorld(this.camera);
        let bestEnemy = null;
        let bestDist = AUTO_AIM_SNAP_RADIUS;
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            const ex = enemy.x + (enemy.width || 0) / 2;
            const ey = enemy.y + (enemy.height || 0) / 2;
            const d = Math.hypot(ex - mouseWorld.x, ey - mouseWorld.y);
            if (d < bestDist) {
                bestDist = d;
                bestEnemy = enemy;
            }
        }
        if (bestEnemy) {
            this.autoAimLockedEnemy = bestEnemy;
            this.autoAimTarget = {
                x: bestEnemy.x + (bestEnemy.width || 0) / 2,
                y: bestEnemy.y + (bestEnemy.height || 0) / 2
            };
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

        // Time bonus: the live decaying value at the moment of capture (see liveTimeBonus).
        this.targetTimeBonus = this.liveTimeBonus().current;
        this.currentTimeBonus = 0;

        // Record this stage's result (finalised: kills + flag + time bonus).
        const clearedStage = this.missionsCompleted; // already incremented above (1..7)
        const stageResult = buildStageResult({
            stage: clearedStage,
            scoreNow: this.score,
            stageStartScore: this.stageStartScore,
            targetTimeBonus: this.targetTimeBonus,
            timeMs: this.missionTimer,
        });
        this.stageResults.push(stageResult);

        // Preliminary "would this make top 5?" notice for the mission-clear screen.
        // Prefer online stage rankings if loaded, else local manager.
        this.stageTop5Time = this._wouldStageRankTime(clearedStage, stageResult.timeMs);
        this.stageTop5Score = this._wouldStageRankScore(clearedStage, stageResult.score);

        this.slotRunning = true;

        this.gameState = this.missionsCompleted >= 7 ? 'game_clear' : 'mission_clear';
        this.stateTimer = 0;
        audioManager.stopBGM();
        audioManager.playSuccess();
    },

    _onlineStageEntry(stage) {
        const sr = this.onlineData && this.onlineData.stageRankings;
        if (!Array.isArray(sr)) return null;
        return sr.find((e) => e.stage === stage) || null;
    },

    _wouldStageRankTime(stage, timeMs) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online.time || [];
            return list.length < 5 || timeMs < list[list.length - 1].timeMs;
        }
        return this.stageRankingManager ? this.stageRankingManager.wouldRankTime(stage, timeMs) : false;
    },

    _wouldStageRankScore(stage, score) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online.score || [];
            return list.length < 5 || score > list[list.length - 1].score;
        }
        return this.stageRankingManager ? this.stageRankingManager.wouldRankScore(stage, score) : false;
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

            // リペアキットを消費してキャリアを修理
            while (player.repairKits > 0) {
                if (carrier.hp < carrier.maxHp) {
                    carrier.hp = Math.min(carrier.maxHp, carrier.hp + REPAIR_KIT_HEAL);
                } else {
                    carrier.lives++;
                }
                player.repairKits--;
            }
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

        const targetWorld = this.autoAimTarget || this.input.getTargetWorld(this.camera);
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);

        // 左クリックが離されたら通常兵器の抑制を解除する
        if (!this.input.mouse.left) {
            this.leftClickSuppress = false;
        }

        // Primary fire（長押し中および左クリック抑制中は通常兵器を抑制）
        if (!this.leftClickSuppress && !this.grenadeWasHeld && (this.input.mouse.left || this.input.isKeyDown('Space'))) {
            if (player.currentWeapon === 'missile') this._fireMissile(player, px, py, angle);
            else if (player.currentWeapon === 'mg') this._fireMachineGun(player, px, py, angle);
        }

        // Secondary fire: Grenade（距離に応じた投擲強度）
        // ★ 短押し/長押しの区別は「押した瞬間」には不可能なため、判定はリリース時に行う
        // 長押し閾値: 10フレーム（約0.17秒）
        const GRENADE_HOLD_THRESHOLD = 10;

        if (this.input.isRightClickHeld() && player.grenades > 0) {
            const dist = Math.hypot(targetWorld.x - px, targetWorld.y - py);
            const ratio = Math.min(dist / GRENADE_SPEED_MAX_DIST, 1.0);
            const grenadeSpeed = GRENADE_SPEED_MIN + ratio * (GRENADE_SPEED_MAX - GRENADE_SPEED_MIN);

            if (this.input.rightHoldFrames >= GRENADE_HOLD_THRESHOLD) {
                // 長押し確定: 軌道プレビューを表示（毎フレーム更新）
                this._grenadeHeldAngle = angle;
                this._grenadeHeldSpeed = grenadeSpeed;
                this._grenadeHeldPx = px + Math.cos(angle) * 10;
                this._grenadeHeldPy = py + Math.sin(angle) * 10;
                this.grenadeWasHeld = true;
                this.grenadeTrajectory = this._calcGrenadeTrajectory(
                    this._grenadeHeldPx, this._grenadeHeldPy,
                    angle, grenadeSpeed
                );

                // 長押し中に左クリックで投擲
                if (this.input.isLeftClickPressed()) {
                    this.projectiles.push(new Grenade(
                        this,
                        this._grenadeHeldPx, this._grenadeHeldPy,
                        this._grenadeHeldAngle, this._grenadeHeldSpeed
                    ));
                    player.grenades--;
                    audioManager.playExplosion(false);
                    this.grenadeTrajectory = null;
                    this.grenadeWasHeld = false;
                    this._grenadeHeldAngle = null;
                    this._grenadeHeldSpeed = null;
                    this._grenadeHeldPx = null;
                    this._grenadeHeldPy = null;

                    // 通常兵器の誤射を避けるため、左クリックを離すまで通常射撃を抑制するフラグを立てる
                    this.leftClickSuppress = true;
                }
            }
            // 閾値未満の間は何もしない（まだ短押しか長押しか判断できない）

        } else {
            // 右クリックを離した瞬間
            if (this.input.isRightClickReleased() && player.grenades > 0) {
                if (!this.grenadeWasHeld) {
                    // 短押し確定（閾値未満でリリース）: 投擲
                    const dist = Math.hypot(targetWorld.x - px, targetWorld.y - py);
                    const ratio = Math.min(dist / GRENADE_SPEED_MAX_DIST, 1.0);
                    const grenadeSpeed = GRENADE_SPEED_MIN + ratio * (GRENADE_SPEED_MAX - GRENADE_SPEED_MIN);
                    this.projectiles.push(new Grenade(this, px + Math.cos(angle) * 10, py + Math.sin(angle) * 10, angle, grenadeSpeed));
                    player.grenades--;
                    audioManager.playExplosion(false);
                }
                // 長押しのリリースはキャンセル（左クリックせずに離した場合）
            }
            // 状態をクリア
            this.grenadeTrajectory = null;
            this.grenadeWasHeld = false;
            this._grenadeHeldAngle = null;
            this._grenadeHeldSpeed = null;
            this._grenadeHeldPx = null;
            this._grenadeHeldPy = null;
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
        if (this.gameState === 'how_to_play') {
            this.screenRenderer.drawHowToPlay(ctx, this.stateTimer < 10000 ? 0 : 1);
            return;
        }
        if (this.gameState === 'local_ranking_display') {
            this.screenRenderer.drawLocalRanking(ctx, this.highScoreManager.getTop10(), this.localRankIndex, this.week.weekId);
            return;
        }
        if (this.gameState === 'global_ranking_display') {
            const data = this.onlineData || { ranking: [], weekId: this.week.weekId };
            this.screenRenderer.drawGlobalRanking(ctx, data.ranking, this.globalRankIndex, data.weekId);
            return;
        }
        if (this.gameState === 'stage_ranking_display') {
            const idx = this.stageDisplayIndex;
            const online = this.onlineData && Array.isArray(this.onlineData.stageRankings)
                ? this.onlineData.stageRankings.find((e) => e.stage === idx + 1)
                : null;
            const data = online
                ? { time: online.time || [], score: online.score || [] }
                : this.stageRankingManager.getStage(idx + 1);
            this.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            const fame = (this.onlineData && this.onlineData.fame) || [];
            this.screenRenderer.drawWallOfFame(ctx, fame);
            return;
        }

        this._drawWorld(ctx);
        this.hud.draw(ctx);
        this.crosshair.draw(ctx);
        this._drawOverlays(ctx);
    },

    _drawWorld(ctx) {
        const alpha = (this.gameState === 'playing') ? this.simAlpha : 1;
        const camX = this.camera.renderX(alpha);
        const camY = this.camera.renderY(alpha);

        ctx.save();
        ctx.translate(-camX, -camY);

        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);

        this.map.draw(ctx);
        if (this.carrier) this.carrier.draw(ctx);
        if (this.player) this.player.draw(ctx);

        for (const proj of this.projectiles) proj.draw(ctx);
        for (const particle of this.particles) particle.draw(ctx);
        for (const mine of this.landmines) mine.draw(ctx);
        for (const kit of this.repairKits) kit.draw(ctx);
        for (const unit of this.autoAimUnits) unit.draw(ctx);
        for (const kit of this.missileKits) kit.draw(ctx);

        // グレネード軌道プレビュー描画（長押し中）
        if (this.grenadeTrajectory) {
            this._drawGrenadeTrajectory(ctx, this.grenadeTrajectory);
        }

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
        // Eligible to name if the overall run is a high score OR any cleared stage
        // would make its per-stage top 5 (so partial runs can still leave a record).
        const eligible = this.highScoreManager.isHighScore(this.score) || this._anyStageWouldRank();
        if (eligible) {
            this.gameState = 'ranking_entry';
            this.playerNameInput = "";
            audioManager.playRankingBGM();
        } else {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        }
    },

    /** True if any buffered stage result would rank top 5 (by time or score). */
    _anyStageWouldRank() {
        for (const r of this.stageResults) {
            if (this._wouldStageRankTime(r.stage, r.timeMs) || this._wouldStageRankScore(r.stage, r.score)) {
                return true;
            }
        }
        return false;
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

    /**
     * Live time bonus for the current stage: the amount you'd be awarded if you
     * captured the flag right now. Decays as missionTimer grows (to 0). `max` is
     * the value at 0 elapsed, used by the HUD to colour the readout by remaining %.
     */
    liveTimeBonus() {
        if (!this.map) return { current: 0, max: 0 };
        const totalTiles = this.map.cols * this.map.rows;
        const max = Math.floor(totalTiles / 100) * 100 * TIME_BONUS_BASE_MULT;
        const current = computeTimeBonus({
            totalTiles,
            elapsedMs: this.missionTimer,
            decayPerSec: MODES[this.mode].timeBonusDecay,
        });
        return { current, max };
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

    /**
     * グレネードの物理軌道を事前シミュレーションして計算する
     * @returns {{ points: {x,y}[], landX: number, landY: number }}
     */
    _calcGrenadeTrajectory(startX, startY, angle, speed) {
        const TRAJ_GRAVITY           = 0.20;
        const TRAJ_MAX_FALLING_SPEED = 6;
        const TRAJ_BOUNCE            = 0.2;
        const TRAJ_FRICTION          = 0.9;
        const TRAJ_LIFETIME          = 90;

        const map = this.map;
        const points = [];
        let x = startX, y = startY;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        let landX = x, landY = y;

        for (let i = 0; i < TRAJ_LIFETIME; i++) {
            vy += TRAJ_GRAVITY;
            if (vy > TRAJ_MAX_FALLING_SPEED) vy = TRAJ_MAX_FALLING_SPEED;

            let nextX = x + vx;
            let nextY = y + vy;

            if (map.isSolidAtPixel(nextX, y)) {
                vx *= -TRAJ_BOUNCE;
                nextX = x + vx;
            }
            x = nextX;

            if (map.isSolidAtPixel(x, nextY)) {
                if (Math.abs(vy) > 0.5) {
                    vy *= -TRAJ_BOUNCE;
                } else {
                    vy = 0;
                    vx *= TRAJ_FRICTION;
                }
                nextY = y + vy;
            }
            y = nextY;

            // 3フレームおきに軌跡の点を記録
            if (i % 3 === 0) {
                points.push({ x, y });
            }

            landX = x;
            landY = y;

            // マップ外に出たら終了
            if (x < 0 || x > map.width || y < 0 || y > map.height) break;
        }

        return { points, landX, landY };
    },

    /**
     * グレネード軌道プレビューを赤い点線と×マークで描画する
     */
    _drawGrenadeTrajectory(ctx, trajectory) {
        const { points, landX, landY } = trajectory;
        if (points.length < 2) return;

        ctx.save();

        // 細い赤い点線で軌道を描画
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // 爆発位置に×マークを描画
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 40, 40, 1.0)';
        ctx.lineWidth = 1.5;
        const s = 5;
        ctx.beginPath();
        ctx.moveTo(landX - s, landY - s);
        ctx.lineTo(landX + s, landY + s);
        ctx.moveTo(landX + s, landY - s);
        ctx.lineTo(landX - s, landY + s);
        ctx.stroke();

        // 薄い円でわかりやすくする
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(landX, landY, 8, 0, Math.PI * 2);
        ctx.stroke();

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
