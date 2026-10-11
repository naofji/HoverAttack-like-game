// 町の崩れる音（audio/sounds/townSounds.js）。spec 4章
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { townCollapseScale, townCollapseVoices } from '../src/js/audio/sounds/townSounds.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_MIN, TOWN_COLLAPSE_SOUND_MERGE_MS,
    TOWN_COLLAPSE_RATTLE_SPREAD, TOWN_COLLAPSE_RUMBLE_TIME,
} from '../src/js/utils/Constants.js';
import { transientLevel, db } from './helpers/dsp.js';
import { collapseGen, explosionGen } from '../tools/render-town-sounds.mjs';

const rand = (seed = 1) => { const r = new SeededRNG(seed); return () => r.next(); };

/** 偽 ctx で fn を鳴らし、作られたノードを返す。崩れる音のまとめの覚え書きは毎回消す */
function capture(fn, ctx = fakeAudioCtx()) {
    return withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._townCollapseAt;
        delete audioManager._townCollapseK;
        fn(ctx);
        return ctx.created;
    });
}
const reaches = (node, dst, seen = new Set()) => node === dst
    || (!seen.has(node) && (seen.add(node), (node.outputs || []).some((n) => reaches(n, dst, seen))));

test('大きさ: かけらが多いほど大きく、REF で 1、どんなに小さくても MIN', () => {
    assert.equal(townCollapseScale(TOWN_COLLAPSE_SOUND_REF), 1);
    assert.equal(townCollapseScale(TOWN_COLLAPSE_SOUND_REF * 5), 1);
    assert.equal(townCollapseScale(0), TOWN_COLLAPSE_SOUND_MIN);
    assert.equal(townCollapseScale(undefined), TOWN_COLLAPSE_SOUND_MIN);
    let prev = 0;
    for (let s = 1; s <= TOWN_COLLAPSE_SOUND_REF; s += 7) {
        const k = townCollapseScale(s);
        assert.ok(k >= prev, `${s}: ${k} < ${prev}`);
        prev = k;
    }
});

test('部品: 大きい崩壊ほど地鳴りが長く・ガラガラが多い。ガラガラは SPREAD の中にばらまかれる', () => {
    const big = townCollapseVoices(TOWN_COLLAPSE_SOUND_REF, rand());
    const small = townCollapseVoices(10, rand());
    assert.ok(big.rumble.dur > small.rumble.dur);
    assert.ok(big.rumble.dur <= TOWN_COLLAPSE_RUMBLE_TIME + 1e-9);
    assert.ok(big.rattles.length > small.rattles.length);
    assert.ok(small.rattles.length >= 1);
    for (const r of big.rattles) assert.ok(r.at >= 0 && r.at <= TOWN_COLLAPSE_RATTLE_SPREAD);
    assert.deepEqual(townCollapseVoices(50, rand(4)), townCollapseVoices(50, rand(4)), '同じ乱数なら同じ部品');
});

test('playTownCollapse: 地鳴り1本とガラガラが SE バスへ。地鳴りはローパスを掃引する', () => {
    // バスを先に組む。withCtx は seFade を null にするので、組まないと _seDest が出力そのものになり、
    // 「バスを通さず出力へ直結」の取り違えを見分けられない
    let fade;
    const nodes = capture(() => {
        audioManager._createSeBus();
        fade = audioManager.seFade;
        audioManager.playTownCollapse(TOWN_COLLAPSE_SOUND_REF, 0);
    });
    const sources = nodes.filter((n) => n.name === 'bufferSource');
    assert.ok(sources.length >= 2, `音源 ${sources.length}`);
    for (const s of sources) {
        assert.ok(reaches(s, fade), 'SE バスに届かない音源がある');
        assert.equal(s.started, 1);
        assert.equal(s.stopped, 1);
    }
    const lowpass = nodes.find((n) => n.name === 'filter' && n.type === 'lowpass');
    assert.ok(lowpass.frequency.events.some(([k]) => k === 'exp'), '地鳴りが掃引しない');
    assert.ok(nodes.some((n) => n.name === 'filter' && n.type === 'bandpass'), 'ガラガラが無い');
});

test('80ms 以内に続いた崩れる音は、前より小さければ鳴らさず、大きければ鳴らす。80ms 過ぎれば鳴る', () => {
    const ctx = fakeAudioCtx();
    const count = () => ctx.created.filter((n) => n.name === 'bufferSource').length;
    withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._townCollapseAt;
        audioManager.playTownCollapse(80, 0);
        const first = count();
        ctx.currentTime = 0.03;
        audioManager.playTownCollapse(20, 0);
        assert.equal(count(), first, '小さい音がまとまらない');
        ctx.currentTime = 0.05;
        audioManager.playTownCollapse(TOWN_COLLAPSE_SOUND_REF, 0);
        const second = count();
        assert.ok(second > first, '大きい音が鳴らない');
        ctx.currentTime = 0.05 + TOWN_COLLAPSE_SOUND_MERGE_MS / 1000 + 0.01;
        audioManager.playTownCollapse(10, 0);
        assert.ok(count() > second, '80ms 過ぎた音が鳴らない');
    });
});

test('引数なしでも、音の出せない環境でも例外を投げない', () => {
    audioManager.playTownCollapse();
    capture(() => audioManager.playTownCollapse());
});

// --- 音量の実測（A特性）。合成は tools/render-town-sounds.mjs と同じ設計 ---

test('崩壊（REF）は大きい爆発より約 3dB 小さい（-5〜-1.5dB）', () => {
    const big = transientLevel(explosionGen(true), 1.2);
    const collapse = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2);
    const d = db(collapse / big);
    assert.ok(d > -5 && d < -1.5, `崩壊 ${db(collapse).toFixed(1)}dB / 爆発 ${db(big).toFixed(1)}dB → 差 ${d.toFixed(1)}dB`);
});

test('小さい破片（REF/8 かけら）が砕ける音は、小さい爆発より小さい', () => {
    const small = transientLevel(explosionGen(false), 0.8);
    const shatter = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 0.8);
    assert.ok(shatter < small, `破片 ${db(shatter).toFixed(1)}dB / 小さい爆発 ${db(small).toFixed(1)}dB`);
});

test('ガラガラは地鳴りに埋もれない（崩壊の音の、地鳴りだけとの差が 1dB 以上）', () => {
    const all = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2);
    const rumble = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF, 1, { rattles: false }), 1.2);
    assert.ok(db(all / rumble) > 1, `差 ${db(all / rumble).toFixed(1)}dB`);
});
