import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplosion } from '../src/js/entities/Particle.js';

test('既定では従来どおり灰色のデブリ粒子が混ざりうる', () => {
  let sawGrey = false;
  for (let i = 0; i < 40 && !sawGrey; i++) {
    sawGrey = createExplosion(0, 0, 60).some((p) => p.color === '#888888');
  }
  assert.ok(sawGrey, '灰色のデブリ粒子が一度も出ない');
});

test('debrisSmoke:false なら灰色のデブリ粒子を混ぜない', () => {
  for (let i = 0; i < 40; i++) {
    const parts = createExplosion(0, 0, 60, { debrisSmoke: false });
    assert.ok(!parts.some((p) => p.color === '#888888'), '灰色の粒子が混ざった');
  }
});

test('opts を渡してもパーティクル数は変わらない', () => {
  const a = createExplosion(0, 0, 30).length;
  const b = createExplosion(0, 0, 30, { debrisSmoke: false }).length;
  assert.equal(a, b);
});
