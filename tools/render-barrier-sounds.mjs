#!/usr/bin/env node
// 要塞のバリアの音を WAV に書き出し、A特性で音量を実測する。
//
// ループ音と、表（WEAPON_SOUNDS）に載らない単発なので、ここで別に書き出す。
// **合成は audio/sounds/fortressSounds.js の WebAudio 版と同じ設計を写したもの。**
// 片方だけ変えると聴いた印象と実機がずれるので、数値を動かしたら両方直すこと。
//
// 使い方:
//   node tools/render-barrier-sounds.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import {
    BARRIER_HUM_FREQ, BARRIER_HUM_HARMONIC, BARRIER_HUM_FILTER,
    BARRIER_HUM_AM_HZ, BARRIER_HUM_AM_DEPTH, BARRIER_HUM_GAIN,
    BARRIER_ABSORB_FILTER, BARRIER_ABSORB_DECAY, BARRIER_ABSORB_GAIN,
    BARRIER_DOWN_FREQ_FROM, BARRIER_DOWN_FREQ_TO, BARRIER_DOWN_TIME,
    BARRIER_DOWN_GAIN,
    REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
} from '../src/js/utils/Constants.js';
import {
    SAMPLE_RATE, biquad, sawtooth, whiteNoise, aWeightedRms, transientLevel, db,
} from '../tests/helpers/dsp.js';

const OUT_DIR = new URL('../audio-preview/', import.meta.url);

function toWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        data.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/** 唸り: ノコギリ＋矩形をローパス、11Hz の AM で揺らす。 */
export function humGen() {
    const saw = sawtooth(BARRIER_HUM_FREQ);
    const lp = biquad('lowpass', BARRIER_HUM_FILTER, 0.707);
    return (i) => {
        const t = i / SAMPLE_RATE;
        const square = Math.sign(Math.sin(2 * Math.PI * BARRIER_HUM_HARMONIC * t));
        const am = 1 + BARRIER_HUM_AM_DEPTH * Math.sin(2 * Math.PI * BARRIER_HUM_AM_HZ * t);
        return lp(saw() + square) * BARRIER_HUM_GAIN * am;
    };
}

/** 比較用: 回復ハム（三角波）。 */
function repairHumGen() {
    return (i) => {
        const t = i / SAMPLE_RATE;
        const phase = (t * REPAIR_HUM_FREQ_TO) % 1;
        const tri = 4 * Math.abs(phase - 0.5) - 1;
        return tri * REPAIR_HUM_GAIN;
    };
}

/** 吸収: バンドパスを通したノイズを指数で落とす。 */
export function absorbGen() {
    const n = whiteNoise(Math.ceil(BARRIER_ABSORB_DECAY * SAMPLE_RATE) + 1, 7);
    const bp = biquad('bandpass', BARRIER_ABSORB_FILTER, 2.2);
    return (i) => {
        const t = i / SAMPLE_RATE;
        if (t > BARRIER_ABSORB_DECAY) return 0;
        const env = BARRIER_ABSORB_GAIN * Math.pow(0.001 / BARRIER_ABSORB_GAIN, t / BARRIER_ABSORB_DECAY);
        return bp(n[i] ?? 0) * env;
    };
}

/** 落下: ノコギリを指数で下降させながら減衰。 */
export function downGen() {
    let phase = 0;
    return (i) => {
        const t = i / SAMPLE_RATE;
        if (t > BARRIER_DOWN_TIME) return 0;
        const f = BARRIER_DOWN_FREQ_FROM
            * Math.pow(BARRIER_DOWN_FREQ_TO / BARRIER_DOWN_FREQ_FROM, t / BARRIER_DOWN_TIME);
        phase = (phase + f / SAMPLE_RATE) % 1;
        const env = BARRIER_DOWN_GAIN * Math.pow(0.001 / BARRIER_DOWN_GAIN, t / BARRIER_DOWN_TIME);
        return (phase * 2 - 1) * env;
    };
}

function render(gen, seconds) {
    const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    for (let i = 0; i < out.length; i++) out[i] = gen(i);
    return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const items = [
    ['barrier-hum', humGen(), 2.0],
    ['barrier-absorb', absorbGen(), 0.2],
    ['barrier-down', downGen(), 0.6],
];
for (const [name, gen, sec] of items) {
    writeFileSync(new URL(`${name}.wav`, OUT_DIR), toWav(render(gen, sec)));
}

// A特性の実測。持続音は Hann、短い音はその長さの窓で。
const hum = aWeightedRms(humGen());
const repair = aWeightedRms(repairHumGen());
const absorb = transientLevel(absorbGen(), BARRIER_ABSORB_DECAY);
const down = transientLevel(downGen(), BARRIER_DOWN_TIME);
console.log('--- A特性の実測 ---');
console.log(`バリアの唸り   ${db(hum).toFixed(1)} dB`);
console.log(`回復ハム(比較) ${db(repair).toFixed(1)} dB   → 差 ${db(hum / repair).toFixed(1)} dB`);
console.log(`吸収           ${db(absorb).toFixed(1)} dB`);
console.log(`落下           ${db(down).toFixed(1)} dB   → 吸収との差 ${db(down / absorb).toFixed(1)} dB`);
console.log(`\n書き出し: ${OUT_DIR.pathname}`);
