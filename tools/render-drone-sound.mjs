#!/usr/bin/env node
// ドローンの移動音の候補を WAV に書き出す。
//
// 音の良し悪しは耳でしか決められないので、数値をいじって実機で確かめる
// 往復を減らすために置いてある。node tools/render-drone-sound.mjs で
// audio-preview/ に候補が並ぶ。気に入ったものの設定を Constants.js へ
// 写せばよい。
//
// 使い方:
//   node tools/render-drone-sound.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';

const FS = 48000;
const OUT_DIR = new URL('../audio-preview/', import.meta.url);

// ---------------------------------------------------------------- WAV 書き出し

/** 16bit モノラルの WAV を組み立てる。 */
function toWav(samples, sampleRate = FS) {
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
    header.writeUInt32LE(16, 16);        // fmt チャンクの長さ
    header.writeUInt16LE(1, 20);         // PCM
    header.writeUInt16LE(1, 22);         // モノラル
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

// ---------------------------------------------------------------- 音の部品

/** WebAudio の BiquadFilterNode と同じ係数のローパス。 */
function lowpass() {
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    return (x, f0, Q) => {
        const w0 = 2 * Math.PI * f0 / FS;
        const cw = Math.cos(w0);
        const al = Math.sin(w0) / (2 * Q);
        const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
                - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
        st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
        return y;
    };
}

/**
 * 候補を1つ合成する。
 *
 * @param {object} cfg
 * @param {number} cfg.from        開始の音程
 * @param {number} cfg.to          終わりの音程
 * @param {number} cfg.dur         長さ（秒）
 * @param {number} cfg.glideShape  1 で一定の下降。大きいほど最初に急落する
 * @param {number} cfg.Q           共鳴の強さ
 * @param {number} cfg.filterMult  フィルタの開始（音程の何倍か）
 * @param {number} cfg.filterEnd   フィルタの終端（音程の何倍か）
 * @param {number[]} cfg.detune    重ねる声のずれ（セント）
 * @param {number} cfg.subGain     1オクターブ下のサイン波
 * @param {number} cfg.decay       0 で減衰なし、1 で最後に消える強さ
 * @param {number} [cfg.metal]     非整数倍の partial を足す量（金属感）
 * @param {number} [cfg.swell]     0 より大きいと最初に膨らんでから減衰する
 */
function synth(cfg) {
    const n = Math.ceil(cfg.dur * FS) + 1000;
    const out = new Float64Array(n);
    const phases = cfg.detune.map(() => 0);
    let subPhase = 0;
    let metalPhase = 0;
    const lp = lowpass();

    for (let i = 0; i < n; i++) {
        const t = i / FS;
        if (t > cfg.dur) break;
        const lin = t / cfg.dur;
        // glideShape で下降の形を変える。大きいほど頭で一気に落ちる
        const k = 1 - Math.pow(1 - lin, cfg.glideShape);

        const f = cfg.from * Math.pow(cfg.to / cfg.from, k);
        let src = 0;
        cfg.detune.forEach((cents, j) => {
            phases[j] = (phases[j] + f * Math.pow(2, cents / 1200) / FS) % 1;
            src += 2 * phases[j] - 1;          // ノコギリ波
        });
        subPhase = (subPhase + (f / 2) / FS) % 1;
        src += Math.sin(2 * Math.PI * subPhase) * cfg.subGain;

        if (cfg.metal) {
            // 2.76倍 は整数倍でないので鐘のような金属感が出る
            metalPhase = (metalPhase + f * 2.76 / FS) % 1;
            src += Math.sin(2 * Math.PI * metalPhase) * cfg.metal;
        }

        const cf = (cfg.from * cfg.filterMult)
            * Math.pow((cfg.to * cfg.filterEnd) / (cfg.from * cfg.filterMult), k);
        const y = lp(src, Math.max(40, cf), cfg.Q);

        let env;
        if (t < 0.02) {
            env = t / 0.02;
        } else if (cfg.swell) {
            // 近づいて遠ざかる感じ。頂点を swell の位置に置く
            const p = (lin - cfg.swell) / (1 - cfg.swell);
            env = lin < cfg.swell
                ? lin / cfg.swell
                : Math.pow(0.0005, p);
        } else {
            env = Math.pow(Math.pow(0.0005, cfg.decay), (t - 0.02) / (cfg.dur - 0.02));
        }
        out[i] = y * env;
    }

    // 比較しやすいよう、どれも同じピークに揃える
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] = out[i] / peak * 0.7;
    return out;
}

// ---------------------------------------------------------------- 候補

// 採用中の設定（Constants.js と揃えてある）。比較の基準にする。
const BASE = {
    from: 620, to: 160, dur: 0.9, glideShape: 1, Q: 6.5,
    filterMult: 1.8, filterEnd: 1.8, detune: [-11, 0, 13],
    subGain: 0.8, decay: 1,
};

const VARIANTS = {
    'A-genkou':      { ...BASE },
    'B-mijikai':     { ...BASE, dur: 0.6, glideShape: 2.2, decay: 1.2 },
    'C-kane':        { ...BASE, dur: 1.1, glideShape: 3.5, decay: 0.7, Q: 9 },
    'D-kinzoku':     { ...BASE, metal: 0.35, Q: 8, filterEnd: 2.4, filterMult: 2.4 },
    'E-motto-hikui': { ...BASE, from: 480, to: 120, subGain: 0.95 },
    'F-toorisugiru': { ...BASE, dur: 1.2, glideShape: 1.4, swell: 0.35 },
};

const NOTES = {
    'A-genkou':      '現行（採用中）。620→160Hz を 0.9 秒で一定に下降',
    'B-mijikai':     '短く歯切れよく。頭で急に落ちる「ポン」寄り',
    'C-kane':        '鐘を撞いた感じ。頭で一気に落ちて余韻が長い',
    'D-kinzoku':     '金属的。非整数倍の成分を足して硬い響きに',
    'E-motto-hikui': 'さらに低く。480→120Hz',
    'F-toorisugiru': '通り過ぎる感じ。膨らんでから減衰する',
};

mkdirSync(OUT_DIR, { recursive: true });
console.log('audio-preview/ に書き出しました:\n');
for (const [name, cfg] of Object.entries(VARIANTS)) {
    const wav = toWav(synth(cfg));
    writeFileSync(new URL(`${name}.wav`, OUT_DIR), wav);
    console.log(`  ${name}.wav`.padEnd(24) + NOTES[name]);
}
console.log('\n  open audio-preview/   で再生できます');
