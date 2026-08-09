import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { AUDIO_PAN_MAX } from '../src/js/utils/Constants.js';

/** StereoPannerNode を持つ最小の AudioContext もどき。 */
function fakeCtx() {
  const ctx = {
    destination: { name: 'destination' },
    panners: [],
    createStereoPanner() {
      const p = { pan: { value: 0 }, connectedTo: null, connect(n) { this.connectedTo = n; } };
      ctx.panners.push(p);
      return p;
    },
  };
  return ctx;
}

/** _out を試すあいだだけ ctx を差し替える。 */
function withCtx(ctx, fn) {
  const saved = audioManager.ctx;
  audioManager.ctx = ctx;
  try { return fn(); } finally { audioManager.ctx = saved; }
}

test('パン0なら余計なノードを挟まず destination へ直結する', () => {
  const ctx = fakeCtx();
  const out = withCtx(ctx, () => audioManager._out(0));
  assert.equal(out, ctx.destination);
  assert.equal(ctx.panners.length, 0, 'パン0でパンナーを作っている');
});

test('パンを指定すると destination の手前にパンナーが入る', () => {
  const ctx = fakeCtx();
  const out = withCtx(ctx, () => audioManager._out(0.5));
  assert.equal(ctx.panners.length, 1);
  assert.equal(out, ctx.panners[0], 'パンナーが出力になっていない');
  assert.equal(out.pan.value, 0.5);
  assert.equal(out.connectedTo, ctx.destination, 'destination に繋がっていない');
});

test('範囲外のパンは -1..1 に収める（WebAudio が例外を投げる）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, () => {
    assert.equal(audioManager._out(9).pan.value, 1);
    assert.equal(audioManager._out(-9).pan.value, -1);
  });
  // 設計上の上限そのものは範囲内であること
  assert.ok(AUDIO_PAN_MAX <= 1);
});

test('StereoPanner の無いブラウザでは直結に落ちる', () => {
  const ctx = fakeCtx();
  delete ctx.createStereoPanner;
  assert.equal(withCtx(ctx, () => audioManager._out(0.8)), ctx.destination);
});
