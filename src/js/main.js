// ============================================
// Main Game Entry Point - v1.0
// ============================================

// Guarded so this module can be imported in a DOM-less test environment
// (e.g. `node --test`) purely to unit-test plain methods on `Game`.
if (typeof window !== 'undefined') {
    window.onerror = function (msg, url, loc) {
        const div = document.createElement('div');
        div.style.position = 'absolute'; div.style.zIndex = '9999'; div.style.background = 'red';
        div.style.color = 'white'; div.style.padding = '10px'; div.style.fontSize = '20px';
        div.textContent = `ERROR: ${msg.toString()} at ${loc}`;
        document.body.appendChild(div);
    };
}

import { Input } from './utils/Input.js';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    MISSILE_MAX_ON_SCREEN, COLOR_CAVE_BG,
    LANDMINE_BLAST_RADIUS, LANDMINE_SCORE,
    PLAYER_MG_BURST_DELAY, PLAYER_MG_SPREAD,
    CARRIER_PROXIMITY_ALERT_RANGE, CARRIER_SPEED,
    GRENADE_SPEED_MIN, GRENADE_SPEED_MAX, GRENADE_SPEED_MAX_DIST,
    STAGE_PALETTES, DEBRIS_MAX_ACTIVE, DEATH_HOLD_FRAMES,
    VOLUME_HUD_FRAMES,
    AUTO_AIM_SNAP_RADIUS, AUTO_AIM_CANCEL_THRESHOLD,
    AUTO_AIM_LEAD_MAX_TICKS, AUTO_AIM_LEAD_STRENGTH,
    AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE,
    MISSILE_SPEED, PLAYER_MG_SPEED,
    LEADERBOARD_URL,
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
import { createExplosion, createSparks } from './entities/Particle.js';
import { SmokeScreen } from './entities/SmokeScreen.js';
import { buildDebris, trimDebris } from './entities/debris/index.js';
import { Flag } from './entities/Flag.js';
import { EnemyAttacker } from './entities/EnemyAttacker.js';
import { EnemyDrone } from './entities/EnemyDrone.js';
import { HUD } from './ui/HUD.js';
import { Crosshair } from './ui/Crosshair.js';
import { ScreenRenderer } from './ui/ScreenRenderer.js';
import { CollisionManager } from './systems/CollisionManager.js';
import { SpawnManager } from './systems/SpawnManager.js';
import { GameStateManager } from './systems/GameStateManager.js';
import { DeathHold } from './systems/DeathHold.js';
import { HighScoreManager } from './systems/HighScoreManager.js';
import { StageRankingManager, pickStageRanking } from './systems/StageRankingManager.js';
import { OnlineLeaderboard } from './systems/OnlineLeaderboard.js';
import { audioManager } from './audio/AudioManager.js';
import { REPAIR_KIT_HEAL } from './entities/RepairKit.js';
import { predictLeadPoint, AimLeadTracker } from './utils/aimLead.js';
import { getCountryCode } from './utils/geo.js';
import { formatClock } from './utils/formatTime.js';
import { nearestHoveringEnemy } from './utils/audioFalloff.js';
import { isEnemyConcealed } from './utils/concealment.js';
import { MODES, cycleMode } from './utils/modes.js';
import { computeTimeBonus, buildStageResult, TIME_BONUS_BASE_MULT } from './utils/scoring.js';
import { advanceAccumulator, SIM_STEP, MAX_TICKS } from './utils/timestep.js';
import { snapshotEntity, interpolateEntity, restoreEntity } from './utils/renderInterp.js';

// ============================================
// Game Object
// ============================================

/** Screens that make up the title/attract-mode loop, in cycle order. */
export const DEMO_CYCLE_STATES = [
    'title', 'how_to_play', 'local_ranking_display',
    'global_ranking_display', 'stage_ranking_display', 'wall_of_fame_display'
];

/**
 * デモループの各画面の中身の描画。draw() から状態名で引く。
 *
 * この表に載っている状態は「世界を描かない全画面表示」であり、描画の後に
 * 必ず位置ドットが重なって終わる。その共通部分は draw() 側が持つので、
 * ここには画面ごとに違うところだけを書く。画面を足すときはここに1行。
 * @type {Object<string, (game: typeof Game, ctx: CanvasRenderingContext2D) => void>}
 */
