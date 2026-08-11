import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';

test('繰り返し start しても音源は1組しか作られない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const after1 = ctx.created.length;
    audioManager.startCarrierEngine(0.5);
    audioManager.startCarrierEngine(1);
    assert.equal(ctx.created.length, after1, '毎回ノードを作り直している（音が重なる）');
  });
});

test('毎フレーム呼ばれた値が追従に反映される', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const gain = audioManager._loops.carrier.gain;
    const first = gain.gain.target;
    audioManager.startCarrierEngine(1);
    assert.ok(gain.gain.target > first, '移動しても音量が上がっていない');
  });
});

test('母艦のエンジンの音は載せ替え前と同じ値を予約する', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const n = audioManager._loops.carrier;
    assert.equal(n.osc.frequency.target, 46);
    assert.equal(n.sub.frequency.target, 23);
    assert.equal(n.filter.frequency.target, 150);
    assert.ok(Math.abs(n.gain.gain.target - 0.06) < 1e-9);

    audioManager.startCarrierEngine(1);
    assert.equal(n.osc.frequency.target, 60);
    assert.equal(n.sub.frequency.target, 30);
    assert.equal(n.filter.frequency.target, 270);
    assert.ok(Math.abs(n.gain.gain.target - 0.11) < 1e-9);
  });
});

test('止めるときは切らずに引く', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0.5);
    const gain = audioManager._loops.carrier.gain;
    audioManager.stopCarrierEngine();
    assert.equal(gain.gain.target, 0, '0 まで引いていない');
    assert.equal(audioManager._loops.carrier, null, '止めたのに残っている');
  });
});

test('二重に止めても落ちない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    audioManager.stopCarrierEngine();
    assert.doesNotThrow(() => audioManager.stopCarrierEngine());
  });
});

test('鳴らしていないものを止めても落ちない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    assert.doesNotThrow(() => audioManager.stopCarrierEngine());
  });
});

test('音の出せない環境では何も作らない', () => {
  assert.doesNotThrow(() => audioManager.startCarrierEngine(1));
  assert.equal(audioManager.ctx, null);
});
