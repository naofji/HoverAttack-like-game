import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { OVERDRIVE_DURATION } from '../src/js/utils/Constants.js';

// オーバードライブの残時間バー。A-AIM ゲージのすぐ下に同じ作法で出す。
// 「いつ切れるか」が読めないと、無限だと思って撃っていた弾が急に減り始める。

function drawBar({ overdriveTimer = OVERDRIVE_DURATION, maxTimer = OVERDRIVE_DURATION } = {}) {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  hud._drawOverdriveBar(ctx, { overdriveTimer, overdriveMaxTimer: maxTimer }, 100);
  return {
    ctx,
    fills: ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
    bars: ctx.calls.filter((c) => c.name === 'fillRect'),
  };
}

test('効いている間はラベルとバーが出る', () => {
  const { texts, bars } = drawBar();
  assert.ok(texts.includes('O-DRIVE'), `ラベルが出ていない: ${texts.join(' / ')}`);
  assert.ok(bars.length >= 2, `バーが描かれていない: ${bars.length} 個`);
});

test('残量がバーの長さに出る', () => {
  const widthOf = (bars) => bars[bars.length - 1].args[2];
  const full = drawBar({ overdriveTimer: OVERDRIVE_DURATION }).bars;
  const half = drawBar({ overdriveTimer: OVERDRIVE_DURATION / 2 }).bars;
  assert.ok(widthOf(full) > widthOf(half), '残量がバーの長さに出ていない');
});

test('持っていなければ何も描かない', () => {
  const { ctx } = drawBar({ overdriveTimer: 0 });
  assert.equal(ctx.calls.length, 0, '持っていないのに描いている');
});

test('自機がいなくても落ちない', () => {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  hud._drawOverdriveBar(ctx, null, 100);
  assert.equal(ctx.calls.length, 0);
});

test('分母が 0 でもゼロ除算でバーが壊れない', () => {
  // 拾う前の状態に手が入った経路（セーブの読み込みなど）でも NaN を描かない
  const { bars } = drawBar({ overdriveTimer: 10, maxTimer: 0 });
  for (const b of bars) {
    assert.ok(Number.isFinite(b.args[2]), `バーの幅が数値でない: ${b.args[2]}`);
  }
});

test('残り3秒を切ると点滅する（切れる予告）', () => {
  // 点滅は時間で色が変わる。同じ残量でも位相違いで2色になることを見る
  const colorsAt = (nowMs) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return drawBar({ overdriveTimer: 60 }).fills;
    } finally {
      Date.now = realNow;
    }
  };
  const a = colorsAt(0).join();
  const b = colorsAt(250).join();
  assert.notEqual(a, b, '残りわずかなのに点滅していない');

  // 十分残っているときは点滅しない
  const steady = (nowMs) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return drawBar({ overdriveTimer: OVERDRIVE_DURATION }).fills.join();
    } finally {
      Date.now = realNow;
    }
  };
  assert.equal(steady(0), steady(250), '残量が十分なのに点滅している');
});

test('HUD の通常描画からも呼ばれる', () => {
  // メソッドがあるだけで draw() から呼ばれていなければ画面には出ない。
  // 描画の中身は上のテストで見ているので、ここでは到達だけを確かめる
  const hud = Object.create(HUD.prototype);
  const player = {
    missiles: 0, grenades: 0, mgBurstLeft: 0, mgReloadTimer: 0, hoverFuel: 0,
    hp: 100, currentWeapon: 'mg', repairKits: 0,
    autoAimTimer: 0, overdriveTimer: OVERDRIVE_DURATION, overdriveMaxTimer: OVERDRIVE_DURATION,
  };
  hud.game = {
    player, carrier: null, score: 0, debugInvincible: false,
    canvas: { width: 1024, height: 768 },
    camera: { x: 0, y: 0 },
    missionsCompleted: 0, base: null,
    baseEmergencyAlert: false, proximityAlertActive: false,
    liveTimeBonus: () => 0,
  };
  let called = 0;
  const original = HUD.prototype._drawOverdriveBar;
  HUD.prototype._drawOverdriveBar = function (...args) { called++; return original.apply(this, args); };
  try {
    hud.draw(makeFakeCtx());
  } finally {
    HUD.prototype._drawOverdriveBar = original;
  }
  assert.equal(called, 1, 'draw() から呼ばれていない');
});