export const DEMO_SCREEN_DRAWERS = {
    title: (g, ctx) => g.screenRenderer.drawTitleScreen(ctx),

    // 20秒を2ページに割る（前半10秒が1ページ目）
    how_to_play: (g, ctx) => g.screenRenderer.drawHowToPlay(ctx, g.stateTimer < 10000 ? 0 : 1),

    local_ranking_display: (g, ctx) => g.screenRenderer.drawLocalRanking(
        ctx, g.highScoreManager.getTop10(), g.localRankIndex, g.week.weekId,
    ),

    global_ranking_display: (g, ctx) => {
        // 未取得でも枠だけは出す（読み込み中に画面が真っ黒にならないように）
        const data = g.onlineData || { ranking: [], weekId: g.week.weekId };
        g.screenRenderer.drawGlobalRanking(ctx, data.ranking, g.globalRankIndex, data.weekId);
    },

    stage_ranking_display: (g, ctx) => {
        const idx = g.stageDisplayIndex;
        const online = g.onlineData ? g.onlineData.stageRankings : null;
        const data = pickStageRanking(online, idx + 1, g.stageRankingManager.getStage(idx + 1));
        g.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
    },

    wall_of_fame_display: (g, ctx) => {
        const fame = (g.onlineData && g.onlineData.fame) || [];
        g.screenRenderer.drawWallOfFame(ctx, fame);
    },
};

