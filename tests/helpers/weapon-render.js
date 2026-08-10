// WEAPON_SOUNDS のプロファイルを波形に起こす。
//
// WebAudio の無い環境で「実際にどう鳴るか」を測るために使う。
// renderWeaponSound と同じ組み立てを、オフラインで再現している。
// 両者がずれると測定の意味が無くなるので、変えるときは対にして直すこと。

import { whiteNoise, SAMPLE_RATE } from './dsp.js';

const FLOOR = 0.0008;   // renderWeaponSound と同じ

/** 掃引するローパス（WebAudio の BiquadFilterNode と同じ係数）。 */
function sweepingLowpass() {
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    return (x, f0) => {
        const w0 = 2 * Math.PI * Math.max(20, f0) / SAMPLE_RATE;
        const cw = Math.cos(w0);
        const al = Math.sin(w0) / 2;          // Q = 1（WebAudio の既定）
        const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
                - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
        st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
        return y;
    };
}

/** 1サンプルぶんの波形。OscillatorNode の type に対応する。 */
function wave(type, phase) {
    if (type === 'square') return phase < 0.5 ? 1 : -1;
    if (type === 'sawtooth') return 2 * phase - 1;
    if (type === 'triangle') return 4 * Math.abs(phase - 0.5) - 1;
    return Math.sin(2 * Math.PI * phase);
}

/** そのプロファイルが鳴り終わるまでの秒数。 */
export function profileDuration(profile) {
    return Math.max(
        profile.hiss ? profile.hiss.dur : 0,
        profile.tone ? profile.tone.dur : 0,
        profile.puffs ? profile.puffs.gap * (profile.puffs.count - 1) + profile.puffs.dur : 0,
    );
}

/**
 * プロファイルを波形に起こす。
 * @param {object} profile WEAPON_SOUNDS の1つ
 * @returns {Float64Array} 長さは 2の冪（鳴り終わるまでを含む）
 */
export function renderWeaponProfile(profile) {
    const dur = profileDuration(profile);
    let n = 1;
    while (n < dur * SAMPLE_RATE) n <<= 1;
    const buf = new Float64Array(n);

    if (profile.hiss) {
        const { from, to, dur: d, gain, hold = 0 } = profile.hiss;
        const noise = whiteNoise(n, 13);
        const lp = sweepingLowpass();
        for (let i = 0; i < n; i++) {
            const t = i / SAMPLE_RATE;
            if (t > d) break;
            const k = t / d;
            // hold の間は満音量を保ってから落とす
            const decay = t <= hold ? 1 : Math.pow(FLOOR / gain, (t - hold) / (d - hold));
            buf[i] += lp(noise[i], from * Math.pow(to / from, k)) * gain * decay;
        }
    }

    if (profile.tone) {
        const { type, from, to, dur: d, gain, hold = 0 } = profile.tone;
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SAMPLE_RATE;
            if (t > d) break;
            const k = t / d;
            phase = (phase + from * Math.pow(to / from, k) / SAMPLE_RATE) % 1;
            const decay = t <= hold ? 1 : Math.pow(FLOOR / gain, (t - hold) / (d - hold));
            buf[i] += wave(type, phase) * gain * decay;
        }
    }

    if (profile.puffs) {
        const { count, gap, freq, dur: d, gain, bright = 3 } = profile.puffs;
        for (let j = 0; j < count; j++) {
            const off = Math.floor(j * gap * SAMPLE_RATE);
            const fade = 1 - j * 0.12;
            const noise = whiteNoise(n, 17 + j);
            const lp = sweepingLowpass();
            let phase = 0;
            const len = Math.floor(d * SAMPLE_RATE);
            for (let i = 0; i < len && off + i < n; i++) {
                const k = (i / SAMPLE_RATE) / d;
                const g = gain * fade;
                buf[off + i] += lp(noise[i], freq * bright * fade * Math.pow(0.8 / (bright * fade), k))
                    * g * Math.pow(FLOOR / g, k);
                phase = (phase + freq * fade * Math.pow(0.45, k) / SAMPLE_RATE) % 1;
                buf[off + i] += Math.sin(2 * Math.PI * phase)
                    * g * 0.7 * Math.pow(FLOOR / (g * 0.7), k);
            }
        }
    }

    return buf;
}
