import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImpactFlash, createDeathFlashes } from '../src/js/entities/Particle.js';
import { makeFakeCtx, extractSets } from './helpers/fake-ctx.js';
import {
  IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS, IMPACT_FLASH_RADIUS_MG,
  DEATH_FLASH_COUNT, DEATH_FLASH_STAGGER,
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

test('破壊時の閃光は複数が時間をずらして瞬く', () => {
  const flashes = createDeathFlashes(100, 200, 16, 24);
  assert.equal(flashes.length, DEATH_FLASH_COUNT);

  const delays = flashes.map((f) => f.delay).sort((a, b) => a - b);
  assert.equal(delays[0], 0, '最初の1つは即座に光ってほしい');
  assert.ok(new Set(delays).size > 1, '全部同時に光っている（連なって見えない）');
  // 「何tick目までに始まるか」ではなく「連鎖全体が一瞬で終わるか」を見る。
  // 遅延には乱数の倍率(最大1.4)が乗るので、刻み×個数では上限を割ってしまう。
  const burstEnd = Math.max(...delays) + IMPACT_FLASH_LIFETIME;
  assert.ok(burstEnd <= 36,
    `連鎖が長すぎて瞬きに見えない: ${burstEnd} tick (約${(burstEnd / 60).toFixed(2)}秒)`);
});

test('破壊時の閃光は機体の範囲に散る', () => {
  const [x, y, w, h] = [100, 200, 16, 24];
  for (const f of createDeathFlashes(x, y, w, h)) {
    assert.ok(f.x >= x - w && f.x <= x + w * 2, `x が機体から離れすぎ: ${f.x}`);
    assert.ok(f.y >= y - h && f.y <= y + h * 2, `y が機体から離れすぎ: ${f.y}`);
  }
});

test('破壊時の閃光はミサイル着弾と同じくらいの大きさ', () => {
  for (const f of createDeathFlashes(100, 200, 16, 24)) {
    assert.ok(f.radius >= IMPACT_FLASH_RADIUS * 0.6 && f.radius <= IMPACT_FLASH_RADIUS * 1.2,
      `ミサイル着弾(${IMPACT_FLASH_RADIUS})と大きさが違いすぎる: ${f.radius}`);
  }
});
