import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bullet } from '../src/js/entities/Bullet.js';
import { TrailParticle } from '../src/js/entities/Particle.js';
import { WATER_MOTION, LAND_MOTION } from '../src/js/world/StageEnvironment.js';
import { BULLET_WATER_DRAG, BULLET_WATER_MIN_SPEED } from '../src/js/utils/Constants.js';

function gameWithMotion(motionAt) {
  return {
    map: { isSolidAtPixel: () => false },
    env: { motionAt },
    particles: [],
  };
}

test('bullet slows down frame by frame while in water instead of an instant scale', () => {
  const game = gameWithMotion(() => WATER_MOTION);
  const bullet = new Bullet(game, 0, 0, 0, { speed: 4, radius: 1, lifetime: 999, sound: null });

  bullet.update();
  assert.equal(bullet.vx, 4 * BULLET_WATER_DRAG);

  bullet.update();
  assert.equal(bullet.vx, 4 * BULLET_WATER_DRAG * BULLET_WATER_DRAG);
});

test('bullet keeps its slowed-down water speed after crossing into air (no snap back)', () => {
  let inWater = true;
  const game = gameWithMotion(() => (inWater ? WATER_MOTION : LAND_MOTION));
  const bullet = new Bullet(game, 0, 0, 0, { speed: 4, radius: 1, lifetime: 999, sound: null });

  for (let i = 0; i < 10; i++) bullet.update();
  const slowedVx = bullet.vx;
  assert.ok(slowedVx < 4, 'velocity should have decayed while in water');

  inWater = false;
  const xBefore = bullet.x;
  bullet.update();

  assert.equal(bullet.vx, slowedVx, 'velocity must not jump back up on leaving water');
  assert.equal(bullet.x, xBefore + slowedVx, 'displacement in air uses the already-slowed velocity, not the original speed');
});

test('bullet vanishes once it has decelerated enough in water, instead of idling for its full lifetime', () => {
  const game = gameWithMotion(() => WATER_MOTION);
  const bullet = new Bullet(game, 0, 0, 0, { speed: 4, radius: 1, lifetime: 999, sound: null });

  let frames = 0;
  while (bullet.alive && frames < 500) { bullet.update(); frames++; }

  assert.equal(bullet.alive, false, 'should have despawned from deceleration, not run out the clock');
  assert.ok(frames <= 40, `disappeared too slowly (${frames} frames), should vanish quickly once slow`);
  assert.ok(Math.hypot(bullet.vx, bullet.vy) < BULLET_WATER_MIN_SPEED + 1e-9);
});

test('bullet leaves a white trail while travelling through water', () => {
  const game = gameWithMotion(() => WATER_MOTION);
  const bullet = new Bullet(game, 0, 0, 0, { speed: 4, radius: 1, lifetime: 999, sound: null });

  for (let i = 0; i < 10; i++) bullet.update();

  assert.ok(game.particles.length > 0, 'no trail particles were spawned in water');
  assert.ok(game.particles.every((p) => p instanceof TrailParticle));
});

test('bullet does not leave a trail while travelling through air', () => {
  const game = gameWithMotion(() => LAND_MOTION);
  const bullet = new Bullet(game, 0, 0, 0, { speed: 4, radius: 1, lifetime: 999, sound: null });

  for (let i = 0; i < 10; i++) bullet.update();

  assert.equal(game.particles.length, 0, 'trail should only appear in water');
});
