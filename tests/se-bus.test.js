import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioManager } from '../src/js/audio/AudioManager.js';
import {
  SE_MASTER_GAIN, SE_COMP_THRESHOLD, SE_COMP_RATIO, SE_COMP_ATTACK,
} from '../src/js/utils/Constants.js';

const SOURCE = readFileSync(new URL('../src/js/audio/AudioManager.js', import.meta.url), 'utf8');

/** ノードの接続を記録する AudioContext もどき。 */
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    destination: { name: 'destination', inputs: [] },
    created: [],
    _node(name, extra = {}) {
      const n = {
        name, inputs: [], outputs: [],
        connect(dst) { this.outputs.push(dst); dst.inputs.push(this); },
        ...extra,
      };
      ctx.created.push(n);
      return n;
    },
    createGain() { return ctx._node('gain', { gain: { value: 1 } }); },
    createDynamicsCompressor() {
      return ctx._node('compressor', {
        threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 1 },
        attack: { value: 0 }, release: { value: 0 },
      });
    },
    createStereoPanner() {
      return ctx._node('panner', { pan: { value: 0 } });
    },
  };
  return ctx;
}

function withCtx(ctx, fn) {
  const saved = { ctx: audioManager.ctx, bus: audioManager.seBus, lx: audioManager.listenerX };
  audioManager.ctx = ctx;
  audioManager.seBus = null;
  try { return fn(); } finally {
    audioManager.ctx = saved.ctx;
    audioManager.seBus = saved.bus;
    audioManager.listenerX = saved.lx;
  }
}

/** dst まで辿り着けるか（間に何が挟まっていてもよい）。 */
function reaches(node, dst, seen = new Set()) {
  if (node === dst) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return (node.outputs || []).some((n) => reaches(n, dst, seen));
}

// --- バスの組み立て -----------------------------------------------------------

test('効果音のバスは 持ち上げ → リミッタ → 出力 の順に繋がる', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const bus = audioManager.seBus;
    assert.equal(bus.name, 'gain');
    assert.equal(bus.gain.value, SE_MASTER_GAIN);

    const comp = bus.outputs[0];
    assert.equal(comp.name, 'compressor', 'リミッタを通さずに出力へ繋いでいる');
    assert.equal(comp.outputs[0], ctx.destination);
  });
});

test('リミッタの設定値が定数どおり', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const comp = audioManager.seBus.outputs[0];
    assert.equal(comp.threshold.value, SE_COMP_THRESHOLD);
    assert.equal(comp.ratio.value, SE_COMP_RATIO);
    assert.equal(comp.attack.value, SE_COMP_ATTACK);
  });
});

test('持ち上げは 1.0 を超える（そうでないと底上げにならない）', () => {
  assert.ok(SE_MASTER_GAIN > 1, `底上げになっていない: ${SE_MASTER_GAIN}`);
  // 素で 1.0 を超える音があるため、圧縮なしでこの値まで上げると割れる
  assert.ok(SE_COMP_RATIO > 1 && SE_COMP_THRESHOLD < 0, 'リミッタが効いていない設定');
});

test('DynamicsCompressor の無い環境では素通しして出力へ繋ぐ', () => {
  const ctx = fakeCtx();
  delete ctx.createDynamicsCompressor;
  withCtx(ctx, () => {
    audioManager._createSeBus();
    assert.equal(audioManager.seBus.outputs[0], ctx.destination);
  });
});

// --- 効果音がバスを通ること ---------------------------------------------------

test('位置つきの音はパンナーを経てバスへ入る（出力へ直結しない）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.setListenerX(0);
    const out = audioManager._out(300);
    assert.equal(out.name, 'panner');
    assert.equal(out.outputs[0], audioManager.seBus, 'パンナーが出力へ直結している');
    assert.ok(reaches(out, ctx.destination));
  });
});

test('位置なしの音もバスへ入る（全体の底上げから漏れない）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    assert.equal(audioManager._out(undefined), audioManager.seBus);
    assert.equal(audioManager._seDest(), audioManager.seBus);
  });
});

test('バスが未構築でも落ちない', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    assert.equal(audioManager._seDest(), ctx.destination);
  });
});

// --- 置換漏れが無いこと -------------------------------------------------------

test('効果音の実装が出力へ直結していない', () => {
  // 29箇所を機械的に置換したので、取りこぼしをここで止める。
  // ctx.destination を名指ししてよいのはバスの組み立てと素通しの2箇所だけ。
  const allowed = [
    'comp.connect(this.ctx.destination);',
    'this.seBus.connect(this.ctx.destination);',
    'return this.seBus || this.ctx.destination;',
  ];
  const lines = SOURCE.split('\n')
    .map((l, i) => ({ n: i + 1, text: l.trim() }))
    .filter((l) => l.text.includes('this.ctx.destination'))
    .filter((l) => !allowed.includes(l.text));
  assert.deepEqual(lines, [],
    `効果音がバスを通らず出力へ直結している:\n${lines.map((l) => `  ${l.n}: ${l.text}`).join('\n')}`);
});

test('BGM は効果音のバスを通さない（BGM 音量と独立させるため）', () => {
  for (const file of ['BGMManager.js', 'MP3BGMManager.js']) {
    const src = readFileSync(new URL(`../src/js/audio/${file}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('seBus'), `${file} が効果音のバスを参照している`);
    assert.ok(src.includes('this.ctx.destination'), `${file} が出力へ繋がっていない`);
  }
});
