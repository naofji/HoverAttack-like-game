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
    assert.ok(p.hiss || p.tone || p.puffs || p.clicks, `${kind}: 中身が空`);
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

// --- ホーミングの「プシュッ！」---------------------------------------------------

test('ホーミングは高い帯域のノイズが主役（プシュッ）', () => {
  const p = WEAPON_SOUNDS.homing;
  assert.ok(p.hiss, '「シュ」にあたる部分が無い');
  // 圧を抜く感じは高い帯域から出る。低いと「ボッ」に寄る
  assert.ok(p.hiss.from >= 3500, `高さが足りず鋭く聞こえない: ${p.hiss.from}Hz`);
  assert.ok(p.hiss.to >= 1000, `末尾が籠もって「ッ」が立たない: ${p.hiss.to}Hz`);
  // 他のどの武器よりも高いところから始まる
  for (const [kind, o] of Object.entries(WEAPON_SOUNDS)) {
    if (kind === 'homing' || !o.hiss) continue;
    assert.ok(p.hiss.from > o.hiss.from, `${kind} より低いところから始まっている`);
  }
});

test('頭に強い一撃がある（プ）', () => {
  const p = WEAPON_SOUNDS.homing;
  assert.ok(p.puffs, '頭の一撃が無い');
  assert.ok(p.puffs.dur <= 0.05, `一撃が長く「ボ」に伸びる: ${p.puffs.dur}秒`);
  assert.ok(p.puffs.gain > p.hiss.gain * 2,
    `一撃がノイズに対して弱く「プ」が立たない: ${p.puffs.gain} vs ${p.hiss.gain}`);
  assert.ok((p.puffs.bright ?? 3) > 3, '一撃が鈍く「ブ」に寄る（bright を上げる）');
  assert.ok(p.hiss.from > p.puffs.freq * 3, '一撃とノイズが同じ高さで分離しない');
});

test('頭が立ちつつ、突出しすぎない', () => {
  // 弱いと気の抜けた「シュー」、強すぎると尾が聞こえない「ボッ」になる
  const buf = renderWeaponProfile(WEAPON_SOUNDS.homing);
  const dur = profileDuration(WEAPON_SOUNDS.homing);
  let head = 0;
  let tail = 0;
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    if (t < 0.04) head = Math.max(head, Math.abs(buf[i]));
    else if (t < dur) { tail += buf[i] * buf[i]; n++; }
  }
  // 下限は2度「プが弱い」と言われて引き上げた値。上限は尾が残る範囲
  const ratio = head / Math.sqrt(tail / n);
  assert.ok(ratio > 9, `頭が立っていない: ${ratio.toFixed(1)}倍`);
  assert.ok(ratio < 18, `頭が突出して尾が聞こえない: ${ratio.toFixed(1)}倍`);
});

