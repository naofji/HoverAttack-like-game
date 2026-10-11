// _noiseBurst のオフライン再現（tests/helpers/dsp.js の noiseBurstGen）。
// 町の崩れる音を爆発音と比べて縛るために要る（段4。se-synthesis.test.js の冒頭にあるとおり、
// これまで爆発はオフライン再現が無く、音量を実測できなかった）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SAMPLE_RATE, biquad, whiteNoise, noiseBurstGen, transientLevel, db,
} from './helpers/dsp.js';
import { EXPLOSION_BURSTS } from '../src/js/audio/sounds/playerSounds.js';

test('掃引しない noiseBurstGen は、固定のローパスに通したノイズに包絡を掛けたものと同じ', () => {
    const o = { gain: 0.3, dur: 0.2, end: 0.001, from: 800 };
    const gen = noiseBurstGen(o, 5);
    const n = whiteNoise(Math.ceil(o.dur * SAMPLE_RATE) + 2, 5);
    const lp = biquad('lowpass', 800, 1);
    for (let i = 0; i < 2000; i++) {
        const t = i / SAMPLE_RATE;
        const want = lp(n[i]) * o.gain * Math.pow(o.end / o.gain, t / o.dur);
        assert.ok(Math.abs(gen(i) - want) < 1e-12, `i=${i}`);
    }
    assert.equal(gen(Math.ceil(o.dur * SAMPLE_RATE) + 10), 0, 'dur の後は止まる');
});

test('掃引すると後半ほど暗くなる（A特性の音量が下がる）', () => {
    const sweep = noiseBurstGen({ gain: 0.3, dur: 0.4, end: 0.3, from: 2000, to: 60 }, 5);
    const flat = noiseBurstGen({ gain: 0.3, dur: 0.4, end: 0.3, from: 2000 }, 5);
    assert.ok(db(transientLevel(sweep, 0.4) / transientLevel(flat, 0.4)) < -3);
});

test('爆発の表: 大きい爆発は小さい爆発より大きく聞こえる（再現で測れる）', () => {
    const big = transientLevel(noiseBurstGen(EXPLOSION_BURSTS.large), 1.2);
    const small = transientLevel(noiseBurstGen(EXPLOSION_BURSTS.small), 1.2);
    assert.ok(db(big / small) > 6, `差 ${db(big / small).toFixed(1)}dB`);
});