export const Game = {
    canvas: null,
    ctx: null,
    lastTime: 0,

    // Core systems
    input: null,
    map: null,
    volumeHudTimer: 0,      // BGM音量インジケータの残り表示フレーム
    camera: null,
    hud: null,
    crosshair: null,

    // Managers
    collisionManager: null,
    spawnManager: null,
    stateManager: null,
    deathHold: null,
    screenRenderer: null,
    highScoreManager: null,

    // Entities
    player: null,
    carrier: null,
    projectiles: [],
    particles: [],
    smokeScreens: [],          // artillery が張った煙幕。視界と Auto Aim を遮る
    landmines: [],
    enemies: [],
    enemyBullets: [],
    repairKits: [],
    autoAimUnits: [],
    missileKits: [],
    autoAimTarget: null,       // world coords {x,y} of snapped enemy, or null
    autoAimLeadPoint: null,    // 着弾予定地点 {x,y}。照準ではなくリードマーカーの位置
    autoAimLockedEnemy: null,  // 現在ロック中の敵エンティティ参照
    aimLead: new AimLeadTracker(AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE), // 偏差射撃用の敵速度計測
    grenadeTrajectory: null,   // 長押し中のグレネード軌道プレビュー {points, landX, landY}
    leftClickSuppress: false,  // グレネード投擲時の左クリック誤射防止用フラグ
    flag: null,

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
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    baseEmergencyAlertStartTime: 0,

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
        this.deathHold = new DeathHold(DEATH_HOLD_FRAMES);
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
        // Press Escape to return to the title screen from playing or other sub-states
        if (this.input.isKeyPressed('Escape') && this.gameState !== 'title') {
            this._enterDemoState('title');
            return;
        }

        this._tickVolumeHud();
        this._updateVolumeControl();
        // ゲームオーバーで引いた効果音を戻す。'playing' に入る経路が
        // 8箇所あるので、個別に呼ばずここでまとめて面倒を見る。
        if (this.gameState === 'playing') audioManager.resumeSe();

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

    /**
     * 「+」で BGM を上げ、「-」で下げる。どの画面でも効く。
     *
     * ランキングの名前入力中だけは無視する。「-」は名前に使える文字なので、
     * 名前を打っているつもりで BGM が下がると訳が分からなくなる。
     * 判定に e.key を使うのは、JIS 配列の「+」が e.code だと Semicolon に
     * なって US 配列と食い違うため。
     */
    _updateVolumeControl() {
        if (this.gameState === 'ranking_entry') return;

        let direction = 0;
        if (this.input.isCharPressed('+', '=')) direction = +1;
        else if (this.input.isCharPressed('-', '_')) direction = -1;
        if (direction === 0) return;

        this.bgmVolume = audioManager.adjustBgmVolume(direction);
        this.volumeHudTimer = VOLUME_HUD_FRAMES;
    },

    /** 音量表示の残り時間を数え下げる。 */
    _tickVolumeHud() {
        if (this.volumeHudTimer > 0) this.volumeHudTimer--;
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

    /** States reachable in the title/demo loop right now — skips global/stage
     *  ranking screens until that data actually exists, matching the existing
     *  forward auto-advance logic below. */
    _availableDemoStates() {
        return DEMO_CYCLE_STATES.filter((state) => {
            if (state === 'global_ranking_display') return this.onlineStatus === 'ok' && !!this.onlineData;
            if (state === 'stage_ranking_display') return this.maxStageReached() >= 1;
            return true;
        });
    },

    /** Index of the current gameState within _availableDemoStates(), for the shared dots UI. */
    _demoCycleIndex() {
        const states = this._availableDemoStates();
        const i = states.indexOf(this.gameState);
        return i === -1 ? 0 : i;
    },

    /** ArrowLeft/ArrowRight navigation shared by every state in the title/demo loop. */
    _handleDemoJump() {
        if (this.input.isKeyPressed('ArrowLeft')) {
            this._jumpDemo(-1);
            return true;
        }
        if (this.input.isKeyPressed('ArrowRight')) {
            this._jumpDemo(1);
            return true;
        }
        return false;
    },

    _jumpDemo(dir) {
        const states = this._availableDemoStates();
        const current = states.indexOf(this.gameState);
        const from = current === -1 ? 0 : current;
        const next = (from + dir + states.length) % states.length;
        this._enterDemoState(states[next]);
    },

    _enterDemoState(state) {
        this.gameState = state;
        this.stateTimer = 0;
        // 敵のホバー音は音源を残したまま鳴らし続ける作りなので、
        // ミッションを離れるここで本当に止める
        audioManager.stopEnemyHover();
        if (state === 'local_ranking_display') {
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (state === 'stage_ranking_display') {
            this.stageDisplayIndex = 0;
            this.stageDisplayTimer = 0;
        } else if (state === 'title') {
            audioManager.playTitleBGM();
        }
    },

    /**
     * デモループの各画面から「ゲームを始める入力」を拾う。
     * タイトルもランキングも、どの画面から始めても手順は同じなので
     * ここ1箇所にまとめる（以前は6画面に同じ4行が写されていた）。
     * @returns {boolean} 開始したら true
     */
    _startGameIfRequested() {
        if (!this._anyKeyOrClick()) return false;
        this.stateManager.restart();
        this.gameState = 'playing';
        audioManager.startBGM(this.missionsCompleted);
        return true;
    },

    _updateTitle(deltaTime) {
        if (this.input.isKeyPressed('KeyA')) {
            this.mode = cycleMode(this.mode, -1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
            return;
        }
        if (this.input.isKeyPressed('KeyD')) {
            this.mode = cycleMode(this.mode, +1);
            this.gameSpeed = MODES[this.mode].gameSpeed;
            return;
        }
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline(); // prefetch online data during how_to_play + local so GLOBAL/FAME are ready
        } else {
            this._startGameIfRequested();
        }
    },

    _updateHowToPlay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this.gameState = 'local_ranking_display';
            this.stateTimer = 0;
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else {
            this._startGameIfRequested();
        }
    },

    _updateLocalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            if (this.onlineStatus === 'ok' && this.onlineData) {
                this.gameState = 'global_ranking_display';
            } else {
                this.gameState = 'title';
                audioManager.playTitleBGM();
            }
            this.stateTimer = 0;
        } else {
            this._startGameIfRequested();
        }
    },

    _updateGlobalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            // Only show stage rankings for stages the player has actually reached
            // locally (keep unseen stages — and their enemies — a surprise).
            if (this.maxStageReached() >= 1) {
                this.gameState = 'stage_ranking_display';
                this.stageDisplayIndex = 0;
                this.stageDisplayTimer = 0;
            } else {
                this.gameState = 'wall_of_fame_display';
            }
            this.stateTimer = 0;
        } else {
            this._startGameIfRequested();
        }
    },

    /** Highest stage number the player has reached locally (persisted, not weekly). */
    maxStageReached() {
        try {
            return Math.min(7, Number(localStorage.getItem('hoverattack_max_stage_reached') || 0));
        } catch (e) {
            return 0;
        }
    },

    /** Record that the player has reached the current stage (call at stage start). */
    _recordStageReached() {
        const stage = Math.min(7, this.missionsCompleted + 1);
        try {
            const prev = Number(localStorage.getItem('hoverattack_max_stage_reached') || 0);
            if (stage > prev) localStorage.setItem('hoverattack_max_stage_reached', String(stage));
        } catch (e) {
            /* ignore storage failures */
        }
    },

    _updateStageRankingDisplay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        this.stageDisplayTimer += deltaTime;
        if (this.stageDisplayTimer > 3000) {
            this.stageDisplayTimer = 0;
            this.stageDisplayIndex++;
            if (this.stageDisplayIndex >= this.maxStageReached()) {
                this.gameState = 'wall_of_fame_display';
                this.stateTimer = 0;
                return;
            }
        }
        this._startGameIfRequested();
    },

    _updateWallOfFameDisplay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'title';
            this.stateTimer = 0;
            audioManager.playTitleBGM();
        } else {
            this._startGameIfRequested();
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
                const formattedTime = this.missionsCompleted >= 7 ? formatClock(this.totalTime) : null;
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
        this._snapshotPrevPositions();
        this._updateCarrier();
        this._updatePlayer();
        this._updateDeathHold();
        this._updateCamera();
        // 呼ぶ順序がそのまま更新順。地雷だけは当たり判定を伴うので別扱い。
        this._updateAndPrune(this.projectiles);
        this._updateAndPrune(this.particles);
        this._updateAndPrune(this.smokeScreens);
        this._updateLandmines();
        this._updateAndPrune(this.repairKits);
        this._updateAndPrune(this.autoAimUnits);
        this._updateAndPrune(this.missileKits);
        this._updateAutoAim();
        this.map.update();
        this._updateAndPrune(this.enemies);
        this._updateEnemyHoverSound();
        this._checkMissionClear();
        this.collisionManager.update();
        this._updateProximityAlert();
    },

    // --- Render interpolation (see utils/renderInterp.js) -------------------

    /** Run fn over every entity that moves each tick and is drawn in the world. */
    _forEachMovingEntity(fn) {
        if (this.player) fn(this.player);
        if (this.carrier) fn(this.carrier);
        for (const e of this.enemies) fn(e);
        for (const p of this.projectiles) fn(p);
        for (const b of this.enemyBullets) fn(b);
        for (const k of this.repairKits) fn(k);
        for (const u of this.autoAimUnits) fn(u);
        for (const k of this.missileKits) fn(k);
    },

    /** Record pre-tick positions so draw() can interpolate towards the new ones. */
    _snapshotPrevPositions() {
        this._forEachMovingEntity(snapshotEntity);
    },

    /** Shift entities to their interpolated draw positions (restore after drawing). */
    _applyRenderInterpolation(alpha) {
        this._forEachMovingEntity((e) => interpolateEntity(e, alpha));
    },

    _restoreRenderInterpolation() {
        this._forEachMovingEntity(restoreEntity);
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

    /**
     * 自機・母艦の破壊演出のホールドを進める。
     * ホールド中はリスポーンもゲームオーバー遷移もしない（_updatePlayer /
     * _updateCarrier がそれを見て待つ）。明けた tick で通常の後始末が走る。
     * シミュレーション自体は止めないので、破片や爆発はその間も動き続ける。
     */
    _updateDeathHold() {
        this.deathHold.tick();

        if (this.deathHold.active) return;

        // ホールドが明けた（あるいは最初から無い）ので、死んだままの対象を後始末する。
        // 母艦を先に見るのは、自機のリスポーン先が母艦だから。
        if (this.carrier && !this.carrier.alive) {
            if (this.carrier.lives > 0) this.stateManager.respawnCarrier();
            else this._triggerGameOver();
        }
        if (this.player && !this.player.alive) {
            if (this.player.lives > 0) this.stateManager.respawnPlayer();
            else this._triggerGameOver();
        }
    },

    /** 自機・母艦が壊れた最初の tick でホールドを立てる。 */
    _beginDeathHoldIfDestroyed(entity) {
        if (!entity || entity.alive || this.deathHold.active) return;
        this.deathHold.begin(
            entity.x + entity.width / 2,
            entity.y + entity.height / 2,
        );
    },

    _updateCarrier() {
        if (!this.carrier) return;
        this.carrier.update();
        this._updateCarrierEngineSound();
        this._beginDeathHoldIfDestroyed(this.carrier);
    },

    /**
     * いま映っている範囲。音量の判定に使う。
     * 左右の振り分けと同じくカメラ基準にして、見えているものと聞こえるものを
     * 一致させる。
     * @returns {{cx:number, cy:number, halfW:number, halfH:number}}
     */
    _viewRect() {
        const halfW = this.canvas.width / 2;
        const halfH = this.canvas.height / 2;
        return { cx: this.camera.x + halfW, cy: this.camera.y + halfH, halfW, halfH };
    },

    /**
     * 敵のホバー音。画面に映っている敵は満音量、画面外は半分で、
     * 1画面ぶん離れると聞こえなくなる。左右はその敵の横位置で振る。
     */
    _updateEnemyHoverSound() {
        const nearest = nearestHoveringEnemy(this.enemies, this._viewRect());
        // 聞こえる敵が居なくなっても止めるのではなく 0 を渡す。音源を残した
        // まま滑らかに引くため。本当に止めるのはミッションを抜けるとき。
        if (!nearest) {
            audioManager.setEnemyHover(0);
            return;
        }
        audioManager.setEnemyHover(nearest.volume, nearest.x);
    },

    /**
     * 母艦のエンジン音。ドッキング中（＝母艦を操作できる間）だけ鳴らす。
     * 移動しているほど音が上がる。
     */
    _updateCarrierEngineSound() {
        const player = this.player;
        const carrier = this.carrier;
        const running = player && player.docked && player.alive && carrier.alive;
        if (!running) {
            audioManager.stopCarrierEngine();
            audioManager.stopRepairHum(); // 母艦の撃墜で強制離脱したときもハムを残さない
            return;
        }
        const throttle = Math.min(1, Math.abs(carrier.vx) / CARRIER_SPEED);
        audioManager.startCarrierEngine(throttle);
    },

    _updatePlayer() {
        if (!this.player) return;
        this.player.update();
        this._beginDeathHoldIfDestroyed(this.player);
    },

    _updateCamera() {
        // 破壊演出中は撃破地点に留まる（リスポーン先へ視点が飛ばない）
        if (this.deathHold.active) {
            this.camera.follow(this.deathHold.focus);
        } else if (this.player && !this.player.docked && this.player.alive) {
            this.camera.follow(this.player);
        } else if (this.carrier && this.carrier.alive) {
            this.camera.follow(this.carrier);
        }
        this.camera.update();
        // 見えている位置と聞こえる向きを合わせる。カメラはマップ端で
        // クランプされるので、自機ではなく画面中心を基準にする。
        audioManager.setListenerView(this._viewRect());
    },

    /**
     * 配列の中身を update() して、死んだものを取り除く。
     *
     * 弾・パーティクル・煙幕・アイテム・敵と、同じ形のループが7本あった。
     * 後ろから走査するのは、splice しても未処理の添字がずれないため。
     * @param {Array<{update:Function, alive:boolean}>} list
     */
    _updateAndPrune(list) {
        for (let i = list.length - 1; i >= 0; i--) {
            list[i].update();
            if (!list[i].alive) list.splice(i, 1);
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

    _updateAutoAim() {
        const player = this.player;
        this.autoAimTarget = null;
        this.autoAimLeadPoint = null;

        // 常にマウス位置を記録しておく（ピックアップ直後に古い位置と比較して即キャンセルされるのを防ぐ）
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        const dx = Math.abs(mx - (this._prevMouseX ?? mx));
        const dy = Math.abs(my - (this._prevMouseY ?? my));
        this._prevMouseX = mx;
        this._prevMouseY = my;

        if (!player || !player.alive || player.docked || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        player.autoAimTimer--;

        // マウスを動かしている間はスナップを抑制してロックも解除（タイマーは継続）
        if (dx + dy > AUTO_AIM_CANCEL_THRESHOLD) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // ロック中の敵が生存していればそのまま追跡
        if (this.autoAimLockedEnemy && this.autoAimLockedEnemy.alive) {
            // 煙に隠れたらロックを落とす。見えていないのに追尾し続けると、
            // 煙を張られた意味が無くなる
            if (isEnemyConcealed(this.autoAimLockedEnemy, this.smokeScreens)) {
                this.autoAimLockedEnemy = null;
                this.aimLead.reset();
                return;
            }
            this._lockOnEnemy(this.autoAimLockedEnemy);
            return;
        }

        // ロック対象なし: マウスのワールド座標に最も近い敵を新規検索
        const mouseWorld = this.input.getMouseWorld(this.camera);
        let bestEnemy = null;
        let bestDist = AUTO_AIM_SNAP_RADIUS;
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            if (isEnemyConcealed(enemy, this.smokeScreens)) continue;  // 煙の中は見えない
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
            this._lockOnEnemy(bestEnemy);
        } else {
            this.aimLead.reset();
        }
    },

    /**
     * ロック対象の照準位置と着弾予定地点を更新する。
     *
     * 照準（autoAimTarget）は敵の中心に据えたままにする。着弾予定地点まで
     * 照準ごと動かすと、敵から外れた場所に照準が浮いて目障りになるため。
     * 予測位置は autoAimLeadPoint として別に持ち、戦闘機の HUD のように
     * 破線とリードサークルで示す（描画は Crosshair）。射撃はそちらを狙う。
     */
    _lockOnEnemy(enemy) {
        const cx = enemy.x + (enemy.width || 0) / 2;
        const cy = enemy.y + (enemy.height || 0) / 2;
        this.autoAimTarget = { x: cx, y: cy };
        this.autoAimLeadPoint = this._leadPointFor(enemy, cx, cy);
    },

    /**
     * ロック中の敵に対する着弾予定地点。
     * 自機の武器は直進弾なので、敵の現在位置を狙うと動く敵には当たらない。
     */
    _leadPointFor(enemy, cx, cy) {
        const player = this.player;
        const v = this.aimLead.measure(enemy);

        return predictLeadPoint({
            shooterX: player.x + player.width / 2,
            shooterY: player.y + player.height / 2,
            targetX: cx,
            targetY: cy,
            targetVx: v.vx,
            targetVy: v.vy,
            // 装備中の武器の弾速で予測する（ミサイルとマシンガンで偏差が変わる）
            projectileSpeed: player.currentWeapon === 'missile' ? MISSILE_SPEED : PLAYER_MG_SPEED,
            maxLeadTicks: AUTO_AIM_LEAD_MAX_TICKS,
            strength: AUTO_AIM_LEAD_STRENGTH,
        });
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

    /**
     * その記録が面別トップ5に入るか。オンラインの記録が取れていればそれで、
     * 取れていなければ手元の記録で判定する。
     *
     * タイムとスコアは「短いほど良い／高いほど良い」が逆なだけで手順は同じ
     * なので、良し悪しの比較だけを betterThanLast で受け取る。
     *
     * @param {number} stage 面番号（1..7）
     * @param {'time'|'score'} kind どちらの順位表か
     * @param {(worstEntry: object) => boolean} betterThanLast 5位より良ければ true
     * @param {() => boolean} localFallback オンラインが無いときの手元判定
     */
    _wouldStageRank(stage, kind, betterThanLast, localFallback) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online[kind] || [];
            return list.length < 5 || betterThanLast(list[list.length - 1]);
        }
        return this.stageRankingManager ? localFallback() : false;
    },

    _wouldStageRankTime(stage, timeMs) {
        return this._wouldStageRank(
            stage, 'time',
            (worst) => timeMs < worst.timeMs,
            () => this.stageRankingManager.wouldRankTime(stage, timeMs),
        );
    },

    _wouldStageRankScore(stage, score) {
        return this._wouldStageRank(
            stage, 'score',
            (worst) => score > worst.score,
            () => this.stageRankingManager.wouldRankScore(stage, score),
        );
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
            audioManager.playDock();
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
                audioManager.stopCarrierEngine();
                audioManager.stopRepairHum();
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

        // 照準が指している点（グレネードの投擲と軌道プレビューはこちらを使う。
        // 放物線で飛行時間も長いため、直進弾用の偏差を当てても正しくない）
        const targetWorld = this.autoAimTarget || this.input.getTargetWorld(this.camera);
        // 直進弾が狙う点。Auto Aim 中は着弾予定地点、それ以外は照準と同じ
        const fireWorld = this.autoAimLeadPoint || targetWorld;

        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);
        const fireAngle = Math.atan2(fireWorld.y - py, fireWorld.x - px);

        // 左クリックが離されたら通常兵器の抑制を解除する
        if (!this.input.mouse.left) {
            this.leftClickSuppress = false;
        }

        // Primary fire（長押し中および左クリック抑制中は通常兵器を抑制）
        if (!this.leftClickSuppress && !this.grenadeWasHeld && (this.input.mouse.left || this.input.isKeyDown('Space'))) {
            if (player.currentWeapon === 'missile') this._fireMissile(player, px, py, fireAngle);
            else if (player.currentWeapon === 'mg') this._fireMachineGun(player, px, py, fireAngle);
        }

        // Secondary fire: Grenade（距離に応じた投擲強度）
        // ★ 短押し/長押しの区別は「押した瞬間」には不可能なため、判定はリリース時に行う
        // 長押し閾値: 10フレーム（約0.17秒）
        const GRENADE_HOLD_THRESHOLD = 10;

        if (this.input.isRightClickHeld() && Math.floor(player.grenades) > 0) {
            const grenadeSpeed = this._grenadeSpeedFor(targetWorld, px, py);

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
                    player.grenades = Math.max(0, Math.floor(player.grenades) - 1);
                    audioManager.playWeapon('grenade', px, py);
                    this._clearGrenadeHold();

                    // 通常兵器の誤射を避けるため、左クリックを離すまで通常射撃を抑制するフラグを立てる
                    this.leftClickSuppress = true;
                }
            }
            // 閾値未満の間は何もしない（まだ短押しか長押しか判断できない）

        } else {
            // 右クリックを離した瞬間
            if (this.input.isRightClickReleased() && Math.floor(player.grenades) > 0) {
                if (!this.grenadeWasHeld) {
                    // 短押し確定（閾値未満でリリース）: 投擲
                    const grenadeSpeed = this._grenadeSpeedFor(targetWorld, px, py);
                    this.projectiles.push(new Grenade(this, px + Math.cos(angle) * 10, py + Math.sin(angle) * 10, angle, grenadeSpeed));
                    player.grenades = Math.max(0, Math.floor(player.grenades) - 1);
                    audioManager.playWeapon('grenade', px, py);
                }
                // 長押しのリリースはキャンセル（左クリックせずに離した場合）
            }
            this._clearGrenadeHold();
        }
    },

    /**
     * グレネードの初速。狙った点が遠いほど強く投げる。
     * 短押しと長押しの両方から呼ぶので、式はここだけに置く
     * （以前は2箇所に同じ3行があり、片方だけ触ると投げ分けが狂う）。
     */
    _grenadeSpeedFor(targetWorld, px, py) {
        const dist = Math.hypot(targetWorld.x - px, targetWorld.y - py);
        const ratio = Math.min(dist / GRENADE_SPEED_MAX_DIST, 1.0);
        return GRENADE_SPEED_MIN + ratio * (GRENADE_SPEED_MAX - GRENADE_SPEED_MIN);
    },

    /** 長押し中に溜めていた投擲の情報を捨てる（投げ終わり・キャンセルの両方から）。 */
    _clearGrenadeHold() {
        this.grenadeTrajectory = null;
        this.grenadeWasHeld = false;
        this._grenadeHeldAngle = null;
        this._grenadeHeldSpeed = null;
        this._grenadeHeldPx = null;
        this._grenadeHeldPy = null;
    },


    _fireMissile(player, px, py, angle) {
        if (Math.floor(player.missiles) <= 0) {
            player.currentWeapon = 'mg';
            audioManager.playSwitch();
            return;
        }
        if (player.missileCooldown > 0) return;

        const active = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
        if (active >= MISSILE_MAX_ON_SCREEN) return;

        this.projectiles.push(new Missile(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, angle, true));
        player.missiles = Math.max(0, Math.floor(player.missiles) - 1);
        player.missileCooldown = 15;
        audioManager.playWeapon('playerMissile', px, py);

        if (Math.floor(player.missiles) <= 0) {
            player.currentWeapon = 'mg';
            audioManager.playSwitch();
        }
    },

    _fireMachineGun(player, px, py, angle) {
        if (player.mgReloadTimer > 0 || player.mgFireTimer > 0) return;

        const finalAngle = angle + (Math.random() - 0.5) * PLAYER_MG_SPREAD;
        this.projectiles.push(new PlayerBullet(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, finalAngle));

        player.mgFireTimer = PLAYER_MG_BURST_DELAY;
        player.mgBurstLeft--;
    },

    // ==========================================
    // DRAW
    // ==========================================
    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Full-screen states — skip world rendering.
        // どの画面も「専用の描画 → 位置ドット → 終わり」で同じなので、
        // 違いのある1行だけを DEMO_SCREEN_DRAWERS の表に置く。
        const drawDemoScreen = DEMO_SCREEN_DRAWERS[this.gameState];
        if (drawDemoScreen) {
            drawDemoScreen(this, ctx);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
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

        this._applyRenderInterpolation(alpha);

        ctx.save();
        ctx.translate(-camX, -camY);

        // 遠景(洞窟)を視差付きで転送。前景の空タイルは透明なのでここが透けて見える。
        if (this.map.backdrop) {
            this.map.backdrop.draw(ctx, camX, camY);
        } else {
            ctx.fillStyle = COLOR_CAVE_BG;
            ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);
        }

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

        // 煙は敵とHPバーの上に重ねる（隠すのが仕事なので最後に描く）
        for (const screen of this.smokeScreens) screen.draw(ctx);

        ctx.restore();

        this._restoreRenderInterpolation();
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
            this.screenRenderer.drawMiniMap(ctx);
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

    /** Returns true if Enter or a mouse click was pressed this frame (game-start input) */
    _anyKeyOrClick() {
        return this.input.isKeyPressed('Enter')
            || this.input.isLeftClickPressed()
            || this.input.isRightClickPressed();
    },

    /** Spawn explosion particles and chain-detonate nearby landmines */
    spawnExplosion(x, y, size, opts) {
        this.particles.push(...createExplosion(x, y, size, opts));
        audioManager.playExplosion(size > 10, x);

        for (const mine of this.landmines) {
            if (!mine.alive) continue;
            const dx = (mine.x + mine.width / 2) - x;
            const dy = (mine.y + mine.height / 2) - y;
            if (dx * dx + dy * dy <= LANDMINE_BLAST_RADIUS * LANDMINE_BLAST_RADIUS) mine.detonate();
        }
    },

    /**
     * 破壊された機体のパーツを破片として撒く。
     * 当たり判定は持たず、既存の particles 配列に相乗りするだけ。
     * @param {object} entity 破壊された機体
     * @param {string} kind DEBRIS_SPECS のキー
     */
    spawnDebris(entity, kind) {
        const debris = buildDebris(entity, kind);
        if (debris.length === 0) return;
        this.particles.push(...debris);
        this._trimDebris();
    },

    /** 破片の同時存在数を上限内に収める。古い破片から落とす。 */
    _trimDebris() {
        trimDebris(this.particles, DEBRIS_MAX_ACTIVE);
    },

    /** Spawn damage sparks at position */
    spawnSparks(x, y) {
        this.particles.push(...createSparks(x, y));
    },

    /**
     * 煙幕を張る。artillery が自機に発見されたときに呼ぶ。
     * 当たり判定は持たず、視界と Auto Aim だけを遮る。
     */
    spawnSmokeScreen(x, y) {
        this.smokeScreens.push(new SmokeScreen(x, y));
        audioManager.playWeapon('smoke', x, y);
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
        // 戦闘の音を引いてから曲を鳴らす。ホバー音やエンジン音が残っていると
        // 終わった感じにならない。曲はフェード段を通らないので消えない。
        audioManager.fadeOutSe();
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
        const TRAJ_GRAVITY = 0.20;
        const TRAJ_MAX_FALLING_SPEED = 6;
        const TRAJ_BOUNCE = 0.2;
        const TRAJ_FRICTION = 0.9;
        const TRAJ_LIFETIME = 90;

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

        const inRange = (x, y) => (cx - x) ** 2 + (cy - y) ** 2 < rangeSq;

        // 敵は機体の中心で測る。
        // 敵弾は x,y をそのまま使う（中心は取らない）。enemyBullets には
        // 大きさを持つ巡航ミサイル(24x16)やレーザーも混ざっており、中心に
        // 直すと警報の鳴りだす距離が変わってしまう。
        this.proximityAlertActive =
            this.enemies.some((e) => e.alive
                && inRange(e.x + (e.width || 0) / 2, e.y + (e.height || 0) / 2))
            || this.enemyBullets.some((b) => b.alive && inRange(b.x, b.y));

        // Play alarm sound periodically while threat is near
        if (this.proximityAlertActive) {
            if (Math.floor(this.totalTime / 16) % 30 === 0) {
                audioManager.playAlarm();
            }
        }
    },

    /**
     * Enter "Enemy Base Emergency Defense Mode" — called by EnemyBase.takeDamage()
     * on mission 2+ once the base is under attack. One-shot latch: once active,
     * subsequent calls are no-ops until a fresh mission (or base destruction)
     * resets the flags.
     * @param {EnemyBase} enemyBase - the base under attack; stored so redirected
     *   defenders (and newly-spawned ones, via SpawnManager) know their rally point.
     */
    triggerBaseEmergencyAlert(enemyBase) {
        if (this.baseEmergencyAlert) return; // one-shot latch: already active

        if (this.missionsCompleted < 1) return; // only mission 2+ (defense in depth)

        this.baseEmergencyAlert = true;
        this.emergencyTargetBase = enemyBase;
        this.baseEmergencyAlertStartTime = Date.now();

        for (const enemy of this.enemies) {
            if (enemy instanceof EnemyAttacker || enemy instanceof EnemyDrone) {
                enemy.setEmergencyDefense(true, enemyBase);
            }
        }

        audioManager.playAlarm();
    },

    loop(timestamp) {
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiral-of-death when tab was hidden
        if (deltaTime > 50) deltaTime = 50;

        this.update(deltaTime);
        this.draw();
        // draw() は画面ごとに早期 return するので、その外側で最後に重ねる
        this.screenRenderer.drawVolumeIndicator(
            this.ctx, audioManager.bgmVolume, this.volumeHudTimer,
        );

        this.input.endFrame();
        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
// Guarded so this module can be imported in a DOM-less test environment
// (e.g. `node --test`) purely to unit-test plain methods on `Game`.
if (typeof document !== 'undefined') {
    Game.init();
}
