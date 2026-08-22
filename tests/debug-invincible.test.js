// デバッグ用の無敵モード。自機と母艦がダメージを受けず、
// ミサイルとグレネードが減らなくなる。既定は OFF。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT } from '../src/js/utils/Constants.js';

function makeGame(debugInvincible = false) {
  return {
    debugInvincible,
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [],
    camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
    input: {
      mouse: { x: 0, y: 0, left: false },
      isKeyDown: () => false, isKeyPressed: () => false,
      getTargetWorld: () => ({ x: 0, y: 0 }),
      crosshairLocked: false,
    },
    spawnExplosion() { }, spawnHeavyDamage() { }, spawnSparks() { },
    spawnDebris() { }, addScore() { }, spawnSmokeScreen() { },
  };
}

test('既定では無敵モードは切れている', () => {
  const p = new Player(makeGame(), 100, 100);
  const before = p.hp;
  p.takeDamage(20);
  assert.equal(p.hp, before - 20, '無敵が既定で入ってしまっている');
});

test('無敵モードでは自機がダメージを受けない', () => {
  const p = new Player(makeGame(true), 100, 100);
  const before = p.hp;
  p.takeDamage(9999);
  assert.equal(p.hp, before);
  assert.equal(p.alive, true);
});

test('無敵モードでは母艦もダメージを受けない', () => {
  const c = new Carrier(makeGame(true), 100, 100);
  const before = c.hp;
  c.takeDamage(9999);
  assert.equal(c.hp, before);
  assert.equal(c.alive, true);
});

test('無敵モードが切れていれば母艦は今までどおり削れる', () => {
  const c = new Carrier(makeGame(), 100, 100);
  const before = c.hp;
  c.takeDamage(10);
  assert.equal(c.hp, before - 10);
});

test('無敵モードではミサイルが減らない', () => {
  const p = new Player(makeGame(true), 100, 100);
  for (let i = 0; i < 50; i++) p.consumeMissile();
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
});

test('無敵モードではグレネードが減らない', () => {
  const p = new Player(makeGame(true), 100, 100);
  for (let i = 0; i < 50; i++) p.consumeGrenade();
  assert.equal(p.grenades, GRENADE_INITIAL_COUNT);
});

test('無敵モードが切れていれば弾数は今までどおり減る', () => {
  const p = new Player(makeGame(), 100, 100);
  p.consumeMissile();
  p.consumeGrenade();
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT - 1);
  assert.equal(p.grenades, GRENADE_INITIAL_COUNT - 1);
});

test('弾数は0より下へは行かない', () => {
  const p = new Player(makeGame(), 100, 100);
  for (let i = 0; i < MISSILE_INITIAL_COUNT + 10; i++) p.consumeMissile();
  for (let i = 0; i < GRENADE_INITIAL_COUNT + 10; i++) p.consumeGrenade();
  assert.equal(p.missiles, 0);
  assert.equal(p.grenades, 0);
});

// game を持たない状況（テスト用の簡易 Player など）で落ちないこと
test('debugInvincible を持たない game でも落ちない', () => {
  const game = makeGame();
  delete game.debugInvincible;
  const p = new Player(game, 100, 100);
  p.takeDamage(5);
  p.consumeMissile();
  assert.ok(p.hp > 0);
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT - 1);
});
