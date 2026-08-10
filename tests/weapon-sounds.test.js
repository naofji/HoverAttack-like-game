import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { WEAPON_SOUNDS, renderWeaponSound } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from './helpers/weapon-render.js';
import { transientLevel, db, whiteNoise, SAMPLE_RATE } from './helpers/dsp.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, ENEMY_HOVER_OFFSCREEN_FADE,
  ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN,
} from '../src/js/utils/Constants.js';

// --- 表の作り -----------------------------------------------------------------

test('武器ごとに別の音が定義されている', () => {
  // 以前は弾もミサイルも巡航ミサイルも同じ playEnemyFire だった
  const kinds = Object.keys(WEAPON_SOUNDS);
  for (const required of [
    'playerMg', 'enemyMg', 'playerMissile', 'enemyMissile', 'homing', 'cruise', 'grenade',
  ]) {
    assert.ok(kinds.includes(required), `${required} が無い`);
  }
});

test('どの音も少なくとも1つの部品を持つ', () => {
  for (const [kind, p] of Object.entries(WEAPON_SOUNDS)) {
    assert.ok(p.hiss || p.tone || p.puffs, `${kind}: 中身が空`);
  }
});

test('自機と敵で音が違う（撃たれている側だと分かる）', () => {
  assert.notDeepEqual(WEAPON_SOUNDS.playerMg, WEAPON_SOUNDS.enemyMg);
  assert.notDeepEqual(WEAPON_SOUNDS.playerMissile, WEAPON_SOUNDS.enemyMissile);
  // 敵の方が低い帯域に居る
  assert.ok(WEAPON_SOUNDS.enemyMg.hiss.from < WEAPON_SOUNDS.playerMg.hiss.from);
  assert.ok(WEAPON_SOUNDS.enemyMissile.tone.from < WEAPON_SOUNDS.playerMissile.tone.from);
});

test('マシンガンは連射に耐える短さ', () => {
  for (const kind of ['playerMg', 'enemyMg']) {
    assert.ok(profileDuration(WEAPON_SOUNDS[kind]) <= 0.12,
      `${kind}: 長すぎて連射で濁る: ${profileDuration(WEAPON_SOUNDS[kind])}秒`);
  }
});

test('巡航ミサイルは最も長い（射出そのものが事件）', () => {
  const cruise = profileDuration(WEAPON_SOUNDS.cruise);
  for (const [kind, p] of Object.entries(WEAPON_SOUNDS)) {
    if (kind === 'cruise') continue;
    assert.ok(profileDuration(p) <= cruise, `${kind} が巡航ミサイルより長い`);
  }
});

// --- ホーミングの「シュボボッ」---------------------------------------------------

test('ホーミングは「シュ」のあとに「ボボッ」が連なる', () => {
  const p = WEAPON_SOUNDS.homing;
  assert.ok(p.hiss, '「シュ」にあたる部分が無い');
  assert.ok(p.puffs, '「ボボッ」にあたる部分が無い');
  assert.ok(p.puffs.count >= 2, `連なりに聞こえない: ${p.puffs.count}回`);

  // 「シュ」は高く短く、「ボボッ」は低い
  assert.ok(p.hiss.from > p.puffs.freq * 3, '「シュ」が「ボ」と同じ高さで分離しない');
  assert.ok(p.hiss.dur < 0.25, `「シュ」が長すぎる: ${p.hiss.dur}秒`);
});

test('「ボボッ」の間隔は連なりに聞こえる範囲', () => {
  const { gap, count } = WEAPON_SOUNDS.homing.puffs;
  assert.ok(gap >= 0.03, `速すぎて1つの音に潰れる: ${gap}秒`);
  assert.ok(gap <= 0.12, `遅すぎて別々の音に聞こえる: ${gap}秒`);
  assert.ok(gap * (count - 1) < 0.3, '連なり全体が長すぎる');
});

