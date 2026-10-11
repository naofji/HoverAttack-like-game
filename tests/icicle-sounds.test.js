// 5面のつららの音（audio/sounds/icicleSounds.js）。震え・落下・床に刺さる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { icicleShakeVoices, icicleFallVoice, icicleSinkVoices } from '../src/js/audio/sounds/icicleSounds.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    ICICLE_SOUND_MERGE_MS, ICICLE_SOUND_SHAKE, ICICLE_SOUND_FALL, ICICLE_SOUND_SINK,
    ICICLE_LENGTH, ICICLE_SINK_SPEED, ICICLE_SHAKE_TICKS,
} from '../src/js/utils/Constants.js';
import { transientLevel, db } from './helpers/dsp.js';
import { shakeGen, fallGen, sinkGen } from '../tools/render-icicle-sounds.mjs';
import { explosionGen } from '../tools/render-town-sounds.mjs';

const rand = (seed = 1) => { const r = new SeededRNG(seed); return () => r.next(); };

/** 偽 ctx で fn を鳴らし、作られたノードを返す。まとめの覚え書きは毎回消す */
function capture(fn, ctx = fakeAudioCtx()) {
    return withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._icicleAt;
        fn(ctx);
        return ctx.created;
    });
}
const reaches = (node, dst, seen = new Set()) => node === dst
    || (!seen.has(node) && (seen.add(node), (node.outputs || []).some((n) => reaches(n, dst, seen))));
/** バスを先に組んで fn を鳴らし、{ nodes, fade } を返す（直結の取り違えを見分けるため） */
function withBus(fn) {
    let fade;
    const nodes = capture(() => {
        audioManager._createSeBus();
        fade = audioManager.seFade;
        fn();
    });
    return { nodes, fade };
}

// --- 部品（純関数）---

test('震え: クリックが clicks 個。1 個ずつ枠（spread / clicks）の中に置かれ、周波数・長さ・大きさは設定の範囲', () => {
    const { clicks, spread, gain, freq, dur, Q } = ICICLE_SOUND_SHAKE;
    const slot = spread / clicks;
    const v = icicleShakeVoices(rand(3));
    assert.equal(v.length, clicks);
    v.forEach((c, i) => {
        assert.ok(c.at >= slot * i && c.at < slot * (i + 1), `${i} 番目が枠の外: ${c.at}`);
        assert.ok(c.freq >= freq[0] && c.freq <= freq[1]);
        assert.ok(c.dur >= dur[0] && c.dur <= dur[1]);
        assert.ok(c.gain > 0 && c.gain <= gain);
        assert.equal(c.Q, Q);
    });
    assert.deepEqual(icicleShakeVoices(rand(4)), icicleShakeVoices(rand(4)), '同じ乱数なら同じ部品');
    assert.notDeepEqual(icicleShakeVoices(rand(4)), icicleShakeVoices(rand(5)));
});

test('震えの音は、震えの時間（ICICLE_SHAKE_TICKS）の中に収まる', () => {
    const shakeSeconds = ICICLE_SHAKE_TICKS / 60;
    for (let seed = 1; seed <= 30; seed++) {
        for (const c of icicleShakeVoices(rand(seed))) assert.ok(c.at + c.dur <= shakeSeconds, `${c.at + c.dur}s が震え ${shakeSeconds}s を超える`);
    }
});

test('落下・床に刺さる: 設定の値のまま。サーッの長さは、めり込む時間（最長のつららが潜りきるまで）に合う', () => {
    assert.deepEqual(icicleFallVoice(), ICICLE_SOUND_FALL);
    const sink = icicleSinkVoices();
    assert.deepEqual(sink.crunch, ICICLE_SOUND_SINK.crunch);
    assert.deepEqual(sink.swish, ICICLE_SOUND_SINK.swish);
    const sinkSeconds = (ICICLE_LENGTH[1] + 4) / ICICLE_SINK_SPEED / 60;
    assert.ok(Math.abs(sink.swish.dur - sinkSeconds) / sinkSeconds < 0.1, `サーッ ${sink.swish.dur}s とめり込み ${sinkSeconds.toFixed(2)}s がずれている`);
    assert.ok(sink.crunch.dur < sink.swish.dur, 'ザクッがサーッより長い');
});

// --- WebAudio のグラフ ---

test('playIcicleShake: クリックごとにバンドパスのノイズが SE バスへ。全部 1 回ずつ start/stop する', () => {
    const { nodes, fade } = withBus(() => audioManager.playIcicleShake(0));
    const sources = nodes.filter((n) => n.name === 'bufferSource');
    assert.equal(sources.length, ICICLE_SOUND_SHAKE.clicks);
    for (const s of sources) {
        assert.ok(reaches(s, fade), 'SE バスに届かない音源がある');
        assert.equal(s.started, 1);
        assert.equal(s.stopped, 1);
    }
    assert.equal(nodes.filter((n) => n.name === 'filter' && n.type === 'bandpass').length, ICICLE_SOUND_SHAKE.clicks);
});

test('playIcicleFall: 帯域を絞ったノイズが下降する（バンドパスの周波数が指数で from → to）。SE バスへ', () => {
    const { nodes, fade } = withBus(() => audioManager.playIcicleFall(0));
    const sources = nodes.filter((n) => n.name === 'bufferSource');
    assert.equal(sources.length, 1);
    assert.ok(reaches(sources[0], fade));
    const bp = nodes.find((n) => n.name === 'filter' && n.type === 'bandpass');
    assert.ok(bp, 'バンドパスが無い');
    const ev = bp.frequency.events;
    assert.deepEqual(ev[0].slice(0, 2), ['set', ICICLE_SOUND_FALL.from]);
    assert.ok(ev.some(([k, v]) => k === 'exp' && v === ICICLE_SOUND_FALL.to), '下降しない');
});

