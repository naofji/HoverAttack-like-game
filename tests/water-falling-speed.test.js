// ============================================
// 水中での最大落下速度（WATER_FALL_SPEED_SCALE）テスト
// ============================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import {
  TILE_SIZE,
  PLAYER_MAX_FALLING_SPEED,
  GRENADE_MAX_FALLING_SPEED,
  WATER_FALL_SPEED_SCALE,
  WATER_SPEED_SCALE,
  WATER_GRAVITY_SCALE,
  GRENADE_LIFETIME,
} from '../src/js/utils/Constants.js';

const WATER_ENV = {
  motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }),
  sightScale: 1,
};

function makeTestGame({ env = null } = {}) {
  const map = {
    width: 200 * TILE_SIZE,
    height: 50 * TILE_SIZE,
    isSolidAtPixel: () => false,
    pixelToTile: (px, py) => ({ r: Math.floor(py / TILE_SIZE), c: Math.floor(px / TILE_SIZE) }),
    destroyArea: () => 0,
  };
  const g = {
    map,
    env,
    particles: [],
    enemies: [],
    spawnExplosion() {},
    input: {
      isKeyDown: () => false,
      isKeyPressed: () => false,
      mouse: { x: 0, y: 0, left: false },
      getTargetWorld: () => ({ x: 0, y: 0 }),
    },
  };
  return Object.assign(g, CombatActions);
}

test('自機（Player）: 水中では落下速度上限が PLAYER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE にクランプされる', () => {
  const game = makeTestGame({ env: WATER_ENV });
  const player = new Player(game, 100, 100);
  player.docked = false;
  player.hovering = false;
  player.onGround = false;

  // 空中で加速した大きな速度で水中に突入したケース
  player.vy = PLAYER_MAX_FALLING_SPEED; // 7.0
  player.update();

  const expectedCap = PLAYER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE;
  assert.ok(player.vy <= expectedCap + 1e-6,
    `自機の水中落下速度が上限 (${expectedCap}) を超えている: vy=${player.vy}`);
  assert.ok(Math.abs(player.vy - expectedCap) < 1e-4,
    `自機の水中落下速度が上限 (${expectedCap}) にクランプされていない: vy=${player.vy}`);
});

test('グレネード（Grenade）: 水中では落下速度上限が GRENADE_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE にクランプされる', () => {
  const game = makeTestGame({ env: WATER_ENV });
  // 真下に向かって高初速で発射
  const g = new Grenade(game, 100, 100, Math.PI / 2, 10);
  g.update();

  const expectedCap = GRENADE_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE;
  assert.ok(g.vy <= expectedCap + 1e-6,
    `グレネードの水中落下速度が上限 (${expectedCap}) を超えている: vy=${g.vy}`);
  assert.ok(Math.abs(g.vy - expectedCap) < 1e-4,
    `グレネードの水中落下速度が上限 (${expectedCap}) にクランプされていない: vy=${g.vy}`);
});

test('グレネード弾道プレビュー（_calcGrenadeTrajectory）も水中の新上限を反映し、Grenade 実体と一致する', () => {
  const game = makeTestGame({ env: WATER_ENV });
  const startX = 100;
  const startY = 100;
  const angle = 0.5;
  const speed = 5;

  const trajectory = game._calcGrenadeTrajectory(startX, startY, angle, speed);
  const g = new Grenade(game, startX, startY, angle, speed);

  const actualPoints = [];
  for (let i = 0; i < GRENADE_LIFETIME; i++) {
    g.update();
    if (i % 3 === 0) {
      actualPoints.push({ x: g.x, y: g.y });
    }
  }

  assert.equal(trajectory.points.length, actualPoints.length);
  for (let i = 0; i < trajectory.points.length; i++) {
    assert.ok(Math.abs(trajectory.points[i].x - actualPoints[i].x) < 1e-4, `point[${i}].x mismatch`);
    assert.ok(Math.abs(trajectory.points[i].y - actualPoints[i].y) < 1e-4, `point[${i}].y mismatch`);
  }
});
