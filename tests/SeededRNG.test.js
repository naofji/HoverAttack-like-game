import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

test('same seed produces identical sequence', () => {
  const a = new SeededRNG(12345);
  const b = new SeededRNG(12345);
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = new SeededRNG(1);
  const b = new SeededRNG(2);
  assert.notEqual(a.next(), b.next());
});

test('next() returns values in [0, 1)', () => {
  const rng = new SeededRNG(999);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});
