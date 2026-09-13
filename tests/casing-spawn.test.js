import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { CasingParticle } from '../src/js/entities/Particle.js';

test('spawnCasing pushes exactly one CasingParticle bound to the game', () => {
  const game = { particles: [], env: { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }) } };
  SpawnEffects.spawnCasing.call(game, 10, 20, true);
  assert.equal(game.particles.length, 1);
  const casing = game.particles[0];
  assert.ok(casing instanceof CasingParticle);
  assert.equal(casing.x, 10);
  assert.equal(casing.y, 20);
  assert.equal(casing.game, game);
});

// 自機の向き基準（狙いの角度ではない）: 右向きなら左上（背中側・上）、
// 左向きなら右上へ、常に左右反転に追従して飛ぶ（実機の指摘）
test('facing right: casing ejects up and to the rear (left)', () => {
  const game = { particles: [], env: { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }) } };
  SpawnEffects.spawnCasing.call(game, 0, 0, true);
  const casing = game.particles[0];
  assert.ok(casing.vx < 0, '背中側(左)へ飛んでいない');
  assert.ok(casing.vy < 0, '上へ飛んでいない');
});

test('facing left: casing ejects up and to the rear (right), mirrored', () => {
  const game = { particles: [], env: { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }) } };
  SpawnEffects.spawnCasing.call(game, 0, 0, false);
  const casing = game.particles[0];
  assert.ok(casing.vx > 0, '背中側(右)へ飛んでいない');
  assert.ok(casing.vy < 0, '上へ飛んでいない');
});