test('playIcicleSink: ザクッ（ローパス・掃引）とサーッ（バンドパス・掃引）の 2 本が SE バスへ', () => {
    const { nodes, fade } = withBus(() => audioManager.playIcicleSink(0));
    const sources = nodes.filter((n) => n.name === 'bufferSource');
    assert.equal(sources.length, 2);
    for (const s of sources) { assert.ok(reaches(s, fade)); assert.equal(s.started, 1); assert.equal(s.stopped, 1); }
    const lp = nodes.find((n) => n.name === 'filter' && n.type === 'lowpass');
    const bp = nodes.find((n) => n.name === 'filter' && n.type === 'bandpass');
    assert.ok(lp && lp.frequency.events.some(([k]) => k === 'exp'), 'ザクッが掃引しない');
    assert.ok(bp && bp.frequency.events.some(([k]) => k === 'exp'), 'サーッが掃引しない');
});

test('音源の x に応じて左右へ振られる（3 つとも。右の音源は右へ、左の音源は左へ）', () => {
    audioManager.listenerX = 500;
    try {
        for (const name of ['playIcicleShake', 'playIcicleFall', 'playIcicleSink']) {
            const right = capture(() => audioManager[name](900)).find((n) => n.name === 'panner');
            assert.ok(right && right.pan.value > 0, `${name}: 右に振られない`);
            const left = capture(() => audioManager[name](100)).find((n) => n.name === 'panner');
            assert.ok(left && left.pan.value < 0, `${name}: 左に振られない`);
        }
    } finally { audioManager.listenerX = null; }
});

// --- まとめ ---

test('同じ種類の音は ICICLE_SOUND_MERGE_MS 以内に重なったら 1 つだけ。過ぎれば鳴る。種類が違えば別', () => {
    const ctx = fakeAudioCtx();
    const count = () => ctx.created.filter((n) => n.name === 'bufferSource').length;
    withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._icicleAt;
        audioManager.playIcicleFall(0);
        const first = count();
        ctx.currentTime = 0.03;
        audioManager.playIcicleFall(0);
        assert.equal(count(), first, '同じ種類が重なった');
        audioManager.playIcicleSink(0);
        assert.ok(count() > first, '違う種類が鳴らない');
        const second = count();
        ctx.currentTime = ICICLE_SOUND_MERGE_MS / 1000 + 0.01;
        audioManager.playIcicleFall(0);
        assert.ok(count() > second, 'MERGE_MS 過ぎた音が鳴らない');
    });
});

test('震えもまとまる（グレネードで十数本が同時に震えても 1 回分のクリックだけ）', () => {
    const nodes = capture(() => { for (let i = 0; i < 12; i++) audioManager.playIcicleShake(0); });
    assert.equal(nodes.filter((n) => n.name === 'bufferSource').length, ICICLE_SOUND_SHAKE.clicks);
});

test('引数なしでも、音の出せない環境でも例外を投げない', () => {
    for (const name of ['playIcicleShake', 'playIcicleFall', 'playIcicleSink']) {
        assert.equal(typeof audioManager[name], 'function', name);
        audioManager[name]();
        capture(() => audioManager[name]());
    }
});

// --- 音量の実測（A特性）。合成は tools/render-icicle-sounds.mjs と同じ設計 ---

// 比べる窓は全部同じ（0.8 秒 → 2 の冪の窓）。窓の長さが違うと、短い音ほど薄まって小さく出る
const level = (gen) => transientLevel(gen, 0.8);
const small = () => level(explosionGen(false));
/** 小さい爆発との差（dB）。シードを変えても同じ範囲に収まることを見る */
const rel = (make) => [1, 2, 3, 4, 5].map((seed) => db(level(make(seed)) / small()));

test('3 つの音の大きさの順: 震え < 落下 < 床に刺さる < 小さい爆発', () => {
    const shake = level(shakeGen());
    const fall = level(fallGen());
    const sink = level(sinkGen());
    assert.ok(shake < fall, `震え ${db(shake).toFixed(1)}dB / 落下 ${db(fall).toFixed(1)}dB`);
    assert.ok(fall < sink, `落下 ${db(fall).toFixed(1)}dB / 床 ${db(sink).toFixed(1)}dB`);
    assert.ok(sink < small(), `床 ${db(sink).toFixed(1)}dB / 小さい爆発 ${db(small()).toFixed(1)}dB`);
});

test('震えのきしみは小さい爆発より約 20dB 小さい（-24〜-16dB。クリックの位置が変わっても）', () => {
    for (const d of rel((seed) => shakeGen(seed))) assert.ok(d > -24 && d < -16, `差 ${d.toFixed(1)}dB`);
});

test('落下の風を切る音は小さい爆発より約 14dB 小さい（-18〜-10dB）', () => {
    for (const d of rel((seed) => fallGen(seed))) assert.ok(d > -18 && d < -10, `差 ${d.toFixed(1)}dB`);
});

test('床に刺さる音は小さい爆発より約 9dB 小さい（-12〜-6dB。3 つの中で一番はっきり）', () => {
    for (const d of rel((seed) => sinkGen(seed))) assert.ok(d > -12 && d < -6, `差 ${d.toFixed(1)}dB`);
});

test('サーッはザクッに埋もれない（床に刺さる音の、ザクッだけとの差が 1dB 以上）', () => {
    const all = level(sinkGen());
    const crunch = level(sinkGen(1, { swish: false }));
    assert.ok(db(all / crunch) > 1, `差 ${db(all / crunch).toFixed(1)}dB`);
});
