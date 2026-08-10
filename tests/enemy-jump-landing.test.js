import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { biquad, whiteNoise, aWeightedRms, db, SAMPLE_RATE } from './helpers/dsp.js';
import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN,
  ENEMY_LANDING_NOISE_HARD, ENEMY_LANDING_NOISE_SOFT,
  ENEMY_LANDING_THUMP_HARD, ENEMY_LANDING_THUMP_SOFT,
  LANDING_MIN_AIRBORNE_FRAMES, ENEMY_HOVER_OFFSCREEN_FADE,
} from '../src/js/utils/Constants.js';

const FLOOR_TOP = 20 * TILE_SIZE;

/** 敵の音を数えながら n フレーム回す。 */
function countSounds(fn) {
  const saved = {
    burst: audioManager.playEnemyBurst,
    landing: audioManager.playEnemyLanding,
  };
  const calls = { burst: 0, landing: [] };
  audioManager.playEnemyBurst = () => { calls.burst++; };
  audioManager.playEnemyLanding = (x, y, hard) => { calls.landing.push(hard); };
  try { fn(); } finally {
    audioManager.playEnemyBurst = saved.burst;
    audioManager.playEnemyLanding = saved.landing;
  }
  return calls;
}

function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  // 自機は射程外に置く（撃たれると音の呼び出しが混ざる）
  game.player = {
    x: 5000, y: FLOOR_TOP - 24, width: 16, height: 24,
    alive: true, docked: false, vx: 0, vy: 0, hp: 100, takeDamage() {},
  };
  return game;
}

// --- 鳴るべきとき -------------------------------------------------------------

test('ジャンプするとジャンプ音が鳴る', () => {
  const game = world();
  const e = makeAttacker(game, 200, FLOOR_TOP - 24, 'standard');
  const calls = countSounds(() => e._jump());
  assert.equal(calls.burst, 1, 'ジャンプ音が鳴っていない');
});

test('ジャンプして降りれば着地音が1回鳴る', () => {
  const game = world();
  const e = makeAttacker(game, 200, FLOOR_TOP - 24, 'standard');
  for (let i = 0; i < 10; i++) e.update();     // 接地させる

  const calls = countSounds(() => {
    e.onGround = false;
    e.vy = -5;                                  // 跳び上がった状態
    for (let i = 0; i < 180; i++) e.update();
  });
  assert.equal(calls.landing.length, 1, `着地音が ${calls.landing.length} 回`);
});

test('高いところから落ちれば硬い着地になる', () => {
  const game = world();
  const e = makeAttacker(game, 200, 40, 'heavy');
  const calls = countSounds(() => { for (let i = 0; i < 200; i++) e.update(); });
  assert.ok(calls.landing.length >= 1, '着地音が鳴っていない');
  assert.equal(calls.landing[0], true, '硬い着地扱いになっていない');
});

// --- 鳴ってはいけないとき -------------------------------------------------------

test('地上に立っているだけでは着地音が鳴らない', () => {
  // 自機で起きていたのと同じ問題。接地判定の1フレームの途切れを着地と数えない
  const game = world();
  const e = makeAttacker(game, 200, FLOOR_TOP - 24, 'standard');
  for (let i = 0; i < 30; i++) e.update();

  const calls = countSounds(() => { for (let i = 0; i < 300; i++) e.update(); });
  const spurious = calls.landing.length - calls.burst;   // 自分で跳んだぶんは正当
  assert.ok(spurious <= 0,
    `跳んでいないのに ${spurious} 回の着地音（ジャンプ${calls.burst}回/着地${calls.landing.length}回）`);
});

test('滞空が短ければ着地と数えない', () => {
  const game = world();
  const e = makeAttacker(game, 200, FLOOR_TOP - 24, 'standard');
  for (let i = 0; i < 10; i++) e.update();

  const calls = countSounds(() => {
    e.onGround = false;
    e.airborneFrames = LANDING_MIN_AIRBORNE_FRAMES - 2;
    e.vy = 0.3;
    for (let i = 0; i < 5; i++) e.update();
  });
  assert.equal(calls.landing.length, 0, '短い浮きを着地と数えた');
});

// --- 位置による扱い -------------------------------------------------------------

/** ノードの生成を数えるだけの AudioContext もどき。 */
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    destination: { name: 'destination' },
    created: [],
    _n(name, extra = {}) {
      const p = () => ({
        value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {},
        setTargetAtTime() {}, cancelScheduledValues() {},
      });
      const n = {
        name, connect() {}, disconnect() {},
        gain: p(), frequency: p(), Q: p(), pan: { value: 0 },
        buffer: null, loop: false, type: '', start() {}, stop() {},
        threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(),
        ...extra,
      };
      ctx.created.push(n);
      return n;
    },
    createGain() { return ctx._n('gain'); },
    createBufferSource() { return ctx._n('bufferSource'); },
    createOscillator() { return ctx._n('oscillator'); },
    createBiquadFilter() { return ctx._n('filter'); },
    createStereoPanner() { return ctx._n('panner'); },
    createDynamicsCompressor() { return ctx._n('compressor'); },
  };
  return ctx;
}

const VIEW = {
  cx: 2000, cy: 1000, halfW: CANVAS_WIDTH / 2, halfH: CANVAS_HEIGHT / 2,
};

