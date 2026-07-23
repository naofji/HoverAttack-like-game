import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKnockback } from '../src/js/utils/Knockback.js';

test('pushes entity upward and to the right when the blast is on the left', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, 5, -6, 3);
  assert.equal(e.vy, -6);
  assert.equal(e.vx, 3);
});

test('pushes entity to the left when the blast is on the right', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, -5, -6, 3);
  assert.equal(e.vx, -3);
});

test('dx=0 defaults to pushing left (matches prior landmine behaviour)', () => {
  const e = { vx: 0, vy: 0 };
  applyKnockback(e, 0, -6, 3);
  assert.equal(e.vx, -3);
});

test('entities without vx/vy (e.g. static targets) are left untouched', () => {
  const e = {};
  applyKnockback(e, 5, -6, 3);
  assert.equal(e.vx, undefined);
  assert.equal(e.vy, undefined);
});
