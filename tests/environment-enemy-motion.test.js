// 敵機・母艦の物理（重力・位置更新）が環境の係数を掛けて動くことを縛る。
// Player.js（タスク4）と同じ形: motionFor() を中心座標で引き、
// vy += GRAVITY * motion.gravity / x,y += v * motion.speed。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, GRAVITY, WATER_GRAVITY_SCALE, WATER_SPEED_SCALE } from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }), sightScale: 1 };

function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  game.input = { isKeyDown: () => false, isKeyPressed: () => false };
  return game;
}

test('tank falls with scaled gravity and scaled displacement', () => {
  const game = world();
  const t = new EnemyTank(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  t.fireInterval = 1e9;
  const y0 = t.y;
  t.update();
  assert.equal(t.vy, GRAVITY * WATER_GRAVITY_SCALE);
  assert.ok(Math.abs((t.y - y0) - t.vy * WATER_SPEED_SCALE) < 1e-9);
});

test('attacker falls with scaled gravity', () => {
  const game = world();
  const a = makeAttacker(game, 5 * TILE_SIZE, 2 * TILE_SIZE, 'standard');
  a.update();
  assert.equal(a.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

test('carrier falls with scaled gravity', () => {
  const game = world();
  const c = new Carrier(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  game.carrier = c;
  c.update();
  assert.equal(c.vy, GRAVITY * WATER_GRAVITY_SCALE);
});
