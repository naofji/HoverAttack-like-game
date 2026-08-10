import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { biquad, whiteNoise, aWeightedRms, aWeight, db } from './helpers/dsp.js';
import {
  PLAYER_HOVER_MAX_FREQ,
  ENEMY_HOVER_NOISE_FREQ, ENEMY_HOVER_NOISE_Q,
  ENEMY_HOVER_WOBBLE_HZ, ENEMY_HOVER_WOBBLE_DEPTH,
  ENEMY_HOVER_BODY_FREQ, ENEMY_HOVER_BODY_GAIN,
  ENEMY_HOVER_MAX_GAIN, ENEMY_HOVER_MAKEUP,
} from '../src/js/utils/Constants.js';

/** 自機のホバー音のノイズ共鳴のピーク（playHover が freq*2 を使う）。 */
const PLAYER_PEAK = PLAYER_HOVER_MAX_FREQ * 2;

/** AudioParam もどき。値と、そこへ繋がってきたノードを覚える。 */
function param(value = 0) {
  return {
    value, inputs: [],
    setValueAtTime(v) { this.value = v; },
    setTargetAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
  };
}

/** ノードのグラフを記録する AudioContext もどき。 */
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: { name: 'destination', inputs: [] },
    created: [],
    _node(name, extra = {}) {
      const n = {
        name, inputs: [], outputs: [],
        connect(dst) { this.outputs.push(dst); (dst.inputs || []).push(this); },
        disconnect() {},
        ...extra,
      };
      ctx.created.push(n);
      return n;
    },
    createGain() { return ctx._node('gain', { gain: param(1) }); },
    createBufferSource() {
      return ctx._node('bufferSource', { buffer: null, loop: false, start() {}, stop() {} });
    },
    createOscillator() {
      return ctx._node('oscillator', { type: '', frequency: param(0), start() {}, stop() {} });
    },
    createBiquadFilter() {
      return ctx._node('filter', { type: '', frequency: param(0), Q: param(1) });
    },
    createStereoPanner() { return ctx._node('panner', { pan: param(0) }); },
    createDynamicsCompressor() {
      return ctx._node('compressor', {
        threshold: param(0), knee: param(0), ratio: param(1),
        attack: param(0), release: param(0),
      });
    },
  };
  return ctx;
}

/** 敵のホバー音を1度鳴らして、作られたノードを返す。 */
function buildEnemyHover(volume = 1) {
  const ctx = fakeCtx();
  const saved = {
    ctx: audioManager.ctx, bus: audioManager.seBus, buf: audioManager.noiseBuffer,
    noise: audioManager.enemyHoverNoise, lfo: audioManager.enemyHoverLfo,
    gain: audioManager.enemyHoverGain, panner: audioManager.enemyHoverPanner,
  };
  audioManager.ctx = ctx;
  audioManager.seBus = null;
  audioManager.noiseBuffer = { fake: true };
  audioManager.enemyHoverNoise = null;
  audioManager.enemyHoverLfo = null;
  audioManager.enemyHoverGain = null;
  audioManager.enemyHoverPanner = null;
  audioManager._createSeBus();
  try {
    audioManager.setEnemyHover(volume, 0);
    return {
      ctx,
      nodes: ctx.created,
      of: (name) => ctx.created.filter((n) => n.name === name),
      noise: audioManager.enemyHoverNoise,
      lfo: audioManager.enemyHoverLfo,
      gain: audioManager.enemyHoverGain,
    };
  } finally {
    Object.assign(audioManager, {
      ctx: saved.ctx, seBus: saved.bus, noiseBuffer: saved.buf,
      enemyHoverNoise: saved.noise, enemyHoverLfo: saved.lfo,
      enemyHoverGain: saved.gain, enemyHoverPanner: saved.panner,
    });
  }
}

// --- 自機と同じ「ノイズ主体」であること -----------------------------------------

