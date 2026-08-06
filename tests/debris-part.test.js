import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import {
  DEBRIS_GRAVITY, DEBRIS_FLASH_COLOR, DEBRIS_MAX_FALL_SPEED, GRAVITY,
} from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractFillRects, extractSets } from './helpers/fake-ctx.js';

/** 決定的なテストのため乱数要素をすべて明示指定した破片を作る。 */
function makePart(overrides = {}) {
  return new DebrisPart({
    x: 100, y: 50, w: 8, h: 4, color: '#CCAA00', angle: 0,
    vx: 2, vy: -1, spin: 0.1, holdFrames: 0, lifetime: 40,
    ...overrides,
  });
}

test('ホールド中は動かず、白熱色で描かれる', () => {
  const p = makePart({ holdFrames: 3 });
  const ctx = makeFakeCtx();
  p.update();
  p.draw(ctx);
  assert.equal(p.x, 100);
  assert.equal(p.y, 50);
  assert.equal(p.life, 40, 'ホールド中は寿命を消費しない');
  assert.equal(extractSets(ctx.calls, 'fillStyle')[0], DEBRIS_FLASH_COLOR);
});

test('ホールドが明けると飛散し、自前の色で描かれる', () => {
  const p = makePart({ holdFrames: 1 });
  p.update();               // ホールド消費
  const ctx = makeFakeCtx();
  p.update();               // 1フレーム目の飛散
  p.draw(ctx);
  assert.equal(p.x, 102);
  assert.equal(p.y, 49);
  assert.equal(extractSets(ctx.calls, 'fillStyle')[0], '#CCAA00');
});

test('重力で vy が単調増加する', () => {
  const p = makePart({ vy: 0 });
  const seen = [];
  for (let i = 0; i < 5; i++) { p.update(); seen.push(p.vy); }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] > seen[i - 1], `vy が増えていない: ${seen}`);
  }
  assert.ok(Math.abs(seen[0] - DEBRIS_GRAVITY) < 1e-9);
});

test('破片にかかる重力は通常の1/6', () => {
  // 通常の重力だとすぐ落ちてしまい、吹き飛んで舞う感じが出ない
  assert.ok(Math.abs(DEBRIS_GRAVITY - GRAVITY / 6) < 1e-9,
    `1/6 になっていない: ${DEBRIS_GRAVITY} (通常 ${GRAVITY})`);
});

test('落下速度は上限で頭打ちになる', () => {
  // 上限に達するまで十分な時間を与える。lifetime は打ち切られないよう長めに。
  const p = makePart({ vy: 0, lifetime: 500 });
  for (let i = 0; i < 200; i++) {
    p.update();
    assert.ok(p.vy <= DEBRIS_MAX_FALL_SPEED + 1e-9, `上限を超えた: ${p.vy}`);
  }
  assert.ok(Math.abs(p.vy - DEBRIS_MAX_FALL_SPEED) < 1e-9,
    `上限に張り付いていない: ${p.vy}`);
});

test('上限より速い初速で放り出されても、それ以上は加速しない', () => {
  const p = makePart({ vy: DEBRIS_MAX_FALL_SPEED + 3, lifetime: 500 });
  const start = p.vy;
  p.update();
  assert.ok(p.vy <= start, `上限超えの初速がさらに加速した: ${start} -> ${p.vy}`);
});

test('空気抵抗で横速度が減衰する', () => {
  const p = makePart({ vx: 4 });
  p.update();
  assert.ok(p.vx < 4 && p.vx > 3.5, `減衰しすぎ/しなさすぎ: ${p.vx}`);
});

test('回転し続ける', () => {
  const p = makePart({ angle: 0, spin: 0.25 });
  p.update();
  p.update();
  assert.ok(Math.abs(p.angle - 0.5) < 1e-9);
});

test('寿命が尽きると alive が false になる', () => {
  const p = makePart({ lifetime: 3 });
  p.update(); p.update();
  assert.equal(p.alive, true);
  p.update();
  assert.equal(p.alive, false);
});

test('scale は 1 から 0 へ単調減少する', () => {
  const p = makePart({ lifetime: 10 });
  let prev = p.scale;
  assert.ok(Math.abs(prev - 1) < 1e-9, `開始時の scale は 1: ${prev}`);
  for (let i = 0; i < 10; i++) {
    p.update();
    assert.ok(p.scale <= prev, `scale が増えた: ${prev} -> ${p.scale}`);
    prev = p.scale;
  }
  assert.ok(prev < 0.05, `最後まで縮んでいない: ${prev}`);
});

test('alpha は終盤まで 1 のまま、最後だけ落ちる', () => {
  const p = makePart({ lifetime: 20 });
  for (let i = 0; i < 10; i++) p.update();
  assert.equal(p.alpha, 1);
  for (let i = 0; i < 8; i++) p.update();
  assert.ok(p.alpha < 1 && p.alpha > 0, `終盤でフェードしていない: ${p.alpha}`);
});

test('draw は中心原点の矩形を1つ描く', () => {
  const p = makePart();
  const ctx = makeFakeCtx();
  p.draw(ctx);
  const rects = extractFillRects(ctx.calls);
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], { x: -4, y: -2, w: 8, h: 4 });
  const translate = ctx.calls.find((c) => c.name === 'translate');
  assert.deepEqual(translate.args, [100, 50]);
});

test('死んだ破片は描画しない', () => {
  const p = makePart({ lifetime: 1 });
  p.update();
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

test('画面外の破片は描画しない', () => {
  const game = { camera: { x: 5000, y: 5000 }, canvas: { width: 1024, height: 768 } };
  const p = makePart({ game });
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});
