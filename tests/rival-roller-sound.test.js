// ローラーダッシュの音（滑走の唸り playRollerDash と急停止の「キィッ」playRollerStop）。
//
// 音量は A特性の transientLevel で、既に実機で決まっている rival の回避ダッシュ音
// （playRivalDash）と比べて縛る。滑走音は滑っているあいだずっと鳴るので控えめ、
// 急停止は一瞬なので同程度。
//
// **playRollerDash / playRollerStop を変えたらここのオフライン再現も合わせること**
// （片方だけ変えると、測っている波形が実装と違うものになる）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transientLevel, db, SAMPLE_RATE, biquad, biquadCoeffs, whiteNoise } from './helpers/dsp.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import {
    TILE_SIZE as T,
    ROLLER_SND_FREQ_FROM, ROLLER_SND_FREQ_TO, ROLLER_SND_SPINUP, ROLLER_SND_GRIND_FREQ,
    ROLLER_SND_GRIND_Q, ROLLER_SND_GRIND_MIX, ROLLER_SND_GAIN, ROLLER_SND_ATTACK,
    ROLLER_SND_RELEASE, ROLLER_SND_DEFAULT_DURATION,
    ROLLER_STOP_SND_DURATION, ROLLER_STOP_SND_FREQ_FROM, ROLLER_STOP_SND_FREQ_TO, ROLLER_STOP_SND_Q,
    ROLLER_STOP_SND_TONE_FROM, ROLLER_STOP_SND_TONE_TO, ROLLER_STOP_SND_TONE_MIX, ROLLER_STOP_SND_GAIN,
    ROLLER_ACCEL_FRAMES, ROLLER_GLIDE_FRAMES_MIN, ROLLER_STOP_FRAMES,
    RIVAL_DASH_SND_FREQ_FROM, RIVAL_DASH_SND_FREQ_TO, RIVAL_DASH_SND_DURATION,
    RIVAL_DASH_SND_FILTER_Q, RIVAL_DASH_SND_FILTER_MULT, RIVAL_DASH_SND_DETUNE,
    RIVAL_DASH_SND_GAIN, RIVAL_DASH_SND_SUB_GAIN, RIVAL_DASH_SND_ATTACK,
    RIVAL_DASH_SND_RISE_AT, RIVAL_DASH_SND_KNEE, RIVAL_DASH_SND_HOLD,
} from '../src/js/utils/Constants.js';

const expRamp = (from, to, k) => from * Math.pow(to / from, Math.min(1, Math.max(0, k)));
const tri = () => { let ph = 0; return (f) => { ph = (ph + f / SAMPLE_RATE) % 1; return 4 * Math.abs(ph - 0.5) - 1; }; };

/** playRollerDash の再現: 三角波のモーター（始まりで回り上がる）＋帯域ノイズの擦れ、保持してから抜く */
function rollerWave(dur = ROLLER_SND_DEFAULT_DURATION) {
    const n = Math.ceil(dur * SAMPLE_RATE);
    const motor = tri();
    const noise = whiteNoise(n, 7);
    const bp = biquad('bandpass', ROLLER_SND_GRIND_FREQ, ROLLER_SND_GRIND_Q);
    const relT = dur - ROLLER_SND_RELEASE;
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const f = expRamp(ROLLER_SND_FREQ_FROM, ROLLER_SND_FREQ_TO, t / ROLLER_SND_SPINUP);
        const src = motor(f) + bp(noise[i]) * ROLLER_SND_GRIND_MIX;
        const env = t < ROLLER_SND_ATTACK ? t / ROLLER_SND_ATTACK
            : t < relT ? 1
            : Math.pow(0.0001, (t - relT) / ROLLER_SND_RELEASE);
        buf[i] = src * ROLLER_SND_GAIN * env;
    }
    return buf;
}

