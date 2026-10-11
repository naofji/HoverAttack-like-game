#!/usr/bin/env node
// 5面のつららの音（震え・落下・床に刺さる）を WAV に書き出し、A特性で音量を実測する。
//
// **合成は audio/sounds/icicleSounds.js の WebAudio 版と同じ設計を写したもの。**
// 部品の並び（icicleShakeVoices / icicleFallVoice / icicleSinkVoices）は同じ純関数を使い、ノードの組み方だけをここで写す。
// 片方だけ変えると聴いた印象と実機がずれるので、数値を動かしたら両方直すこと。
// テスト（tests/icicle-sounds.test.js）が shakeGen / fallGen / sinkGen を読む。
//
// 使い方:
//   node tools/render-icicle-sounds.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { icicleShakeVoices, icicleFallVoice, icicleSinkVoices } from '../src/js/audio/sounds/icicleSounds.js';
import { explosionGen } from './render-town-sounds.mjs';
import {
    SAMPLE_RATE, biquadCoeffs, whiteNoise, noiseBurstGen, transientLevel, db,
} from '../tests/helpers/dsp.js';

/**
 * AudioIcicleSounds._bandBurst のオフライン再現。**片方だけ変えない。**
 * バンドパスの中心を from から to へ指数で掃引し（to が無ければ固定）、ゲインを gain から 0.001 へ dur かけて指数で落とし、
 * dur で止まる。Q は線形。at 秒に始まる（その前は 0）。ノイズは at 秒目から読む（WebAudio の start(t + at, at) と同じ）
 * @returns {(i:number)=>number}
 */
export function bandBurstGen({ at = 0, gain, dur, from, to, Q = 1 }, seed = 3, noise = whiteNoise(Math.ceil(2 * SAMPLE_RATE), seed)) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (i) => {
        const t = i / SAMPLE_RATE - at;
        if (t < 0 || t > dur) return 0;
        const f = to === undefined ? from : from * Math.pow(to / from, t / dur);
        const [b0, b1, b2, a1, a2] = biquadCoeffs('bandpass', f, Q);
        const x = noise[Math.floor((t + at) * SAMPLE_RATE)] ?? 0;
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y * gain * Math.pow(0.001 / gain, t / dur);
    };
}

const sum = (gens) => (i) => gens.reduce((a, g) => a + g(i), 0);

/** 震えのきしみ（playIcicleShake）の再現 */
export function shakeGen(seed = 1) {
    const rng = new SeededRNG(seed);
    const noise = whiteNoise(Math.ceil(2 * SAMPLE_RATE), seed + 200);
    return sum(icicleShakeVoices(() => rng.next()).map((v) => bandBurstGen({ at: v.at, gain: v.gain, dur: v.dur, from: v.freq, Q: v.Q }, seed, noise)));
}

/** 落下の風を切る音（playIcicleFall）の再現 */
export function fallGen(seed = 1) {
    return bandBurstGen(icicleFallVoice(), seed + 100);
}

/**
 * 床に刺さる音（playIcicleSink）の再現。ザクッは _noiseBurst と同じ、サーッは _bandBurst と同じ
 * @param {{swish?: boolean}} [opts] swish: false でザクッだけ（テストでサーッの寄与を測る）
 */
export function sinkGen(seed = 1, { swish = true } = {}) {
    const v = icicleSinkVoices();
    const parts = [noiseBurstGen(v.crunch, seed + 100)];
    if (swish) parts.push(bandBurstGen(v.swish, seed + 300));
    return sum(parts);
}

function toWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24);
    h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

function render(gen, seconds) {
    const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    for (let i = 0; i < out.length; i++) out[i] = gen(i);
    return out;
}

// テストから import されたときは書き出さない（直接走らせたときだけ）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const OUT_DIR = new URL('../audio-preview/', import.meta.url);
    mkdirSync(OUT_DIR, { recursive: true });
    const items = [
        ['icicle-shake', shakeGen(), 0.6],
        ['icicle-fall', fallGen(), 0.5],
        ['icicle-sink', sinkGen(), 0.6],
    ];
    for (const [name, gen, sec] of items) writeFileSync(new URL(`${name}.wav`, OUT_DIR), toWav(render(gen, sec)));

    // 比べる窓は全部同じ（0.8 秒 → 2 の冪の窓）。窓の長さが違うと、短い音ほど薄まって小さく出る
    const L = (gen) => db(transientLevel(gen, 0.8));
    const base = L(explosionGen(false));
    const row = (name, v) => console.log(`${name} ${v.toFixed(1)} dB（小さい爆発との差 ${(v - base).toFixed(1)} dB）`);
    console.log('--- A特性の実測 ---');
    console.log(`小さい爆発（比較）      ${base.toFixed(1)} dB`);
    row('震え（きしみ）         ', L(shakeGen()));
    row('落下（風を切る）       ', L(fallGen()));
    row('床に刺さる             ', L(sinkGen()));
    row('  ザクッだけ           ', L(sinkGen(1, { swish: false })));
    console.log(`\n書き出し: ${OUT_DIR.pathname}`);
}
