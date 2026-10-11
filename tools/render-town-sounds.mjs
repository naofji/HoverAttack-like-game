#!/usr/bin/env node
// 3面の町の音（崩れる音・炎のループ）を WAV に書き出し、A特性で音量を実測する。
//
// **合成は audio/sounds/townSounds.js の WebAudio 版と同じ設計を写したもの。**
// 部品の並び（townCollapseVoices / crackleSamples）は同じ純関数を使い、ノードの組み方だけをここで写す。
// 片方だけ変えると聴いた印象と実機がずれるので、数値を動かしたら両方直すこと。
// テスト（tests/town-sounds.test.js）が collapseGen / explosionGen を読む。
//
// 使い方:
//   node tools/render-town-sounds.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_RATTLE_Q } from '../src/js/utils/Constants.js';
import { townCollapseVoices } from '../src/js/audio/sounds/townSounds.js';
import { EXPLOSION_BURSTS } from '../src/js/audio/sounds/playerSounds.js';
import {
    SAMPLE_RATE, biquad, whiteNoise, noiseBurstGen, transientLevel, db,
} from '../tests/helpers/dsp.js';

/** 爆発音（playExplosion）の再現。比べる相手 */
export function explosionGen(large) {
    return noiseBurstGen(EXPLOSION_BURSTS[large ? 'large' : 'small']);
}

/**
 * 崩れる音（playTownCollapse）の再現。地鳴りは _noiseBurst と同じ、ガラガラはバンドパスのノイズの一撃。
 * @param {number} size 崩れたかけらの数
 * @param {number} [seed]
 * @param {{rattles?: boolean}} [opts] rattles: false で地鳴りだけ（テストでガラガラの寄与を測る）
 */
export function collapseGen(size, seed = 1, { rattles = true } = {}) {
    const rng = new SeededRNG(seed);
    const v = townCollapseVoices(size, () => rng.next());
    const rumble = noiseBurstGen(v.rumble, seed + 100);
    const noise = whiteNoise(Math.ceil(2 * SAMPLE_RATE), seed + 200);
    const parts = rattles ? v.rattles.map((r) => ({ ...r, bp: biquad('bandpass', r.freq, TOWN_COLLAPSE_RATTLE_Q) })) : [];
    return (i) => {
        const t = i / SAMPLE_RATE;
        let y = rumble(i);
        for (const r of parts) {
            if (t < r.at || t > r.at + r.dur) continue;
            // WebAudio 版は start(t + at, at)＝ノイズの at 秒目から読む。ここも同じ所から読む
            const x = noise[Math.floor((t - r.at + r.at) * SAMPLE_RATE)] ?? 0;
            y += r.bp(x) * r.gain * Math.pow(0.001 / r.gain, (t - r.at) / r.dur);
        }
        return y;
    };
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
        ['town-collapse-large', collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.4],
        ['town-collapse-small', collapseGen(TOWN_COLLAPSE_SOUND_REF / 3), 1.4],
        ['town-shatter', collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 1.0],
    ];
    for (const [name, gen, sec] of items) writeFileSync(new URL(`${name}.wav`, OUT_DIR), toWav(render(gen, sec)));

    const L = (gen, s) => db(transientLevel(gen, s));
    console.log('--- A特性の実測 ---');
    console.log(`大きい爆発（比較）      ${L(explosionGen(true), 1.2).toFixed(1)} dB`);
    console.log(`崩壊（${TOWN_COLLAPSE_SOUND_REF} かけら）     ${L(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2).toFixed(1)} dB`);
    console.log(`小さい爆発（比較）      ${L(explosionGen(false), 0.8).toFixed(1)} dB`);
    console.log(`破片（${TOWN_COLLAPSE_SOUND_REF / 8} かけら）       ${L(collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 0.8).toFixed(1)} dB`);
    console.log(`\n書き出し: ${OUT_DIR.pathname}`);
}