test('敵のホバー音はノイズを共鳴させて作る（音程のある発振ではない）', () => {
  const b = buildEnemyHover();
  assert.equal(b.of('bufferSource').length, 1, 'ノイズ源が無い');
  assert.equal(b.noise.buffer, audioManager.noiseBuffer || b.noise.buffer, 'ノイズを読んでいない');
  assert.equal(b.noise.loop, true, '持続音なのにループしていない');

  const bandpass = b.of('filter').filter((f) => f.type === 'bandpass');
  assert.equal(bandpass.length, 1, 'バンドパスで共鳴させていない');
});

test('音程を作るノコギリ波は残っていない（以前の低い唸りの正体）', () => {
  const b = buildEnemyHover();
  const tonal = b.of('oscillator').filter((o) => o.type !== 'sine');
  assert.deepEqual(tonal, [], `音程のある発振が残っている: ${tonal.map((o) => o.type)}`);
});

// --- 自機とは別物であること -----------------------------------------------------

test('自機より低い帯域で鳴る', () => {
  assert.ok(ENEMY_HOVER_NOISE_FREQ < PLAYER_PEAK,
    `自機(${PLAYER_PEAK}Hz)より低くない: ${ENEMY_HOVER_NOISE_FREQ}Hz`);
  // ただし「高音系のノイズ」と呼べる範囲には居る（低い唸りに戻さない）
  assert.ok(ENEMY_HOVER_NOISE_FREQ >= 500,
    `高音系と言える高さではない: ${ENEMY_HOVER_NOISE_FREQ}Hz`);
  // 差が小さいと同じ音に聞こえる。半オクターブ以上は離す
  const ratio = PLAYER_PEAK / ENEMY_HOVER_NOISE_FREQ;
  assert.ok(ratio >= 1.4, `自機と近すぎて区別できない: ${ratio.toFixed(2)}倍`);

  const b = buildEnemyHover();
  const bp = b.of('filter').find((f) => f.type === 'bandpass');
  assert.equal(bp.frequency.value, ENEMY_HOVER_NOISE_FREQ);
  assert.equal(bp.Q.value, ENEMY_HOVER_NOISE_Q);
});

test('自機より緩い共鳴にする（細く鋭い音は自機のもの）', () => {
  const PLAYER_Q = 5;   // playHover の hoverNoiseFilter
  assert.ok(ENEMY_HOVER_NOISE_Q < PLAYER_Q,
    `自機と同じかそれ以上に鋭い: ${ENEMY_HOVER_NOISE_Q}`);
});

test('中心周波数がゆっくり揺れる（自機の音は揺れない）', () => {
  const b = buildEnemyHover();
  const lfo = b.lfo;
  assert.ok(lfo, '揺らぎの発振が無い');
  assert.equal(lfo.type, 'sine');
  assert.equal(lfo.frequency.value, ENEMY_HOVER_WOBBLE_HZ);

  // 揺らぎは音として聞こえてはいけない（可聴帯域に入ると別の音になる）
  assert.ok(ENEMY_HOVER_WOBBLE_HZ < 20, `揺れが速すぎて音になる: ${ENEMY_HOVER_WOBBLE_HZ}Hz`);
  assert.ok(ENEMY_HOVER_WOBBLE_HZ > 1, `揺れが遅すぎて気づけない: ${ENEMY_HOVER_WOBBLE_HZ}Hz`);

  // 深さのゲインを経てバンドパスの frequency に繋がっていること
  const depth = lfo.outputs[0];
  assert.equal(depth.name, 'gain');
  assert.equal(depth.gain.value, ENEMY_HOVER_WOBBLE_DEPTH);
  const bp = b.of('filter').find((f) => f.type === 'bandpass');
  assert.ok(depth.outputs.includes(bp.frequency),
    '揺らぎがバンドパスの中心周波数に繋がっていない');
});

test('揺れても自機の帯域までは上がらない', () => {
  const top = ENEMY_HOVER_NOISE_FREQ + ENEMY_HOVER_WOBBLE_DEPTH;
  assert.ok(top < PLAYER_PEAK, `揺れの頂点(${top}Hz)が自機(${PLAYER_PEAK}Hz)に届く`);
});

// --- 機体の重さ ---------------------------------------------------------------

