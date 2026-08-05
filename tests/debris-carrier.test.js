import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

function makeCarrier() {
  return {
    x: 500, y: 300, width: CARRIER_WIDTH, height: CARRIER_HEIGHT,
    vx: 0, vy: 0, facingRight: true,
  };
}

test('carrier スペックは大物らしいタメを持つ', () => {
  const spec = DEBRIS_SPECS.carrier;
  assert.ok(spec);
  assert.ok(spec.holdFrames >= 5, `タメが短い: ${spec.holdFrames}`);
});

test('パーツが機体枠に概ね収まる', () => {
  const spec = DEBRIS_SPECS.carrier;
  assert.ok(spec.parts.length >= 6, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const p of spec.parts) {
    assert.ok(p.x >= -CARRIER_WIDTH && p.x <= CARRIER_WIDTH * 2, `x=${p.x}`);
    assert.ok(p.y >= -CARRIER_HEIGHT && p.y <= CARRIER_HEIGHT * 2, `y=${p.y}`);
    assert.ok(p.w > 0 && p.h > 0);
  }
});

test('船体が左右2片に割れる', () => {
  const hulls = DEBRIS_SPECS.carrier.parts.filter((p) => p.color === '#1a3a6a');
  assert.equal(hulls.length, 2, '下部船体が2片になっていない');
  assert.notEqual(hulls[0].x, hulls[1].x, '2片が同じ位置にある');
});

test('左右の船体片は反対方向へ飛ぶ', () => {
  const debris = buildDebris(makeCarrier(), 'carrier');
  const hulls = debris.filter((d) => d.color === '#1a3a6a');
  assert.equal(hulls.length, 2);
  const [left, right] = hulls[0].x < hulls[1].x ? hulls : [hulls[1], hulls[0]];
  assert.ok(left.vx < right.vx, `左右へ割れていない: ${left.vx} vs ${right.vx}`);
});
