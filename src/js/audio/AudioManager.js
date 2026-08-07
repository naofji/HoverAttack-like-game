import { BGMManager } from './BGMManager.js';
import { MP3BGMManager } from './MP3BGMManager.js';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.hoverOsc = null;
        this.hoverNoise = null;
        this.hoverGain = null;
        this.isHovering = false;
        this.noiseBuffer = null;
        this.hoverRPM = 0; // Tracks internal engine rev-up (0.0 to 1.0)
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
        this._createNoiseBuffer();

        if (this.useMP3BGM) {
            this.bgm = new MP3BGMManager(this.ctx);
        } else {
            this.bgm = new BGMManager(this.ctx);
        }

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

            this.hoverGain.connect(this.ctx.destination);

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
        const maxFreq = 600;
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
        noise.connect(nf); nf.connect(ng); ng.connect(this.ctx.destination);
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
            osc.connect(g); g.connect(this.ctx.destination);
            osc.start(t + delay); osc.stop(t + delay + 0.12);
        }
    }

    /**
     * 母艦のエンジン音。ドッキング中（＝母艦を操作できる間）だけ鳴らす。
     * 低い唸りのループ。移動中は少し高く・大きくなる。
     * @param {number} throttle 0=停止 1=移動中
     */
    startCarrierEngine(throttle = 0) {
        if (!this._prepare()) return;

        if (!this.carrierOsc) {
            this.carrierOsc = this.ctx.createOscillator();
            this.carrierSub = this.ctx.createOscillator();
            this.carrierGain = this.ctx.createGain();
            this.carrierFilter = this.ctx.createBiquadFilter();

            this.carrierOsc.type = 'sawtooth';
            this.carrierSub.type = 'sine';
            this.carrierFilter.type = 'lowpass';
            this.carrierFilter.frequency.value = 180;
            this.carrierFilter.Q.value = 3;

            this.carrierGain.gain.value = 0;
            this.carrierOsc.connect(this.carrierFilter);
            this.carrierSub.connect(this.carrierFilter);
            this.carrierFilter.connect(this.carrierGain);
            this.carrierGain.connect(this.ctx.destination);

            this.carrierOsc.start();
            this.carrierSub.start();
        }

        // 停止中は低く静かに、移動中は少し上がる
        const t = this.ctx.currentTime;
        this.carrierOsc.frequency.setTargetAtTime(46 + throttle * 14, t, 0.12);
        this.carrierSub.frequency.setTargetAtTime(23 + throttle * 7, t, 0.12);
        this.carrierFilter.frequency.setTargetAtTime(150 + throttle * 120, t, 0.12);
        this.carrierGain.gain.setTargetAtTime(0.06 + throttle * 0.05, t, 0.12);
    }

    /** 母艦のエンジンを止める（アタッチ解除時）。 */
    stopCarrierEngine() {
        if (!this.carrierGain) return;
        this.carrierGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
        const osc = this.carrierOsc;
        const sub = this.carrierSub;
        this.carrierOsc = null;
        this.carrierSub = null;
        this.carrierGain = null;
        setTimeout(() => {
            try { osc.stop(); osc.disconnect(); sub.stop(); sub.disconnect(); } catch (e) { /* 既に停止 */ }
        }, 250);
    }

    /**
     * 着地音。強い着地（スタンする落下）ほど重く鳴る。
     * @param {boolean} hard スタンを伴う落下か
     */
    playLanding(hard = false) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const vol = hard ? 0.26 : 0.12;
        const dur = hard ? 0.20 : 0.10;

        // 接地の衝撃（低いノイズ）
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(hard ? 700 : 1100, t);
        nf.frequency.exponentialRampToValueAtTime(120, t + dur);
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(vol, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(nf); nf.connect(ng); ng.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + dur);

        // 機体の重みを出す低い一撃
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hard ? 110 : 150, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + dur);
        g.gain.setValueAtTime(vol * 0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + dur);
    }

    /**
     * 自機の破壊。汎用の爆発音とは別に、下降する悲鳴のような成分を重ねて
     * 「やられた」ことが音だけで分かるようにする。
     */
    playPlayerDestroyed() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;

        // 崩れ落ちる金属音（下降するノコギリ波）
        const osc = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.9);
        og.gain.setValueAtTime(0.16, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        const of = this.ctx.createBiquadFilter();
        of.type = 'lowpass';
        of.frequency.setValueAtTime(2400, t);
        of.frequency.exponentialRampToValueAtTime(300, t + 0.9);
        osc.connect(of); of.connect(og); og.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.9);

        // 厚みを出す爆発のノイズ
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(1800, t);
        nf.frequency.exponentialRampToValueAtTime(160, t + 0.7);
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        noise.connect(nf); nf.connect(ng); ng.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.7);
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
            osc.connect(g); g.connect(this.ctx.destination);
            osc.start(t + delay); osc.stop(t + delay + 0.09);
        }
    }

    /** マシンガンのリロード完了。弾倉が入る小さな金属音。 */
    playReloadComplete() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 2600;
        nf.Q.value = 4;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.14, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        noise.connect(nf); nf.connect(ng); ng.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.07);

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t + 0.05);
        g.gain.setValueAtTime(0.0001, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.058);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t + 0.05); osc.stop(t + 0.13);
    }

    playBurst() {
        if (!this._prepare()) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 0.3);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, this.ctx.currentTime + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.4);
    }

    playExplosion(large = false) {
        if (!this._prepare()) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(large ? 1000 : 600, this.ctx.currentTime);
        noiseFilter.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + (large ? 0.5 : 0.2));

        const noiseEnvelope = this.ctx.createGain();
        noiseEnvelope.gain.setValueAtTime(large ? 0.3 : 0.15, this.ctx.currentTime);
        noiseEnvelope.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (large ? 0.8 : 0.3));

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseEnvelope);
        noiseEnvelope.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + (large ? 0.8 : 0.3));
    }

    // --- Weapons ---
    playMissile() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    playEnemyFire() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playSwitch() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
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
        gain.connect(this.ctx.destination);

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
        gain.connect(this.ctx.destination);

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

        // Sharp noise attack (the "crack/snap")
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(2000, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.1);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        // Heavy low thud (the "weight")
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        // Add some distortion/crunch
        const distortion = this.ctx.createWaveShaper();
        distortion.curve = this._makeDistortionCurve(100);

        osc.connect(distortion);
        distortion.connect(oscGain);
        oscGain.connect(this.ctx.destination);

        noise.start(now);
        osc.start(now);
        noise.stop(now + 0.15);
        osc.stop(now + 0.4);
    }

    playBaseDestroyed() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;
        const notes = [
            { f: 523.25, t: 0, d: 0.1 }, // C5
            { f: 659.25, t: 0.12, d: 0.1 }, // E5
            { f: 783.99, t: 0.24, d: 0.3 }  // G5
        ];

        notes.forEach(note => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(note.f, now + note.t);

            gain.gain.setValueAtTime(0.08, now + note.t);
            gain.gain.exponentialRampToValueAtTime(0.01, now + note.t + note.d);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + note.t);
            osc.stop(now + note.t + note.d);
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
            gain.connect(this.ctx.destination);

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
                gain.connect(this.ctx.destination);
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
                bGain.connect(this.ctx.destination);
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
        fnMaster.connect(this.ctx.destination);

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
            gain.connect(this.ctx.destination);
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
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.3);

            this._loadAlarmSound();
        }
    }

    playProximityAlarm() {
        if (!this._prepare()) return;
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // "Bween!" sound using a low-frequency sawtooth wave
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.3);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    }
}

export const audioManager = new AudioManager();