/** 指定位置で敵の音を鳴らし、生成されたノードを返す。 */
function playAt(method, x, y) {
  const ctx = fakeCtx();
  const saved = { ctx: audioManager.ctx, bus: audioManager.seBus, view: audioManager.listenerView, buf: audioManager.noiseBuffer };
  audioManager.ctx = ctx;
  audioManager.seBus = null;
  audioManager.noiseBuffer = { fake: true };
  audioManager._createSeBus();
  audioManager.setListenerView(VIEW);
  try {
    audioManager[method](x, y);
    return ctx.created;
  } finally {
    audioManager.ctx = saved.ctx;
    audioManager.seBus = saved.bus;
    audioManager.noiseBuffer = saved.buf;
    audioManager.listenerView = saved.view;
    audioManager.setListenerX(saved.view ? saved.view.cx : null);
  }
}

for (const method of ['playEnemyBurst', 'playEnemyLanding']) {
  test(`${method}: 遠すぎる音源は鳴らさない`, () => {
    const far = playAt(method, VIEW.cx + VIEW.halfW + ENEMY_HOVER_OFFSCREEN_FADE + 100, VIEW.cy);
    const sources = far.filter((n) => n.name === 'bufferSource' || n.name === 'oscillator');
    assert.deepEqual(sources, [], '聞こえない距離なのに音を組み立てている');
  });

  test(`${method}: 画面内の音源は左右に振れる`, () => {
    const right = playAt(method, VIEW.cx + 400, VIEW.cy);
    const panner = right.find((n) => n.name === 'panner');
    assert.ok(panner, 'パンナーが無い');
    assert.ok(panner.pan.value > 0, `右の音源が右から鳴らない: ${panner.pan.value}`);

    const left = playAt(method, VIEW.cx - 400, VIEW.cy);
    assert.ok(left.find((n) => n.name === 'panner').pan.value < 0, '左の音源が左から鳴らない');
  });
}

// --- 聞こえる大きさ -------------------------------------------------------------

/** 掃引するローパスノイズ（ジャンプ音）を合成して A特性の実効値を返す。 */
function burstLevel(f0, f1, gain) {
  const n = 1 << 15;
  const noise = whiteNoise(n, 7);
  const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
  return aWeightedRms((i) => {
    const t = Math.min(i / SAMPLE_RATE, 0.3);
    const f = f0 * Math.pow(f1 / f0, t / 0.3);
    const w0 = 2 * Math.PI * f / SAMPLE_RATE;
    const cw = Math.cos(w0), al = Math.sin(w0) / 2;
    const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const x = noise[i];
    const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
            - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    return y * gain;
  }, n);
}

test('敵のジャンプ音は自機のジャンプ音と同じくらいの大きさで聞こえる', () => {
  // 音作りを変えたときの音量再調整漏れを止める。敵のホバー音で実際にやらかした。
  const player = burstLevel(1000, 3000, 0.1);
  const enemy = burstLevel(ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN);
  const diff = db(enemy / player);
  assert.ok(diff > -6, `敵のジャンプ音が聞き取れない: 自機比 ${diff.toFixed(1)}dB`);
  assert.ok(diff < 3, `敵のジャンプ音が自機より目立つ: 自機比 ${diff.toFixed(1)}dB`);
});

/**
 * 着地音を丸ごと合成して A特性の実効値を返す。
 * 一撃の周波数だけを比べても実際の聞こえ方は分からない。上に載るノイズの
 * 帯域が支配的なこともあるため、両方を含めて測る。
 */
function landingLevel({ hard, noiseFrom, thump }) {
  const n = 1 << 15;
  const dur = hard ? 0.20 : 0.10;
  const vol = hard ? 0.26 : 0.12;
  const noise = whiteNoise(n, 11);
  const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
  let phase = 0;
  return aWeightedRms((i) => {
    const t = i / SAMPLE_RATE;
    if (t > dur) return 0;
    const k = t / dur;

    const f = noiseFrom * Math.pow(120 / noiseFrom, k);
    const w0 = 2 * Math.PI * f / SAMPLE_RATE;
    const cw = Math.cos(w0), al = Math.sin(w0) / 2;
    const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const x = noise[i];
    const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
            - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;

    const tf = thump * Math.pow(40 / thump, k);
    phase += tf / SAMPLE_RATE;
    const decay = Math.pow(0.001 / vol, k);
    return y * vol * decay + Math.sin(2 * Math.PI * phase) * vol * 0.8 * decay;
  }, n);
}

test('敵の着地音は自機より低いが、聞こえなくなるほどではない', () => {
  for (const [name, hard, playerNoise, playerThump, enemyNoise, enemyThump] of [
    ['hard', true, 700, 110, ENEMY_LANDING_NOISE_HARD, ENEMY_LANDING_THUMP_HARD],
    ['soft', false, 1100, 150, ENEMY_LANDING_NOISE_SOFT, ENEMY_LANDING_THUMP_SOFT],
  ]) {
    assert.ok(enemyThump < playerThump, `${name}: 一撃が自機より低くない`);
    assert.ok(enemyNoise < playerNoise, `${name}: ノイズが自機より低くない`);

    const player = landingLevel({ hard, noiseFrom: playerNoise, thump: playerThump });
    const enemy = landingLevel({ hard, noiseFrom: enemyNoise, thump: enemyThump });
    const diff = db(enemy / player);
    assert.ok(diff > -6, `${name}: 低すぎて聞こえない: 自機比 ${diff.toFixed(1)}dB`);
    assert.ok(diff < 0, `${name}: 自機より控えめになっていない: 自機比 ${diff.toFixed(1)}dB`);
  }
});

test('自機の帯域と重ならない（ジャンプ音）', () => {
  assert.ok(ENEMY_BURST_FREQ_TO < 3000, '掃引の頂点が自機と同じ');
  assert.ok(ENEMY_BURST_FREQ_FROM < 1000, '掃引の始点が自機と同じ');
});
