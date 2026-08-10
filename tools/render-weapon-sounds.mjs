#!/usr/bin/env node
// 武器の発射音を WAV に書き出して聴き比べる。
//
// 音の良し悪しは耳でしか決められないので、実機で確かめる往復を減らすために
// 置いてある。WEAPON_SOUNDS をそのまま読むので、Constants を直せばここにも
// 反映される。気になる音があればその行を直せばよい。
//
// 使い方:
//   node tools/render-weapon-sounds.mjs
//   open audio-preview/            # macOS
//
// 音量は揃えず、実際の相対関係のまま出す。武器どうしのバランスを
// 確かめるのが目的なので、正規化すると意味が無くなる。

import { writeFileSync, mkdirSync } from 'node:fs';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from '../tests/helpers/weapon-render.js';
import { SAMPLE_RATE } from '../tests/helpers/dsp.js';

const OUT_DIR = new URL('../audio-preview/', import.meta.url);

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

/** 連射の様子。マシンガンは1発だけ聴いても判断できない。 */
function repeat(buf, times, intervalSec) {
    const step = Math.floor(intervalSec * SAMPLE_RATE);
    const out = new Float64Array(step * times + buf.length);
    for (let t = 0; t < times; t++) {
        for (let i = 0; i < buf.length; i++) out[t * step + i] += buf[i];
    }
    return out;
}

const NOTES = {
    playerMg: '自機のマシンガン',
    enemyMg: '敵のマシンガン（自機より低く鈍い）',
    playerMissile: '自機のミサイル',
    enemyMissile: '敵のミサイル',
    homing: 'ホーミングミサイル「シュボボッ」',
    cruise: '巡航ミサイル（最も長く太い）',
    grenade: 'グレネードの投擲',
};

mkdirSync(OUT_DIR, { recursive: true });
console.log('audio-preview/ に書き出しました:\n');
for (const [kind, profile] of Object.entries(WEAPON_SOUNDS)) {
    const buf = renderWeaponProfile(profile);
    writeFileSync(new URL(`w-${kind}.wav`, OUT_DIR), toWav(buf));
    console.log(`  w-${kind}.wav`.padEnd(26)
        + `${profileDuration(profile).toFixed(2)}s  ${NOTES[kind] || ''}`);
}

// 連射しないと判断できない音は、連射版も出す
for (const [kind, interval] of [['playerMg', 0.09], ['enemyMg', 0.12]]) {
    const buf = repeat(renderWeaponProfile(WEAPON_SOUNDS[kind]), 8, interval);
    writeFileSync(new URL(`w-${kind}-burst.wav`, OUT_DIR), toWav(buf));
    console.log(`  w-${kind}-burst.wav`.padEnd(26) + `8連射（${interval}秒間隔）`);
}

console.log('\n  open audio-preview/   で再生できます');
