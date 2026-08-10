#!/usr/bin/env node
// 自機ミサイルの発射音の候補を WAV に書き出して聴き比べる。
//
// 現状は「ボゥン」と鈍い。発音直後が暗く（重心 350Hz）そこに振幅が集中し、
// 明るくなる頃には音が消えているため。方向の違う案を並べて選んでもらう。
//
//   node tools/render-missile-candidates.mjs
//   open audio-preview/
//
// 気に入ったものの設定を weaponSounds.js の playerMissile へ写す。
// 敵版は同じ形のまま帯域を一段下げれば揃う。

import { writeFileSync, mkdirSync } from 'node:fs';
import { renderWeaponProfile, profileDuration } from '../tests/helpers/weapon-render.js';
import { transientLevel, db, whiteNoise, SAMPLE_RATE } from '../tests/helpers/dsp.js';
import {
    ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN,
} from '../src/js/utils/Constants.js';

const OUT_DIR = new URL('../audio-preview/', import.meta.url);
const TARGET_DB = -5.0;      // 敵のジャンプ音を 0dB としたときの狙い

/** 比較の基準になる音（敵のジャンプ音）。 */
function referenceLevel() {
    const n = 1 << 14;
    const noise = whiteNoise(n, 7);
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        if (t > 0.3) break;
        const f = ENEMY_BURST_FREQ_FROM
            * Math.pow(ENEMY_BURST_FREQ_TO / ENEMY_BURST_FREQ_FROM, t / 0.3);
        const w0 = 2 * Math.PI * f / SAMPLE_RATE;
        const cw = Math.cos(w0), al = Math.sin(w0) / 2;
        const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        const x = noise[i];
        const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
                - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
        st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
        buf[i] = y * ENEMY_BURST_GAIN;
    }
    return transientLevel((i) => buf[i], 0.3);
}

const REF = referenceLevel();

function levelOf(profile) {
    const buf = renderWeaponProfile(profile);
    return db(transientLevel((i) => buf[i], profileDuration(profile)) / REF);
}

/** 全ての部品を同じ倍率で伸縮する。 */
function scaled(profile, m) {
    const out = {};
    for (const [part, cfg] of Object.entries(profile)) {
        out[part] = { ...cfg, gain: cfg.gain * m };
    }
    return out;
}

/** 狙いの音量になる倍率を二分探索する。音色だけを比べたいので揃える。 */
function normalize(profile) {
    let lo = 0.02;
    let hi = 8;
    for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (levelOf(scaled(profile, m)) > TARGET_DB) hi = m; else lo = m;
    }
    return scaled(profile, (lo + hi) / 2);
}

/** 16bit モノラルの WAV。 */
function toWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        data.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24);
    h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

const CANDIDATES = {
    // 現状。発音直後が暗く、明るくなる頃には消えている
    'A-genkou-boun': {
        profile: {
            hiss: { from: 700, to: 2600, dur: 0.34, gain: 0.13 },
            tone: { type: 'sawtooth', from: 120, to: 40, dur: 0.30, gain: 0.06 },
        },
        note: '現状「ボゥン」。頭が暗く、明るい部分が聞こえない',
    },

    // 明るい噴射音を前に出して持続させる。素直な「シャーッ」寄り
    'B-funsha': {
        profile: {
            hiss: { from: 3200, to: 1000, dur: 0.50, hold: 0.14, gain: 0.055 },
            tone: { type: 'sawtooth', from: 200, to: 60, dur: 0.20, gain: 0.045 },
            puffs: { count: 1, gap: 0.04, freq: 500, dur: 0.04, gain: 0.10, bright: 8 },
        },
        note: '噴射音を前に出して持続させた案',
    },

    // 「ズーン」= 低く重い塊が長く残る。頭の一撃は鈍く、余韻を低音で作る
    'C-zoon': {
        profile: {
            hiss: { from: 900, to: 260, dur: 0.55, hold: 0.10, gain: 0.045 },
            tone: { type: 'sawtooth', from: 110, to: 38, dur: 0.75, hold: 0.28, gain: 0.10 },
            puffs: { count: 1, gap: 0.04, freq: 150, dur: 0.06, gain: 0.10, bright: 3 },
        },
        note: '「ズーン」低く重い塊が長く残る',
    },

    // 「シュパーン」= 鋭いノイズ（シュ）+ 硬い一撃（パ）+ 響く余韻（ーン）
    'D-shupaan': {
        profile: {
            hiss: { from: 6000, to: 1800, dur: 0.22, hold: 0.05, gain: 0.075 },
            tone: { type: 'triangle', from: 900, to: 300, dur: 0.60, hold: 0.16, gain: 0.055 },
            puffs: { count: 1, gap: 0.04, freq: 700, dur: 0.035, gain: 0.13, bright: 9 },
        },
        note: '「シュパーン」鋭く弾けて金属質の余韻が残る',
    },

    // D の余韻をさらに伸ばした版
    'E-shupaan-long': {
        profile: {
            hiss: { from: 6000, to: 1800, dur: 0.22, hold: 0.05, gain: 0.075 },
            tone: { type: 'triangle', from: 1100, to: 260, dur: 0.90, hold: 0.30, gain: 0.055 },
            puffs: { count: 1, gap: 0.04, freq: 700, dur: 0.035, gain: 0.13, bright: 9 },
        },
        note: '「シュパーーン」余韻をさらに伸ばした版',
    },
};

/** 20ms ごとの明るさ（ゼロ交差率）と振幅。 */
function trace(profile) {
    const buf = renderWeaponProfile(profile);
    const dur = profileDuration(profile);
    const step = Math.floor(0.02 * SAMPLE_RATE);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    let line = '';
    for (let t = 0; t < dur; t += 0.04) {
        const a = Math.floor(t * SAMPLE_RATE);
        const n = Math.min(step * 2, buf.length - a);
        if (n < 64) break;
        let rms = 0;
        for (let i = 0; i < n; i++) rms += buf[a + i] * buf[a + i];
        rms = Math.sqrt(rms / n);
        line += rms > peak * 0.35 ? '█' : rms > peak * 0.18 ? '▓'
            : rms > peak * 0.08 ? '▒' : rms > peak * 0.03 ? '░' : '·';
    }
    return line;
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`audio-preview/ に書き出しました（どれも ${TARGET_DB}dB に揃えてあります）:\n`);
for (const [name, { profile, note }] of Object.entries(CANDIDATES)) {
    const tuned = normalize(profile);
    writeFileSync(new URL(`m-${name}.wav`, OUT_DIR), toWav(renderWeaponProfile(tuned)));
    console.log(`  m-${name}.wav`.padEnd(26)
        + `${profileDuration(tuned).toFixed(2)}s  ${trace(tuned).padEnd(24)}  ${note}`);
}
console.log('\n  █ 大 ▓ 中 ▒ 小 ░ 微 · 無音   1目盛 = 40ms');
console.log('  open audio-preview/   で再生できます');
