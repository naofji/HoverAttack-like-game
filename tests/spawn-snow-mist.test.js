// spawnSnowMist の飛び方（実機の指摘: スラスターの風は上から受けるので、
// 平地では真上には吹き上がらず横に拡散する。斜面では斜辺に沿って舞う）。
//
// 角度は「右=0度、上=+90度」の独自基準（vx=cos, vy=-sin。キャンバスは下が正）。
// 平地: 0〜45度・135〜180度（水平から上へ最大45度、真上は含まない）
// 斜面: 0〜-45度・180〜225度（水平から下へ最大45度、斜辺に沿って舞い落ちる）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SnowMistParticle } from '../src/js/entities/Particle.js';

function game() {
  return { particles: [] };
}

test('平地(onSlope=false)では上方向(真上)に吹き上がらない', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, false);
  for (const p of g.particles) {
    assert.ok(p instanceof SnowMistParticle);
    // 真上(-90度)寄りにならない: |vx| はある程度残る（水平成分がゼロに近づかない）
    assert.ok(Math.abs(p.vx) > 1e-6, `真上に近すぎる: vx=${p.vx} vy=${p.vy}`);
  }
});

test('平地では下方向へは飛ばない（地面に潜らない）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, false);
  for (const p of g.particles) assert.ok(p.vy <= 1e-9, `下向きに出ている: vy=${p.vy}`);
});

test('平地では横から45度以上は傾かない（水平寄り）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, false);
  for (const p of g.particles) {
    const tilt = Math.abs(Math.atan2(-p.vy, Math.abs(p.vx))); // 水平からの傾き
    assert.ok(tilt <= Math.PI / 4 + 1e-9, `45度を超えて傾いている: ${(tilt * 180 / Math.PI).toFixed(1)}度`);
  }
});

test('斜面(onSlope=true)では上方向へは飛ばない（斜辺沿いに下へ舞う）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, true);
  for (const p of g.particles) assert.ok(p.vy >= -1e-9, `上向きに出ている: vy=${p.vy}`);
});

test('斜面でも横から45度以上は傾かない', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, true);
  for (const p of g.particles) {
    const tilt = Math.abs(Math.atan2(p.vy, Math.abs(p.vx)));
    assert.ok(tilt <= Math.PI / 4 + 1e-9, `45度を超えて傾いている: ${(tilt * 180 / Math.PI).toFixed(1)}度`);
  }
});

test('速さは以前より控えめ（実機の指摘: 勢いよすぎた）', () => {
  const g = game();
  for (let i = 0; i < 200; i++) SpawnEffects.spawnSnowMist.call(g, 0, 0, 1, false);
  for (const p of g.particles) {
    const speed = Math.hypot(p.vx, p.vy);
    assert.ok(speed <= 1.6, `速すぎる: ${speed}`);
  }
});
