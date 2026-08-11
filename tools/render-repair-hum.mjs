#!/usr/bin/env node
// 回復ハムを WAV に書き出して聴く。
//
// ループ音は WEAPON_SOUNDS の表に載らないので（あちらは鳴らし切る音の表）、
// ここで別に書き出す。実際の回復と同じ 3.6 秒で音程が上がりきる。
//
// 使い方:
//   node tools/render-repair-hum.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import {
    REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
    REPAIR_HUM_WOBBLE_HZ, REPAIR_HUM_WOBBLE_DEPTH,
    PLAYER_MAX_HP, DOCK_HP_RATE,
} from '../src/js/utils/Constants.js';
import { SAMPLE_RATE } from '../tests/helpers/dsp.js';

const OUT_DIR = new URL('../audio-preview/', import.meta.url);
const SECONDS = PLAYER_MAX_HP / DOCK_HP_RATE / 60;   // 満タンまでの実時間

/** 16bit モノラルの WAV を組み立てる。 */
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

const n = Math.floor(SECONDS * SAMPLE_RATE);
const buf = new Float64Array(n);
let phase = 0;
let lfoPhase = 0;
for (let i = 0; i < n; i++) {
    const p = i / n;                                   // 回復の進捗
    const f = REPAIR_HUM_FREQ_FROM + p * (REPAIR_HUM_FREQ_TO - REPAIR_HUM_FREQ_FROM);
    phase = (phase + f / SAMPLE_RATE) % 1;
    lfoPhase = (lfoPhase + REPAIR_HUM_WOBBLE_HZ / SAMPLE_RATE) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const gain = REPAIR_HUM_GAIN + Math.sin(2 * Math.PI * lfoPhase) * REPAIR_HUM_WOBBLE_DEPTH;
    buf[i] = tri * gain;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL('repair-hum.wav', OUT_DIR), toWav(buf));
console.log(`audio-preview/repair-hum.wav  ${SECONDS.toFixed(1)}s  `
    + `${REPAIR_HUM_FREQ_FROM} → ${REPAIR_HUM_FREQ_TO}Hz`);
