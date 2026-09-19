// ライバルのダッシュ音「ヴーン」の音量と形
//
// 音作りを変えたら A特性で実測する、というこのリポジトリの約束にしたがって、
// **兄弟の音（ドローンの移動音）との相対 dB** で縛る。絶対値で縛ると、
// 出力段やマスターの取り回しを変えたときに意味を失う。
//
// 波形は playRivalDash / playDroneMove の WebAudio グラフをオフラインで
// 再現したもの。両方を同じ renderSweep に通しているので、比較が公平になる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transientLevel, db, SAMPLE_RATE } from './helpers/dsp.js';
import {
    RIVAL_DASH_SND_FREQ_FROM, RIVAL_DASH_SND_FREQ_TO, RIVAL_DASH_SND_DURATION,
    RIVAL_DASH_SND_FILTER_Q, RIVAL_DASH_SND_FILTER_MULT, RIVAL_DASH_SND_DETUNE,
    RIVAL_DASH_SND_GAIN, RIVAL_DASH_SND_SUB_GAIN, RIVAL_DASH_SND_ATTACK,
    RIVAL_DASH_SND_RISE_AT, RIVAL_DASH_SND_KNEE, RIVAL_DASH_SND_HOLD,
    DRONE_MOVE_FREQ_FROM, DRONE_MOVE_FREQ_TO, DRONE_MOVE_DURATION,
    DRONE_MOVE_FILTER_Q, DRONE_MOVE_FILTER_MULT, DRONE_MOVE_FILTER_END_MULT,
    DRONE_MOVE_DETUNE, DRONE_MOVE_GAIN, DRONE_MOVE_SUB_GAIN,
    RIVAL_DASH_FRAMES,
} from '../src/js/utils/Constants.js';

/** そのサンプル時刻の基音。riseAt があれば2段、無ければ一様に掃く。 */
function freqAt(p, t) {
    if (p.riseAt === undefined) {
        return p.freqFrom * Math.pow(p.freqTo / p.freqFrom, t / p.duration);
    }
    const riseT = p.riseAt * p.duration;
    const kneeF = p.freqFrom * p.knee;
    return t <= riseT
        ? p.freqFrom * Math.pow(p.knee, t / riseT)
        : kneeF * Math.pow(p.freqTo / kneeF, (t - riseT) / (p.duration - riseT));
}

/**
 * 「detune した鋸波＋1オクターブ下のサイン波を、共鳴ローパスで掃く」音を
 * オフラインで再現する。playRivalDash と playDroneMove はどちらもこの形。
 *
 * 音程の上がり方と包絡は2通りある:
 *   - riseAt を渡すと「前半はほぼ平ら → 後半で一気に」の2段（ダッシュ音）
 *   - 渡さなければ全体を等しく掃く（ドローンの移動音）
 *   - hold を渡すとそこまで音量を保ってから落とす（渡さなければ attack から減衰）
 * **playRivalDash を変えたらここも合わせること**（片方だけ変えると、測っている
 * 波形が実装と違うものになる）。
 */
function renderSweep(p, n = 1 << 17) {
    const phases = p.detune.map(() => 0);
    let subPhase = 0;
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const buf = new Float64Array(n);

    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        if (t > p.duration) break;
        const k = t / p.duration;

        const f = freqAt(p, t);
        let src = 0;
        p.detune.forEach((cents, j) => {
            phases[j] = (phases[j] + f * Math.pow(2, cents / 1200) / SAMPLE_RATE) % 1;
            src += 2 * phases[j] - 1;
        });
        subPhase = (subPhase + (f / 2) / SAMPLE_RATE) % 1;
        src += Math.sin(2 * Math.PI * subPhase) * p.subGain;

        const cf = p.riseAt === undefined
            ? p.filterFrom * Math.pow(p.filterTo / p.filterFrom, k)
            : freqAt(p, t) * p.filterMult;
        const w0 = 2 * Math.PI * cf / SAMPLE_RATE;
        const cw = Math.cos(w0), al = Math.sin(w0) / (2 * p.q);
        const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        const y = (b0 / a0) * src + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
                - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
        st.x2 = st.x1; st.x1 = src; st.y2 = st.y1; st.y1 = y;

        const holdT = (p.hold ?? 0) * p.duration;
        const decayFrom = Math.max(holdT, p.attack);
        const env = t < p.attack ? t / p.attack
            : t < holdT ? 1
            : Math.pow(0.0001, (t - decayFrom) / (p.duration - decayFrom));
        buf[i] = y * p.gain * env;
    }
    return buf;
}

