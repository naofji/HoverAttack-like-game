import { BGMManager } from './BGMManager.js';
import { MP3BGMManager } from './MP3BGMManager.js';
import { effectiveVolumes } from '../utils/settings.js';
import { clampVolume, loadBgmVolume, saveBgmVolume } from '../utils/bgmVolume.js';
import { AudioStings } from './sounds/stings.js';
import { AudioPlayerSounds } from './sounds/playerSounds.js';
import { AudioLoopSounds } from './sounds/loopSounds.js';
import { AudioEnemySounds } from './sounds/enemySounds.js';
import { AudioOutput } from './engine/output.js';
import { AudioSeBus } from './engine/seBus.js';
import { AudioHover } from './sounds/hover.js';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.seFaded = false;    // 効果音を引いた状態か
        this.seFade = null;      // 効果音だけを引くための段（ゲームオーバー用）
        this.seUserGain = null;  // ユーザー設定の効果音音量（seFade とは別の段）
        this.seUserVolume = 1.0; // AudioContext がまだ無い段階でも覚えておく
        this.stingMasterVolume = 1.0; // 状態を告げる曲（ゲームオーバー等）に掛ける全体音量。applySettings() 未実行時は素通し
        this.seMaster = null;    // 効果音の底上げ（BGM は通さない）
        this.listenerX = null;   // 画面中心のワールドX（左右の振り分けの基準）
        this.listenerView = null;// いま映っている矩形（位置による音量の基準）
        // 0〜1。「実効値」＝ 設定画面の マスター音量 × BGM 音量 の積。
        // BGM 個別の値ではないので、旧キー（hoverAttack.bgmVolume）へ書き戻すのに
        // このフィールドを使ってはいけない（それをやって旧キーの意味が壊れたのが
        // 今回の不具合。詳しくは setBgmVolume() / _applyBgmVolume() のコメント）
        this.bgmVolume = loadBgmVolume();   // 前回の設定を引き継ぐ（起動直後のみ旧キーの生値）
        this.hoverOsc = null;
        this.hoverNoise = null;
        this.hoverGain = null;
        this.isHovering = false;
        this.noiseBuffer = null;
        this.hoverRPM = 0; // Tracks internal engine rev-up (0.0 to 1.0)
        this._loops = {};        // 鳴り続けている音（key → ノード束）
        this.bgm = null;
        this.useMP3BGM = true; // Set to true to use an external MP3 file
        this.alarmBuffer = null;
        this._alarmLoading = false;
    }

    /**
     * WebAudio が使えるか。node:test のような DOM の無い環境では使えない。
     * ゲームロジックのテスト中に敵が射撃するなどして音が鳴ろうとしたとき、
     * ここで弾かないと例外になる（実際にテストが不定期に落ちる原因だった）。
     */
    get available() {
        return typeof window !== 'undefined'
            && !!(window.AudioContext || window.webkitAudioContext);
    }

    init() {
        if (this.ctx) return;
        if (!this.available) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._createSeBus();
        this._createNoiseBuffer();

        if (this.useMP3BGM) {
            this.bgm = new MP3BGMManager(this.ctx);
        } else {
            this.bgm = new BGMManager(this.ctx);
        }
        // BGM は init() で初めて作られるので、保存済みの設定をここで流し込む
        this.bgm.setVolume(this.bgmVolume);

        this._loadAlarmSound();

        // Resume context and retry BGM on first user interaction (browser policy)
        const resume = () => {
            if (!this.ctx) return;
            this._resume();
            if (this.ctx.state === 'running') {
                if (this.bgm && !this.bgm.playing && this.bgm.url && this.bgm.url.endsWith('title.mp3')) {
                    this.bgm.start();
                }
                document.removeEventListener('click', resume);
                document.removeEventListener('keydown', resume);
            }
        };
        document.addEventListener('click', resume);
        document.addEventListener('keydown', resume);
    }

    _createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }

    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /** Convenience: ensure context is initialized and running. */
    /**
     * 音を鳴らす前の準備。鳴らせない環境なら false を返すので、
     * 各 play メソッドは先頭で `if (!this._prepare()) return;` とする。
     * @returns {boolean} 音を鳴らせるか
     */
    _prepare() {
        this.init();
        if (!this.ctx) return false;
        this._resume();
        return true;
    }

    /**
     * Build a wave-shaper distortion curve.
     * @param {number} amount - Distortion intensity (higher = more distorted).
     */
    _makeDistortionCurve(amount) {
        const k         = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve     = new Float32Array(n_samples);
        const deg       = Math.PI / 180;
        for (let i = 0; i < n_samples; i++) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    /**
     * BGM の音量を音に反映するだけ（保存はしない）。
     *
     * 設定画面の applySettings() 専用。ここで渡される v は「マスター×BGM」の
     * 実効値であって、ユーザーが設定した BGM 個別の値ではない。保存まで
     * やってしまうと、旧キー（hoverAttack.bgmVolume＝ -/+ の時代からある値）に
     * 実効値が書き込まれてしまい、「旧キーは書き換えない（設定画面を戻したときに
     * 前の音量が残るように）」という設計を壊す。実際に、マスター 50%・BGM 100%
     * にすると旧キーへ 0.5 が保存される不具合になっていた。保存が要る場面は
     * setBgmVolume() を使うこと。
     * @param {number} v 0〜1（実効値）
     */
    _applyBgmVolume(v) {
        this.bgmVolume = clampVolume(v);
        if (this.bgm) this.bgm.setVolume(this.bgmVolume);
    }

    /**
     * BGM の音量を設定して保存する。
     * AudioContext がまだ無い（音を鳴らす前）段階でも値は覚えておき、
     * init() で BGM を作るときに反映する。
     *
     * 現在の呼び出し元は無い（設定画面は _applyBgmVolume() を使う）。それでも
     * 残しているのは、「保存もする BGM 単体の入り口」が要る場面（例えば将来
     * 設定画面を経ない直接操作を足すとき）のための公開 API として。
     * ここで保存する v は実効値ではなく BGM 単体の値である前提。実効値を渡すと
     * 旧キーの意味が壊れるので、呼ぶ側は effectiveVolumes() を通した後の値を
     * 渡さないこと。
     * @param {number} v 0〜1
     */
    setBgmVolume(v) {
        this._applyBgmVolume(v);
        saveBgmVolume(this.bgmVolume);
        return this.bgmVolume;
    }

    /**
     * ユーザー設定を音に反映する。値が変わるたびに呼んでよい。
     *
     * BGM と効果音は別々の経路なので、マスターを掛けた実効値をそれぞれに配る
     * （utils/settings.js の effectiveVolumes がその計算を持つ）。
     * BGM 側は _applyBgmVolume()（保存しない）を使う。保存は saveSettings() が
     * settings 全体をまとめて1キーに書くので、ここで setBgmVolume() を呼んで
     * 旧キーに実効値を書き込んでしまうと二重保存になり、旧キーの意味も壊れる。
     *
     * ゲームオーバーのファンファーレ（playGameOver）は SE バスを通らず
     * 「全体音量」だけに従う設計なので、実効値とは別にマスター単体も覚えておく。
     * @param {object} [settings]
     */
    applySettings(settings) {
        if (!settings) return;
        const { bgm, se } = effectiveVolumes(settings);
        this._applyBgmVolume(bgm);
        this.seUserVolume = se;
        // ワンショットの「状態を告げる曲」用。SE バスを迂回するため、
        // マスター単体をここで覚えておいて、鳴らす瞬間に掛ける
        this.stingMasterVolume = clampVolume(settings.masterVolume);
        // AudioContext がまだ無い（音を鳴らす前）段階でも値は覚えておき、
        // init() でノードを作るときに反映する
        if (this.seUserGain) this.seUserGain.gain.value = se;
    }

}

// ============================================
// Mixins
// ============================================
//
// 音の系統ごとに別ファイルへ分け、ここで prototype に混ぜている。
// `this` の意味は変わらないので、audio-manager.test.js の総当たり
// （prototype の own property を列挙して引数なしで呼ぶ）もそのまま通る。
Object.assign(
    AudioManager.prototype,
    AudioSeBus, AudioOutput,
    AudioHover,    AudioEnemySounds, AudioLoopSounds, AudioPlayerSounds, AudioStings,
);

export const audioManager = new AudioManager();
