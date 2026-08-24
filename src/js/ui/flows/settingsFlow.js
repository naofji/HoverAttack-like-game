// ============================================
// Settings Flow
// ============================================
//
// 設定画面の開閉・カーソル移動・全画面の復帰。main.js から切り出した。
//
// **`Game` へ Object.assign で混ぜる前提のオブジェクトリテラル**であり、
// メソッドの `this` は `Game`（またはテストが渡す偽 game）を指す。
// 関数化して `game` を第一引数に取る形にしなかったのは、テストが
// `Game._updateSettings.call(fakeGame)` という呼び方をしているため —
// 引数の形を変えると「動かしただけ」ではなくなり、移動が正しかったことを
// テストで証明できなくなる。

import { VOLUME_STEP_FINE } from '../../utils/Constants.js';
import { saveSettings, stepSetting } from '../../utils/settings.js';
import { visibleSettingsItems } from '../settingsItems.js';
import { enterFullscreen } from '../../utils/fullscreen.js';
import { audioManager } from '../../audio/AudioManager.js';

export const SettingsFlow = {
    /**
     * 設定画面を開く。プレイ中に開いた場合はここでゲーム時間が止まる
     * （_updatePlaying() を呼ばなくなるだけ。タイマーもアキュムレータも
     * その中で進むので、止めるための特別な処理は要らない）。
     * @param {string} from 戻り先の状態名
     */
    _openSettings(from) {
        this.settingsReturnTo = from;
        this.gameState = 'settings';
        this.settingsIndex = 0;
        this.confirmingQuit = false;
        this.showingControls = false;
        // 自機が止まっているのに噴射音が鳴り続けるのは不自然なので、
        // ループする音だけ止める。BGM と単発の効果音はそのまま
        audioManager.stopLoopingSe();
    },

    /** 設定画面を閉じて元の状態へ戻る。 */
    _closeSettings() {
        this.gameState = this.settingsReturnTo || 'title';
        this.settingsReturnTo = null;
        this.confirmingQuit = false;
        this.showingControls = false;
        // 設定画面で AUTO FULLSCREEN を ON にしてそのまま閉じれば即座に効く。
        // Escape で閉じた場合はブラウザが全画面を解除しているので、ここで戻る
        this._restoreFullscreen();
    },

    /** 設定を保存し、音へ反映する。値を変えるたびに呼ぶ。 */
    _saveSettings() {
        saveSettings(this.settings);
        audioManager.applySettings(this.settings);
    },

    _updateSettings() {
        const items = visibleSettingsItems(this.settingsReturnTo === 'playing');

        // WASD とカーソルキーを等価に受ける（_nav）。設定画面は ←/→ も使う ──
        // デモ画面送り（_handleDemoJump）と同じキーだが、設定画面は
        // _updateGameState() の別の分岐で、そちらを通らないので衝突しない
        const nav = (key, arrow) => this._nav(key, arrow);

        // 操作一覧を読んでいる間は裏の設定を動かさない。カーソルや値が動くと、
        // 閉じたときに知らぬ間に設定が変わっていることになる。
        // Escape / P で閉じる経路は update() 側にある（設定画面ごと閉じないため）
        if (this.showingControls) {
            if (this.input.isKeyPressed('Enter')) this.showingControls = false;
            return;
        }

        if (this.confirmingQuit) {
            // 確認中は A/D（←/→）で YES/NO を選び、Enter で決める。既定は NO
            if (nav('KeyA', 'ArrowLeft')) this.quitChoiceYes = true;
            if (nav('KeyD', 'ArrowRight')) this.quitChoiceYes = false;
            if (this.input.isKeyPressed('Enter')) {
                if (this.quitChoiceYes) {
                    this.confirmingQuit = false;
                    this.settingsReturnTo = null;
                    this._enterDemoState('title');
                } else {
                    this.confirmingQuit = false;
                }
            }
            return;
        }

        // 端で止めず、反対側へ回り込む。項目が11個あるので、下のほうの行
        // （途中終了）へ行くのに毎回上から辿るのは遠い。剰余の前に length を
        // 足しているのは、0 で上を押したときに負にならないようにするため。
        // 回り込む先は表の長さではなく**その場面で出ている項目の数**
        // （タイトルからは途中終了が出ないので1つ少ない）
        if (nav('KeyW', 'ArrowUp')) {
            this.settingsIndex = (this.settingsIndex - 1 + items.length) % items.length;
        }
        if (nav('KeyS', 'ArrowDown')) {
            this.settingsIndex = (this.settingsIndex + 1) % items.length;
        }

        // item は W/S を処理した**後**に取る。先に取ると、同じフレームで
        // 行を移動しつつ A/D を押したときに移動前の項目を動かしてしまう
        const item = items[this.settingsIndex];
        if (!item) return;

        if (item.type === 'action') {
            if (this.input.isKeyPressed('Enter')) {
                if (item.confirm) {
                    this.confirmingQuit = true;
                    this.quitChoiceYes = false;   // 既定は NO。押し間違いで捨てない
                } else if (item.run) {
                    item.run(this);
                }
            }
            return;
        }

        let direction = 0;
        if (nav('KeyD', 'ArrowRight')) direction = +1;
        else if (nav('KeyA', 'ArrowLeft')) direction = -1;
        if (direction !== 0) {
            const wasAutoFullscreen = this.settings.autoFullscreen;
            this.settings = stepSetting(this.settings, item.key, direction, VOLUME_STEP_FINE);
            this._saveSettings();
            // AUTO FULLSCREEN を OFF→ON へ動かした瞬間だけ、その場で全画面へ入る
            // （ユーザーの決定：スイッチをいじらなければ次の画面遷移まで待つが、
            // 触った瞬間は「その時点から全画面」という体験にする）。この D キー押下の
            // ユーザー操作（transient activation）がまだ生きているので requestFullscreen が
            // 許可される — _restoreFullscreen() の4箇所と同じ制約。既に ON のまま
            // 連打したときや OFF へ動かしたときには呼ばない
            if (item.key === 'autoFullscreen' && !wasAutoFullscreen && this.settings.autoFullscreen) {
                enterFullscreen();
            }
        }
    },

    /** 設定画面の描画に渡す状態をまとめる。 */
    _settingsViewState() {
        return {
            settings: this.settings,
            index: this.settingsIndex,
            fromPlaying: this.settingsReturnTo === 'playing',
            confirmingQuit: this.confirmingQuit,
            quitChoiceYes: this.quitChoiceYes,
            showingControls: this.showingControls,
        };
    },

    /**
     * 画面遷移の節目で全画面へ戻す。設定が OFF なら何もしない。
     *
     * **呼べる場所はブラウザの制約で決まる。** requestFullscreen はユーザー操作の
     * 直後（transient activation が生きている間）でないと拒否されるので、
     * キーやクリックを受けたその回の更新からしか呼べない。時間で進む遷移
     * （ゲームオーバー4秒・全クリア7秒の自動遷移）に入れていないのはそのため。
     * その場合は次に入力を伴う節目で戻る。
     *
     * 規則をこの1メソッドに集約しているのは、enterFullscreen() を main.js に
     * 散らすと「どこで戻るのか」が追えなくなるため。
     *
     * enterFullscreen() は既に全画面なら何もしない（冪等）。M キーで入れた
     * 全画面をここが壊すことはない。
     */
    _restoreFullscreen() {
        if (this.settings?.autoFullscreen) enterFullscreen();
    },
};
