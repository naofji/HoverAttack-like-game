import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Landmine } from '../src/js/entities/Landmine.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import {
  LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX,
  GRENADE_KNOCKBACK_VY, GRENADE_KNOCKBACK_VX,
  MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX,
} from '../src/js/utils/Constants.js';

function makeGame(overrides = {}) {
  return {
    spawnExplosion() {},
    addScore() {},
    player: null,
    carrier: null,
    enemies: [],
    landmines: [],
    map: { pixelToTile: () => ({ r: 0, c: 0 }), destroyArea: () => [] },
    ...overrides,
  };
}

function makePlayer(x, y) {
  return {
    x, y, width: 16, height: 20, alive: true,
    docked: false, invincibleTimer: 0,
    vx: 0, vy: 0,
    takeDamage() {},
  };
}

test('landmine knocks the player up and away from the blast', () => {
  const game = makeGame();
  const player = makePlayer(20, 0);
  game.player = player;
  const mine = new Landmine(game, 0, 0);
  mine.detonate();
  assert.equal(player.vy, LANDMINE_KNOCKBACK_VY);
  assert.equal(player.vx, LANDMINE_KNOCKBACK_VX);
});

test('enemy grenade knocks the player back, less than a landmine', () => {
  const game = makeGame();
  const player = makePlayer(20, 0);
  game.player = player;
  const grenade = new Grenade(game, 0, 0, 0);
  grenade.isPlayerOwned = false;
  grenade._explode();
  assert.equal(player.vy, GRENADE_KNOCKBACK_VY);
  assert.equal(player.vx, GRENADE_KNOCKBACK_VX);
  assert.ok(Math.abs(GRENADE_KNOCKBACK_VY) < Math.abs(LANDMINE_KNOCKBACK_VY));
  assert.ok(Math.abs(GRENADE_KNOCKBACK_VX) < Math.abs(LANDMINE_KNOCKBACK_VX));
});

test('enemy missile hit knocks the player back, less than a grenade', () => {
  const game = makeGame();
  const player = makePlayer(20, 20);
  game.player = player;
  const cm = new CollisionManager(game);
  const proj = { x: 25, y: 25, isRival: false, alive: true };
  cm._enemyMissileVsTargets(proj);
  assert.equal(player.vy, MISSILE_HIT_KNOCKBACK_VY);
  assert.equal(player.vx, MISSILE_HIT_KNOCKBACK_VX);
  assert.ok(Math.abs(MISSILE_HIT_KNOCKBACK_VY) < Math.abs(GRENADE_KNOCKBACK_VY));
  assert.ok(Math.abs(MISSILE_HIT_KNOCKBACK_VX) < Math.abs(GRENADE_KNOCKBACK_VX));
});

test('player machine-gun bullets never apply knockback to enemies', () => {
  const game = makeGame();
  const enemy = { x: 20, y: 20, width: 16, height: 20, alive: true, isBase: false, vx: 0, vy: 0, takeDamage() {} };
  game.enemies = [enemy];
  const cm = new CollisionManager(game);
  const proj = { x: 25, y: 25, alive: true };
  cm._playerBulletVsEnemies(proj);
  assert.equal(enemy.vx, 0);
  assert.equal(enemy.vy, 0);
});
