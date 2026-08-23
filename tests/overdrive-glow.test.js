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
import {
  OVERDRIVE_DURATION, OVERDRIVE_WARN_TICKS, OVERDRIVE_BLINK_MS,
} from '../src/js/utils/Constants.js';

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

test('明るい暖色で光る（暗い色で塗らない）', () => {
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

/** その描画で使われたグラデーションの色を全部集める。 */
function glowColors(timer) {
  return glowCalls(timer)
    .filter((c) => c.name === 'set:fillStyle')
    .map((c) => c.args[0])
    .filter((v) => v && v.type === 'radialGradient')
    .flatMap((g) => g.stops.map(([, color]) => color));
}

/** 一番内側の色を rgba の4成分に分解する。赤と金の見分け、濃さの比較に使う。 */
function innerColor(timer, nowMs) {
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    const c = glowColors(timer)[0];
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(c);
    assert.ok(m, `色が読めない: ${c}`);
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  } finally {
    Date.now = realNow;
  }
}

/** 点滅の2つの位相を取る。 */
function bothPhases(timer) {
  const a = innerColor(timer, 0);
  const b = innerColor(timer, OVERDRIVE_BLINK_MS);
  return [a, b];
}

test('点滅は「瞬いている」と見える速さ', () => {
  // 0.12秒では「ゆっくり切り替わっている」に見えて、機体が唸っている感じが
  // 出なかった（実機で確認）。1位相 0.08秒より速いこと
  assert.ok(OVERDRIVE_BLINK_MS <= 80, `遅い: ${OVERDRIVE_BLINK_MS}ms`);
});

test('効いている間はずっと金と赤を往復する', () => {
  const [a, b] = bothPhases(OVERDRIVE_DURATION);
  const [red, gold] = a.g < b.g ? [a, b] : [b, a];
  assert.ok(red.g <= 110, `赤側が赤くない: G=${red.g}`);
  assert.ok(gold.g >= 170, `金側が金色でない: G=${gold.g}`);
});

test('切れかけると金色の成分が消えて、赤だけの点滅になる', () => {
  const [a, b] = bothPhases(1); // ほぼ尽きている
  assert.ok(a.g <= 110 && b.g <= 110, `金色が残っている: G=${a.g} / ${b.g}`);
  assert.notEqual(a.a, b.a, '赤一色になったまま点滅が止まっている');
});

test('金色の成分は残り時間に連れて滑らかに減る', () => {
  // しきい値でいきなり切り替わるのではなく、細っていくのが分かるように
  const goldAt = (timer) => {
    const [a, b] = bothPhases(timer);
    return Math.max(a.g, b.g);
  };
  const full = goldAt(OVERDRIVE_WARN_TICKS);
  const half = goldAt(OVERDRIVE_WARN_TICKS / 2);
  const nearly = goldAt(OVERDRIVE_WARN_TICKS / 10);
  assert.ok(full > half, `減っていない: ${full} → ${half}`);
  assert.ok(half > nearly, `減っていない: ${half} → ${nearly}`);
});

test('しきい値より前では金色が満量のまま', () => {
  const goldAt = (timer) => {
    const [a, b] = bothPhases(timer);
    return Math.max(a.g, b.g);
  };
  assert.equal(goldAt(OVERDRIVE_DURATION), goldAt(OVERDRIVE_WARN_TICKS),
    'しきい値より前で既に色が褪せている');
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
