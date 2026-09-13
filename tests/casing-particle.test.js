import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CasingParticle } from '../src/js/entities/Particle.js';
import { WATER_MOTION, LAND_MOTION } from '../src/js/world/StageEnvironment.js';
import {
  CASING_GRAVITY, CASING_MAX_FALL_SPEED, CASING_LIFETIME, WATER_GRAVITY_SCALE, CASING_BOUNCE,
} from '../src/js/utils/Constants.js';

function gameWithMotion(motionAt) {
  return { env: { motionAt } };
}

test('CasingParticle falls under gravity and dies after its lifetime', () => {
  const game = gameWithMotion(() => LAND_MOTION);
  const casing = new CasingParticle(game, 0, 0, 1, 0);

  casing.update();
  assert.equal(casing.vy, CASING_GRAVITY);
  assert.equal(casing.alive, true);

  for (let i = 0; i < CASING_LIFETIME; i++) casing.update();
  assert.equal(casing.alive, false);
});

test('CasingParticle falls more slowly in water (gravity scaled by motion.gravity)', () => {
  const game = gameWithMotion(() => WATER_MOTION);
  const casing = new CasingParticle(game, 0, 0, 0, 0);

  casing.update();
  assert.equal(casing.vy, CASING_GRAVITY * WATER_GRAVITY_SCALE);
});

test('CasingParticle is flagged as debris so it triggers a water-crossing splash', () => {
  const casing = new CasingParticle(gameWithMotion(() => LAND_MOTION), 0, 0, 0, 0);
  assert.equal(casing.isDebris, true);
});

test('CasingParticle never exceeds its max fall speed', () => {
  const game = gameWithMotion(() => LAND_MOTION);
  const casing = new CasingParticle(game, 0, 0, 0, 0);
  for (let i = 0; i < 200; i++) casing.update();
  assert.ok(casing.vy <= CASING_MAX_FALL_SPEED);
});

test('CasingParticle bounces off the floor instead of falling through it', () => {
  // y=50 以上を地面とする単純な地形
  const map = { isSolidAtPixel: (x, y) => y >= 50 };
  const game = { env: { motionAt: () => LAND_MOTION }, map };
  const casing = new CasingParticle(game, 0, 48, 0, 5); // 床にぶつかる勢いで落下中

  casing.update();

  assert.ok(casing.y < 50, '床の中にめり込んでいる');
  assert.ok(casing.vy < 0, '跳ね返って上向きの速度になっていない');
});

test('CasingParticle bounces off a wall and loses some speed', () => {
  const map = { isSolidAtPixel: (x) => x >= 10 };
  const game = { env: { motionAt: () => LAND_MOTION }, map };
  const casing = new CasingParticle(game, 5, 0, 10, 0);

  casing.update();

  assert.ok(casing.x < 10, '壁の中にめり込んでいる');
  assert.equal(casing.vx, -10 * CASING_BOUNCE, '跳ね返りで減速していない');
});

test('CasingParticle with no map still falls straight through (decorative fallback)', () => {
  const casing = new CasingParticle({ env: { motionAt: () => LAND_MOTION } }, 0, 0, 1, 0);
  assert.doesNotThrow(() => casing.update());
});

test('CasingParticle draw does not throw with no ctx state left dangling', () => {
  const game = gameWithMotion(() => LAND_MOTION);
  const casing = new CasingParticle(game, 10, 20, 1, -1);
  const calls = [];
  const ctx = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate() {}, rotate() {}, fillRect() {},
    set globalAlpha(v) {}, set fillStyle(v) {},
  };
  casing.draw(ctx);
  assert.deepEqual(calls, ['save', 'restore']);
});
