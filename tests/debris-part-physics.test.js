// DebrisPart が薬莢(CasingParticle)と同じく、地形で跳ね返り、水中で
// ゆっくり沈むこと。テストの作りは casing-particle.test.js に合わせてある。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import { WATER_MOTION, LAND_MOTION } from '../src/js/world/StageEnvironment.js';
import { DEBRIS_GRAVITY, DEBRIS_BOUNCE, DEBRIS_DRAG, WATER_GRAVITY_SCALE } from '../src/js/utils/Constants.js';

function makePart({ game, x = 0, y = 0, vx = 0, vy = 0 } = {}) {
  return new DebrisPart({
    x, y, w: 4, h: 4, color: '#fff', angle: 0, vx, vy, spin: 0,
    holdFrames: 0, lifetime: 999, game,
  });
}

function gameWithMotion(motionAt, map) {
  return { env: { motionAt }, map };
}

test('DebrisPart bounces off the floor instead of falling through it', () => {
  const map = { isSolidAtPixel: (x, y) => y >= 50 };
  const game = gameWithMotion(() => LAND_MOTION, map);
  const part = makePart({ game, x: 0, y: 48, vy: 5 });

  part.update();

  assert.ok(part.y < 50, '床の中にめり込んでいる');
  assert.ok(part.vy < 0, '跳ね返って上向きの速度になっていない');
});

test('DebrisPart bounces off a wall and loses some speed', () => {
  const map = { isSolidAtPixel: (x) => x >= 10 };
  const game = gameWithMotion(() => LAND_MOTION, map);
  const part = makePart({ game, x: 5, y: 0, vx: 10 });

  part.update();

  assert.ok(part.x < 10, '壁の中にめり込んでいる');
  // 跳ね返り(DEBRIS_BOUNCE)のあと、毎フレームの空気抵抗(DEBRIS_DRAG)も掛かる
  assert.equal(part.vx, -10 * DEBRIS_BOUNCE * DEBRIS_DRAG, '跳ね返りで減速していない');
});

test('DebrisPart falls more slowly in water (gravity scaled by motion.gravity)', () => {
  const map = { isSolidAtPixel: () => false };
  const game = gameWithMotion(() => WATER_MOTION, map);
  const part = makePart({ game });

  part.update();

  assert.equal(part.vy, DEBRIS_GRAVITY * WATER_GRAVITY_SCALE);
});

test('DebrisPart with no game.map still falls straight through (decorative fallback)', () => {
  const part = makePart({ game: null });
  assert.doesNotThrow(() => part.update());
});

test('DebrisPart is still flagged as debris so it triggers a water-crossing splash', () => {
  const part = makePart({ game: null });
  assert.equal(part.isDebris, true);
});
