import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT, DEBRIS_SUBDIVIDE } from '../src/js/utils/Constants.js';

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

test('パーツが基本的な形を満たす（座標と draw() の一致は debris-static-parts-match-draw.test.js で検証）', () => {
  const spec = DEBRIS_SPECS.carrier;
  assert.ok(spec.parts.length >= 6, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const p of spec.parts) {
    assert.ok(p.w > 0 && p.h > 0);
  }
});

test('船体が左右2片に割れる', () => {
  const hulls = DEBRIS_SPECS.carrier.parts.filter((p) => p.color === '#1a3a6a');
  assert.equal(hulls.length, 2, '下部船体が2片になっていない');
  assert.notEqual(hulls[0].x, hulls[1].x, '2片が同じ位置にある');
});

test('左右の船体片は反対方向へ飛ぶ', () => {
  const carrier = makeCarrier();
  const debris = buildDebris(carrier, 'carrier');
  // 下部船体は左右2パーツ。各パーツはさらに 2x2 に割れるので、
  // 船体色の破片は 2 * DEBRIS_SUBDIVIDE^2 個になる。
  const hulls = debris.filter((d) => d.color === '#1a3a6a');
  assert.equal(hulls.length, 2 * DEBRIS_SUBDIVIDE * DEBRIS_SUBDIVIDE);

  const midX = carrier.x + carrier.width / 2;
  const meanVx = (group) => group.reduce((a, d) => a + d.vx, 0) / group.length;
  const left = hulls.filter((d) => d.x < midX);
  const right = hulls.filter((d) => d.x >= midX);
  assert.equal(left.length, right.length, '左右に均等に割れていない');
  assert.ok(meanVx(left) < meanVx(right),
    `左右へ割れていない: ${meanVx(left)} vs ${meanVx(right)}`);
});
