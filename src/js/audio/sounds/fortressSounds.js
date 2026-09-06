// ============================================
// AudioManager - 要塞の音（電磁パルスのバリア）
// ============================================
//
// バリアは「近づくと唸っていて、弾を吸うとジッと鳴り、2基目を壊すと電源が
// 落ちる」の3つで成り立たせる。唸りは低いノコギリ＋矩形波を速い振幅変調で
// 揺らしたもの。純粋なトーンだと電子音になって「装置が唸っている」感じが
// 出ない（回復ハムと同じ理由）。唸りだけだと母艦エンジンと紛らわしいので、
// 11Hz の AM で「ジジジ」を足して区別する。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    BARRIER_HUM_FREQ, BARRIER_HUM_HARMONIC, BARRIER_HUM_FILTER,
    BARRIER_HUM_AM_HZ, BARRIER_HUM_AM_DEPTH, BARRIER_HUM_GAIN,
    BARRIER_ABSORB_FILTER, BARRIER_ABSORB_DECAY, BARRIER_ABSORB_GAIN,
    BARRIER_DOWN_FREQ_FROM, BARRIER_DOWN_FREQ_TO, BARRIER_DOWN_TIME,
    BARRIER_DOWN_GAIN,
} from '../../utils/Constants.js';

export const AudioFortressSounds = {
    /**
     * バリアの唸り。いちばん近い1本だけを鳴らす（合計すると本数ぶん青天井になる）。
     * 毎フレーム呼んでよい。聞こえる範囲に無いときは volume 0 を渡す。
     *
     * @param {number} volume 0〜1。距離から求めた音量（nearestActiveBarrier）
     * @param {number} [x] 音源のワールドX。左右の振り分けに使う
     */
    setBarrierHum(volume = 0, x = null) {
        if (volume <= 0) {
            // 音源は残したまま滑らかに引く。作り直すと繋ぎ目でプチッと鳴る
            if (this.barrierHumGain) {
                this.barrierHumGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
            }
            return;
        }
        if (!this._prepare()) return;

        if (!this.barrierHumGain) {
            const osc = this.ctx.createOscillator();
            const harm = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            // 振幅変調。gain.gain に足し込む形なので depth は絶対値
            const am = this.ctx.createOscillator();
            const amGain = this.ctx.createGain();

            // 三角波1本。ノコギリ＋矩形だと低い唸りが強く出て「うざい」（実機の指摘）
            osc.type = 'triangle';
            osc.frequency.value = BARRIER_HUM_FREQ;
            harm.type = 'triangle';
            harm.frequency.value = BARRIER_HUM_HARMONIC;
            filter.type = 'lowpass';
            filter.frequency.value = BARRIER_HUM_FILTER;
            am.type = 'sine';
            am.frequency.value = BARRIER_HUM_AM_HZ;
            amGain.gain.value = BARRIER_HUM_GAIN * BARRIER_HUM_AM_DEPTH;
            gain.gain.value = 0;

            osc.connect(filter);
            // HARMONIC が 0 なら倍音は無効。繋がないことで完全に消す
            if (BARRIER_HUM_HARMONIC > 0) harm.connect(filter);
            filter.connect(gain);
            am.connect(amGain);
            amGain.connect(gain.gain);
            gain.connect(this._panned(x));

            osc.start();
            if (BARRIER_HUM_HARMONIC > 0) harm.start();
            am.start();
            this.barrierHumOsc = osc;
            this.barrierHumHarm = harm;
            this.barrierHumAm = am;
            this.barrierHumGain = gain;
        }
        const t = this.ctx.currentTime;
        this.barrierHumGain.gain.setTargetAtTime(BARRIER_HUM_GAIN * volume, t, 0.12);
    },

    /** バリアの唸りを止める（面を抜けるとき）。 */
    stopBarrierHum() {
        if (!this.barrierHumGain) return;
        this.barrierHumGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.10);
        const nodes = [this.barrierHumOsc, this.barrierHumAm];
        if (BARRIER_HUM_HARMONIC > 0) nodes.push(this.barrierHumHarm);
        this.barrierHumOsc = null;
        this.barrierHumHarm = null;
        this.barrierHumAm = null;
        this.barrierHumGain = null;
        setTimeout(() => {
            for (const n of nodes) {
                try { n.stop(); n.disconnect(); } catch { /* 既に止まっていれば無視 */ }
            }
        }, 200);
    },

    /** 弾を吸ったときの「ジッ」。短いノイズのバーストだけで、余韻は残さない。 */
    playBarrierAbsorb(x = null) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = BARRIER_ABSORB_FILTER;
        bp.Q.value = 2.2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(BARRIER_ABSORB_GAIN, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + BARRIER_ABSORB_DECAY);
        noise.connect(bp); bp.connect(g); g.connect(this._panned(x));
        noise.start(t); noise.stop(t + BARRIER_ABSORB_DECAY);
    },

    /**
     * 2基目のユニットが壊れてバリアが落ちた合図。電源が落ちる下降音。
     * ユニットの爆発（playBlast）に重ねるので、爆発と食い合わない低い帯域に置く。
     */
    playBarrierDown(x = null) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(BARRIER_DOWN_FREQ_FROM, t);
        osc.frequency.exponentialRampToValueAtTime(BARRIER_DOWN_FREQ_TO, t + BARRIER_DOWN_TIME);
        g.gain.setValueAtTime(BARRIER_DOWN_GAIN, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + BARRIER_DOWN_TIME);
        osc.connect(g); g.connect(this._panned(x));
        osc.start(t); osc.stop(t + BARRIER_DOWN_TIME);
    },
};