test('尾を引く（プシュッではなくプシュー）', () => {
  const p = WEAPON_SOUNDS.homing;
  assert.ok(p.hiss.hold > 0.1,
    `満音量を保つ時間が短く、頭で消えて「シュッ」に切れる: ${p.hiss.hold ?? 0}秒`);

  // ピークの -30dB を上回る間を「聞こえている」とみなす
  const buf = renderWeaponProfile(p);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  let audible = 0;
  for (let i = 0; i < buf.length; i++) {
    if (Math.abs(buf[i]) > peak * 0.032) audible = i / SAMPLE_RATE;
  }
  assert.ok(audible > 0.25, `尾が短く「シュー」に伸びない: ${audible.toFixed(2)}秒`);
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

// --- ミサイルの迫力 -------------------------------------------------------------
//
// 「ボゥン」と鈍かったのは、包絡が頭から減衰するのに明るさが後から来ていて、
// 暗いところだけ鳴って終わっていたため。同じ形に戻らないよう固定する。

/** 波形の指定区間の明るさ（ゼロ交差率）と実効値。 */
function brightnessAt(buf, from, to) {
  const a = Math.floor(from * SAMPLE_RATE);
  const b = Math.min(buf.length, Math.floor(to * SAMPLE_RATE));
  let crossings = 0;
  let energy = 0;
  for (let i = a + 1; i < b; i++) {
    if ((buf[i - 1] < 0) !== (buf[i] < 0)) crossings++;
    energy += buf[i] * buf[i];
  }
  return {
    hz: crossings / ((b - a) / SAMPLE_RATE) / 2,
    rms: Math.sqrt(energy / (b - a)),
  };
}

for (const kind of ['playerMissile', 'enemyMissile']) {
  test(`${kind}: 明るいところから始まる（頭が暗いと「ボゥン」になる）`, () => {
    const p = WEAPON_SOUNDS[kind];
    assert.ok(p.hiss.from > p.hiss.to,
      '暗いところから開く掃引に戻っている。包絡が頭から減衰するので聞こえない');
    assert.ok(p.hiss.from >= 2000, `頭が暗い: ${p.hiss.from}Hz`);

    const buf = renderWeaponProfile(p);
    const head = brightnessAt(buf, 0, 0.05);
    assert.ok(head.hz > 700, `発音直後が低い成分ばかり: ${Math.round(head.hz)}Hz`);
  });

  test(`${kind}: 噴射が尾を引く（一瞬で終わらない）`, () => {
    const p = WEAPON_SOUNDS[kind];
    assert.ok(p.hiss.hold > 0.05,
      `満音量を保つ時間が無く、頭で消える: ${p.hiss.hold ?? 0}秒`);

    const buf = renderWeaponProfile(p);
    const head = brightnessAt(buf, 0, 0.05);
    const mid = brightnessAt(buf, 0.10, 0.20);
    assert.ok(mid.rms > head.rms * 0.15,
      `0.1〜0.2秒で消えている: 頭 ${head.rms.toFixed(4)} → 中盤 ${mid.rms.toFixed(4)}`);
  });

  test(`${kind}: 点火の一撃がある`, () => {
    const p = WEAPON_SOUNDS[kind];
    assert.ok(p.puffs, '頭の一撃が無く、噴射だけで立ち上がりが鈍い');
    assert.ok(p.puffs.dur <= 0.06, `一撃が長い: ${p.puffs.dur}秒`);
  });
}

test('ミサイルは自機の方が高い帯域で鳴る', () => {
  assert.ok(WEAPON_SOUNDS.enemyMissile.hiss.from < WEAPON_SOUNDS.playerMissile.hiss.from);
  assert.ok(WEAPON_SOUNDS.enemyMissile.puffs.freq < WEAPON_SOUNDS.playerMissile.puffs.freq);
});

// --- リロード「ガチャリ」---------------------------------------------------------

test('リロードは金属の打撃で出来ている', () => {
  const p = WEAPON_SOUNDS.reload;
  assert.ok(p.clicks, '打撃が無い');
  assert.ok(!p.hiss && !p.tone, '噴射音や音程成分が混ざると機構の音に聞こえない');
  // 整数倍でない共鳴が金属らしさを作る。1.0 だと倍音が整って鐘や笛に寄る
  const metal = p.clicks.metal ?? 2.76;
  assert.ok(Math.abs(metal - Math.round(metal)) > 0.2,
    `共鳴の比が整数に近く、金属に聞こえない: ${metal}`);
  assert.ok((p.clicks.Q ?? 7) >= 5, `共鳴が緩く、硬さが出ない: Q=${p.clicks.Q}`);
});

test('「ガチャ」と「リ」に分かれる（等間隔にしない）', () => {
  const { count, gap } = WEAPON_SOUNDS.reload.clicks;
  assert.equal(count, 3, `打撃が3つでない: ${count}`);
  assert.ok(Array.isArray(gap), '間隔が等間隔で、拍に聞こえて機械的すぎる');
  assert.ok(gap[1] > gap[0] * 1.4,
    `「ガチャ」と「リ」の切れ目が足りない: ${gap.join(' / ')}秒`);
});

/**
 * 打撃ごとのピーク。窓は次の打撃までで切る。
 * 打撃の長さより間隔が短いことがあり、そのまま長さぶん見ると隣の頭を拾う。
 */
function clickPeaks(profile) {
  const buf = renderWeaponProfile(profile);
  const { count, gap, dur } = profile.clicks;
  const at = (v, i) => (Array.isArray(v) ? (v[i] ?? v[v.length - 1]) : v);
  const peaks = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const span = i < count - 1 ? Math.min(dur, at(gap, i)) : dur;
    const from = Math.floor(t * SAMPLE_RATE);
    const to = Math.min(buf.length, Math.floor((t + span) * SAMPLE_RATE));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(buf[j]));
    peaks.push(peak);
    t += at(gap, i);
  }
  return peaks;
}

test('打撃の音程は「低 → 中 → 超低」', () => {
  // 単調に上げると軽い機構、単調に下げるとただの減速に聞こえる。
  // 一度上げてから底へ落とす形で、重い部品が落ち着く感じを作る
  const { freq } = WEAPON_SOUNDS.reload.clicks;
  assert.ok(Array.isArray(freq), '打撃ごとに音程を指定していない');
  assert.equal(freq.length, 3);
  assert.ok(freq[0] < freq[1], `2発目が上がっていない: ${freq.join(' / ')}Hz`);
  assert.ok(freq[2] < freq[0], `3発目が最も低くない: ${freq.join(' / ')}Hz`);
  assert.ok(freq[2] < freq[0] * 0.7,
    `3発目が「超低」と言えるほど低くない: ${freq.join(' / ')}Hz`);
});

test('低い打撃が痩せない（帯域幅の差を補正している）', () => {
  // バンドパスを通る帯域は中心周波数に比例するので、同じゲインだと
  // 低い打撃ほど弱くなる。打撃ごとにゲインを与えて補正していないと崩れる
  const peaks = clickPeaks(WEAPON_SOUNDS.reload);
  const max = Math.max(...peaks);
  assert.ok(peaks[0] / max > 0.5,
    `1発目（低）が痩せている: ${(peaks[0] / max * 100).toFixed(0)}%`);
  assert.ok(peaks[2] / max > 0.6,
    `3発目（超低）が痩せている: ${(peaks[2] / max * 100).toFixed(0)}%`);
});

test('リロードは一瞬で終わる（動作を待たされる感じにしない）', () => {
  assert.ok(profileDuration(WEAPON_SOUNDS.reload) < 0.3,
    `長すぎる: ${profileDuration(WEAPON_SOUNDS.reload).toFixed(2)}秒`);
});

test('自機のリロードは定位させない（自分の銃なので中央）', () => {
  const player = readFileSync(new URL('../src/js/entities/Player.js', import.meta.url), 'utf8');
  assert.ok(player.includes("playWeapon('reload')"), 'リロード音が呼ばれていない');
  assert.ok(!player.includes("playWeapon('reload',"), '座標を渡していて左右に振れる');
});
