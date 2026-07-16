import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerpColor } from '../src/js/utils/color.js';

test('lerpColor returns endpoints at t=0 and t=1', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpColor('#000000', '#ffffff', 1), '#ffffff');
});

test('lerpColor interpolates the midpoint', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0.5), '#808080'); // round(127.5)=128=0x80
});

test('lerpColor clamps t outside [0,1]', () => {
  assert.equal(lerpColor('#102030', '#a0b0c0', -1), '#102030');
  assert.equal(lerpColor('#102030', '#a0b0c0', 2), '#a0b0c0');
});

test('lerpColor handles uppercase and per-channel interpolation', () => {
  // R:0x00->0x10 at .5 = 0x08, G:0x00->0x20 = 0x10, B:0x00->0x40 = 0x20
  assert.equal(lerpColor('#000000', '#102040', 0.5), '#081020');
});