const dashWave = () => renderSweep({
    freqFrom: RIVAL_DASH_SND_FREQ_FROM, freqTo: RIVAL_DASH_SND_FREQ_TO,
    riseAt: RIVAL_DASH_SND_RISE_AT, knee: RIVAL_DASH_SND_KNEE,
    filterMult: RIVAL_DASH_SND_FILTER_MULT,
    q: RIVAL_DASH_SND_FILTER_Q, detune: RIVAL_DASH_SND_DETUNE,
    gain: RIVAL_DASH_SND_GAIN, subGain: RIVAL_DASH_SND_SUB_GAIN,
    duration: RIVAL_DASH_SND_DURATION, attack: RIVAL_DASH_SND_ATTACK,
    hold: RIVAL_DASH_SND_HOLD,
});

/** 比較の相手。こちらは既に実機で音量が決まっている音 */
const droneWave = () => renderSweep({
    freqFrom: DRONE_MOVE_FREQ_FROM, freqTo: DRONE_MOVE_FREQ_TO,
    filterFrom: DRONE_MOVE_FREQ_FROM * DRONE_MOVE_FILTER_MULT,
    filterTo: DRONE_MOVE_FREQ_TO * DRONE_MOVE_FILTER_END_MULT,
    q: DRONE_MOVE_FILTER_Q, detune: DRONE_MOVE_DETUNE,
    gain: DRONE_MOVE_GAIN, subGain: DRONE_MOVE_SUB_GAIN,
    duration: DRONE_MOVE_DURATION, attack: 0.03,
});

// 長さの違う音どうしを比べるので transientLevel（その音の長さに合わせた矩形窓）。
// 固定長の窓で測ると、短いダッシュ音だけが不当に小さく出て
// 「-24.7dB も足りない」という誤った結論になる（実際に一度そうなった）
const levelOf = (buf, seconds) => db(transientLevel((i) => buf[i], seconds));

test('ドローンの移動音と同じ土俵の音量で鳴る（埋もれず、うるさくもない）', () => {
    const diff = levelOf(dashWave(), RIVAL_DASH_SND_DURATION)
        - levelOf(droneWave(), DRONE_MOVE_DURATION);
    // 狙いは「ドローンより気持ち控えめ」。ダッシュは回避のたびに鳴るので、
    // 同じ音量だと連発したときに耳につく
    assert.ok(diff < 0, `ドローンの移動音より大きい: ${diff.toFixed(1)}dB`);
    assert.ok(diff > -6, `小さすぎて他の音に埋もれる: ${diff.toFixed(1)}dB`);
});

test('歪まない（2声＋サブを重ねても振り切れない）', () => {
    let peak = 0;
    for (const v of dashWave()) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak < 0.9, `振幅が大きく歪む: ${peak.toFixed(3)}`);
    assert.ok(peak > 0.05, `振幅が小さすぎて聞こえない: ${peak.toFixed(3)}`);
});

test('低い方から高い方へ上がる（「ヴーン」であって「ポーーン」ではない）', () => {
    assert.ok(RIVAL_DASH_SND_FREQ_TO > RIVAL_DASH_SND_FREQ_FROM, '上昇していない');
    const octaves = Math.log2(RIVAL_DASH_SND_FREQ_TO / RIVAL_DASH_SND_FREQ_FROM);
    assert.ok(octaves >= 1.0, `上昇の幅が狭く動きが聞こえない: ${octaves.toFixed(2)}オクターブ`);
    assert.ok(octaves <= 2.0, `上げすぎて悲鳴のように聞こえる: ${octaves.toFixed(2)}オクターブ`);

    // 実際の波形でも上がっている（定数だけ見ても、実装が使っているとは限らない）
    const buf = dashWave();
    const span = Math.floor(RIVAL_DASH_SND_DURATION * SAMPLE_RATE);
    const crossings = (from, to) => {
        let c = 0;
        for (let i = from + 1; i < to; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) c++;
        return c;
    };
    assert.ok(crossings(span / 2, span) > crossings(0, span / 2) * 1.2,
        '後半が高くなっていない');
});

// ここから2つは、実機で「他の音に混ざって判別しづらい」と出たときに足した。
// 原因は音程ではなく包絡で、減衰が先頭から効いていたため、音程が上がる頃には
// ほぼ消えていた。「上がっている」ことが**聞こえる**ことまで縛る。

/** 最後の30%と最初の30%のゼロ交差の比。音程がどれだけ上がって終わるか。 */
function lateRiseRatio(buf, duration) {
    const span = Math.floor(duration * SAMPLE_RATE);
    const crossings = (from, to) => {
        let c = 0;
        for (let i = from + 1; i < to; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) c++;
        return c;
    };
    return crossings(Math.floor(span * 0.7), span) / crossings(0, Math.floor(span * 0.3));
}

/** 最後の30%の RMS / 全体の RMS。後半がまだ鳴っているか。 */
function tailShare(buf, duration) {
    const span = Math.floor(duration * SAMPLE_RATE);
    const rms = (from, to) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += buf[i] * buf[i];
        return Math.sqrt(sum / (to - from));
    };
    return rms(Math.floor(span * 0.7), span) / rms(0, span);
}

