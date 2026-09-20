// spawnWaterMist の飛び方。spawnSnowMist の平地(onSlope=false)ケースと同じ角度分布
// （水面は常に水平なので斜面の場合分けは無い）。真上には吹き上がらず、水平から
// 最大45度で左右に拡散する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { WaterMistParticle } from '../src/js/entities/Particle.js';

function game() {
  return { particles: [] };
}

test('真上(-90度)寄りにならない', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnWaterMist.call(g, 0, 0, 1);
  for (const p of g.particles) {
    assert.ok(p instanceof WaterMistParticle);
    assert.ok(Math.abs(p.vx) > 1e-6, `真上に近すぎる: vx=${p.vx} vy=${p.vy}`);
  }
});

test('下方向へは飛ばない（水面に潜らない）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnWaterMist.call(g, 0, 0, 1);
  for (const p of g.particles) assert.ok(p.vy <= 1e-9, `下向きに出ている: vy=${p.vy}`);
});

test('横から45度以上は傾かない（水平寄り）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnWaterMist.call(g, 0, 0, 1);
  for (const p of g.particles) {
    const tilt = Math.abs(Math.atan2(-p.vy, Math.abs(p.vx)));
    assert.ok(tilt <= Math.PI / 4 + 1e-9, `45度を超えて傾いている: ${(tilt * 180 / Math.PI).toFixed(1)}度`);
  }
});

test('count 個ぶんの粒を生成する', () => {
  const g = game();
  SpawnEffects.spawnWaterMist.call(g, 0, 0, 12);
  assert.equal(g.particles.length, 12);
});
