import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Missile } from '../src/js/entities/Missile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, MISSILE_SPEED, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, GRENADE_GRAVITY } from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }), sightScale: 1 };

test('missile advances by speed * WATER_SPEED_SCALE in water', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  const m = new Missile(game, 5 * TILE_SIZE, 5 * TILE_SIZE, 0, true);
  const x0 = m.x;
  m.update();
  assert.ok(Math.abs((m.x - x0) - MISSILE_SPEED * WATER_SPEED_SCALE) < 1e-9);
});

test('grenade gravity and displacement are scaled in water', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  const g = new Grenade(game, 5 * TILE_SIZE, 5 * TILE_SIZE, 0, 0);
  const y0 = g.y;
  g.update();
  assert.ok(Math.abs(g.vy - GRENADE_GRAVITY * WATER_GRAVITY_SCALE) < 1e-9);
  assert.ok(Math.abs((g.y - y0) - g.vy * WATER_SPEED_SCALE) < 1e-9);
});