test('上昇は後半に寄っている（終わり際にはっきり上がって終わる）', () => {
    const ratio = lateRiseRatio(dashWave(), RIVAL_DASH_SND_DURATION);
    // 実測 2.54。一様に掃いていた頃は 1.96 で、上がりきる前に音が終わっていた
    assert.ok(ratio > 2.2, `終わり際の上昇が足りない: ${ratio.toFixed(2)}倍`);
});

test('上昇している区間がまだ鳴っている（包絡で消してしまっていない）', () => {
    const share = tailShare(dashWave(), RIVAL_DASH_SND_DURATION);
    // 実測 0.80。先頭から減衰させていた頃は 0.52 で、上昇が聞こえなかった
    assert.ok(share > 0.65,
        `後半が小さすぎて、上がっていることが聞こえない: 全体比 ${share.toFixed(2)}`);
});

test('ダッシュ本体より長く、次のダッシュには被らない長さ', () => {
    const dashSeconds = RIVAL_DASH_FRAMES / 60;
    assert.ok(RIVAL_DASH_SND_DURATION > dashSeconds,
        `加速が終わる前に音が切れる: 音 ${RIVAL_DASH_SND_DURATION}秒 / 加速 ${dashSeconds.toFixed(2)}秒`);
    assert.ok(RIVAL_DASH_SND_DURATION < 0.8, `長すぎて次の動きに被る: ${RIVAL_DASH_SND_DURATION}秒`);
});

test('立ち上がりはクリックノイズにならない程度にはある', () => {
    assert.ok(RIVAL_DASH_SND_ATTACK >= 0.005, `急峻すぎてプチッと鳴る: ${RIVAL_DASH_SND_ATTACK}秒`);
    // かといって鈍いと「ヴ」の子音が消えて加速に聞こえない
    assert.ok(RIVAL_DASH_SND_ATTACK <= 0.05, `鈍すぎて加速感が出ない: ${RIVAL_DASH_SND_ATTACK}秒`);
});

test('ローパスは基音より上に居る（籠もらない）', () => {
    assert.ok(RIVAL_DASH_SND_FILTER_MULT > 1, `基音より下まで閉じており籠もる: ${RIVAL_DASH_SND_FILTER_MULT}`);
    assert.ok(RIVAL_DASH_SND_FILTER_MULT < 4, `開きすぎて芯が無くなる: ${RIVAL_DASH_SND_FILTER_MULT}`);
});

// --- 配線（ダッシュの瞬間に鳴っているか）-------------------------------------
// 音そのものの形は上で測った。ここは「回避の立ち上がりで1回だけ、自分の位置で
// 鳴らしているか」だけを見る。

import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { RIVAL_ALIGN_TRIGGER_FRAMES } from '../src/js/utils/Constants.js';

// 軸が合っている＝自機が自分とほぼ同じ X に居る状態。
// 離れた targetX を渡すと alignXFrames がその場で 0 に戻り、回避が始まらない。
const alignedX = (e) => e.x + e.width / 2;

function spawnRival() {
    const game = makeGame(makeMap(flatFloorRows()));
    return makeAttacker(game, 200, 100, 'rival');
}

function startEvade(e) {
    e.alignXFrames = RIVAL_ALIGN_TRIGGER_FRAMES + 1;
    e.alignYFrames = 0;
    e.evadeTimer = 0;
    return e._updateAlignmentAvoidance(0, 0, alignedX(e));
}

function stepEvade(e) {
    e._updateAlignmentAvoidance(0, 0, alignedX(e));
}

/** playRivalDash の呼び出しを数える。 */
function countDashSounds(fn) {
    const saved = audioManager.playRivalDash;
    let count = 0;
    audioManager.playRivalDash = () => { count++; };
    try { fn(); } finally { audioManager.playRivalDash = saved; }
    return count;
}

test('ダッシュの瞬間に音が1回だけ鳴る', () => {
    const e = spawnRival();
    const count = countDashSounds(() => {
        startEvade(e);
        for (let i = 0; i < RIVAL_DASH_FRAMES + 5; i++) stepEvade(e);
    });
    assert.equal(count, 1, `1回の回避で ${count} 回鳴った`);
});

test('ダッシュ音は自分の位置で鳴る（距離減衰と左右の振り分けが効く）', () => {
    const e = spawnRival();
    const saved = audioManager.playRivalDash;
    let args = null;
    audioManager.playRivalDash = (...a) => { args = a; };
    try { startEvade(e); } finally { audioManager.playRivalDash = saved; }

    assert.ok(args, '音が鳴っていない');
    assert.ok(Math.abs(args[0] - (e.x + e.width / 2)) < 1, `X がずれている: ${args[0]}`);
    assert.ok(Math.abs(args[1] - (e.y + e.height / 2)) < 1, `Y がずれている: ${args[1]}`);
});
