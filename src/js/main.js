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
    DEBRIS_MAX_ACTIVE, DEATH_HOLD_FRAMES,
    VOLUME_HUD_FRAMES,
    AUTO_AIM_SNAP_RADIUS, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT,
    AUTO_AIM_LEAD_MAX_TICKS, AUTO_AIM_LEAD_STRENGTH,
    AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE,
    MISSILE_SPEED, PLAYER_MG_SPEED,
    LEADERBOARD_URL,
    VOLUME_STEP_COARSE,
    AUTO_AIM_HOLD_TENTHS_DEFAULT,
    VIEW_CULL_MARGIN,
    CONTINUE_COUNTDOWN_MS, GAMEOVER_WAIT_MS,
} from './utils/Constants.js';
import { stepHoldKey, initialHoldState } from './utils/holdKey.js';
import { loadSettings, stepSetting } from './utils/settings.js';
import { SeededRNG } from './utils/SeededRNG.js';
import { getCurrentWeek, stageSeed } from './utils/WeekSeed.js';
import { toggleFullscreen } from './utils/fullscreen.js';
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
import { StageRankingManager } from './systems/StageRankingManager.js';
import { SaveManager } from './systems/SaveManager.js';
import { OnlineLeaderboard } from './systems/OnlineLeaderboard.js';
import { audioManager } from './audio/AudioManager.js';
import { REPAIR_KIT_HEAL } from './entities/RepairKit.js';
import { predictLeadPoint, AimLeadTracker } from './utils/aimLead.js';
import { getCountryCode } from './utils/geo.js';
import { centerOf } from './utils/Physics.js';
import { formatClock } from './utils/formatTime.js';
import { nearestHoveringEnemy } from './utils/audioFalloff.js';
import { isEnemyConcealed } from './utils/concealment.js';
import { MODES } from './utils/modes.js';
import { computeTimeBonus, buildStageResult, TIME_BONUS_BASE_MULT } from './utils/scoring.js';
import { advanceAccumulator, SIM_STEP, MAX_TICKS } from './utils/timestep.js';
import { snapshotEntity, interpolateEntity, restoreEntity } from './utils/renderInterp.js';
import { isInView } from './utils/viewCull.js';
import { SettingsFlow } from './ui/flows/settingsFlow.js';
import { AttractFlow } from './ui/flows/attractFlow.js';
import { DEMO_CYCLE_STATES, DEMO_SCREEN_DRAWERS } from './ui/flows/demoScreens.js';

// テストと main.js 自身が使う。表の実体は ui/flows/demoScreens.js
export { DEMO_CYCLE_STATES, DEMO_SCREEN_DRAWERS };

