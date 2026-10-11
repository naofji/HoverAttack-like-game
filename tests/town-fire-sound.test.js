// 町の炎のループ（audio/sounds/townSounds.js）。spec 4章
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { crackleSamples } from '../src/js/audio/sounds/townSounds.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_FIRE_CRACKLE_RATE } from '../src/js/utils/Constants.js';
import { aWeightedRms, db } from './helpers/dsp.js';
import { fireLoopGen } from '../tools/render-town-sounds.mjs';
import { humGen } from '../tools/render-barrier-sounds.mjs';

const reaches = (node, dst, seen = new Set()) => node === dst
    || (!seen.has(node) && (seen.add(node), (node.outputs || []).some((n) => reaches(n, dst, seen))));

test('パチパチのバッファ: 同じ種なら同じ。1秒あたりおよそ RATE 回のクリック', () => {
    const a = crackleSamples(48000 * 2, 48000, new SeededRNG(3));
    const b = crackleSamples(48000 * 2, 48000, new SeededRNG(3));
    assert.deepEqual(a, b);
    // クリックの頭を数える（無音から音が立ち上がる所）
    let heads = 0;
    for (let i = 1; i < a.length; i++) if (a[i - 1] === 0 && a[i] !== 0) heads++;
    assert.ok(heads > TOWN_FIRE_CRACKLE_RATE * 2 * 0.7 && heads < TOWN_FIRE_CRACKLE_RATE * 2 * 1.3, `${heads}`);
});

test('startTownFire: ゴーッとパチパチの2つのループが SE バスへ。強さに音量が追従し、左右に振れる', () => {
    const ctx = fakeAudioCtx();
    withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        audioManager.listenerX = 0;
        audioManager.startTownFire(0.5, 600);
        const sources = ctx.created.filter((n) => n.name === 'bufferSource');
        assert.equal(sources.length, 2);
        for (const s of sources) {
            assert.equal(s.loop, true);
            assert.equal(s.started, 1);
            assert.ok(reaches(s, ctx.destination));
        }
        const loop = audioManager._loops.townFire;
        assert.equal(loop.gain.gain.target, 0.5);
        assert.ok(loop.pan.pan.target > 0, '右の火が右から聞こえない');
        audioManager.startTownFire(1, 600);
        assert.equal(ctx.created.filter((n) => n.name === 'bufferSource').length, 2, '毎回作り直している');
        assert.equal(loop.gain.gain.target, 1);
    });
});

test('stopTownFire と stopLoopingSe（ミッションを抜けるとき）でループが止まる', () => {
    for (const stop of ['stopTownFire', 'stopLoopingSe']) {
        const ctx = fakeAudioCtx();
        withCtx(ctx, () => {
            audioManager.noiseBuffer = { name: 'noise' };
            audioManager.startTownFire(1, 0);
            const loop = audioManager._loops.townFire;
            audioManager[stop]();
            assert.equal(audioManager._loops.townFire, null, `${stop} で止まらない`);
            assert.equal(loop.gain.gain.target, 0);
        });
    }
});

test('引数なしでも、音の出せない環境でも例外を投げない', () => {
    audioManager.startTownFire();
    audioManager.stopTownFire();
});

// --- 音量の実測（A特性）。合成は tools/render-town-sounds.mjs と同じ設計 ---

test('炎のループは最大でもバリアの唸り以下、かつ 6dB より小さくはならない（聞こえる）', () => {
    const hum = aWeightedRms(humGen());
    const fire = aWeightedRms(fireLoopGen(1));
    const d = db(fire / hum);
    assert.ok(d <= 0 && d > -6, `炎 ${db(fire).toFixed(1)}dB / 唸り ${db(hum).toFixed(1)}dB → 差 ${d.toFixed(1)}dB`);
});

test('パチパチはハイパスで消えていない（ゴーッとの差が ±6dB 以内）', () => {
    const roar = aWeightedRms(fireLoopGen(1, 1, { crackle: false }));
    const crackle = aWeightedRms(fireLoopGen(1, 1, { roar: false }));
    const d = db(crackle / roar);
    assert.ok(Math.abs(d) < 6, `パチパチ ${db(crackle).toFixed(1)}dB / ゴーッ ${db(roar).toFixed(1)}dB`);
});
