// ============================================
// AudioManager - 3面の町の音（崩れる音・炎のループ）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（4章）。
// 崩れる音は「低い地鳴り＋瓦礫のガラガラ」。地鳴りだけだと爆発の尾と区別がつかず、
// ガラガラだけだと軽い。どちらの大きさ・長さも崩れたかけらの数で決める（townCollapseScale）。
// 音の設計（部品の並び）は純関数 townCollapseVoices に出し、tools/render-town-sounds.mjs の
// オフライン再現と共有する。**WebAudio 版と再現は対。片方だけ変えない。**
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_EXP, TOWN_COLLAPSE_SOUND_MIN, TOWN_COLLAPSE_SOUND_MERGE_MS,
    TOWN_COLLAPSE_RUMBLE_GAIN, TOWN_COLLAPSE_RUMBLE_TIME, TOWN_COLLAPSE_RUMBLE_FROM, TOWN_COLLAPSE_RUMBLE_TO,
    TOWN_COLLAPSE_RATTLES, TOWN_COLLAPSE_RATTLE_SPREAD, TOWN_COLLAPSE_RATTLE_GAIN,
    TOWN_COLLAPSE_RATTLE_FREQ_MIN, TOWN_COLLAPSE_RATTLE_FREQ_RANGE, TOWN_COLLAPSE_RATTLE_Q,
    TOWN_FIRE_ROAR_GAIN, TOWN_FIRE_ROAR_FILTER, TOWN_FIRE_CRACKLE_GAIN, TOWN_FIRE_CRACKLE_FILTER,
    TOWN_FIRE_CRACKLE_RATE, TOWN_FIRE_CRACKLE_SECONDS, TOWN_FIRE_CRACKLE_SEED,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';

/** 崩れたかけらの数 → 音の大きさ k（MIN〜1） */
export function townCollapseScale(size) {
    const k = Math.pow(Math.max(0, size || 0) / TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_EXP);
    return Math.max(TOWN_COLLAPSE_SOUND_MIN, Math.min(1, k));
}

/**
 * 崩れる音の部品。地鳴り（_noiseBurst の引数）と、ガラガラ（バンドパスのノイズの一撃）の並び。
 * @param {number} size 崩れたかけらの数
 * @param {() => number} rand 0〜1。WebAudio 版は Math.random、再現は種つき
 */
export function townCollapseVoices(size, rand) {
    const k = townCollapseScale(size);
    const dur = TOWN_COLLAPSE_RUMBLE_TIME * (0.5 + 0.5 * k);
    const rumble = {
        gain: TOWN_COLLAPSE_RUMBLE_GAIN * k, dur, end: 0.001,
        from: TOWN_COLLAPSE_RUMBLE_FROM, to: TOWN_COLLAPSE_RUMBLE_TO, sweepDur: dur,
    };
    const rattles = [];
    const n = Math.max(1, Math.round(TOWN_COLLAPSE_RATTLES * k));
    for (let i = 0; i < n; i++) {
        rattles.push({
            at: rand() * TOWN_COLLAPSE_RATTLE_SPREAD * (0.5 + 0.5 * k),
            freq: TOWN_COLLAPSE_RATTLE_FREQ_MIN + rand() * TOWN_COLLAPSE_RATTLE_FREQ_RANGE,
            gain: TOWN_COLLAPSE_RATTLE_GAIN * k * (0.5 + 0.5 * rand()),
            dur: 0.04 + rand() * 0.04,
        });
    }
    return { k, rumble, rattles };
}

/**
 * パチパチのバッファ（n サンプル）。まばらなクリック（数 ms の減衰するノイズ）を並べる。
 * WebAudio 版は1度だけ作ってループし、再現も同じものを使う
 * @param {{next: () => number}} rng
 */
export function crackleSamples(n, sampleRate, rng) {
    const out = new Float32Array(n);
    const count = Math.round(TOWN_FIRE_CRACKLE_RATE * n / sampleRate);
    for (let c = 0; c < count; c++) {
        const at = Math.floor(rng.next() * n);
        const len = Math.floor(sampleRate * (0.002 + rng.next() * 0.004));
        const amp = 0.3 + 0.7 * rng.next();
        for (let k = 0; k < len && at + k < n; k++) out[at + k] += (rng.next() * 2 - 1) * amp * Math.exp(-5 * k / len);
    }
    return out;
}