/** playRollerStop の再現: 掃引する帯域ノイズ＋下がるサイン波、頭から指数で抜く */
function stopWave() {
    const dur = ROLLER_STOP_SND_DURATION;
    const n = Math.ceil(dur * SAMPLE_RATE);
    const noise = whiteNoise(n, 9);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, ph = 0;
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE, k = t / dur;
        const [b0, b1, b2, a1, a2] = biquadCoeffs('bandpass',
            expRamp(ROLLER_STOP_SND_FREQ_FROM, ROLLER_STOP_SND_FREQ_TO, k), ROLLER_STOP_SND_Q);
        const x = noise[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        ph = (ph + expRamp(ROLLER_STOP_SND_TONE_FROM, ROLLER_STOP_SND_TONE_TO, k) / SAMPLE_RATE) % 1;
        const src = y + Math.sin(2 * Math.PI * ph) * ROLLER_STOP_SND_TONE_MIX;
        buf[i] = src * ROLLER_STOP_SND_GAIN * Math.pow(0.0001, k);
    }
    return buf;
}

/** 比べる相手: playRivalDash（tests/rival-dash-sound.test.js の renderSweep と同じ再現の、要るところだけ） */
function dashWave() {
    const p = {
        freqFrom: RIVAL_DASH_SND_FREQ_FROM, freqTo: RIVAL_DASH_SND_FREQ_TO, riseAt: RIVAL_DASH_SND_RISE_AT,
        knee: RIVAL_DASH_SND_KNEE, duration: RIVAL_DASH_SND_DURATION,
    };
    const freqAt = (t) => {
        const riseT = p.riseAt * p.duration, kneeF = p.freqFrom * p.knee;
        return t <= riseT ? p.freqFrom * Math.pow(p.knee, t / riseT)
            : kneeF * Math.pow(p.freqTo / kneeF, (t - riseT) / (p.duration - riseT));
    };
    const n = Math.ceil(p.duration * SAMPLE_RATE);
    const phases = RIVAL_DASH_SND_DETUNE.map(() => 0);
    let sub = 0;
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE, f = freqAt(t);
        let src = 0;
        RIVAL_DASH_SND_DETUNE.forEach((c, j) => { phases[j] = (phases[j] + f * Math.pow(2, c / 1200) / SAMPLE_RATE) % 1; src += 2 * phases[j] - 1; });
        sub = (sub + f / 2 / SAMPLE_RATE) % 1;
        src += Math.sin(2 * Math.PI * sub) * RIVAL_DASH_SND_SUB_GAIN;
        const w0 = 2 * Math.PI * f * RIVAL_DASH_SND_FILTER_MULT / SAMPLE_RATE;
        const cw = Math.cos(w0), al = Math.sin(w0) / (2 * RIVAL_DASH_SND_FILTER_Q);
        const a0 = 1 + al;
        const y = ((1 - cw) / 2 / a0) * src + ((1 - cw) / a0) * st.x1 + ((1 - cw) / 2 / a0) * st.x2
            - (-2 * cw / a0) * st.y1 - ((1 - al) / a0) * st.y2;
        st.x2 = st.x1; st.x1 = src; st.y2 = st.y1; st.y1 = y;
        const holdT = RIVAL_DASH_SND_HOLD * p.duration;
        const env = t < RIVAL_DASH_SND_ATTACK ? t / RIVAL_DASH_SND_ATTACK : t < holdT ? 1
            : Math.pow(0.0001, (t - holdT) / (p.duration - holdT));
        buf[i] = y * RIVAL_DASH_SND_GAIN * env;
    }
    return buf;
}

const levelOf = (buf, seconds) => db(transientLevel((i) => buf[i] ?? 0, seconds));
const DASH_DB = levelOf(dashWave(), RIVAL_DASH_SND_DURATION);

test('滑走音は回避ダッシュ音より控えめ（滑っているあいだ鳴り続けるので）', () => {
    const diff = levelOf(rollerWave(), ROLLER_SND_DEFAULT_DURATION) - DASH_DB;
    assert.ok(diff < -1, `回避ダッシュ音に対して大きすぎる: ${diff.toFixed(1)}dB`);
    assert.ok(diff > -8, `小さすぎて埋もれる: ${diff.toFixed(1)}dB`);
});

test('急停止の音は回避ダッシュ音と同じくらい', () => {
    const diff = levelOf(stopWave(), ROLLER_STOP_SND_DURATION) - DASH_DB;
    assert.ok(diff > -3 && diff < 2, `回避ダッシュ音との差 ${diff.toFixed(1)}dB`);
});

