import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT, DEBRIS_SPLIT_PIECES } from '../src/js/utils/Constants.js';

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

test('左右の船体片は平均として反対方向へ飛ぶ', () => {
  // 等方な散らばりを混ぜているので、1回ごとの左右差は揺らぐ。
  // 「船が中央から裂ける」という傾向が残っているかを多数回の平均で見る。
  const meanVx = (group) => group.reduce((a, d) => a + d.vx, 0) / group.length;
  let leftTotal = 0;
  let rightTotal = 0;
  const TRIALS = 40;

  for (let i = 0; i < TRIALS; i++) {
    const carrier = makeCarrier();
    const hulls = buildDebris(carrier, 'carrier').filter((d) => d.color === '#1a3a6a');
    const midX = carrier.x + carrier.width / 2;
    leftTotal += meanVx(hulls.filter((d) => d.x < midX));
    rightTotal += meanVx(hulls.filter((d) => d.x >= midX));
  }

  assert.ok(leftTotal / TRIALS < rightTotal / TRIALS,
    `左右へ裂ける傾向が無い: 左 ${(leftTotal / TRIALS).toFixed(2)} / 右 ${(rightTotal / TRIALS).toFixed(2)}`);
});
