import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImpactFlash } from '../src/js/entities/Particle.js';
import { makeFakeCtx, extractSets } from './helpers/fake-ctx.js';
import { IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS } from '../src/js/utils/Constants.js';

const X = 300;
const Y = 200;

/** arc 呼び出しを {x,y,r} で取り出す。 */
function arcs(calls) {
  return calls.filter((c) => c.name === 'arc').map((c) => ({
    x: c.args[0], y: c.args[1], r: c.args[2],
  }));
}

function drawNow(flash) {
  const ctx = makeFakeCtx();
  flash.draw(ctx);
  return ctx.calls;
}

test('着弾点に丸い閃光を描く', () => {
  const circles = arcs(drawNow(new ImpactFlash(X, Y)));
  assert.ok(circles.length >= 1, '円が描かれていない');
  for (const c of circles) {
    assert.deepEqual({ x: c.x, y: c.y }, { x: X, y: Y }, '着弾点からずれている');
  }
});

test('短命であること（爆発を邪魔しない長さ）', () => {
  assert.ok(IMPACT_FLASH_LIFETIME <= 12,
    `着弾の閃光としては長すぎる: ${IMPACT_FLASH_LIFETIME}`);
  const f = new ImpactFlash(X, Y);
  for (let i = 0; i < IMPACT_FLASH_LIFETIME - 1; i++) f.update();
  assert.equal(f.alive, true);
  f.update();
  assert.equal(f.alive, false);
});

test('小さめであること（機体を覆い隠さない）', () => {
  // 自機は 16x24。閃光がそれを飲み込むと「爆発」になってしまう
  assert.ok(IMPACT_FLASH_RADIUS <= 16,
    `着弾の閃光としては大きすぎる: ${IMPACT_FLASH_RADIUS}`);
  const maxR = Math.max(...arcs(drawNow(new ImpactFlash(X, Y))).map((c) => c.r));
  assert.ok(maxR <= IMPACT_FLASH_RADIUS + 1e-6);
});

test('広がりながら薄れる', () => {
  const f = new ImpactFlash(X, Y);
  let prevR = -1;
  let prevAlpha = Infinity;
  for (let i = 0; i < IMPACT_FLASH_LIFETIME; i++) {
    const calls = drawNow(f);
    const r = Math.max(...arcs(calls).map((c) => c.r));
    const alpha = extractSets(calls, 'globalAlpha')[0];
    assert.ok(r >= prevR, `半径が縮んだ: ${prevR} -> ${r}`);
    assert.ok(alpha <= prevAlpha, `不透明度が上がった: ${prevAlpha} -> ${alpha}`);
    prevR = r;
    prevAlpha = alpha;
    f.update();
  }
});

test('寿命が尽きたら描画しない', () => {
  const f = new ImpactFlash(X, Y);
  while (f.alive) f.update();
  assert.equal(drawNow(f).length, 0);
});

test('大きさを指定できる（弾種で変えられる）', () => {
  const small = arcs(drawNow(new ImpactFlash(X, Y, 6)));
  const big = arcs(drawNow(new ImpactFlash(X, Y, 14)));
  assert.ok(Math.max(...big.map((c) => c.r)) > Math.max(...small.map((c) => c.r)));
});