test('どちらも歪まない', () => {
    for (const [name, w] of [['滑走', rollerWave()], ['急停止', stopWave()]]) {
        let peak = 0;
        for (const v of w) peak = Math.max(peak, Math.abs(v));
        assert.ok(peak < 0.9, `${name}の振幅が大きい: ${peak.toFixed(3)}`);
    }
});

// --- 鳴らす場所（rollerDash.js）---

function spy(names, fn) {
    const saved = {}, calls = Object.fromEntries(names.map((n) => [n, []]));
    for (const n of names) { saved[n] = audioManager[n]; audioManager[n] = (...a) => calls[n].push(a); }
    try { fn(); } finally { for (const n of names) audioManager[n] = saved[n]; }
    return calls;
}
function world(rows = flatFloorRows(), x = 200) {
    const game = makeGame(makeMap(rows));
    const e = makeAttacker(game, x, 20 * T - 24, 'rival');
    e.onGround = true; e.onTerrain = true; e.aiState = 'chase';
    game.player = { x: x + 40, y: 20 * T - 24, width: 16, height: 24, alive: true, docked: false };
    return { game, e };
}
function withRandom(v, fn) { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } }

test('始めた瞬間に滑走音が1回、自分の位置で、滑走の長さぶん鳴る', () => {
    const { e } = world();
    const calls = spy(['playRollerDash'], () => withRandom(0, () => {
        e._tryStartRollerDash(40);
        while (e.isRollerDashing()) e._updateRollerDash();
    }));
    assert.equal(calls.playRollerDash.length, 1);
    const [x, y, dur] = calls.playRollerDash[0];
    assert.ok(Math.abs(x - 208) < 1 && Math.abs(y - (20 * T - 12)) < 1, `位置 ${x},${y}`);
    // game.gameSpeed が無い（テストの game）ときは 1 倍＝60フレーム/秒
    const frames = ROLLER_ACCEL_FRAMES + ROLLER_GLIDE_FRAMES_MIN + ROLLER_STOP_FRAMES;
    assert.ok(Math.abs(dur - frames / 60) < 1e-9, `長さ ${dur}`);
});

test('ゲーム速度が遅いと、滑走音もそのぶん長く鳴る（物理は 60×gameSpeed フレーム/秒）', () => {
    const { game, e } = world();
    game.gameSpeed = 0.8;
    const calls = spy(['playRollerDash'], () => withRandom(0, () => e._tryStartRollerDash(40)));
    const frames = ROLLER_ACCEL_FRAMES + ROLLER_GLIDE_FRAMES_MIN + ROLLER_STOP_FRAMES;
    assert.ok(Math.abs(calls.playRollerDash[0][2] - frames / 48) < 1e-9);
});

test('滑り切ると急停止の音が1回鳴る', () => {
    const { e } = world();
    const calls = spy(['playRollerStop'], () => withRandom(0, () => {
        e._tryStartRollerDash(40);
        while (e.isRollerDashing()) e._updateRollerDash();
    }));
    assert.equal(calls.playRollerStop.length, 1);
});

test('壁・落下・反動で終わったときは急停止の音が鳴らない', () => {
    // 落下
    const { e } = world();
    const fall = spy(['playRollerStop'], () => withRandom(0, () => {
        e._tryStartRollerDash(40);
        for (let i = 0; i < 5; i++) e._updateRollerDash();
        e.onGround = false;
        e._updateRollerDash();
    }));
    assert.equal(fall.playRollerStop.length, 0, '落下');
    // 壁
    const rows = flatFloorRows().map((s, r) => (r < 20 ? s.slice(0, 8) + '#' + s.slice(9) : s));
    const { e: w } = world(rows, 170);
    const wall = spy(['playRollerStop'], () => withRandom(0, () => {
        w._tryStartRollerDash(40);
        for (let i = 0; i < 200 && w.isRollerDashing(); i++) w.update();
    }));
    assert.equal(wall.playRollerStop.length, 0, '壁');
    // 反動
    const { e: r } = world();
    const recoil = spy(['playRollerStop'], () => withRandom(0, () => {
        r._tryStartRollerDash(40);
        r.recoilTimer = 5;
        r.update();
    }));
    assert.equal(recoil.playRollerStop.length, 0, '反動');
});
