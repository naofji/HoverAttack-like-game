import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImpactFlash } from '../src/js/entities/Particle.js';
import { makeFakeCtx, extractSets } from './helpers/fake-ctx.js';
import {
  IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS, IMPACT_FLASH_RADIUS_MG,
} from '../src/js/utils/Constants.js';

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

test('ミサイルの閃光はマシンガンより明確に大きい', () => {
  assert.ok(IMPACT_FLASH_RADIUS >= IMPACT_FLASH_RADIUS_MG * 2,
    `差が小さく弾種の違いが伝わらない: ${IMPACT_FLASH_RADIUS} vs ${IMPACT_FLASH_RADIUS_MG}`);
  // ただし爆発そのものにはしない（機体2体ぶんを超えない）
  assert.ok(IMPACT_FLASH_RADIUS <= 30,
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

// --- 開始遅延と、破壊時の連鎖 -------------------------------------------------

test('遅延を指定すると、その間は描かれない', () => {
  const f = new ImpactFlash(X, Y, IMPACT_FLASH_RADIUS, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(drawNow(f).length, 0, `${i} tick 目で既に光っている`);
    assert.equal(f.alive, true, '待機中に消えてしまった');
    f.update();
  }
  assert.ok(drawNow(f).length > 0, '遅延明けに光らない');
});

test('遅延中は寿命を消費しない', () => {
  const delayed = new ImpactFlash(X, Y, IMPACT_FLASH_RADIUS, 4);
  for (let i = 0; i < 4; i++) delayed.update();
  const plain = new ImpactFlash(X, Y);
  assert.equal(delayed.lifetime, plain.lifetime, '待機中に寿命が減っている');
});