test('「ボボッ」は後ろほど弱くなる（押し出される向きが出る）', () => {
  // renderWeaponSound の fade がその役目。波形の各破裂のピークで確かめる
  const buf = renderWeaponProfile(WEAPON_SOUNDS.homing);
  const { count, gap, dur } = WEAPON_SOUNDS.homing.puffs;
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * gap * SAMPLE_RATE);
    const to = Math.min(buf.length, Math.floor((i * gap + dur) * SAMPLE_RATE));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(buf[j]));
    peaks.push(peak);
  }
  assert.ok(peaks[peaks.length - 1] < peaks[0],
    `最後の破裂が最初より弱くない: ${peaks.map((v) => v.toFixed(3)).join(' / ')}`);
});

// --- 音量 ---------------------------------------------------------------------

/** 敵のジャンプ音。既にバランスを確認済みなので基準に使う。 */
function referenceLevel() {
  const n = 1 << 14;
  const noise = whiteNoise(n, 7);
  const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const buf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    if (t > 0.3) break;
    const f = ENEMY_BURST_FREQ_FROM
      * Math.pow(ENEMY_BURST_FREQ_TO / ENEMY_BURST_FREQ_FROM, t / 0.3);
    const w0 = 2 * Math.PI * f / SAMPLE_RATE;
    const cw = Math.cos(w0), al = Math.sin(w0) / 2;
    const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0;
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const x = noise[i];
    const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
            - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    buf[i] = y * ENEMY_BURST_GAIN;
  }
  return transientLevel((i) => buf[i], 0.3);
}

test('どの武器も他の効果音と同じ土俵の音量で鳴る', () => {
  // 音作りを変えたときの音量再調整漏れを止める。敵のホバー音で実際にやらかした。
  const ref = referenceLevel();
  for (const [kind, p] of Object.entries(WEAPON_SOUNDS)) {
    const buf = renderWeaponProfile(p);
    const level = transientLevel((i) => buf[i], profileDuration(p));
    const diff = db(level / ref);
    assert.ok(diff > -14, `${kind}: 小さすぎて聞こえない: 基準比 ${diff.toFixed(1)}dB`);
    assert.ok(diff < 3, `${kind}: 大きすぎて他を覆う: 基準比 ${diff.toFixed(1)}dB`);
  }
});

test('歪まない', () => {
  for (const [kind, p] of Object.entries(WEAPON_SOUNDS)) {
    let peak = 0;
    for (const v of renderWeaponProfile(p)) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak < 0.6, `${kind}: 振幅が大きい: ${peak.toFixed(3)}`);
    assert.ok(peak > 0.02, `${kind}: 振幅が小さすぎる: ${peak.toFixed(3)}`);
  }
});

test('マシンガンが突出しない（連射するので目立ちすぎると疲れる）', () => {
  const ref = referenceLevel();
  const lvl = (kind) => {
    const buf = renderWeaponProfile(WEAPON_SOUNDS[kind]);
    return db(transientLevel((i) => buf[i], profileDuration(WEAPON_SOUNDS[kind])) / ref);
  };
  const mg = Math.max(lvl('playerMg'), lvl('enemyMg'));
  const missile = Math.max(lvl('playerMissile'), lvl('cruise'));
  assert.ok(mg - missile < 4,
    `マシンガンがミサイルより ${(mg - missile).toFixed(1)}dB 大きい`);
});

// --- 鳴らす仕組み ---------------------------------------------------------------

