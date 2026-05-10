// ============================================
// BGMManager - Procedural Jazz/Funk BGM
// ============================================
// Generates a looping BGM with Web Audio API:
//   - Jazz drum patterns (kick / snare / hi-hat)
//   - Walking jazz bassline
//   - Warm ethereal chord pads
//   - Catchy, syncopated lead riffs
//   - Delay and reverb effects

// ---- Music Data ----

// Jazz chord progression: ii-V-I-vi style (two keys)
const PROGRESSIONS = [
    // Dm7 - G7 - Cmaj7 - Am7
    [
        [293.66, 349.23, 440.00, 523.25],
        [392.00, 493.88, 587.33, 349.23],
        [261.63, 329.63, 392.00, 493.88],
        [220.00, 261.63, 329.63, 392.00],
    ],
    // Fm7 - Bb7 - Ebmaj7 - Cm7
    [
        [174.61, 207.65, 261.63, 311.13],
        [233.08, 293.66, 349.23, 207.65],
        [155.56, 196.00, 233.08, 293.66],
        [130.81, 155.56, 196.00, 233.08],
    ],
];

const BASS_PATTERNS = [
    [
        [146.83, 164.81, 174.61, 164.81],
        [196.00, 220.00, 246.94, 220.00],
        [130.81, 146.83, 164.81, 146.83],
        [110.00, 130.81, 146.83, 130.81],
    ],
    [
        [87.31,  98.00,  110.00, 98.00 ],
        [116.54, 130.81, 146.83, 130.81],
        [77.78,  87.31,  98.00,  87.31 ],
        [65.41,  77.78,  87.31,  77.78 ],
    ],
];

// Lead scales (per progression)
const LEAD_SCALES = [
    [523.25, 587.33, 622.25, 698.46, 783.99, 932.33, 1046.50, 1174.66, 1244.51],
    [622.25, 698.46, 783.99, 932.33, 1046.50, 1244.51, 1396.91, 1567.98],
];

// Catchy syncopated riffs: rhythm = 1 means "play note"
const RIFFS = [
    {
        rhythm:  [1,0,0,1, 1,0,1,0, 0,0,1,0, 1,1,0,0],
        offsets: [0,0,0,4, 3,3,5,5, 0,0,2,2, 4,0,0,0],
    },
    {
        rhythm:  [1,0,1,1, 0,1,0,0, 1,0,1,0, 0,0,0,1],
        offsets: [0,0,2,3, 0,4,0,0, 5,0,4,0, 0,0,0,2],
    },
];

// Drum patterns (two variants for variety)
const KICK_PATTERNS  = [
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,0,0],
];
const SNARE_PATTERNS = [
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,0,1],
];
const HIHAT_PATTERNS = [
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [1,1,1,1, 1,0,1,0, 1,1,1,1, 1,0,1,0],
];

export class BGMManager {
    constructor(audioCtx) {
        this.ctx     = audioCtx;
        this.playing = false;

        // Tempo
        this.bpm          = 150;
        this.stepDuration = 60 / this.bpm / 4; // 16th-note
        this.barDuration  = this.stepDuration * 16;

        // Scheduling
        this.scheduleTimer    = null;
        this.nextBarTime      = 0;
        this.currentBar       = 0;
        this.scheduleAheadTime = 0.2;

        // State
        this.currentProgression = 0;
        this.currentRiff        = 0;

        // Audio graph nodes (created lazily in _init)
        this.masterGain   = null;
        this.noiseBuffer  = null;
        this.convolver    = null;
        this.reverbGain   = null;
        this.delayNode    = null;
        this.delayFeedback = null;
        this.delayGain    = null;
        this.drumBus      = null;
        this.bassBus      = null;
        this.padBus       = null;
        this.leadBus      = null;
    }

    // ==========================================
    // INITIALIZATION (lazy)
    // ==========================================

    _init() {
        if (this.masterGain) return;
        this._createNoiseBuffer();
        this._createEffects();
        this._createBuses();
    }

    _createNoiseBuffer() {
        const sr  = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, sr * 2, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
    }

    _createEffects() {
        const sr      = this.ctx.sampleRate;
        const length  = sr * 1.5;
        const impulse = this.ctx.createBuffer(2, length, sr);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        this.convolver        = this.ctx.createConvolver();
        this.convolver.buffer = impulse;
        this.reverbGain       = this.ctx.createGain();
        this.reverbGain.gain.value = 0.25;

        this.delayNode             = this.ctx.createDelay(1.0);
        this.delayNode.delayTime.value = this.stepDuration * 3;
        this.delayFeedback         = this.ctx.createGain();
        this.delayFeedback.gain.value = 0.35;
        this.delayGain             = this.ctx.createGain();
        this.delayGain.gain.value  = 0.2;

        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        this.delayNode.connect(this.delayGain);
    }

    _createBuses() {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;

        this.drumBus = this._makeBus(0.70);
        this.bassBus = this._makeBus(0.55);
        this.padBus  = this._makeBus(0.20);
        this.leadBus = this._makeBus(0.25);

        // Reverb send
        this.padBus.connect(this.convolver);
        this.leadBus.connect(this.convolver);
        this.convolver.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        // Delay send (lead only)
        this.leadBus.connect(this.delayNode);
        this.delayGain.connect(this.masterGain);

        this.masterGain.connect(this.ctx.destination);
    }

    /** Create a gain node, connect to masterGain, and return it. */
    _makeBus(gainValue) {
        const bus = this.ctx.createGain();
        bus.gain.value = gainValue;
        bus.connect(this.masterGain);
        return bus;
    }

    // ==========================================
    // PLAYBACK CONTROL
    // ==========================================

