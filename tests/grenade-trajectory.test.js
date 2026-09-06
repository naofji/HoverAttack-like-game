// ============================================
// グレネード弾道プレビューの環境係数・バリア連動テスト
// ============================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import {
  TILE_SIZE,
  WATER_SPEED_SCALE, WATER_GRAVITY_SCALE,
  GRENADE_LIFETIME,
} from '../src/js/utils/Constants.js';

function makeTestGame({ env = null, barriers = [] } = {}) {
  const map = {
    width: 200 * TILE_SIZE,
    height: 50 * TILE_SIZE,
    isSolidAtPixel: (px, py) => {
      // y >= 30 * TILE_SIZE を床とする
      return py >= 30 * TILE_SIZE;
    },
    pixelToTile: (px, py) => ({ r: Math.floor(py / TILE_SIZE), c: Math.floor(px / TILE_SIZE) }),
    destroyArea: () => 0,
  };
  const g = {
    map,
    env,
    barriers,
    particles: [],
    enemies: [],
    spawnExplosion() {},
  };
  return Object.assign(g, CombatActions);
}

const WATER_ENV = {
  motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }),
  sightScale: 1,
};

test('陸上（通常環境）で Grenade 実体と _calcGrenadeTrajectory の軌道が一致する', () => {
  const game = makeTestGame();
  const startX = 100;
  const startY = 100;
  const angle = 0.5;
  const speed = 5;

  const trajectory = game._calcGrenadeTrajectory(startX, startY, angle, speed);

  // Grenade 実体を1フレームずつ動かして 3フレームおきの座標を記録
  const g = new Grenade(game, startX, startY, angle, speed);
  const actualPoints = [];
  for (let i = 0; i < GRENADE_LIFETIME; i++) {
    g.update();
    if (i % 3 === 0) {
      actualPoints.push({ x: g.x, y: g.y });
    }
  }

  // points の個数と各点の座標が一致するか
  assert.equal(trajectory.points.length, actualPoints.length);
  for (let i = 0; i < trajectory.points.length; i++) {
    assert.ok(Math.abs(trajectory.points[i].x - actualPoints[i].x) < 1e-4, `point[${i}].x mismatch`);
    assert.ok(Math.abs(trajectory.points[i].y - actualPoints[i].y) < 1e-4, `point[${i}].y mismatch`);
  }
});

test('水中環境で _calcGrenadeTrajectory が水中の抵抗・浮力を反映し、Grenade 実体と一致する', () => {
  const game = makeTestGame({ env: WATER_ENV });
  const startX = 100;
  const startY = 100;
  const angle = 0.5;
  const speed = 5;

  const trajectory = game._calcGrenadeTrajectory(startX, startY, angle, speed);

  // Grenade 実体を水中で動かして記録
  const g = new Grenade(game, startX, startY, angle, speed);
  const actualPoints = [];
  for (let i = 0; i < GRENADE_LIFETIME; i++) {
    g.update();
    if (i % 3 === 0) {
      actualPoints.push({ x: g.x, y: g.y });
    }
  }

  // 陸上（speed=1, gravity=1）と水中（speed=0.5, gravity=0.25）では到達地点が大きく異なるはず
  const landTraj = makeTestGame()._calcGrenadeTrajectory(startX, startY, angle, speed);
  assert.ok(trajectory.landX < landTraj.landX, '水中で減速されていない（陸上と同じ飛距離になっている）');

  // 水中実体とプレビューが完全に一致するか
  assert.equal(trajectory.points.length, actualPoints.length);
  for (let i = 0; i < trajectory.points.length; i++) {
    assert.ok(Math.abs(trajectory.points[i].x - actualPoints[i].x) < 1e-4, `water point[${i}].x mismatch at ${i}`);
    assert.ok(Math.abs(trajectory.points[i].y - actualPoints[i].y) < 1e-4, `water point[${i}].y mismatch at ${i}`);
  }
});

test('バリアがある場合、バリアに当たった位置で軌道計算が終了する', () => {
  const barrierRect = { x: 150, y: 50, width: 8, height: 400 };
  const barriers = [{ active: true, fieldRect: barrierRect }];
  const game = makeTestGame({ barriers });

  const startX = 100;
  const startY = 100;
  const angle = 0; // 真右
  const speed = 5;

  const traj = game._calcGrenadeTrajectory(startX, startY, angle, speed);
  assert.ok(traj.landX >= barrierRect.x && traj.landX <= barrierRect.x + barrierRect.width + 10,
    `バリアで止まっていない (landX=${traj.landX})`);
  assert.ok(traj.points.length < 30, `バリア通過後も点が記録され続けている (length=${traj.points.length})`);
});