// ============================================
// Game Object
// ============================================
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
    // Shift のタップ／長押しを見分けるための計測。utils/holdKey.js が進める
    shiftHold: initialHoldState(),

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
    // デバッグ用の無敵モード。true にすると自機と母艦がダメージを受けず、
    // ミサイルとグレネードも減らない（撃ち放題）。先の面の演出を止めずに
    // 見て回るためのもので、**本番は false に戻す**。
    // ON の間は HUD の右上に INVINCIBLE と出るので、戻し忘れには気づける
    debugInvincible: false,
    missionsCompleted: 0,
    runTries: 1,          // 今のランがセーブ地点から何回目か。通常スタートは 1
    stageSelectRun: false, // 面セレクトから始めたランか（週スコアに出さない）
    mode: 'normal',       // 'normal' | 'newtype'
    gameSpeed: MODES.normal.gameSpeed,
    simAccumulator: 0,
    simAlpha: 1,
    gameState: 'title', // 'title' | 'playing' | 'settings' | 'gameover' | 'mission_clear' | 'game_clear' | 'ranking_entry' | 'local_ranking_display' | 'global_ranking_display' | 'stage_ranking_display' | 'wall_of_fame_display' | 'stage_select'
    settings: null,          // init() で loadSettings() が入れる
    settingsIndex: 0,        // 設定画面で選択中の行
    settingsReturnTo: null,  // 設定画面を閉じたときに戻る状態
    confirmingQuit: false,   // 途中終了の確認中か
    quitChoiceYes: false,    // 確認中のカーソル。既定は NO（押し間違いで進行を捨てない）
    showingControls: false,  // 設定画面に操作一覧を重ねているか
    showMiniMap: false,
    miniMapAlpha: 0,
    stateTimer: 0,
    titleMenuIndex: 0,    // タイトルのメニューで選んでいる行（0..titleMenuItems().length-1）
    stageSelectIndex: 1,  // 面セレクトで選んでいる面（1..saveManager.reached）
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

        // 設定は音より先に読む。AudioContext がまだ無くても applySettings() は
        // 値を覚えておき、音を作るときに反映される
        this.settings = loadSettings();
        audioManager.applySettings(this.settings);

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
        // 途中セーブと面セレクトの解放。週IDで無効化されるので、
        // highScoreManager と同じくここ（週が確定した直後）で作る。
        this.saveManager = new SaveManager(this);
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
        // Escape / P で設定画面を開閉する。
        //
        // 全画面中の Escape はブラウザが全画面解除に使い、そのときの keydown は
        // ページへ渡ってこないと見られる（下の M キーのコメント参照）。つまり
        // 全画面では「1回目で全画面解除、2回目でメニュー」になりうるので、
        // 全画面を保ったまま開ける P を主の操作として案内する。
        const wantsMenu = this.input.isKeyPressed('Escape') || this.input.isKeyPressed('KeyP');
        if (wantsMenu) {
            // 操作一覧を重ねている間は、まずそれを閉じる。ここを飛ばすと
            // Escape / P で設定画面ごと閉じてしまい、戻り先を1段間違える
            if (this.gameState === 'settings' && this.showingControls) {
                this.showingControls = false;
                return;
            }
            if (this.gameState === 'settings') {
                this._closeSettings();
                return;
            }
            if (this.gameState === 'playing' || this.gameState === 'title') {
                this._openSettings(this.gameState);
                return;
            }
            // それ以外の画面（ランキング等）は従来どおり Escape でタイトルへ
            if (this.input.isKeyPressed('Escape')) {
                this._enterDemoState('title');
                return;
            }
        }

        this._tickVolumeHud();
        this._updateVolumeControl();
        // ゲームオーバーで引いた効果音を戻す。'playing' に入る経路が
        // 8箇所あるので、個別に呼ばずここでまとめて面倒を見る。
        if (this.gameState === 'playing') audioManager.resumeSe();

        // M で全画面を切り替える。カーソルが canvas の外に出やすいのが
        // 元々の不満だったので、画面いっぱいに広げて外に出る余地を減らす狙い。
        // ranking_entry だけは除外する。名前入力中の M キー押下は
        // getTypedChars() で文字としても消費されるため、除外しないと
        // 「MAX」などと打つたびに全画面が切り替わってしまう
        // （_updateVolumeControl() が「-」を除外しているのと同じ理由）。
        // なお全画面はブラウザ仕様で Escape でも解除される。Chrome/Firefox は
        // 全画面解除に Escape を使ったとき keydown 自体を握って渡してこないため、
        // 想定では「1回目の Escape は全画面解除のみ、2回目でミッション離脱」に
        // 分かれるはず（同時に両方起きるわけではない）。ただし未確認 — 実機で確かめること。
        if (this.gameState !== 'ranking_entry' && this.input.isKeyPressed('KeyM')) toggleFullscreen();

        // プレイ中以外では長押しの計測を寝かせる。押したまま画面が変わって戻ってきたときに、
        // たまった時間で即発火するのを防ぐ。抜ける経路は設定画面・ミッションクリア・
        // ゲームオーバーと複数あるので、出口ごとに書かず「プレイ中でなければ常に初期化」で受ける
        if (this.gameState !== 'playing') this.shiftHold = initialHoldState();

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

        // 付け替え前は BGM 音量を直接動かしていた。設定画面ができた今は
        // 「全体音量」を動かす。プレイ中にポーズを挟まず片手で下げられる
        // ほうが速いので、-/+ は残してある。刻みは粗いほう（10%）
        this.settings = stepSetting(this.settings, 'masterVolume', direction, VOLUME_STEP_COARSE);
        this._saveSettings();
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
            case 'settings': return this._updateSettings();
            case 'stage_select': return this._updateStageSelect();
            case 'playing': return this._updatePlaying(deltaTime);
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
        // 面セレクトの解放は**週ごと**に消える。上の旧キーは週非依存のままにする
        // ——あちらは面別ランキング表示画面の出現ゲート(_availableDemoStates)に
        // 使われていて、週別にすると週明けにその画面が出なくなる。
        if (this.saveManager) this.saveManager.recordReached(stage);
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

    async _submitOnline(name, score, mission, clearTime, country, tries) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        // weekId はマップ生成に使った週（init() で1回だけ決まる this.week）をそのまま送る。
        // サーバー受信時刻から週を計算すると、週境界をまたいでクリアしたとき
        // 「遊んだ地形の週」と「記録される週」がずれるため。
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime, country, tries, weekId: this.week.weekId });
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
                // 面セレクトのランは週スコアへ登録しない（送信もしない）。
                // 判定側(_tryGoToRanking)だけを塞ぐと、面別で名前入力に来たときに
                // ここが通ってしまう
                if (!this.stageSelectRun && this.highScoreManager.isHighScore(this.score)) {
                    this.localRankIndex = this.highScoreManager.addScore(
                        this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries
                    );
                    this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries);
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
                        weekId: this.week.weekId,
                    });
                }
                this._restoreFullscreen();
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

        if (this.canContinueHere()) {
            if (this.input.isKeyPressed('KeyC')) {
                this.continueFromSave();
                return;
            }
            // カウントダウンを待ってから従来の流れへ。放置すればランキング登録に
            // 進むので、見逃しても手順が止まらない（既存の自動遷移の性格を保つ）
            if (this.stateTimer > CONTINUE_COUNTDOWN_MS) this._tryGoToRanking();
            return;
        }

        if (this.stateTimer > GAMEOVER_WAIT_MS) this._tryGoToRanking();
    },

    /**
     * ここでコンティニューを出せるか。
     * **面セレクトのランでは出さない** — セーブは通しラン専用で、単発の
     * タイムアタックから通しランの続きへ飛べてしまうのは筋が通らない。
     */
    canContinueHere() {
        return !this.stageSelectRun && !!(this.saveManager && this.saveManager.save);
    },

    /** CONTINUE? の残り秒。描画用（0 未満にはしない）。 */
    continueSecondsLeft() {
        return Math.max(0, Math.ceil((CONTINUE_COUNTDOWN_MS - this.stateTimer) / 1000));
    },

    /** セーブ地点から再開する。トライ数の加算と保存は SaveManager の仕事。 */
    continueFromSave() {
        if (!this.saveManager.applyContinue()) return;
        this._restoreFullscreen();
        this.gameState = 'playing';
        // セーブからの再開は必ず通しラン。_enterDemoState 側の変更だけでも
        // canContinueHere() の !stageSelectRun 側の道は塞がるが、ここでも
        // 明示しておく二重の安全側（呼び出し経路が増えても再開後は必ず false）。
        this.stageSelectRun = false;
        // resetScore = false。applyContinue が入れたスコアと累計時間を消さない
        this.stateManager.resetLevel(false);
        audioManager.startBGM(this.missionsCompleted);
    },

    _updateGameClear(deltaTime) {
        this.stateTimer += deltaTime;
        if (this._updateTimeBonusSlot(true)) return;
        if (this.stateTimer > 7000) this._tryGoToRanking();
    },

    _updateMissionClear() {
        if (this._updateTimeBonusSlot(false)) return;

        // S だけ先に見る。下の決定の判定に混ぜると、セーブと前進が二重に走る。
        // 払えないときは**無反応**にする（連打で 10000 点を失う事故を防ぐため、
        // 確認ダイアログではなく専用キーにしてある）。
        if (this.input.isKeyPressed('KeyS')) {
            if (!this.saveManager.canSaveNow()) return;
            this.saveManager.saveHere();
            this._advanceToNextMission();
            return;
        }

        // 決定は ENTER（＋クリック）。**以前は「任意の文字キーでも進む」だった**が、
        // タイトルと面セレクトを ENTER 決定に統一したのに合わせて揃えた。
        // W は手が覚えているので別名として残す。
        if (this._anyKeyOrClick() || this.input.isKeyPressed('KeyW')) {
            this._advanceToNextMission();
        }
    },

    /** 面クリア画面から次の面へ。セーブの有無で変わらない部分をまとめた。 */
    _advanceToNextMission() {
        this._restoreFullscreen();
        this.gameState = 'playing';
        this.stateManager.nextMission();
        audioManager.startBGM(this.missionsCompleted);
    },

    /**
     * `Shift` のタップと長押しを振り分ける。
     *
     * タップ（しきい値未満で離す）＝クロスヘアロック、長押し＝Auto Aim の解除／再開。
     * 押した瞬間にロックを切り替える作りだと、長押しのたびにロックが道連れになるので、
     * **タップは離したときに確定させる**（判定は utils/holdKey.js）。
     *
     * プレイ中だけに閉じてあるのは `F` キーと同じ理由 — `this.player` は
     * `'settings'`（ポーズ中）や `'mission_clear'` でも alive かつ未ドックのまま残るので、
     * 自機の状態を見るだけでは「プレイ中限定」にならない。撃てるのはプレイ中だけなので、
     * プレイ外でロックしても使い道がない。
     */
    _updateShiftKey(deltaTime) {
        const down = this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');
        // 設定は 1/10 秒で持っているのでミリ秒に直す
        const tenths = this.settings?.autoAimHoldTenths ?? AUTO_AIM_HOLD_TENTHS_DEFAULT;
        const { state, tap, hold } = stepHoldKey(this.shiftHold, down, deltaTime, tenths * 100);
        this.shiftHold = state;

        if (tap) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }

        // 長押しが効くのは Auto Aim を持っているときだけ。持っていない間に反転できると、
        // 次に拾ったときの状態が「いつ長押ししたか」で決まってしまう
        if (hold && this.player && this.player.autoAimTimer > 0) {
            this.player.autoAimPaused = !this.player.autoAimPaused;
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
        // タップでロックが今フレーム切り替わることがあるので、ミラーリングより先に判定する。
        // 後ろにすると「押した瞬間はまだ古いロック状態で描画される」1フレーム遅れが生まれる
        this._updateShiftKey(deltaTime);
        // ロック中: 内部マウス座標をクロスヘアのスクリーン位置に固定
        if (this.input.crosshairLocked) {
            this.input.mouse.x = this.input.lockedWorldX - this.camera.x;
            this.input.mouse.y = this.input.lockedWorldY - this.camera.y;
        }
        this._updateMiniMap();
        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.pressWeaponKey();
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
        this._updateOverdrive();
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

    /**
     * オーバードライブの残り時間を1ティック減らす。
     *
     * **_simulationTick() の内側に置くのが要件。** 設定画面を開いている間に
     * 止まってほしいので（_updateAutoAim() と同じ理由。update() 直下へ出すと
     * ポーズ中も減り始める）。
     */
    _updateOverdrive() {
        const player = this.player;
        if (!player || !player.alive || player.overdriveTimer <= 0) return;
        player.overdriveTimer--;
        if (player.overdriveTimer <= 0) player.overdriveMaxTimer = 0;
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

        if (!player || !player.alive || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // 残り時間は「実際に効いているか」と無関係に減る。ドック中も Shift で
        // 解除している間も減らすのは、Auto Aim を温存して使い回す立ち回りを
        // 作らないため（解除は節約手段ではなく「今は手動で狙いたい」ための操作）。
        //
        // **この減算が _simulationTick() の内側にあることが要件。** 設定画面を
        // 開いている間にタイマーが止まるのは、gameState === 'settings' の間
        // _updatePlaying() ごと呼ばれず、ここに到達しないため。update() 直下など
        // 外へ出すとポーズ中も減り始める
        player.autoAimTimer--;

        // 尽きた時点で解除状態も消す。通常状態に戻ったのに「解除中」が残ると、
        // 次に拾ったときの挙動が「いつ切ったか」で決まってしまう
        if (player.autoAimTimer <= 0) {
            player.autoAimPaused = false;
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // ドック中と解除中は吸い付かない（タイマーは上で減らし済み）
        if (player.docked || player.autoAimPaused) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // マウスを動かしている間はスナップを抑制してロックも解除（タイマーは継続）。
        // しきい値を設定から取るのは、canvas の拡大率で物理的なマウスの体感が
        // 変わるため（Constants 側のコメント参照）。環境ごとの正解が1つに決まらない
        const releaseThreshold = this.settings?.autoAimRelease ?? AUTO_AIM_CANCEL_THRESHOLD_DEFAULT;
        if (dx + dy > releaseThreshold) {
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
        // ここでシミュレーションが止まるので、鳴り続ける音は自分で止める。
        // バスは引かない（この直後のファンファーレは同じバスを通るため）
        audioManager.stopLoopingSe();
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
            // 設定が ON のときだけミサイルへ持ち替える。既定は OFF＝現行どおり
            // 持ち替えない（リスポーン時に missile へ戻すのは respawn() の仕事で、
            // こちらはプレイ中のドッキング）
            if (this.settings?.autoSwitchMissile) player.currentWeapon = 'missile';
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
                    player.consumeGrenade();
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
                    player.consumeGrenade();
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
        player.consumeMissile();
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
        // 減算そのものは Player 側。オーバードライブ中に減らさない判定を
        // consumeMissile と同じ場所に寄せてある
        player.consumeMGRound();
    },

    // ==========================================
    // DRAW
    // ==========================================
    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 面セレクトはデモ巡回に含めない（タイムアタック専用の単発画面なので、
        // DEMO_SCREEN_DRAWERS の表を通すと位置ドットが付いてアトラクトの一部に見えてしまう）
        if (this.gameState === 'stage_select') {
            this.screenRenderer.drawStageSelect(ctx);
            return;
        }

        // Full-screen states — skip world rendering.
        // どの画面も「専用の描画 → 位置ドット → 終わり」で同じなので、
        // 違いのある1行だけを DEMO_SCREEN_DRAWERS の表に置く。
        const drawDemoScreen = DEMO_SCREEN_DRAWERS[this.gameState];
        if (drawDemoScreen) {
            drawDemoScreen(this, ctx);
            this.screenRenderer.drawDemoCycleDots(ctx, this._demoCycleIndex(), this._availableDemoStates().length);
            return;
        }

        // 設定画面は背後を残して重ねる。プレイ中なら止まった戦場の上、
        // タイトルなら（上の表で描かれた）タイトル画面の上に出る
        if (this.gameState === 'settings' && this.settingsReturnTo !== 'playing') {
            this.screenRenderer.drawTitleScreen(ctx);
            this.screenRenderer.drawSettings(ctx, this._settingsViewState());
            return;
        }

        this._drawWorld(ctx);
        this.hud.draw(ctx);
        this.crosshair.draw(ctx);
        this._drawOverlays(ctx);
        // 母艦の方向矢印はミニマップより上の面に描く。HUD.draw() の中に
        // あるとミニマップに隠れてしまうため、ミニマップ(_drawOverlays)より
        // 後に呼ぶ（ユーザー要望: 矢印はミニマップより手前に見えてほしい）。
        this.hud.drawCarrierArrow(ctx);

        if (this.gameState === 'settings') {
            this.screenRenderer.drawSettings(ctx, this._settingsViewState());
        }
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
        for (const mine of this.landmines) {
            if (!isInView(mine, this.camera, this.canvas, VIEW_CULL_MARGIN)) continue;
            mine.draw(ctx);
        }
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
            // 画面に掛かっていない敵は描かない。実測(2026-08-16)で敵は平均100体
            // いるのに画面内は16%だけで、**1体あたりの ctx 呼び出しが 23.0 → 1.1**
            // （フレーム合計 1886 → 108）になった。
            // **更新は間引かない**（画面外でも巡回や帰還を続ける必要がある）ので、
            // ここで飛ばしても挙動は一切変わらない。敵6クラスの draw() に
            // 描画以外の副作用が無いことは確認済み
            if (!isInView(enemy, this.camera, this.canvas, VIEW_CULL_MARGIN)) continue;
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
        // **面セレクトのランは週スコアに出さない**ので、週ハイスコアの側は見ない。
        // 単独の1面だけを遊んだ記録が通しランと同じ表に並ぶのは筋が通らないため。
        const weeklyEligible = !this.stageSelectRun && this.highScoreManager.isHighScore(this.score);
        const eligible = weeklyEligible || this._anyStageWouldRank();
        if (eligible) {
            this.gameState = 'ranking_entry';
            this.playerNameInput = "";
            audioManager.playRankingBGM();
        } else {
            // 全クリアからここへ来る経路があるので、タイトルへは
            // _enterDemoState を通す（効果音を落とすのはそちらの仕事）
            this._enterDemoState('title');
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

        // 敵も敵弾も、機体の中心が範囲に入ったら警報。x,y が左上か中心かは
        // クラスによって違うので、中心の求め方は centerOf に任せる。
        const nearCarrier = (obj) => {
            if (!obj.alive) return false;
            const c = centerOf(obj);
            return (cx - c.x) ** 2 + (cy - c.y) ** 2 < rangeSq;
        };

        this.proximityAlertActive = this.enemies.some(nearCarrier)
            || this.enemyBullets.some(nearCarrier);

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
        // -/+ が動かすのは全体音量なので、HUD もそれを映す
        this.screenRenderer.drawVolumeIndicator(
            this.ctx, this.settings ? this.settings.masterVolume : 1, this.volumeHudTimer,
        );

        this.input.endFrame();
        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Mixins
// ============================================
//
// 画面フローなど、ループ本体と関係のないメソッド群は別ファイルに分けて
// ここで `Game` に混ぜている。`this` の意味は変わらないので、
// `Game._updateSettings.call(fakeGame)` というテストの呼び方もそのまま通る。
Object.assign(Game, SettingsFlow, AttractFlow);

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
// Guarded so this module can be imported in a DOM-less test environment
// (e.g. `node --test`) purely to unit-test plain methods on `Game`.
if (typeof document !== 'undefined') {
    Game.init();
}
