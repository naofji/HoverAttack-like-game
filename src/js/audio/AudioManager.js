import { BGMManager } from './BGMManager.js';
import { MP3BGMManager } from './MP3BGMManager.js';
import { effectiveVolumes } from '../utils/settings.js';
import {
    PLAYER_HOVER_MAX_FREQ, SE_MASTER_GAIN, SE_COMP_THRESHOLD,
    SE_COMP_KNEE, SE_COMP_RATIO, SE_COMP_ATTACK,
    SE_COMP_RELEASE, SE_FADE_OUT_SECONDS,
} from '../utils/Constants.js';
import { clampVolume, loadBgmVolume, saveBgmVolume } from '../utils/bgmVolume.js';
import { AudioStings } from './sounds/stings.js';
import { AudioPlayerSounds } from './sounds/playerSounds.js';
import { AudioLoopSounds } from './sounds/loopSounds.js';
import { AudioEnemySounds } from './sounds/enemySounds.js';
import { AudioOutput } from './engine/output.js';

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

    // --- Hover (Engine) Sounds ---
    playHover(pitch = 1.0) {
        if (!this._prepare()) return;

        if (!this.hoverOsc) {
            this.hoverOsc = this.ctx.createOscillator();
            this.hoverNoise = this.ctx.createBufferSource();
            this.hoverGain = this.ctx.createGain();
            this.hoverNoise.buffer = this.noiseBuffer;
            this.hoverNoise.loop = true;

            this.hoverOsc.type = 'sawtooth';

            // Distortion for the oscillator (engine growl)
            const distortion = this.ctx.createWaveShaper();
            distortion.curve = this._makeDistortionCurve(400);
            distortion.oversample = '4x';

            // Filter for the oscillator (muffled tone)
            const oscFilter = this.ctx.createBiquadFilter();
            oscFilter.type = 'lowpass';
            oscFilter.frequency.value = 300;

            // Resonant filter for the noise
            this.hoverNoiseFilter = this.ctx.createBiquadFilter();
            this.hoverNoiseFilter.type = 'bandpass';
            this.hoverNoiseFilter.Q.value = 5;

            // Separate gains to control volume independently
            this.oscGain = this.ctx.createGain();
            this.oscGain.gain.value = 0.4; // Oscillator volume (relative)

            this.noiseGain = this.ctx.createGain();
            this.noiseGain.gain.value = 1.2; // Noise volume (louder as requested)

            // Connect oscillator -> distortion -> filter -> oscGain -> hoverGain
            this.hoverOsc.connect(distortion);
            distortion.connect(oscFilter);
            oscFilter.connect(this.oscGain);
            this.oscGain.connect(this.hoverGain);

            // Connect noise -> noiseFilter -> noiseGain -> hoverGain
            this.hoverNoise.connect(this.hoverNoiseFilter);
            this.hoverNoiseFilter.connect(this.noiseGain);
            this.noiseGain.connect(this.hoverGain);

            this.hoverGain.connect(this._seDest());

            this.hoverGain.gain.setValueAtTime(0, this.ctx.currentTime);
            // Overall master volume remains around 0.06
            this.hoverGain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.1);

            this.hoverOsc.start();
            this.hoverNoise.start();
            this.hoverRPM = 0; // Reset RPM on start
        }

        // Increase RPM over time (simulates engine revving up)
        this.hoverRPM = Math.min(1.0, this.hoverRPM + (1 - this.hoverRPM) * 0.2);

        // Modulate pitch based on RPM
        const minFreq = 10;
        const maxFreq = PLAYER_HOVER_MAX_FREQ;
        const freq = minFreq + (maxFreq - minFreq) * this.hoverRPM;

        // Apply frequency to both the oscillator and the noise filter
        this.hoverOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.15);
        if (this.hoverNoiseFilter) {
            this.hoverNoiseFilter.frequency.setTargetAtTime(freq * 2, this.ctx.currentTime, 0.15);
        }

        this.isHovering = true;
    }

    stopHover() {
        if (this.hoverGain) {
            this.hoverGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
            this.hoverRPM = 0; // Reset RPM when stopping
            setTimeout(() => {
                if (this.hoverOsc && !this.isHovering) {
                    this.hoverOsc.stop();
                    this.hoverOsc.disconnect();
                    if (this.hoverNoise) {
                        this.hoverNoise.stop();
                        this.hoverNoise.disconnect();
                    }
                    this.hoverOsc = null;
                    this.hoverNoise = null;
                    this.hoverGain = null;
                }
            }, 200);
        }
        this.isHovering = false;
    }

    // --- Explosions & Bursts ---
    /**
     * 効果音のマスターバスを作る。効果音 → ゲイン → リミッタ → 出力。
     *
     * 効果音は元々29箇所が個別に destination へ繋がっていて、全体を上げる
     * 場所が無かった。素で 1.0 を超える音（ホバー音は 1.2）があるため、
     * 単純に持ち上げると割れる。圧縮を挟んでから持ち上げている。
     * BGM はこのバスを通さない。BGM の音量調節と独立させるため。
     */
    _createSeBus() {
        // 効果音 → フェード段 → 底上げ → リミッタ → 出力
        //
        // フェード段を分けているのは、ゲームオーバーで効果音だけを引くため。
        // 底上げとリミッタより手前に置くことで、そこを通らない音（ゲーム
        // オーバーの曲）は音量も掛かり方も変わらないまま残る。
        this.seMaster = this.ctx.createGain();
        this.seMaster.gain.value = SE_MASTER_GAIN;
        this.seFade = this.ctx.createGain();
        this.seFade.gain.value = 1;
        // ユーザー設定の音量は seFade とは別の段にする。同じ段を使うと、
        // ゲームオーバーのフェードとユーザー設定が互いを上書きしてしまう
        this.seUserGain = this.ctx.createGain();
        this.seUserGain.gain.value = this.seUserVolume;
        this.seFade.connect(this.seUserGain);
        this.seUserGain.connect(this.seMaster);

        if (typeof this.ctx.createDynamicsCompressor === 'function') {
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = SE_COMP_THRESHOLD;
            comp.knee.value = SE_COMP_KNEE;
            comp.ratio.value = SE_COMP_RATIO;
            comp.attack.value = SE_COMP_ATTACK;
            comp.release.value = SE_COMP_RELEASE;
            this.seMaster.connect(comp);
            comp.connect(this.ctx.destination);
        } else {
            this.seMaster.connect(this.ctx.destination);
        }
    }

    /**
     * 効果音の接続先。バスがまだ無ければ素の出力に落ちる。
     * @returns {AudioNode}
     */
    _seDest() {
        return this.seFade || this.ctx.destination;
    }

    /**
     * 鳴り続ける音の共通の骨格。
     *
     * 「無ければ作る → 毎回 setTargetAtTime で追従させる」という形は
     * エンジンにも補給のハムにも要る。ここに集約して、
     * 音ごとの違いは build / tune の2つだけに出るようにしてある。
     * （ホバーだけは実測で音量・音色を詰めた経緯があり、この骨格に
     * 乗せ替えると質感が変わる恐れがあるため、あえて手書きのまま残してある）
     *
     * 毎フレーム呼んでよい。呼ぶのをやめるだけでは止まらないので、
     * 止めるときは _stopLoopSound() を呼ぶこと。
     *
     * @param {string} key 音の名前（_loops のキー）
     * @param {{build: () => object, tune: (nodes: object, t: number) => void}} spec
     *   build は `{ gain, sources: [...] }` を含むノード束を返す。
     *   gain は止めるときに引く段、sources は start / stop する音源
     */
    _loopSound(key, spec) {
        if (!this._prepare()) return;
        let nodes = this._loops[key];
        if (!nodes) {
            nodes = spec.build();
            this._loops[key] = nodes;
            for (const src of nodes.sources) src.start();
        }
        spec.tune(nodes, this.ctx.currentTime);
    }

    /**
     * ループ音を止める。ぶつ切りにせず引いてから音源を捨てる。
     * 鳴っていないときや、音の出せない環境で呼んでも何も起きない。
     * @param {string} key
     * @param {number} [fade] 引くのにかける時定数（秒）
     */
    _stopLoopSound(key, fade = 0.12) {
        const nodes = this._loops[key];
        if (!nodes) return;
        this._loops[key] = null;
        nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
        const { sources } = nodes;
        setTimeout(() => {
            for (const src of sources) {
                try { src.stop(); src.disconnect(); } catch (e) { /* 既に停止 */ }
            }
        }, Math.max(250, fade * 2000));
    }

    /**
     * 状態を告げる曲（ゲームオーバーなど）の接続先。
     * 効果音のフェードより後ろに繋ぐので、効果音を引いても残る。
     * @returns {AudioNode}
     */
    _stingDest() {
        return this.seMaster || this.ctx.destination;
    }

    /**
     * 効果音を滑らかに引いて止める。ゲームオーバーで使う。
     *
     * 持続音（自機のホバー・敵のホバー・母艦のエンジン・補給のハム）は音源ごと止める。
     * 音量を戻したときに鳴り出さないようにするため。
     * 状態を告げる曲と BGM はこの段を通らないので影響を受けない。
     *
     * @param {number} [seconds]
     */
    /**
     * 鳴り続ける音を全部止める。
     *
     * 自機のホバー、敵のホバー、母艦のエンジン、回復ハムの4つは、
     * 止める指示があるまで鳴り続ける作り（毎フレームの更新で音量を
     * 追従させている）。ミッションを抜けると更新が止まるので、
     * 抜けるときに明示的に止めないと鳴りっぱなしになる。
     *
     * 効果音バスは触らないので、この後に鳴らす音（クリアのファンファーレ）は
     * 影響を受けない。バスごと引きたいときは fadeOutSe を使う。
     */
    stopLoopingSe() {
        this.stopHover();
        this.stopEnemyHover();
        this.stopCarrierEngine();
        this.stopRepairHum();
    }

    fadeOutSe(seconds = SE_FADE_OUT_SECONDS) {
        this.seFaded = true;
        this.stopLoopingSe();
        if (!this.ctx || !this.seFade) return;

        const t = this.ctx.currentTime;
        this.seFade.gain.cancelScheduledValues(t);
        this.seFade.gain.setValueAtTime(this.seFade.gain.value, t);
        this.seFade.gain.linearRampToValueAtTime(0, t + seconds);
    }

    /**
     * 引いた効果音を戻す。何度呼んでもよいので、プレイ中は毎フレーム
     * 呼んで構わない。どの経路からミッションに入っても無音のまま
     * 取り残されないようにするため。
     */
    resumeSe() {
        if (!this.seFaded) return;
        this.seFaded = false;
        if (!this.ctx || !this.seFade) return;

        const t = this.ctx.currentTime;
        this.seFade.gain.cancelScheduledValues(t);
        this.seFade.gain.setValueAtTime(1, t);
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
    AudioOutput,
    AudioEnemySounds, AudioLoopSounds, AudioPlayerSounds, AudioStings,
);

export const audioManager = new AudioManager();
