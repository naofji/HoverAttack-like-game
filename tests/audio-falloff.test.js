import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceVolume, loudestHoverVolume } from '../src/js/utils/audioFalloff.js';
import { ENEMY_HOVER_AUDIBLE_RANGE } from '../src/js/utils/Constants.js';

const R = ENEMY_HOVER_AUDIBLE_RANGE;

test('距離0で最大、可聴範囲の外で無音', () => {
  assert.equal(distanceVolume(0, R), 1);
  assert.equal(distanceVolume(R, R), 0);
  assert.equal(distanceVolume(R * 2, R), 0);
});

test('距離が伸びるほど単調に小さくなる', () => {
  let prev = Infinity;
  for (let d = 0; d <= R; d += R / 20) {
    const v = distanceVolume(d, R);
    assert.ok(v <= prev, `${d}px で大きくなった: ${prev} -> ${v}`);
    prev = v;
  }
});

test('近いほど急に大きくなる（線形ではない）', () => {
  // 線形なら中間距離でちょうど 0.5 になる。実際の音の減衰は近距離ほど効くので、
  // 中間では 0.5 より小さくなってほしい
  assert.ok(distanceVolume(R / 2, R) < 0.5,
    `中間距離で線形と同じ: ${distanceVolume(R / 2, R)}`);
});

test('負の距離でも壊れない', () => {
  assert.equal(distanceVolume(-10, R), 1);
});

// --- 複数の敵から1つの音量を決める ---

const hovering = (x, y) => ({ x, y, width: 16, height: 24, alive: true, hovering: true });

test('ホバーしている敵がいなければ無音', () => {
  const enemies = [{ ...hovering(0, 0), hovering: false }];
  assert.equal(loudestHoverVolume(enemies, 0, 0, R), 0);
});

test('死んだ敵は数えない', () => {
  const enemies = [{ ...hovering(0, 0), alive: false }];
  assert.equal(loudestHoverVolume(enemies, 0, 0, R), 0);
});

test('いちばん近い敵の音量になる（合計ではない）', () => {
  const near = hovering(50, 0);
  const far = hovering(R - 10, 0);
  const both = loudestHoverVolume([far, near], 8, 12, R);
  const onlyNear = loudestHoverVolume([near], 8, 12, R);
  assert.ok(Math.abs(both - onlyNear) < 1e-9,
    `合計されている: 2体 ${both} / 近い1体 ${onlyNear}`);
});

test('敵が増えても音量が1を超えない', () => {
  const many = Array.from({ length: 20 }, (_, i) => hovering(i * 2, 0));
  assert.ok(loudestHoverVolume(many, 0, 0, R) <= 1);
});

test('遠ざかると小さくなる', () => {
  const near = loudestHoverVolume([hovering(100, 0)], 0, 0, R);
  const far = loudestHoverVolume([hovering(400, 0)], 0, 0, R);
  assert.ok(far < near, `遠いほうが大きい: 近 ${near} / 遠 ${far}`);
});

test('敵の中心で距離を測る（左上ではない）', () => {
  // 幅16・高さ24 の敵。中心は (x+8, y+12)
  const e = hovering(100, 100);
  const atCenter = loudestHoverVolume([e], 108, 112, R);
  assert.equal(atCenter, 1, '中心にいるのに最大音量でない');
});

test('敵の配列が無くても壊れない', () => {
  assert.equal(loudestHoverVolume(null, 0, 0, R), 0);
  assert.equal(loudestHoverVolume([], 0, 0, R), 0);
});