test('低い成分を薄く足して軽くなりすぎないようにする', () => {
  const b = buildEnemyHover();
  const lp = b.of('filter').find((f) => f.type === 'lowpass');
  assert.ok(lp, '低域の層が無い');
  assert.equal(lp.frequency.value, ENEMY_HOVER_BODY_FREQ);
  // あくまで脇役。主役のノイズより小さいこと
  assert.ok(ENEMY_HOVER_BODY_GAIN < 1,
    `低域が主役になっている: ${ENEMY_HOVER_BODY_GAIN}`);
});

test('高域と低域は同じノイズ源を分岐して使う（音源を二重に持たない）', () => {
  const b = buildEnemyHover();
  assert.equal(b.of('bufferSource').length, 1);
  const targets = b.noise.outputs.map((n) => n.type);
  assert.ok(targets.includes('bandpass') && targets.includes('lowpass'),
    `分岐していない: ${targets.join(',')}`);
});

// --- 既存の振る舞いを壊していないこと -------------------------------------------

test('音量とパンは従来どおり効く', () => {
  const b = buildEnemyHover(0.5);
  assert.equal(b.gain.gain.value, 0.5 * ENEMY_HOVER_MAX_GAIN * ENEMY_HOVER_MAKEUP);
  assert.equal(b.of('panner').length, 1, 'パンナーが無い');
});

test('音量0で止める', () => {
  const b = buildEnemyHover(0);
  assert.equal(b.of('bufferSource').length, 0, '無音なのに鳴らしている');
});

// --- 聞こえる大きさ -------------------------------------------------------------
//
// 音作りを変えたときに音量の再調整を忘れると、テストは全部通るのに音が
// 聞こえなくなる。実際にやらかしたので、聴感レベルそのものを固定する。

/** 敵のホバー音を実際に合成して、A特性の実効値を返す。 */
function enemyHoverLevel() {
  const noise = whiteNoise(1 << 15);
  const air = biquad('bandpass', ENEMY_HOVER_NOISE_FREQ, ENEMY_HOVER_NOISE_Q);
  const body = biquad('lowpass', ENEMY_HOVER_BODY_FREQ, 1);
  const level = aWeightedRms((i) => air(noise[i]) + body(noise[i]) * ENEMY_HOVER_BODY_GAIN);
  return level * ENEMY_HOVER_MAX_GAIN * ENEMY_HOVER_MAKEUP;
}

/** 自機のホバー音（最大RPM時）の A特性の実効値。比較の基準にする。 */
function playerHoverLevel() {
  const noise = whiteNoise(1 << 15);
  const bp = biquad('bandpass', PLAYER_HOVER_MAX_FREQ * 2, 5);
  return aWeightedRms((i) => bp(noise[i]) * 1.2) * 0.1;   // noiseGain 1.2 → hoverGain 0.1
}

test('画面内の敵のホバー音は自機のホバー音と同じくらいの大きさで聞こえる', () => {
  const enemy = enemyHoverLevel();
  const player = playerHoverLevel();
  const diff = db(enemy / player);
  assert.ok(diff > -6,
    `敵のホバー音が小さすぎて聞き取れない: 自機比 ${diff.toFixed(1)}dB`);
  assert.ok(diff < 6,
    `敵のホバー音が大きすぎて自機の音を覆う: 自機比 ${diff.toFixed(1)}dB`);
});

test('単純な実効値ではなく聴感で測っている', () => {
  // 62Hz と 760Hz では A特性の重みが 25dB 以上違う。ここを取り違えると
  // 「実効値は同じなのに全く聞こえない」音を作ってしまう。
  assert.ok(db(aWeight(760) / aWeight(62)) > 20,
    '低音と高音の聴感差を測れていない');
});

test('補正倍率を外すと聞こえなくなる（この補正が効いていることの確認）', () => {
  const withMakeup = enemyHoverLevel();
  const withoutMakeup = withMakeup / ENEMY_HOVER_MAKEUP;
  const loss = db(withoutMakeup / playerHoverLevel());
  assert.ok(loss < -6,
    `補正なしでも十分な音量になっており、補正の意味が説明できない: ${loss.toFixed(1)}dB`);
});
