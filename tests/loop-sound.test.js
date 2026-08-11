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

test('母艦のエンジンは停止時と全速で決まった値を予約する', () => {
  // 音程まわりは _loopSound へ載せ替えたときから不変。
  // gain だけ 2026-08-12 に実機の判断で 0.060/0.110 から合計 -8dB 下げた
  // （ドッキング中ずっと鳴っていて他の効果音が埋もれるため）。
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const n = audioManager._loops.carrier;
    assert.equal(n.osc.frequency.target, 46);
    assert.equal(n.sub.frequency.target, 23);
    assert.equal(n.filter.frequency.target, 150);
    assert.ok(Math.abs(n.gain.gain.target - 0.024) < 1e-9,
      `停止時の音量: ${n.gain.gain.target}`);

    audioManager.startCarrierEngine(1);
    assert.equal(n.osc.frequency.target, 60);
    assert.equal(n.sub.frequency.target, 30);
    assert.equal(n.filter.frequency.target, 270);
    assert.ok(Math.abs(n.gain.gain.target - 0.044) < 1e-9,
      `全速の音量: ${n.gain.gain.target}`);
  });
});

test('母艦は動かすと音が上がる（停止時と全速の比は保つ）', () => {
  // 音量を下げるときに base だけ／range だけを触ると、動かしたときの
  // 手応え（エンジンが唸る感じ）が消える。比で縛っておく
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const n = audioManager._loops.carrier;
    const idle = n.gain.gain.target;

    audioManager.startCarrierEngine(1);
    const full = n.gain.gain.target;

    assert.ok(full > idle, '動かしても音量が上がっていない');
    assert.ok(Math.abs(full / idle - 110 / 60) < 0.02,
      `停止時と全速の比が変わっている: ${(full / idle).toFixed(3)}（元は ${(110 / 60).toFixed(3)}）`);
  });
});

test('母艦のエンジンは回復ハムと帯域が重ならない', () => {
  // 2つはドッキング中に同時に鳴る。帯域が近づくと片方が聞き取れなくなる。
  // エンジンを触るときはこの分離を保つこと
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(1);   // 全速＝いちばん高くなる条件
    const engineTop = audioManager._loops.carrier.osc.frequency.target;
    assert.ok(engineTop < REPAIR_HUM_FREQ_FROM / 2,
      `エンジン ${engineTop}Hz がハムの下限 ${REPAIR_HUM_FREQ_FROM}Hz に近すぎる`);
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
