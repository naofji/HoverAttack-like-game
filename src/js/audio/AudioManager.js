import { BGMManager } from './BGMManager.js';
import { MP3BGMManager } from './MP3BGMManager.js';
import {
    ENEMY_HOVER_MAX_GAIN, PLAYER_HOVER_MAX_FREQ,
    ENEMY_HOVER_NOISE_FREQ, ENEMY_HOVER_NOISE_Q,
    ENEMY_HOVER_WOBBLE_HZ, ENEMY_HOVER_WOBBLE_DEPTH,
    ENEMY_HOVER_BODY_FREQ, ENEMY_HOVER_BODY_GAIN, ENEMY_HOVER_MAKEUP,
    ENEMY_HOVER_ATTACK, ENEMY_HOVER_RELEASE,
    ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN,
    DRONE_MOVE_FREQ_FROM, DRONE_MOVE_FREQ_TO, DRONE_MOVE_DURATION,
    DRONE_MOVE_FILTER_Q, DRONE_MOVE_FILTER_MULT, DRONE_MOVE_FILTER_END_MULT,
    DRONE_MOVE_DETUNE,
    DRONE_MOVE_GAIN, DRONE_MOVE_SUB_GAIN,
    ENEMY_LANDING_NOISE_HARD, ENEMY_LANDING_NOISE_SOFT,
    ENEMY_LANDING_THUMP_HARD, ENEMY_LANDING_THUMP_SOFT,
    SE_MASTER_GAIN, SE_COMP_THRESHOLD, SE_COMP_KNEE,
    SE_COMP_RATIO, SE_COMP_ATTACK, SE_COMP_RELEASE, SE_FADE_OUT_SECONDS,
    CARRIER_ENGINE_FREQ_BASE, CARRIER_ENGINE_FREQ_RANGE,
    CARRIER_ENGINE_SUB_BASE, CARRIER_ENGINE_SUB_RANGE,
    CARRIER_ENGINE_FILTER_BASE, CARRIER_ENGINE_FILTER_RANGE,
    CARRIER_ENGINE_GAIN_BASE, CARRIER_ENGINE_GAIN_RANGE,
    REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
    REPAIR_HUM_WOBBLE_HZ, REPAIR_HUM_WOBBLE_DEPTH,
} from '../utils/Constants.js';
import { stereoPan, positionalVolume } from '../utils/audioFalloff.js';
import { WEAPON_SOUNDS, renderWeaponSound } from './weaponSounds.js';
import { stepVolume, clampVolume, loadBgmVolume, saveBgmVolume } from '../utils/bgmVolume.js';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.seFaded = false;    // 効果音を引いた状態か
        this.seFade = null;      // 効果音だけを引くための段（ゲームオーバー用）
        this.seMaster = null;    // 効果音の底上げ（BGM は通さない）
        this.listenerX = null;   // 画面中心のワールドX（左右の振り分けの基準）
        this.listenerView = null;// いま映っている矩形（位置による音量の基準）
        this.bgmVolume = loadBgmVolume();   // 0〜1。前回の設定を引き継ぐ
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
        this.seFade.connect(this.seMaster);

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
     * BGM の音量を設定して保存する。
     * AudioContext がまだ無い（音を鳴らす前）段階でも値は覚えておき、
     * init() で BGM を作るときに反映する。
     * @param {number} v 0〜1
     */
    setBgmVolume(v) {
        this.bgmVolume = clampVolume(v);
        if (this.bgm) this.bgm.setVolume(this.bgmVolume);
        saveBgmVolume(this.bgmVolume);
        return this.bgmVolume;
    }

    /**
     * BGM の音量を1段上げ下げする。
     * @param {number} direction +1 で上げ、-1 で下げ
     * @returns {number} 変更後の音量
     */
    adjustBgmVolume(direction) {
        return this.setBgmVolume(stepVolume(this.bgmVolume, direction));
    }

    /**
     * 聞き手の横位置（ワールド座標）を更新する。毎フレーム画面中心を渡す。
     *
     * 自機ではなく画面中心を基準にするのは、見えている位置と聞こえる向きを
     * 一致させるため。カメラはマップ端でクランプされるし、破壊演出中は
     * 撃破地点に留まるので、自機基準だと画面左の爆発が右から鳴りうる。
     *
     * @param {number|null} x 画面中心のワールドX。null で定位を止める
     */
    setListenerX(x) {
        this.listenerX = Number.isFinite(x) ? x : null;
    }

    /**
     * いま映っている範囲を渡す。左右の振り分けと、位置による音量の両方に使う。
     * 毎フレーム呼ぶ。null を渡すと定位も減衰も止まる（メニュー中など）。
     * @param {{cx:number, cy:number, halfW:number, halfH:number}|null} view
     */
    setListenerView(view) {
        this.listenerView = (view && Number.isFinite(view.cx)) ? view : null;
        this.setListenerX(view ? view.cx : null);
    }

    /**
     * 音源の位置から音量の倍率を求める。画面内なら 1、外なら小さくなる。
     * 画面が分からないうちは減衰させない（聞こえないより聞こえる方がまし）。
     * @param {number} x ワールドX
     * @param {number} y ワールドY
     * @returns {number} 0〜1
     */
    _positionalGain(x, y) {
        // 位置を持たない音（自機のリロードなど）は減衰させない。
        // 座標が無いまま計算に入れると NaN になり、黙って無音になる。
        if (x == null || y == null) return 1;
        if (!this.listenerView) return 1;
        return positionalVolume(x, y, this.listenerView);
    }

    /**
     * 音源のワールドX から左右の振り分けを求める。
     * 位置を持たない音（UI・自機の操作音）は sourceX 省略で中央のまま。
     * @param {number} [sourceX]
     * @returns {number} -1（左）〜 +1（右）
     */
    _panFor(sourceX) {
        if (sourceX == null || this.listenerX == null) return 0;
        return stereoPan(sourceX, this.listenerX);
    }

    /**
     * 音の出力先。音源のワールドX を渡すとその位置から聞こえるようになる。
     *
     * StereoPanner が無い環境では素通しして destination を返すので、
     * 呼び出し側は分岐を書かなくてよい。
     *
     * @param {number} [sourceX] 音源のワールドX。省略で中央
     * @returns {AudioNode} connect() の相手
     */
    _out(sourceX) {
        const pan = this._panFor(sourceX);
        if (!pan || typeof this.ctx.createStereoPanner !== 'function') {
            return this._seDest();
        }
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        panner.connect(this._seDest());
        return panner;
    }

    // ------------------------------------------
    // 単発音の組み立て
    //
    // 手続き合成の単発音は、どれも「音源 → (色付け) → ゲインの減衰 → 出力」
    // という同じ配線でできている。この骨組みが十数箇所に写されていて、
    // ノードの作成・接続・start/stop の書き忘れが起きやすかった。
    //
    // WEAPON_SOUNDS の表に載せなかったのは、表の部品が「必ず FLOOR まで
    // 指数減衰する」前提で作られているのに対し、ここの音は減衰の終端値が
    // 0.0001〜0.09 とばらばらで、掃引時間と包絡時間が違うもの、発振器を
    // フィルタや歪みに通すものがあるため。表に寄せると音が変わる。
    // 骨組みだけを共有し、音を決める数値は各メソッドに残す。
    // ------------------------------------------

    /**
     * ノイズの一撃。ローパスを掃引しながら減衰させる。
     *
     * @param {object} o
     * @param {number} o.t 開始時刻
     * @param {number} o.gain 開始ゲイン
     * @param {number} o.dur 包絡の長さ（この時刻に end へ達し、音源も止まる）
     * @param {number} [o.end] 減衰の終端。0 は指定できない（指数ランプのため）
     * @param {number} o.from ローパスの開始周波数
     * @param {number} [o.to] 終了周波数。省略すると掃引しない
     * @param {number} [o.sweepDur] 掃引の長さ。省略すると dur と同じ
     * @param {AudioNode} o.dest 接続先
     * @returns {AudioBufferSourceNode}
     */
    _noiseBurst({ t, gain, dur, end = 0.001, from, to, sweepDur = dur, dest }) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(from, t);
        if (to !== undefined) {
            filter.frequency.exponentialRampToValueAtTime(to, t + sweepDur);
        }

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(end, t + dur);

        noise.connect(filter);
        filter.connect(g);
        g.connect(dest);
        noise.start(t);
        noise.stop(t + dur);
        return noise;
    }

    /**
     * 音程のある一撃。周波数を滑らせながら減衰させる。
     *
     * @param {object} o
     * @param {number} o.t 開始時刻
     * @param {string} o.type 波形
     * @param {number} o.from 開始周波数
     * @param {number} [o.to] 終了周波数。省略すると音程を動かさない
     * @param {number} [o.freqDur] 音程が動く長さ。省略すると dur と同じ
     * @param {number} o.gain 開始ゲイン
     * @param {number} o.dur 包絡の長さ
     * @param {number} [o.end] 減衰の終端
     * @param {AudioNode} [o.through] 発振器とゲインの間に挟むノード（フィルタや歪み）
     * @param {AudioNode} o.dest 接続先
     * @returns {OscillatorNode}
     */
    _toneBurst({ t, type, from, to, freqDur, gain, dur, end = 0.001, through, dest }) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        if (to !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(to, t + (freqDur ?? dur));
        }

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(end, t + dur);

        if (through) {
            osc.connect(through);
            through.connect(g);
        } else {
            osc.connect(g);
        }
        g.connect(dest);
        osc.start(t);
        osc.stop(t + dur);
        return osc;
    }

    /**
     * 敵のホバー音。共有の1ループを、いちばん近い敵の距離で駆動する。
     * 敵ごとにオシレーターを持つと数が増えるほど破綻するため。
     * 自機のホバー音と混ざっても区別できるよう、低めで濁った音にしてある。
     * @param {number} volume 0〜1。距離から求めた音量（nearestHoveringEnemy）
     * @param {number} [sourceX] その敵のワールドX。左右の振り分けに使う
     */
    setEnemyHover(volume, sourceX) {
        // 無音になっても音源は壊さない。敵の噴射は細切れなので、その都度
        // 作り直すと毎回ゼロから立ち上がることになり、音が痩せる。
        // 実測で平均音量が 1〜5dB 変わる。本当に止めるのは stopEnemyHover。
        if (volume <= 0) {
            if (this.enemyHoverGain) {
                this.enemyHoverGain.gain.setTargetAtTime(
                    0, this.ctx.currentTime, ENEMY_HOVER_RELEASE);
            }
            return;
        }
        if (!this._prepare()) return;

        if (!this.enemyHoverNoise) {
            this.enemyHoverNoise = this.ctx.createBufferSource();
            this.enemyHoverNoise.buffer = this.noiseBuffer;
            this.enemyHoverNoise.loop = true;
            this.enemyHoverGain = this.ctx.createGain();
            this.enemyHoverGain.gain.value = 0;

            // 主体は共鳴させたノイズ。自機と同じ音作りだが中心を下げてある
            const air = this.ctx.createBiquadFilter();
            air.type = 'bandpass';
            air.frequency.value = ENEMY_HOVER_NOISE_FREQ;
            air.Q.value = ENEMY_HOVER_NOISE_Q;

            // 中心周波数をゆっくり揺らす。自機の音は揺れないので、
            // この「ふらつき」だけで鳴っているのが敵だと分かる
            this.enemyHoverLfo = this.ctx.createOscillator();
            this.enemyHoverLfo.type = 'sine';
            this.enemyHoverLfo.frequency.value = ENEMY_HOVER_WOBBLE_HZ;
            const wobble = this.ctx.createGain();
            wobble.gain.value = ENEMY_HOVER_WOBBLE_DEPTH;
            this.enemyHoverLfo.connect(wobble);
            wobble.connect(air.frequency);

            // 高域だけだと軽いので、同じノイズを低く濾して機体の重さを足す
            const body = this.ctx.createBiquadFilter();
            body.type = 'lowpass';
            body.frequency.value = ENEMY_HOVER_BODY_FREQ;
            const bodyGain = this.ctx.createGain();
            bodyGain.gain.value = ENEMY_HOVER_BODY_GAIN;

            // 持続音なのでパンナーを持ち続け、毎フレーム値だけ更新する
            this.enemyHoverPanner = (typeof this.ctx.createStereoPanner === 'function')
                ? this.ctx.createStereoPanner()
                : null;

            this.enemyHoverNoise.connect(air);
            air.connect(this.enemyHoverGain);
            this.enemyHoverNoise.connect(body);
            body.connect(bodyGain);
            bodyGain.connect(this.enemyHoverGain);
            if (this.enemyHoverPanner) {
                this.enemyHoverGain.connect(this.enemyHoverPanner);
                this.enemyHoverPanner.connect(this._seDest());
            } else {
                this.enemyHoverGain.connect(this._seDest());
            }

            this.enemyHoverNoise.start();
            this.enemyHoverLfo.start();
        }

        // 立ち上がりは速く、減衰は遅く。噴射が細切れでも音が途切れない。
        // 対称にすると噴射の切れ目ごとにしぼんで「鳴っていない」印象になる。
        const target = volume * ENEMY_HOVER_MAX_GAIN * ENEMY_HOVER_MAKEUP;
        const rising = target > this.enemyHoverGain.gain.value;
        this.enemyHoverGain.gain.setTargetAtTime(
            target, this.ctx.currentTime,
            rising ? ENEMY_HOVER_ATTACK : ENEMY_HOVER_RELEASE,
        );
        if (this.enemyHoverPanner) {
            // 急に左右が飛ぶと不快なので、音量と同じく滑らかに寄せる
            this.enemyHoverPanner.pan.setTargetAtTime(
                this._panFor(sourceX), this.ctx.currentTime, 0.08,
            );
        }
    }

    /**
     * 敵アタッカーのジャンプ音。自機の playBurst と同じ「掃引するノイズ」だが、
     * 帯域を一段低くして自機の音と区別できるようにしてある。
     * 距離で音量が下がり、横位置で左右に振れる。
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playEnemyBurst(x, y) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        // 自機の playBurst と同じ作り。減衰しきらず 0.6 倍で残す
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._out(x),
            gain: ENEMY_BURST_GAIN * level,
            dur: 0.4, end: ENEMY_BURST_GAIN * 0.6 * level,
            from: ENEMY_BURST_FREQ_FROM, to: ENEMY_BURST_FREQ_TO, sweepDur: 0.3,
        });
    }

    /**
     * 敵アタッカーの着地音。自機の playLanding と同じ「ノイズ＋低い一撃」だが、
     * 一撃をさらに低くしてある。距離で音量が下がり、横位置で左右に振れる。
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     * @param {boolean} [hard] 強い落下か
     */
    playEnemyLanding(x, y, hard = false) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        const t = this.ctx.currentTime;
        const out = this._out(x);
        const vol = (hard ? 0.26 : 0.12) * level;
        const dur = hard ? 0.20 : 0.10;

        this._noiseBurst({
            t, dest: out, dur, gain: vol,
            from: hard ? ENEMY_LANDING_NOISE_HARD : ENEMY_LANDING_NOISE_SOFT, to: 120,
        });

        // 一撃は自機(45Hz)よりさらに低い40Hzまで落として、重量差を出す
        this._toneBurst({
            t, dest: out, dur, type: 'sine', gain: vol * 0.8,
            from: hard ? ENEMY_LANDING_THUMP_HARD : ENEMY_LANDING_THUMP_SOFT, to: 40,
        });
    }

    /**
     * ドローンが動き出したときの「プーーン」。高い方から低い方へ滑り落ちる。
     *
     * ホバリング中は鳴らさない。呼ぶのは突進を始めた瞬間だけで、持続音では
     * ないため止める必要も無い。
     *
     * 音程をわずかにずらした3本のノコギリ波を重ね、共鳴の強いローパスを
     * 音程より速く下降させる。3本のずれがうねりと厚みを生む。
     * 終端でフィルタを基音より上に残すことで、籠もった「ウ」ではなく
     * 開いた「オ」の母音になる（プーーンではなくポーーン）。
     *
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playDroneMove(x, y) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        const t = this.ctx.currentTime;
        const end = t + DRONE_MOVE_DURATION;
        const out = this._out(x);

        // 共鳴の強いローパス。音程より高いところから、音程より速く落ちる
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = DRONE_MOVE_FILTER_Q;
        filter.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM * DRONE_MOVE_FILTER_MULT, t);
        filter.frequency.exponentialRampToValueAtTime(
            DRONE_MOVE_FREQ_TO * DRONE_MOVE_FILTER_END_MULT, end);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(DRONE_MOVE_GAIN * level, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        filter.connect(gain);
        gain.connect(out);

        const voices = [];
        for (const cents of DRONE_MOVE_DETUNE) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.detune.value = cents;
            osc.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM, t);
            osc.frequency.exponentialRampToValueAtTime(DRONE_MOVE_FREQ_TO, end);
            osc.connect(filter);
            voices.push(osc);
        }

        // 1オクターブ下のサイン波。芯の細さを補って機体の重さを出す
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM / 2, t);
        sub.frequency.exponentialRampToValueAtTime(DRONE_MOVE_FREQ_TO / 2, end);
        const subGain = this.ctx.createGain();
        subGain.gain.value = DRONE_MOVE_SUB_GAIN;
        sub.connect(subGain);
        subGain.connect(filter);
        voices.push(sub);

        for (const v of voices) { v.start(t); v.stop(end); }
    }

    /**
     * 武器の発射音。種類は weaponSounds.js の表で決まる。
     *
     * 以前は弾もミサイルも同じ音だったので、武器ごとに関数を足すのではなく
     * 表を引く形にしてある。音を増やすときは表に1行足すだけでよい。
     *
     * @param {keyof typeof WEAPON_SOUNDS} kind
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playWeapon(kind, x, y) {
        const profile = WEAPON_SOUNDS[kind];
        if (!profile) return;
        if (!this._prepare()) return;

        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        renderWeaponSound(
            this.ctx, this._out(x), profile, this.noiseBuffer, level, this.ctx.currentTime,
        );
    }

    /** 敵のホバー音を止める。 */
    stopEnemyHover() {
        if (!this.enemyHoverGain) return;
        this.enemyHoverGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.10);
        const noise = this.enemyHoverNoise;
        const lfo = this.enemyHoverLfo;
        this.enemyHoverNoise = null;
        this.enemyHoverLfo = null;
        this.enemyHoverGain = null;
        this.enemyHoverPanner = null;
        setTimeout(() => {
            try {
                noise.stop(); noise.disconnect();
                if (lfo) { lfo.stop(); lfo.disconnect(); }
            } catch (e) { /* 既に停止 */ }
        }, 250);
    }

    /**
     * ドッキング成立。金属が噛み合う「ガコッ」＋確認のトーン。
     * このあと startCarrierEngine() でエンジン音のループが始まる。
     */
    playDock() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;

        // 金属の当たる音（短いノイズを低めのバンドパスで）
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 420;
        nf.Q.value = 1.2;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.28, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        noise.connect(nf); nf.connect(ng); ng.connect(this._seDest());
        noise.start(t); noise.stop(t + 0.14);

        // 確認のトーン（少し遅らせて上がる2音）
        for (const [delay, freq] of [[0.06, 330], [0.13, 494]]) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t + delay);
            g.gain.exponentialRampToValueAtTime(0.09, t + delay + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.10);
            osc.connect(g); g.connect(this._seDest());
            osc.start(t + delay); osc.stop(t + delay + 0.12);
        }
    }

    /**
     * 母艦のエンジン音。ドッキング中（＝母艦を操作できる間）だけ鳴らす。
     * 低い唸りのループ。移動中は少し高く・大きくなる。
     * @param {number} throttle 0=停止 1=移動中
     */
    startCarrierEngine(throttle = 0) {
        this._loopSound('carrier', {
            build: () => {
                const osc = this.ctx.createOscillator();
                const sub = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'sawtooth';
                sub.type = 'sine';
                filter.type = 'lowpass';
                filter.frequency.value = 180;
                filter.Q.value = 3;
                gain.gain.value = 0;

                osc.connect(filter);
                sub.connect(filter);
                filter.connect(gain);
                gain.connect(this._seDest());
                return { gain, filter, osc, sub, sources: [osc, sub] };
            },
            // 停止中は低く静かに、移動中は少し上がる
            tune: (n, t) => {
                n.osc.frequency.setTargetAtTime(
                    CARRIER_ENGINE_FREQ_BASE + throttle * CARRIER_ENGINE_FREQ_RANGE, t, 0.12);
                n.sub.frequency.setTargetAtTime(
                    CARRIER_ENGINE_SUB_BASE + throttle * CARRIER_ENGINE_SUB_RANGE, t, 0.12);
                n.filter.frequency.setTargetAtTime(
                    CARRIER_ENGINE_FILTER_BASE + throttle * CARRIER_ENGINE_FILTER_RANGE, t, 0.12);
                n.gain.gain.setTargetAtTime(
                    CARRIER_ENGINE_GAIN_BASE + throttle * CARRIER_ENGINE_GAIN_RANGE, t, 0.12);
            },
        });
    }

    /** 母艦のエンジンを止める（アタッチ解除時）。 */
    stopCarrierEngine() {
        this._stopLoopSound('carrier');
    }

    /**
     * ドッキング中の HP 回復。満ちるまで鳴り続け、進むほど音程が上がる。
     * 毎フレーム呼んでよい。満タンになったら stopRepairHum() を呼ぶこと。
     * @param {number} progress 0=空 1=満タン
     */
    startRepairHum(progress = 0) {
        const p = Math.max(0, Math.min(1, progress));
        this._loopSound('repair', {
            build: () => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                // 揺れ。一定だと電子音になり、装置が働いている感じが出ない
                const lfo = this.ctx.createOscillator();
                const lfoGain = this.ctx.createGain();

                osc.type = 'triangle';
                lfo.type = 'sine';
                lfo.frequency.value = REPAIR_HUM_WOBBLE_HZ;
                lfoGain.gain.value = REPAIR_HUM_WOBBLE_DEPTH;
                gain.gain.value = 0;

                osc.connect(gain);
                lfo.connect(lfoGain);
                lfoGain.connect(gain.gain);
                gain.connect(this._seDest());
                return { gain, osc, lfo, sources: [osc, lfo] };
            },
            tune: (n, t) => {
                const freq = REPAIR_HUM_FREQ_FROM + p * (REPAIR_HUM_FREQ_TO - REPAIR_HUM_FREQ_FROM);
                n.osc.frequency.setTargetAtTime(freq, t, 0.15);
                n.gain.gain.setTargetAtTime(REPAIR_HUM_GAIN, t, 0.15);
            },
        });
    }

    /** 回復ハムを止める（満タン、または補給の途中で離脱したとき）。 */
    stopRepairHum() {
        this._stopLoopSound('repair');
    }

    /**
     * 着地音。強い着地（スタンする落下）ほど重く鳴る。
     * @param {boolean} hard スタンを伴う落下か
     */
    playLanding(hard = false) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const dest = this._seDest();
        const vol = hard ? 0.26 : 0.12;
        const dur = hard ? 0.20 : 0.10;

        // 接地の衝撃（低いノイズ）
        this._noiseBurst({
            t, dest, dur, gain: vol,
            from: hard ? 700 : 1100, to: 120,
        });

        // 機体の重みを出す低い一撃
        this._toneBurst({
            t, dest, dur, type: 'sine', gain: vol * 0.8,
            from: hard ? 110 : 150, to: 45,
        });
    }

    /**
     * 自機の破壊。汎用の爆発音とは別に、下降する悲鳴のような成分を重ねて
     * 「やられた」ことが音だけで分かるようにする。
     */
    playPlayerDestroyed() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const dest = this._seDest();

        // 崩れ落ちる金属音（下降するノコギリ波）。
        // ノコギリ波をそのまま出すと耳に刺さるので、ローパスも一緒に閉じる
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(2400, t);
        lowpass.frequency.exponentialRampToValueAtTime(300, t + 0.9);
        this._toneBurst({
            t, dest, dur: 0.9, type: 'sawtooth', gain: 0.16,
            from: 420, to: 55, through: lowpass,
        });

        // 厚みを出す爆発のノイズ
        this._noiseBurst({
            t, dest, dur: 0.7, gain: 0.3, from: 1800, to: 160,
        });
    }

    /** アイテム取得。短く明るい上昇音。 */
    playPickup() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        for (const [delay, freq] of [[0, 660], [0.05, 880], [0.10, 1320]]) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t + delay);
            g.gain.exponentialRampToValueAtTime(0.07, t + delay + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.08);
            osc.connect(g); g.connect(this._seDest());
            osc.start(t + delay); osc.stop(t + delay + 0.09);
        }
    }


    /** バースト移動の噴射。上へ開く掃引で、押し出される感じを出す。 */
    playBurst() {
        if (!this._prepare()) return;

        // 減衰しきらず 0.06 で残す（噴射が続いている最中に途切れないように）
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._seDest(),
            gain: 0.1, dur: 0.4, end: 0.06,
            from: 1000, to: 3000, sweepDur: 0.3,
        });
    }

    playExplosion(large = false, sourceX) {
        if (!this._prepare()) return;

        // ローパスを 40Hz まで落とすため聞こえる帯域が薄い。マスターの底上げに
        // 加えて、爆発だけさらに +3dB 持ち上げる（画面端で埋もれていたため）。
        // 掃引のほうが包絡より短い＝暗くなりきってから尾を引く
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._out(sourceX),
            gain: large ? 0.42 : 0.21,
            dur: large ? 0.8 : 0.3, end: 0.01,
            from: large ? 1000 : 600, to: 40, sweepDur: large ? 0.5 : 0.2,
        });
    }

    // --- Weapons ---


    /** 武器の切り替え。短く落ちる電子音1つ。 */
    playSwitch() {
        if (!this._prepare()) return;

        this._toneBurst({
            t: this.ctx.currentTime, dest: this._seDest(),
            type: 'square', from: 1200, to: 400,
            gain: 0.03, dur: 0.05,
        });
    }

    // --- Laser ---
    playLaserCharge() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 1.5); // 1.5s charge

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.5);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);

        osc.connect(gain);
        gain.connect(this._seDest());

        osc.start();
        osc.stop(this.ctx.currentTime + 1.5);
    }

    playLaserFire() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.5);

        sub.type = 'sine';
        sub.frequency.setValueAtTime(40, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this._seDest());

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);

        osc.start();
        sub.start();
        osc.stop(this.ctx.currentTime + 0.6);
        sub.stop(this.ctx.currentTime + 0.6);
    }

    playHeavyDamage() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;
        const dest = this._seDest();

        // 頭の「バキッ」。掃引を包絡より短く切って、鋭さだけを立てる
        this._noiseBurst({
            t: now, dest, gain: 0.3, dur: 0.15, end: 0.01,
            from: 2000, to: 100, sweepDur: 0.1,
        });

        // 重さを出す低い一撃。歪ませて軋みを足す
        const distortion = this.ctx.createWaveShaper();
        distortion.curve = this._makeDistortionCurve(100);
        this._toneBurst({
            t: now, dest, type: 'sawtooth', gain: 0.2,
            from: 100, to: 30, freqDur: 0.3, dur: 0.4,
            through: distortion,
        });
    }

    playBaseDestroyed() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;
        const notes = [
            { f: 523.25, t: 0, d: 0.1 }, // C5
            { f: 659.25, t: 0.12, d: 0.1 }, // E5
            { f: 783.99, t: 0.24, d: 0.3 }  // G5
        ];

        const dest = this._seDest();
        // 音程は動かさない（to を渡さない）。和音を順に置くだけのファンファーレ
        notes.forEach((note) => {
            this._toneBurst({
                t: now + note.t, dest, type: 'triangle',
                from: note.f, gain: 0.08, dur: note.d, end: 0.01,
            });
        });
    }

    playSuccess() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;

        // A triumphant, grand victory fanfare (like a retro classic RPG or action game clear)
        // Melody: G4 -> C5 -> G5 -> C6 -> E6 -> G6 (held with vibrato/arpeggio)

        // Base Tempo: 120BPM (1 beat = 0.5s)
        const tempo = 0.15; // Fast, energetic pace for the intro

        // Main Lead Melody (Square wave for retro heroic feel)
        const melody = [
            { f: 392.00, t: 0.0, d: tempo },       // G4 (Pickup)
            { f: 523.25, t: tempo, d: tempo },     // C5
            { f: 783.99, t: tempo * 2, d: tempo }, // G5
            { f: 523.25, t: tempo * 3, d: tempo }, // C5
            { f: 1046.50, t: tempo * 4, d: tempo * 1.5 }, // C6 (Slight hold)
            { f: 783.99, t: tempo * 5.5, d: tempo * 0.5 }, // G5 (Quick drop)
            { f: 1318.51, t: tempo * 6, d: tempo * 1.5 }, // E6 (Climb)
            { f: 1046.50, t: tempo * 7.5, d: tempo * 0.5 },// C6
            { f: 1567.98, t: tempo * 8, d: tempo * 4 }    // G6 (Final triumphant hold)
        ];

        // Harmony / Brass backing (Sawtooth for thickness)
        const harmony = [
            { f: 196.00, t: 0.0, d: tempo },       // G3
            { f: 261.63, t: tempo, d: tempo },     // C4
            { f: 392.00, t: tempo * 2, d: tempo }, // G4
            { f: 261.63, t: tempo * 3, d: tempo }, // C4
            { f: 523.25, t: tempo * 4, d: tempo * 1.5 },  // C5
            { f: 392.00, t: tempo * 5.5, d: tempo * 0.5 }, // G4
            { f: 659.25, t: tempo * 6, d: tempo * 1.5 },  // E5
            { f: 523.25, t: tempo * 7.5, d: tempo * 0.5 }, // C5
            { f: 783.99, t: tempo * 8, d: tempo * 4 }     // G5
        ];

        // Bassline (Triangle for solid foundation)
        const bass = [
            { f: 98.00, t: 0.0, d: tempo * 4 },       // G2
            { f: 130.81, t: tempo * 4, d: tempo * 4 },    // C3
            { f: 130.81, t: tempo * 8, d: tempo * 4 }     // C3
        ];

        // Combine all tracks
        const allNotes = [];
        melody.forEach(n => allNotes.push({ ...n, type: 'square', vol: 0.08 }));
        harmony.forEach(n => allNotes.push({ ...n, type: 'sawtooth', vol: 0.05 }));
        bass.forEach(n => allNotes.push({ ...n, type: 'triangle', vol: 0.12 }));

        // Sparkle arpeggio over the final held note (G6 chord)
        const finalTime = tempo * 8;
        const arpeggioNotes = [1046.50, 1318.51, 1567.98, 2093.00]; // C6, E6, G6, C7
        for (let i = 0; i < 16; i++) {
            allNotes.push({
                f: arpeggioNotes[i % 4],
                t: finalTime + (i * 0.05),
                d: 0.1,
                type: 'sine',
                vol: 0.03
            });
        }

        allNotes.forEach(note => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = note.type;
            osc.frequency.setValueAtTime(note.f, now + note.t);

            // Snappy envelope for the notes
            gain.gain.setValueAtTime(0, now + note.t);
            gain.gain.linearRampToValueAtTime(note.vol, now + note.t + 0.02); // Quick attack

            if (note.t >= finalTime && note.d >= tempo * 4) {
                // Final held note has a long fade out
                gain.gain.setValueAtTime(note.vol, now + note.t + 1.0); // Hold full volume for 1 sec
                gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d); // Fade out over remaining 3 secs
            } else {
                // Normal notes
                gain.gain.setValueAtTime(note.vol, now + note.t + note.d - 0.05); // Hold
                gain.gain.linearRampToValueAtTime(0.001, now + note.t + note.d); // Quick Release
            }

            osc.connect(gain);
            gain.connect(this._seDest());

            osc.start(now + note.t);
            osc.stop(now + note.t + note.d);
        });
    }

    // --- BGM Control ---
    startBGM(missionIndex = 0) {
        this.init();
        this._resume();

        if (this.bgm) {
            if (this.useMP3BGM) {
                const missionNum = (missionIndex + 1).toString().padStart(2, '0');
                const url = `src/assets/audio/bgm${missionNum}.mp3`;
                console.log(`AudioManager: Starting BGM for Mission ${missionIndex + 1} -> ${url}`);
                this.bgm.setURL(url);
            }
            this.bgm.start();
        }
    }

    stopBGM() {
        if (this.bgm) {
            this.bgm.stop();
        }
    }

    playTitleBGM() {
        this.init();
        this._resume();

        if (this.useMP3BGM && this.bgm) {
            // If already playing title BGM, don't restart it
            if (this.bgm.playing && this.bgm.url && this.bgm.url.endsWith('title.mp3')) {
                return;
            }
        }

        this.stopRankingBGM(); // Ensure ranking BGM is stopped

        if (this.useMP3BGM && this.bgm) {
            this.bgm.setURL('src/assets/audio/title.mp3');
            this.bgm.start();
        }
    }

    playRankingBGM() {
        if (!this._prepare()) return;
        this.stopRankingBGM();

        if (this.useMP3BGM && this.bgm) {
            this.bgm.setURL('src/assets/audio/name.mp3');
            this.bgm.start();
            return;
        }

        const now = this.ctx.currentTime;
        const tempo = 0.2; // 150 BPM
        this.rankingOscillators = [];
        this.rankingGainNodes = [];

        // Simple C Major loop (C E G C) very bright and pop
        const notes = [
            523.25, 659.25, 783.99, 1046.50,
            523.25, 659.25, 1046.50, 783.99
        ];
        const bassNotes = [130.81, 130.81, 174.61, 174.61, 196.00, 196.00, 196.00, 196.00];

        // Loop the pattern a few times and schedule them out
        // For simplicity, we just schedule 120 beats (approx 24 seconds) of loop.
        // It's a ranking screen, so 24s is usually enough. Or we can extend it.
        const numLoops = 20;

        for (let loop = 0; loop < numLoops; loop++) {
            for (let i = 0; i < 8; i++) {
                let t = now + (loop * 8 + i) * tempo;

                // Melody
                let osc = this.ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.value = notes[i];
                let gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + tempo - 0.02);

                osc.connect(gain);
                gain.connect(this._seDest());
                osc.start(t);
                osc.stop(t + tempo);

                this.rankingOscillators.push(osc);
                this.rankingGainNodes.push(gain);

                // Bass
                let bOsc = this.ctx.createOscillator();
                bOsc.type = 'triangle';
                bOsc.frequency.value = bassNotes[i];
                let bGain = this.ctx.createGain();
                bGain.gain.setValueAtTime(0, t);
                bGain.gain.linearRampToValueAtTime(0.1, t + 0.05);
                bGain.gain.linearRampToValueAtTime(0, t + tempo);

                bOsc.connect(bGain);
                bGain.connect(this._seDest());
                bOsc.start(t);
                bOsc.stop(t + tempo);

                this.rankingOscillators.push(bOsc);
                this.rankingGainNodes.push(bGain);
            }
        }
    }

    stopRankingBGM() {
        if (this.useMP3BGM && this.bgm) {
            this.bgm.stop();
        }

        if (this.rankingGainNodes) {
            this.rankingGainNodes.forEach(g => {
                g.gain.cancelScheduledValues(this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
            });
            this.rankingGainNodes = null;
        }
        if (this.rankingOscillators) {
            setTimeout(() => {
                if (this.rankingOscillators) {
                    this.rankingOscillators.forEach(o => {
                        try { o.stop(); o.disconnect(); } catch (e) { }
                    });
                    this.rankingOscillators = null;
                }
            }, 600);
        }
    }

    playGameOver() {
        if (!this._prepare()) return;
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;

        // Sad minor chord descending progression: Cm -> G/B -> Ab -> G
        // We'll play a heavy arpeggiated bass line and a crying lead

        const noteLength = 0.6; // Slow and heavy
        const volume = 0.4; // Fixed volume

        // Notes for the descending bass/chords
        // Cm: C, Eb, G
        // G/B: B, D, G
        // Ab: Ab, C, Eb
        // G: G, B, D
        const chords = [
            [130.81, 155.56, 196.00], // Cm (C3)
            [123.47, 146.83, 196.00], // G/B (B2)
            [103.83, 130.81, 155.56], // Ab (Ab2)
            [98.00, 123.47, 146.83]  // G (G2)
        ];

        // Lead melody (crying effect with pitch bend down)
        const leadNotes = [523.25, 493.88, 415.30, 392.00]; // C5, B4, Ab4, G4

        // Master FX for the fanfare
        const fnMaster = this.ctx.createGain();
        fnMaster.gain.value = volume;
        fnMaster.connect(this._stingDest());

        // Lowpass filter for a muffled, distant sad sound
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + noteLength * 4); // Closes down over time
        filter.connect(fnMaster);

        // Play the chords
        chords.forEach((chord, i) => {
            const time = now + i * noteLength;
            chord.forEach((freq, j) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle'; // Smooth, sad tone
                osc.frequency.value = freq;

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.3, time + 0.1);
                // Last chord holds longer and fades out
                const dur = (i === chords.length - 1) ? noteLength * 3 : noteLength;
                gain.gain.exponentialRampToValueAtTime(0.01, time + dur - 0.1);

                osc.connect(gain);
                gain.connect(filter);

                osc.start(time);
                osc.stop(time + dur);
            });
        });

        // Play the crying lead melody
        leadNotes.forEach((freq, i) => {
            const time = now + i * noteLength;
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth'; // Slightly buzzy for emotion

            // Pitch bend / crying effect
            osc.frequency.setValueAtTime(freq, time);
            if (i === leadNotes.length - 1) {
                // Final note droops down dramatically
                osc.frequency.exponentialRampToValueAtTime(freq * 0.8, time + noteLength * 3);
            } else {
                // Slight vibrato/droop on standard notes
                osc.frequency.linearRampToValueAtTime(freq * 0.98, time + noteLength);
            }

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.25, time + 0.1); // Attack

            const dur = (i === leadNotes.length - 1) ? noteLength * 3 : noteLength;
            gain.gain.exponentialRampToValueAtTime(0.01, time + dur - 0.05); // Decay

            osc.connect(gain);
            gain.connect(filter);

            osc.start(time);
            osc.stop(time + dur);
        });
    }

    async _loadAlarmSound() {
        if (this._alarmLoading || this.alarmBuffer) return;
        this._alarmLoading = true;
        try {
            const response = await fetch('src/assets/audio/alert.mp3');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            this.alarmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log('AudioManager: Successfully loaded and decoded alert.mp3');
        } catch (e) {
            console.error('AudioManager: Failed to load alert.mp3, falling back to synthesizer alarm:', e);
            this._alarmLoading = false;
        }
    }

    playAlarm() {
        if (!this._prepare()) return;
        if (!this.ctx || this.ctx.state === 'suspended') return;

        // MP3がロード完了している場合はそちらを再生する
        if (this.alarmBuffer) {
            const source = this.ctx.createBufferSource();
            source.buffer = this.alarmBuffer;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime); // 適度な音量に調整

            source.connect(gain);
            gain.connect(this._seDest());
            source.start(0);
        } else {
            // ロードされていない場合は旧シンセサイザー音を再生し、裏でロードを再度キック
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            // Siren effect: oscillate frequency
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.15);
            osc.frequency.linearRampToValueAtTime(800, now + 0.3);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);

            osc.connect(gain);
            gain.connect(this._seDest());

            osc.start(now);
            osc.stop(now + 0.3);

            this._loadAlarmSound();
        }
    }

}

export const audioManager = new AudioManager();
