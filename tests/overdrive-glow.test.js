// オーバードライブ中の機体の赤い輝き。
//
// HUD の残時間バーだけだと視線を下へ外さないと状態が読めない。機体そのものが
// 光っていれば、撃ち合いの最中でも「まだ効いている」が視界の中心で分かる。
// 切れる前は点滅させて予告する（HUD バーと同じ OVERDRIVE_WARN_TICKS）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { OVERDRIVE_DURATION, OVERDRIVE_WARN_TICKS } from '../src/js/utils/Constants.js';

function makeGame() {
  return {
    debugInvincible: false,
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [],
    camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
    input: {
      mouse: { x: 0, y: 0, left: false },
      isKeyDown: () => false, isKeyPressed: () => false,
      getTargetWorld: () => ({ x: 0, y: 0 }),
      crosshairLocked: false,
    },
    spawnExplosion() { }, spawnHeavyDamage() { }, spawnSparks() { },
    spawnDebris() { }, addScore() { }, spawnSmokeScreen() { },
  };
}

function glowCalls(timer) {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = timer;
  const ctx = makeFakeCtx();
  p._drawOverdriveGlow(ctx);
  return ctx.calls;
}

test('オーバードライブ中でなければ何も描かない', () => {
  assert.equal(glowCalls(0).length, 0, '効いていないのに光っている');
});

test('オーバードライブ中は機体のまわりに光を描く', () => {
  const calls = glowCalls(OVERDRIVE_DURATION);
  assert.ok(calls.some((c) => c.name === 'arc' || c.name === 'fill'),
    '輝きが描かれていない');
});

test('赤系で光る', () => {
  const calls = glowCalls(OVERDRIVE_DURATION);
  const colors = calls
    .filter((c) => c.name === 'set:fillStyle' || c.name === 'set:strokeStyle')
    .map((c) => c.args[0])
    .filter((v) => typeof v === 'string');
  const grads = calls.filter((c) => c.name === 'set:fillStyle')
    .map((c) => c.args[0])
    .filter((v) => v && v.type === 'radialGradient')
    .flatMap((g) => g.stops.map(([, color]) => color));

  const all = [...colors, ...grads].join(' ');
  assert.match(all, /rgba?\(\s*2[0-9]{2}/, `赤系が使われていない: ${all}`);
});

test('残り時間が僅かになると点滅する', () => {
  // 同じ残量でも実時間の位相で見た目が変わる（＝点滅している）
  const at = (nowMs, timer) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return JSON.stringify(glowCalls(timer));
    } finally {
      Date.now = realNow;
    }
  };
  assert.notEqual(at(0, 60), at(150, 60), '残りわずかなのに点滅していない');
  assert.equal(at(0, OVERDRIVE_DURATION), at(150, OVERDRIVE_DURATION),
    '残量が十分なのに点滅している');
});

test('点滅の境目は HUD バーと同じしきい値', () => {
  const at = (nowMs, timer) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return JSON.stringify(glowCalls(timer));
    } finally {
      Date.now = realNow;
    }
  };
  // しきい値のすぐ上では点滅せず、すぐ下では点滅する
  assert.equal(at(0, OVERDRIVE_WARN_TICKS + 1), at(150, OVERDRIVE_WARN_TICKS + 1));
  assert.notEqual(at(0, OVERDRIVE_WARN_TICKS), at(150, OVERDRIVE_WARN_TICKS));
});

test('draw() から呼ばれる（機体より先に描いて背後の光にする）', () => {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = OVERDRIVE_DURATION;
  const order = [];
  p._drawOverdriveGlow = () => order.push('glow');
  p._drawBody = () => order.push('body');
  p._drawMachineGun = () => { };
  p._drawBazooka = () => { };
  p._drawHoverExhaust = () => { };
  p.draw(makeFakeCtx());
  assert.deepEqual(order, ['glow', 'body'], '機体の手前に光を描いている');
});

test('死んでいる間は光らない', () => {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = OVERDRIVE_DURATION;
  p.alive = false;
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});