export const AudioTownSounds = {
    /**
     * 建物の崩壊・落ちた破片が砕けたとき。町の側（Town._flushEffects）が 1 tick に一番大きい1つだけ渡す。
     * tick をまたいで TOWN_COLLAPSE_SOUND_MERGE_MS 以内に続いた音は、前より小さければ鳴らさない。
     * 前より大きければ鳴らす（待って比べると、崩れた瞬間から音が遅れる）
     * @param {number} [size] 崩れたかけらの数
     * @param {number} [sourceX] 音源のワールドX
     */
    playTownCollapse(size = 0, sourceX = null) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const v = townCollapseVoices(size, Math.random);
        if (this._townCollapseAt !== undefined && t - this._townCollapseAt < TOWN_COLLAPSE_SOUND_MERGE_MS / 1000
            && v.k <= this._townCollapseK) return;
        this._townCollapseAt = t;
        this._townCollapseK = v.k;
        const dest = this._out(sourceX);
        this._noiseBurst({ t, dest, ...v.rumble });
        for (const r of v.rattles) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = r.freq;
            bp.Q.value = TOWN_COLLAPSE_RATTLE_Q;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(r.gain, t + r.at);
            g.gain.exponentialRampToValueAtTime(0.001, t + r.at + r.dur);
            src.connect(bp); bp.connect(g); g.connect(dest);
            // ノイズの読み出し位置をずらして、ガラガラごとに違う粒にする
            src.start(t + r.at, r.at);
            src.stop(t + r.at + r.dur);
        }
    },

    /**
     * 画面の近くで火が燃えているあいだのループ。毎 tick 呼んでよい（町の側が Town.update から呼ぶ）。
     * 強さは近い火元の数と位置から（FireSystem.soundLevel）。0 になったら stopTownFire を呼ぶこと
     * @param {number} [intensity] 0〜1
     * @param {number} [sourceX] 火元のワールドX（重み付きの平均）
     */
    startTownFire(intensity = 0, sourceX = null) {
        const level = Math.max(0, Math.min(1, intensity));
        this._loopSound('townFire', {
            build: () => {
                const roar = this.ctx.createBufferSource();
                roar.buffer = this.noiseBuffer;
                roar.loop = true;
                const lp = this.ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = TOWN_FIRE_ROAR_FILTER;
                const roarGain = this.ctx.createGain();
                roarGain.gain.value = TOWN_FIRE_ROAR_GAIN;

                const crackle = this.ctx.createBufferSource();
                crackle.buffer = this._townCrackleBuffer();
                crackle.loop = true;
                const hp = this.ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = TOWN_FIRE_CRACKLE_FILTER;
                hp.Q.value = 0.7;
                const crackleGain = this.ctx.createGain();
                crackleGain.gain.value = TOWN_FIRE_CRACKLE_GAIN;

                const gain = this.ctx.createGain();
                gain.gain.value = 0;
                roar.connect(lp); lp.connect(roarGain); roarGain.connect(gain);
                crackle.connect(hp); hp.connect(crackleGain); crackleGain.connect(gain);
                // 火元が動くので、パンナーは作り置いて追従させる（_panned は1回きりの音用）
                let pan = null;
                if (typeof this.ctx.createStereoPanner === 'function') {
                    pan = this.ctx.createStereoPanner();
                    gain.connect(pan);
                    pan.connect(this._seDest());
                } else {
                    gain.connect(this._seDest());
                }
                return { gain, pan, sources: [roar, crackle] };
            },
            tune: (n, t) => {
                n.gain.gain.setTargetAtTime(level, t, 0.25);
                if (n.pan) n.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, this._panFor(sourceX))), t, 0.25);
            },
        });
    },

    /** 炎のループを止める（火が消えた・画面から火が無くなった・ミッションを抜けた）。燃え尽きるように少し長めに引く */
    stopTownFire() {
        this._stopLoopSound('townFire', 0.4);
    },

    /** パチパチのバッファ。1度だけ作る */
    _townCrackleBuffer() {
        if (!this.townCrackleBuffer || this.townCrackleBuffer.sampleRate !== this.ctx.sampleRate) {
            const n = Math.round(TOWN_FIRE_CRACKLE_SECONDS * this.ctx.sampleRate);
            const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
            buf.getChannelData(0).set(crackleSamples(n, this.ctx.sampleRate, new SeededRNG(TOWN_FIRE_CRACKLE_SEED)));
            this.townCrackleBuffer = buf;
        }
        return this.townCrackleBuffer;
    },
};
