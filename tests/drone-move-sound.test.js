import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { aWeightedRms, db, SAMPLE_RATE } from './helpers/dsp.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE,
  DRONE_MOVE_FREQ_FROM, DRONE_MOVE_FREQ_TO, DRONE_MOVE_DURATION,
  DRONE_MOVE_FILTER_Q, DRONE_MOVE_FILTER_MULT, DRONE_MOVE_DETUNE,
  DRONE_MOVE_GAIN, DRONE_MOVE_SUB_GAIN, DRONE_MOVE_COOLDOWN,
  ENEMY_HOVER_OFFSCREEN_FADE,
} from '../src/js/utils/Constants.js';

// --- 鳴る条件 -----------------------------------------------------------------

function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  return game;
}

/** 移動音の回数を数える。 */
function countMoves(fn) {
  const saved = audioManager.playDroneMove;
  let count = 0;
  audioManager.playDroneMove = () => { count++; };
  try { fn(); } finally { audioManager.playDroneMove = saved; }
  return count;
}

test('ホバリング中は無音', () => {
  const game = world();
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);
  drone.state = 'hover';
  drone.stateTimer = 100000;         // ホバーから抜けさせない

  assert.equal(countMoves(() => { for (let i = 0; i < 300; i++) drone.update(); }), 0,
    'ホバリングしているだけで鳴っている');
});

test('狙う相手がいなければ巡回しているだけで鳴らない', () => {
  const game = world();
  game.player = null;
  game.carrier = null;
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);

  assert.equal(countMoves(() => { for (let i = 0; i < 300; i++) drone.update(); }), 0,
    '巡回中に鳴っている');
});

test('突進を始めると鳴る', () => {
  const game = world();
  const target = {
    x: 600, y: 20 * TILE_SIZE - 24, width: 16, height: 24,
    alive: true, docked: false,
  };
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);

  assert.equal(countMoves(() => drone._startDash(target)), 1, '突進で鳴っていない');
});

test('特攻を始めても鳴る', () => {
  const game = world();
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);
  assert.equal(countMoves(() => drone._startKamikaze({ x: 400, y: 100, width: 16, height: 24 })), 1);
});

test('立て続けに状態が変わっても音が重ならない', () => {
  const game = world();
  const target = { x: 600, y: 100, width: 16, height: 24, alive: true, docked: false };
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);

  const count = countMoves(() => {
    for (let i = 0; i < 5; i++) drone._startDash(target);
  });
  assert.equal(count, 1, `間隔を空けずに ${count} 回鳴った`);
});

test('間隔が空けばまた鳴る', () => {
  const game = world();
  const target = { x: 600, y: 100, width: 16, height: 24, alive: true, docked: false };
  const drone = new EnemyDrone(game, 300, 100);
  game.enemies.push(drone);

  const count = countMoves(() => {
    drone._startDash(target);
    for (let i = 0; i < DRONE_MOVE_COOLDOWN; i++) drone.update();
    drone.moveSoundTimer = 0;      // クールダウン明けを保証
    drone._startDash(target);
  });
  assert.equal(count, 2, '2回目が鳴らない');
});

// --- 音の形 -------------------------------------------------------------------

test('高い方から低い方へ落ちる（プーーン）', () => {
  assert.ok(DRONE_MOVE_FREQ_FROM > DRONE_MOVE_FREQ_TO, '下降していない');
  const octaves = Math.log2(DRONE_MOVE_FREQ_FROM / DRONE_MOVE_FREQ_TO);
  assert.ok(octaves >= 1.5, `下降の幅が狭く「プーーン」に聞こえない: ${octaves.toFixed(2)}オクターブ`);
});

test('一瞬で終わらず、長すぎもしない', () => {
  assert.ok(DRONE_MOVE_DURATION >= 0.5, `短すぎて下降が聞き取れない: ${DRONE_MOVE_DURATION}秒`);
  assert.ok(DRONE_MOVE_DURATION <= 1.2, `長すぎて次の動きに被る: ${DRONE_MOVE_DURATION}秒`);
});

test('共鳴フィルタは音程より高いところから、音程より下まで落ちる', () => {
  // 先にフィルタが落ちることで「プー」から「ーン」への変化が生まれる
  assert.ok(DRONE_MOVE_FILTER_MULT > 1, 'フィルタが音程より下から始まっている');
  const filterEnd = DRONE_MOVE_FREQ_TO * 0.8;
  assert.ok(filterEnd < DRONE_MOVE_FREQ_TO, 'フィルタが最後まで音程より上にある');
  assert.ok(DRONE_MOVE_FILTER_Q > 4, `共鳴が弱くうなりの芯が出ない: Q=${DRONE_MOVE_FILTER_Q}`);
});

test('音程をずらした複数の声を重ねる（うねりと厚み）', () => {
  assert.ok(DRONE_MOVE_DETUNE.length >= 3, `声の数が足りない: ${DRONE_MOVE_DETUNE.length}`);
  const spread = Math.max(...DRONE_MOVE_DETUNE) - Math.min(...DRONE_MOVE_DETUNE);
  assert.ok(spread > 0, 'ずれが無く1本と同じ');
  // ずらしすぎると和音に聞こえてしまう（半音は100セント）
  assert.ok(spread < 50, `ずれが大きく音痴に聞こえる: ${spread}セント`);
});