    start() {
        if (this.playing) return;
        this._init();
        this.playing    = true;
        this.currentBar = 0;
        this.nextBarTime = this.ctx.currentTime + 0.1;

        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 1.2);

        this._scheduleLoop();
    }

    stop() {
        if (!this.playing) return;
        this.playing = false;
        if (this.masterGain) this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); // ~0.5s
        if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
    }

    // ==========================================
    // SCHEDULING
    // ==========================================

    _scheduleLoop() {
        if (!this.playing) return;
        while (this.nextBarTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this._scheduleBar(this.nextBarTime, this.currentBar);
            this.nextBarTime += this.barDuration;
            this.currentBar++;

            // Rotate progression and riff every 4 bars
            if (this.currentBar % 4 === 0) {
                this.currentProgression = (this.currentProgression + 1) % PROGRESSIONS.length;
                this.currentRiff        = (this.currentRiff + 1) % RIFFS.length;
            }
        }
        this.scheduleTimer = setTimeout(() => this._scheduleLoop(), 50);
    }

    _scheduleBar(barTime, barIndex) {
        const chordIndex  = barIndex % 4;
        const chord       = PROGRESSIONS[this.currentProgression][chordIndex];
        const bassNotes   = BASS_PATTERNS[this.currentProgression][chordIndex];
        const drumVariant = barIndex % KICK_PATTERNS.length;

        this._scheduleDrums(barTime, drumVariant);
        this._scheduleBass(barTime, bassNotes);
        this._schedulePad(barTime, chord);
        this._scheduleLeadRiff(barTime, barIndex);
    }

    // ==========================================
    // DRUMS
    // ==========================================

    _scheduleDrums(barTime, variant) {
        for (let step = 0; step < 16; step++) {
            const t = barTime + step * this.stepDuration;
            if (KICK_PATTERNS[variant][step])  this._playKick(t);
            if (SNARE_PATTERNS[variant][step]) this._playSnare(t);
            if (HIHAT_PATTERNS[variant][step]) this._playHihat(t, step % 4 === 3);
        }
    }

    _playKick(time) {
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        osc.connect(gain);
        gain.connect(this.drumBus);
        osc.start(time);
        osc.stop(time + 0.15);
    }

    _playSnare(time) {
        // Noise layer
        const noise   = this.ctx.createBufferSource();
        noise.buffer  = this.noiseBuffer;
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type  = 'highpass';
        nFilter.frequency.value = 1800;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.4, time);
        nGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.drumBus);

        // Tone layer
        const osc   = this.ctx.createOscillator();
        osc.type    = 'triangle';
        osc.frequency.value = 220;
        const oGain = this.ctx.createGain();
        oGain.gain.setValueAtTime(0.25, time);
        oGain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
        osc.connect(oGain);
        oGain.connect(this.drumBus);

        noise.start(time); noise.stop(time + 0.10);
        osc.start(time);   osc.stop(time + 0.08);
    }

    _playHihat(time, open = false) {
        const noise  = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type  = 'bandpass';
        filter.frequency.value = 8000;
        const dur  = open ? 0.1 : 0.04;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.drumBus);
        noise.start(time);
        noise.stop(time + dur);
    }

    // ==========================================
    // BASS
    // ==========================================

    _scheduleBass(barTime, bassNotes) {
        const beatDur = this.stepDuration * 4;
        for (let beat = 0; beat < 4; beat++) {
            this._playBassNote(barTime + beat * beatDur, bassNotes[beat], beatDur * 0.9);
        }
    }

    _playBassNote(time, freq, dur) {
        const osc  = this.ctx.createOscillator();
        osc.type   = 'triangle';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.5, time + 0.02);
        gain.gain.setValueAtTime(0.5, time + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(this.bassBus);
        osc.start(time);
        osc.stop(time + dur);
    }

    // ==========================================
    // PAD
    // ==========================================

    _schedulePad(barTime, chord) {
        const dur = this.barDuration;
        chord.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type  = 'sine';
            osc.frequency.value = freq;
            osc.detune.value    = (i - 1.5) * 10;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, barTime);
            gain.gain.linearRampToValueAtTime(0.2, barTime + 0.5);
            gain.gain.setValueAtTime(0.2, barTime + dur - 0.5);
            gain.gain.linearRampToValueAtTime(0.001, barTime + dur);
            osc.connect(gain);
            gain.connect(this.padBus);
            osc.start(barTime);
            osc.stop(barTime + dur);
        });
    }

    // ==========================================
    // LEAD SYNTH
    // ==========================================

    /** Play the catchy riff every other bar to avoid overcrowding. */
    _scheduleLeadRiff(barTime, barIndex) {
        if (barIndex % 2 !== 0) return;

        const riff  = RIFFS[this.currentRiff];
        const scale = LEAD_SCALES[this.currentProgression % LEAD_SCALES.length];

        for (let step = 0; step < 16; step++) {
            if (!riff.rhythm[step]) continue;
            const t    = barTime + step * this.stepDuration;
            const freq = scale[riff.offsets[step] % scale.length];
            this._playLeadNote(t, freq, this.stepDuration * 2);
        }
    }

    _playLeadNote(time, freq, dur) {
        const osc    = this.ctx.createOscillator();
        osc.type     = 'square';
        osc.frequency.setValueAtTime(freq, time);

        const filter = this.ctx.createBiquadFilter();
        filter.type  = 'lowpass';
        filter.frequency.setValueAtTime(4000, time);
        filter.frequency.exponentialRampToValueAtTime(1000, time + dur);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.4, time + 0.01);
        gain.gain.setValueAtTime(0.3, time + dur * 0.5);
        gain.gain.linearRampToValueAtTime(0.001, time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.leadBus);

        osc.start(time);
        osc.stop(time + dur);
    }
}
