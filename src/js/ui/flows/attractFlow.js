// ============================================
// Attract Flow
// ============================================
//
// タイトル画面・デモループの巡回・モード選択・面セレクト・遊び方と
// ランキング4画面の「更新」側。描画は ScreenRenderer と demoScreens.js。
//
// settingsFlow.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラル。`this` は Game を指す（理由は settingsFlow.js の冒頭）。

import { MODES, cycleMode } from '../../utils/modes.js';
import { audioManager } from '../../audio/AudioManager.js';
import { DEMO_CYCLE_STATES } from './demoScreens.js';

export const AttractFlow = {
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

    /**
     * デモループの画面に入る。Escape・左右キーでの移動・自動送りの
     * すべてがここを通る。
     *
     * 画面ごとの入り口の始末（順位のハイライト消し、面送りの巻き戻し、
     * タイトル曲）は以前この関数と自動送りの両方に書かれていて、
     * 自動送りで入ったときだけ処理が抜ける形になりやすかった。
     */
    _enterDemoState(state) {
        this.gameState = state;
        this.stateTimer = 0;
        // 面セレクトのランはここで終わったことにする。stageSelectRun を true に
        // するのは _startStageSelectRun() だけで、以前は false に戻すのが
        // 新しい通しランを始める経路だけだった。そのため面セレクトのランを
        // Escape 等で切り上げてデモ／タイトルへ戻っても true のまま残り、
        // タイトルのメニューから CONTINUE が消えたままになる
        // （titleMenuItems() が canContinueHere() を見るため）。
        this.stageSelectRun = false;
        // ミッションを抜けるので効果音を落とす。ホバー音・母艦のエンジン・
        // 回復ハムは止める指示があるまで鳴り続ける作りで、ここを抜けると
        // 毎フレームの更新も止まるため、放っておくとタイトルで鳴りっぱなしに
        // なる（Escape で抜けたときに実際そうなっていた）。
        // 鳴っていなければ何もしないので、画面が変わるたびに呼んで構わない。
        // 'playing' に戻ると update() が resumeSe() でバスを戻す。
        audioManager.fadeOutSe();
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
     * デモ画面（遊び方・ランキング4種）から ENTER／クリックでタイトルへ戻す。
     *
     * **以前はここが「どの画面からでも即 1面スタート」だった。** コンティニューと
     * 面セレクトを足したことで、同じ ENTER が画面によって「開始」「決定」と
     * 意味を変えるようになり分かりにくくなった（ユーザーの判断）。**ゲームを
     * 始める入口はタイトルのメニュー1箇所だけ**にして、ENTER はどこでも
     * 「決定」に統一した。デモ画面での決定は「メニューへ戻る」。
     * @returns {boolean} 戻ったら true
     */
    _returnToTitleIfRequested() {
        if (!this._anyKeyOrClick()) return false;
        this._enterDemoState('title');
        return true;
    },

    /**
     * タイトルのメニューに今並ぶ項目。**使えないものは並べない** —
     * 出ている＝選べる、を保つため（グレーで出すと「なぜ選べないのか」を
     * 別途説明する羽目になる）。
     *
     * `continue` の条件は `canContinueHere()` と同一にしてある。片方だけ
     * 変えると「行は出ているのに決定しても何も起きない」が生まれる。
     */
    titleMenuItems() {
        const items = ['start'];
        if (this.canContinueHere()) items.push('continue');
        if (this.saveManager && this.saveManager.reached >= 1) items.push('stageSelect');
        return items;
    },

    /**
     * 今選ばれている項目。**毎回 items から引き直す** — 週替わりでセーブが
     * 消えるなど、項目が減って titleMenuIndex が範囲外に残ることがあるため。
     */
    selectedTitleItem() {
        const items = this.titleMenuItems();
        return items[Math.min(this.titleMenuIndex, items.length - 1)];
    },

    /**
     * WASD とカーソルキーを等価に受ける。ゲーム中の移動が A/D と ←/→ の
     * どちらでも動くので、メニュー類だけ WASD 限定なのは揃っていなかった。
     *
     * **タイトルでは ←/→ を渡さないこと。** あちらはデモ画面送り
     * （_handleDemoJump）が使っていて衝突する。縦の ↑/↓ だけが空いている。
     */
    _nav(key, arrow) {
        return this.input.isKeyPressed(key) || this.input.isKeyPressed(arrow);
    },

    _updateTitle(deltaTime) {
        // A/D は横の選択（モード）、W/S は縦の選択（メニュー）、ENTER が決定。
        // 面セレクト画面も同じ規則で動く
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

        const items = this.titleMenuItems();
        // 端で止める（巡回させない）。項目が3つまでしかなく、巡回すると
        // 「一番下から下を押したら START に戻った」が事故に見える
        this.titleMenuIndex = Math.min(this.titleMenuIndex, items.length - 1);
        if (this._nav('KeyW', 'ArrowUp')) {
            this.titleMenuIndex = Math.max(0, this.titleMenuIndex - 1);
            return;
        }
        if (this._nav('KeyS', 'ArrowDown')) {
            this.titleMenuIndex = Math.min(items.length - 1, this.titleMenuIndex + 1);
            return;
        }
        if (this._handleDemoJump()) return;

        if (this._anyKeyOrClick()) {
            this._activateTitleMenu();
            return;
        }

        this.stateTimer += deltaTime;
        if (this.stateTimer > 8000) {
            this._enterDemoState('how_to_play');
            this._refreshOnline(); // prefetch online data during how_to_play + local so GLOBAL/FAME are ready
        }
    },

    /** メニューの決定。全画面へ入れるのはここが入力直後にしか通らないため。 */
    _activateTitleMenu() {
        // 開始と同時に全画面へ入る。M キーを押さなくても最大化してほしい、という
        // 実機の要望。_anyKeyOrClick() が真＝この更新の直前にキーかクリックがあった
        // 場合しか通らないので、transient activation が生きている
        this._restoreFullscreen();
        switch (this.selectedTitleItem()) {
            case 'continue':
                this.continueFromSave();
                return;
            case 'stageSelect':
                this.stageSelectIndex = 1;
                this.gameState = 'stage_select';
                this.stateTimer = 0;
                return;
            default:
                // 新しい通しラン。**セーブは消さない** — 誤って決定しても
                // 続きを失わないように、次にセーブが成立するまで残す
                this.runTries = 1;
                this.stageSelectRun = false;
                this.stateManager.restart();
                this.gameState = 'playing';
                audioManager.startBGM(this.missionsCompleted);
        }
    },

    /**
     * 面セレクト。**タイムアタック用**なので、選んだ面だけを単独で遊ぶ。
     *
     * 面は縦に並ぶので W/S で選び、ENTER で決定する——タイトルのメニューと
     * 同じ手つき。以前は A/D で選んで W で始める形だったが、A/D は
     * 「横の選択（モード）」、W/S は「縦の選択」、ENTER は「決定」と
     * 役割を固定した方が覚えることが減る（ユーザーの判断）。
     *
     * Escape は本番では main.js の共通ハンドラ（'title'/'playing'/'settings' 以外は
     * Escape でタイトルへ戻す仕組み）が先に拾うので、この分岐に実際は届かない。
     * それでもここに残すのは、このメソッド単体でテストしたときの意味を保つため。
     */
    _updateStageSelect() {
        const max = this.saveManager.reached;
        if (this.input.isKeyPressed('Escape')) {
            this._enterDemoState('title');
            return;
        }
        if (this._nav('KeyW', 'ArrowUp')) {
            this.stageSelectIndex = Math.max(1, this.stageSelectIndex - 1);
            return;
        }
        if (this._nav('KeyS', 'ArrowDown')) {
            this.stageSelectIndex = Math.min(max, this.stageSelectIndex + 1);
            return;
        }
        if (this._anyKeyOrClick()) {
            this._startStageSelectRun(this.stageSelectIndex);
        }
    },

    /**
     * 面セレクトから始める。スコアもタイムも 0 から。
     * resetLevel(true) を使わないのは、あちらが missionsCompleted を
     * debugStartMission へ戻してしまい、選んだ面が無視されるため。
     */
    _startStageSelectRun(stage) {
        this._restoreFullscreen();
        this.stageSelectRun = true;
        this.runTries = 1;
        this.missionsCompleted = stage - 1;
        this.score = 0;
        this.totalTime = 0;
        this.stageResults = [];
        this.gameState = 'playing';
        this.stateManager.resetLevel(false);
        audioManager.startBGM(this.missionsCompleted);
    },

    _updateHowToPlay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this._enterDemoState('local_ranking_display');
        } else {
            this._returnToTitleIfRequested();
        }
    },

    _updateLocalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            // オンラインの記録が取れていなければ GLOBAL は飛ばす
            const hasOnline = this.onlineStatus === 'ok' && this.onlineData;
            this._enterDemoState(hasOnline ? 'global_ranking_display' : 'title');
        } else {
            this._returnToTitleIfRequested();
        }
    },

    _updateGlobalRanking(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            // Only show stage rankings for stages the player has actually reached
            // locally (keep unseen stages — and their enemies — a surprise).
            const hasStages = this.maxStageReached() >= 1;
            this._enterDemoState(hasStages ? 'stage_ranking_display' : 'wall_of_fame_display');
        } else {
            this._returnToTitleIfRequested();
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
                this._enterDemoState('wall_of_fame_display');
                return;
            }
        }
        this._returnToTitleIfRequested();
    },

    _updateWallOfFameDisplay(deltaTime) {
        if (this._handleDemoJump()) return;

        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this._enterDemoState('title');
        } else {
            this._returnToTitleIfRequested();
        }
    },
};