/** ノードの生成を数えるだけの AudioContext もどき。 */
function fakeCtx() {
  const created = [];
  const param = () => ({
    value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const node = (name) => {
    created.push(name);
    return {
      name, connect() {}, disconnect() {}, start() {}, stop() {},
      type: '', buffer: null, loop: false,
      gain: param(), frequency: param(), Q: param(), detune: param(), pan: { value: 0 },
    };
  };
  return {
    created, currentTime: 0, destination: { name: 'destination' },
    createGain: () => node('gain'),
    createBufferSource: () => node('bufferSource'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('panner'),
  };
}

const VIEW = { cx: 2000, cy: 1000, halfW: CANVAS_WIDTH / 2, halfH: CANVAS_HEIGHT / 2 };

function playAt(kind, x, y) {
  const ctx = fakeCtx();
  const saved = {
    ctx: audioManager.ctx, fade: audioManager.seFade,
    view: audioManager.listenerView, buf: audioManager.noiseBuffer,
  };
  audioManager.ctx = ctx;
  audioManager.seFade = { name: 'fade' };
  audioManager.noiseBuffer = { fake: true };
  audioManager.setListenerView(VIEW);
  try {
    audioManager.playWeapon(kind, x, y);
    return ctx.created;
  } finally {
    audioManager.ctx = saved.ctx;
    audioManager.seFade = saved.fade;
    audioManager.noiseBuffer = saved.buf;
    audioManager.listenerView = saved.view;
    audioManager.setListenerX(saved.view ? saved.view.cx : null);
  }
}

test('画面内で撃てば音が組み立てられる', () => {
  const nodes = playAt('enemyMg', VIEW.cx + 100, VIEW.cy);
  assert.ok(nodes.length > 0, '音が鳴っていない');
});

test('遠すぎる発砲は組み立てない', () => {
  const far = playAt('enemyMg', VIEW.cx + VIEW.halfW + ENEMY_HOVER_OFFSCREEN_FADE + 100, VIEW.cy);
  assert.deepEqual(far, [], '聞こえない距離なのに音を組み立てている');
});

test('知らない武器名では何も起きない', () => {
  assert.deepEqual(playAt('nonexistent', VIEW.cx, VIEW.cy), []);
});

test('部品の数だけノードが作られる', () => {
  // hiss = ノイズ+フィルタ+ゲイン、tone = 発振+ゲイン
  const mg = playAt('playerMg', VIEW.cx, VIEW.cy).filter((n) => n !== 'panner');
  assert.deepEqual(mg.sort(), ['bufferSource', 'filter', 'gain', 'gain', 'oscillator'].sort());
});

// --- 呼び出し側 -----------------------------------------------------------------

const SRC = (f) => readFileSync(new URL(`../src/js/${f}`, import.meta.url), 'utf8');

test('古い共用の発射音は残っていない', () => {
  const am = SRC('audio/AudioManager.js');
  assert.ok(!am.includes('playEnemyFire'), 'playEnemyFire が残っている');
  assert.ok(!am.includes('playMissile('), 'playMissile が残っている');
});

test('基地の通常弾で音が二重に鳴らない', () => {
  // EnemyBullet のコンストラクタが鳴らすので、基地側で足すと2回になる
  const base = SRC('entities/EnemyBase.js');
  const bullet = SRC('entities/EnemyBullet.js');
  assert.ok(bullet.includes("playWeapon('enemyMg'"), '弾自身が音を鳴らしていない');
  assert.ok(!base.includes("playWeapon('enemyMg'"), '基地でも通常弾の音を鳴らしている');
});

test('武器ごとに違う種類が渡されている', () => {
  const base = SRC('entities/EnemyBase.js');
  for (const kind of ['enemyMissile', 'homing', 'cruise']) {
    assert.ok(base.includes(`playWeapon('${kind}'`), `基地が ${kind} を鳴らしていない`);
  }
  const attacker = SRC('entities/EnemyAttacker.js');
  for (const kind of ['homing', 'enemyMissile', 'grenade']) {
    assert.ok(attacker.includes(`playWeapon('${kind}'`),
      `アタッカーが ${kind} を鳴らしていない`);
  }
});

test('renderWeaponSound は部品が無くても落ちない', () => {
  const ctx = fakeCtx();
  assert.doesNotThrow(() => renderWeaponSound(ctx, {}, {}, null, 1, 0));
  assert.deepEqual(ctx.created, []);
});
