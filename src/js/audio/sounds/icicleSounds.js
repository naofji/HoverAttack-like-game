// ============================================
// AudioManager - 5面のつららの音（震え・落下・床に刺さる）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md（音の節）。
// 震え: 氷のきしみ（高い帯域の小さなクリックを 0.34 秒にばらまく）。予兆なので一番小さい。
// 落下: 風を切る下降音（帯域を絞ったノイズ）。頭上から落ちる気配。
// 床に刺さる: ザクッ（ローパスのノイズの一撃）＋サーッ（めり込む時間に合わせた粉雪のノイズ）。3 つの中で一番はっきり。
// 音の設計（部品の並び）は純関数に出し、tools/render-icicle-sounds.mjs のオフライン再現と共有する。
// **WebAudio 版と再現は対。片方だけ変えない。**
//
// 呼ぶのは Town（_flushEffects が、画面の近くの震え・落下・床に刺さった瞬間の注文だけを渡す）。
// 同じ種類の音が ICICLE_SOUND_MERGE_MS 以内に重なったら 1 つだけ鳴らす（グレネードで十数本が同時に震えても 1 回）。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import { ICICLE_SOUND_MERGE_MS, ICICLE_SOUND_SHAKE, ICICLE_SOUND_FALL, ICICLE_SOUND_SINK } from '../../utils/Constants.js';

/**
 * 震えのクリックの並び。時間を clicks 個の枠に分け、枠の中のどこかに置く（きしみが規則的に聞こえないように）
 * @param {() => number} rand 0〜1。WebAudio 版は Math.random、再現は種つき
 * @returns {Array<{at:number, freq:number, gain:number, dur:number, Q:number}>}
 */
export function icicleShakeVoices(rand) {
    const { clicks, spread, gain, freq, Q, dur } = ICICLE_SOUND_SHAKE;
    const slot = spread / clicks;
    const out = [];
    for (let i = 0; i < clicks; i++) {
        out.push({
            at: slot * i + rand() * slot * 0.8,
            freq: freq[0] + rand() * (freq[1] - freq[0]),
            gain: gain * (0.5 + 0.5 * rand()),
            dur: dur[0] + rand() * (dur[1] - dur[0]),
            Q,
        });
    }
    return out;
}

/** 落下の音（帯域を絞ったノイズの下降 1 本） */
export function icicleFallVoice() {
    return { ...ICICLE_SOUND_FALL };
}

/** 床に刺さる音（crunch: ローパスのノイズの一撃、swish: バンドパスのノイズの下降） */
export function icicleSinkVoices() {
    return { crunch: { ...ICICLE_SOUND_SINK.crunch }, swish: { ...ICICLE_SOUND_SINK.swish } };
}

export const AudioIcicleSounds = {
    /** 震え始めたとき。sourceX: 音源のワールド X */
    playIcicleShake(sourceX = null) {
        if (!this._prepare() || this._icicleMerged('shake')) return;
        const t = this.ctx.currentTime;
        const dest = this._out(sourceX);
        for (const v of icicleShakeVoices(Math.random)) {
            // ノイズの読み出し位置をずらして、クリックごとに違う粒にする（_bandBurst の offset）
            this._bandBurst({ t: t + v.at, gain: v.gain, dur: v.dur, from: v.freq, Q: v.Q, offset: v.at, dest });
        }
    },

    /** 落ち始めたとき */
    playIcicleFall(sourceX = null) {
        if (!this._prepare() || this._icicleMerged('fall')) return;
        const t = this.ctx.currentTime;
        this._bandBurst({ t, ...icicleFallVoice(), dest: this._out(sourceX) });
    },

    /** 先が床に触れてめり込み始めたとき */
    playIcicleSink(sourceX = null) {
        if (!this._prepare() || this._icicleMerged('sink')) return;
        const t = this.ctx.currentTime;
        const dest = this._out(sourceX);
        const v = icicleSinkVoices();
        this._noiseBurst({ t, dest, ...v.crunch });
        this._bandBurst({ t, ...v.swish, dest });
    },

    /**
     * 同じ種類の音が ICICLE_SOUND_MERGE_MS 以内に続いたら true（鳴らさない）。同じ tick に何本も注文が来ても 1 回になる
     */
    _icicleMerged(kind) {
        const t = this.ctx.currentTime;
        this._icicleAt = this._icicleAt || {};
        if (this._icicleAt[kind] !== undefined && t - this._icicleAt[kind] < ICICLE_SOUND_MERGE_MS / 1000) return true;
        this._icicleAt[kind] = t;
        return false;
    },

    /**
     * バンドパスのノイズの一撃。中心周波数を from から to へ指数で掃引し（to が無ければ from のまま）、
     * ゲインを gain から 0.001 へ dur かけて指数で落とす。Q は線形（バンドパスの Q は dB でなく線形）。
     * offset は noiseBuffer の読み出し位置（秒）
     */
    _bandBurst({ t, gain, dur, from, to, Q = 1, offset = 0, dest }) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(from, t);
        if (to !== undefined) bp.frequency.exponentialRampToValueAtTime(to, t + dur);
        bp.Q.value = Q;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(bp); bp.connect(g); g.connect(dest);
        src.start(t, offset);
        src.stop(t + dur);
        return src;
    },
};
