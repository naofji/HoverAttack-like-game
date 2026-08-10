// 音の「聞こえる大きさ」を測るための最小限の信号処理。
//
// 音作りを変えたときに音量の再調整を忘れる、という失敗を止めるために置いてある。
// 実際にそれをやらかした: 敵のホバー音を 62Hz のノコギリ波から 760Hz の
// バンドパスノイズに差し替えたとき、狭い帯域で大半のエネルギーが捨てられる
// ことを補正せず、聞こえない音になった。

export const SAMPLE_RATE = 48000;

/**
 * WebAudio の BiquadFilterNode と同じ RBJ 係数のフィルタ。
 * @param {'bandpass'|'lowpass'} type
 * @param {number} f0 中心／遮断周波数
 * @param {number} Q
 * @returns {(x:number)=>number} 1サンプルずつ通す関数
 */
export function biquad(type, f0, Q) {
    const w0 = 2 * Math.PI * f0 / SAMPLE_RATE;
    const cw = Math.cos(w0);
    const al = Math.sin(w0) / (2 * Q);
    let b0, b1, b2;
    if (type === 'bandpass') {
        b0 = al; b1 = 0; b2 = -al;
    } else {
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0;
    }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
        const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2
                - (a1 / a0) * y1 - (a2 / a0) * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}

/** ノコギリ波。1サンプルずつ返す。 */
export function sawtooth(freq) {
    let phase = 0;
    return () => {
        phase = (phase + freq / SAMPLE_RATE) % 1;
        return 2 * phase - 1;
    };
}

/** 決まった並びの白色ノイズ。テストを再現可能にするため乱数を固定する。 */
export function whiteNoise(length, seed = 1) {
    const out = new Float64Array(length);
    let s = seed >>> 0;
    for (let i = 0; i < length; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;   // 線形合同法
        out[i] = (s / 0xFFFFFFFF) * 2 - 1;
    }
    return out;
}

/** その場で書き換える基数2の FFT。 */
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        for (let i = 0; i < n; i += len) {
            for (let k = 0; k < len / 2; k++) {
                const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
                const ur = re[i + k], ui = im[i + k];
                const xr = re[i + k + len / 2], xi = im[i + k + len / 2];
                const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
                re[i + k] = ur + vr; im[i + k] = ui + vi;
                re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            }
        }
    }
}

/** IEC 61672 の A特性。人間の耳の感度に合わせた重み。 */
export function aWeight(f) {
    if (f <= 0) return 0;
    const f2 = f * f;
    const num = 12194 ** 2 * f2 * f2;
    const den = (f2 + 20.6 ** 2)
        * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
        * (f2 + 12194 ** 2);
    return 1.2589 * num / den;
}

/**
 * A特性をかけた実効値。単純な RMS では低音を過大評価する。
 * 62Hz と 760Hz の音を比べるとその差は 10dB 近くになる。
 *
 * @param {(i:number)=>number} gen サンプルを返す関数
 * @param {number} [n] 長さ（2の冪）
 * @returns {number}
 */
export function aWeightedRms(gen, n = 1 << 15) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
        re[i] = gen(i) * hann;
    }
    fft(re, im);
    let power = 0;
    for (let k = 1; k < n / 2; k++) {
        const a = aWeight(k * SAMPLE_RATE / n);
        power += (re[k] * re[k] + im[k] * im[k]) * a * a;
    }
    return Math.sqrt(power) / n;
}

/** 比をデシベルで。 */
export function db(ratio) {
    return 20 * Math.log10(ratio);
}
