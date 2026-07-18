import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODE_ORDER, cycleMode } from '../src/js/utils/modes.js';

test('mode table values', () => {
  assert.equal(MODES.normal.gameSpeed, 0.8);
  assert.equal(MODES.normal.timeBonusDecay, 40);
  assert.equal(MODES.newtype.gameSpeed, 1.0);
  assert.equal(MODES.newtype.timeBonusDecay, 50);
});

test('default order starts at normal', () => {
  assert.deepEqual(MODE_ORDER, ['normal', 'newtype']);
});

test('cycleMode wraps both directions', () => {
  assert.equal(cycleMode('normal', +1), 'newtype');
  assert.equal(cycleMode('newtype', +1), 'normal');
  assert.equal(cycleMode('normal', -1), 'newtype');
  assert.equal(cycleMode('newtype', -1), 'normal');
});