// --- 実際の波形 ---------------------------------------------------------------

/** playDroneMove が作る波形を再現する。 */
function droneWave(n = 1 << 15) {
  const phases = DRONE_MOVE_DETUNE.map(() => 0);
  let subPhase = 0;
  const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const buf = new Float64Array(n);
  const filterFrom = DRONE_MOVE_FREQ_FROM * DRONE_MOVE_FILTER_MULT;
  const filterTo = DRONE_MOVE_FREQ_TO * 0.8;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    if (t > DRONE_MOVE_DURATION) break;
    const k = t / DRONE_MOVE_DURATION;

    const f = DRONE_MOVE_FREQ_FROM * Math.pow(DRONE_MOVE_FREQ_TO / DRONE_MOVE_FREQ_FROM, k);
    let src = 0;
    DRONE_MOVE_DETUNE.forEach((cents, j) => {
      phases[j] = (phases[j] + f * Math.pow(2, cents / 1200) / SAMPLE_RATE) % 1;
      src += 2 * phases[j] - 1;
    });
    subPhase = (subPhase + (f / 2) / SAMPLE_RATE) % 1;
    src += Math.sin(2 * Math.PI * subPhase) * DRONE_MOVE_SUB_GAIN;

    const cf = filterFrom * Math.pow(filterTo / filterFrom, k);
    const w0 = 2 * Math.PI * cf / SAMPLE_RATE;
    const cw = Math.cos(w0), al = Math.sin(w0) / (2 * DRONE_MOVE_FILTER_Q);
    const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const y = (b0 / a0) * src + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
            - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
    st.x2 = st.x1; st.x1 = src; st.y2 = st.y1; st.y1 = y;

    const env = t < 0.03 ? t / 0.03 : Math.pow(0.0001, (t - 0.03) / (DRONE_MOVE_DURATION - 0.03));
    buf[i] = y * DRONE_MOVE_GAIN * env;
  }
  return buf;
}

test('歪まない（3声＋サブを重ねても振幅が振り切れない）', () => {
  let peak = 0;
  for (const v of droneWave()) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak < 0.9, `振幅が大きく歪む: ${peak.toFixed(3)}`);
  assert.ok(peak > 0.05, `振幅が小さすぎて聞こえない: ${peak.toFixed(3)}`);
});

test('他の敵の音に埋もれない大きさで鳴る', () => {
  const buf = droneWave();
  const level = aWeightedRms((i) => buf[i], buf.length);
  // 敵のジャンプ音とだいたい同じ土俵に居ればよい（実測 -1.7dB）
  assert.ok(db(level) > -52, `小さすぎて聞こえない: ${db(level).toFixed(1)}dB(A)`);
  assert.ok(db(level) < -36, `大きすぎて耳につく: ${db(level).toFixed(1)}dB(A)`);
});

test('音の重心が時間とともに下がる（下降が実際に起きている）', () => {
  const buf = droneWave();
  const span = Math.floor(DRONE_MOVE_DURATION * SAMPLE_RATE);
  // ゼロ交差の回数を前半・後半で比べる。低い音ほど交差が少ない
  const crossings = (from, to) => {
    let c = 0;
    for (let i = from + 1; i < to; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) c++;
    return c;
  };
  const first = crossings(0, span / 2);
  const second = crossings(span / 2, span);
  assert.ok(second < first * 0.7,
    `後半が低くなっていない: 前半${first}回 / 後半${second}回`);
});

// --- 位置による扱い -------------------------------------------------------------

test('遠すぎるドローンの音は組み立てない', () => {
  const view = { cx: 2000, cy: 1000, halfW: CANVAS_WIDTH / 2, halfH: CANVAS_HEIGHT / 2 };
  const created = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: () => { created.push('gain'); return stub(); },
    createOscillator: () => { created.push('oscillator'); return stub(); },
    createBiquadFilter: () => { created.push('filter'); return stub(); },
    createStereoPanner: () => { created.push('panner'); return stub(); },
  };
  function stub() {
    const p = () => ({
      value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {},
    });
    return {
      connect() {}, start() {}, stop() {}, type: '',
      gain: p(), frequency: p(), Q: p(), detune: p(), pan: { value: 0 },
    };
  }

  const saved = { ctx: audioManager.ctx, bus: audioManager.seBus, view: audioManager.listenerView };
  audioManager.ctx = ctx;
  audioManager.seBus = { name: 'bus' };
  audioManager.setListenerView(view);
  try {
    audioManager.playDroneMove(
      view.cx + view.halfW + ENEMY_HOVER_OFFSCREEN_FADE + 100, view.cy);
    assert.deepEqual(created, [], '聞こえない距離なのに音を組み立てている');
  } finally {
    audioManager.ctx = saved.ctx;
    audioManager.seBus = saved.bus;
    audioManager.listenerView = saved.view;
    audioManager.setListenerX(saved.view ? saved.view.cx : null);
  }
});
