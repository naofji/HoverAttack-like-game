import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import {
  REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
} from '../src/js/utils/Constants.js';

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

// --- 回復ハム -------------------------------------------------------------------

test('回復が進むと音程が上がる（あと何秒かが耳で分かる）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0);
    const osc = audioManager._loops.repair.osc;
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_FROM);
    audioManager.startRepairHum(1);
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_TO);
  });
});

test('進捗が範囲外でも音程が飛ばない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(-5);
    const osc = audioManager._loops.repair.osc;
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_FROM);
    audioManager.startRepairHum(99);
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_TO);
  });
});

test('ハムは母艦のエンジンと帯域が被らない', () => {
  // 被ると唸りになって、どちらの音も濁る
  assert.ok(REPAIR_HUM_FREQ_FROM > 200,
    `エンジン（46〜60Hz）に近すぎる: ${REPAIR_HUM_FREQ_FROM}Hz`);
  assert.ok(REPAIR_HUM_FREQ_TO > REPAIR_HUM_FREQ_FROM, '進んでも上がらない');
});

test('ハムは他の音を邪魔しない音量', () => {
  // 鳴り続ける音なので、単発の効果音より小さくないと耳につく
  assert.ok(REPAIR_HUM_GAIN > 0.01, `小さすぎて聞こえない: ${REPAIR_HUM_GAIN}`);
  assert.ok(REPAIR_HUM_GAIN < 0.09, `鳴り続ける音として大きすぎる: ${REPAIR_HUM_GAIN}`);
});

test('ハムも繰り返し start で音源が増えない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0);
    const after1 = ctx.created.length;
    audioManager.startRepairHum(0.5);
    assert.equal(ctx.created.length, after1);
  });
});

test('ハムを止めると引いて消える', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0.5);
    const gain = audioManager._loops.repair.gain;
    audioManager.stopRepairHum();
    assert.equal(gain.gain.target, 0);
    assert.equal(audioManager._loops.repair, null);
  });
});

test('エンジンとハムは互いを止めない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    audioManager.startRepairHum(0);
    audioManager.stopRepairHum();
    assert.ok(audioManager._loops.carrier, 'ハムを止めたらエンジンまで止まった');
  });
});

test('ゲームオーバーのフェードでハムも音源ごと止まる', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.startRepairHum(0.5);
    audioManager.fadeOutSe();
    assert.equal(audioManager._loops.repair, null, '引いた後も鳴り続ける');
  });
});
