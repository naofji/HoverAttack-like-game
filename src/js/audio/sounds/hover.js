// ============================================
// AudioManager - 自機のホバー音
// ============================================
//
// 自機のスラスターが鳴らし続ける音。ノイズ＋トーンの1ループを、
// 上昇の強さ（pitch）で駆動する。敵のホバー音（audio/sounds/enemySounds.js）
// とは別物で、混ざっても区別できるよう向こうを低めで濁らせてある。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import { PLAYER_HOVER_MAX_FREQ } from '../../utils/Constants.js';

export const AudioHover = {
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
    },

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
    },
};
