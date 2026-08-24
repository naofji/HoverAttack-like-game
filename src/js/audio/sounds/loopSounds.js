// ============================================
// AudioManager - 鳴り続ける音（ループ）
// ============================================
//
// ドッキング成立の「ガコッ」と、そのあと続く母艦エンジン、修理中のハム音。
// ループ音の登録と停止そのものは this._loopSound() / this._stopLoopSound()
// が引き受け、ここは音色の組み立てと、進捗に応じた追従だけを書く。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    CARRIER_ENGINE_FREQ_BASE, CARRIER_ENGINE_FREQ_RANGE,
    CARRIER_ENGINE_SUB_BASE, CARRIER_ENGINE_SUB_RANGE,
    CARRIER_ENGINE_FILTER_BASE, CARRIER_ENGINE_FILTER_RANGE,
    CARRIER_ENGINE_GAIN_BASE, CARRIER_ENGINE_GAIN_RANGE,
    REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
    REPAIR_HUM_WOBBLE_HZ, REPAIR_HUM_WOBBLE_DEPTH,
} from '../../utils/Constants.js';

export const AudioLoopSounds = {
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
    },

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
    },

    /** 母艦のエンジンを止める（アタッチ解除時）。 */
    stopCarrierEngine() {
        this._stopLoopSound('carrier');
    },

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
    },

    /** 回復ハムを止める（満タン、または補給の途中で離脱したとき）。 */
    stopRepairHum() {
        this._stopLoopSound('repair');
    },
};
