// 周回シールドの配線。EnemyBase 側の判定が正しくても、被弾点のXが
// 渡っていなければ何も起きない。実際の CollisionManager / Grenade を通して確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { Missile } from '../src/js/entities/Missile.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import {
  ENEMY_BASE_HP, BASE_ORBIT_SHIELD_MISSION, BASE_ORBIT_SHIELD_DEPLOY,
} from '../src/js/utils/Constants.js';

/** audioManager.playWeapon の呼び出しキーだけを記録する。 */
function spyWeaponSounds() {
  const original = audioManager.playWeapon;
  const keys = [];
  audioManager.playWeapon = (key) => keys.push(key);
  return { keys, restore() { audioManager.playWeapon = original; } };
}

function makeGame() {
  return {
    missionsCompleted: BASE_ORBIT_SHIELD_MISSION,
    score: 0,
    enemies: [],
    projectiles: [],
    enemyBullets: [],
    particles: [],
    player: null,
    carrier: null,
    camera: null,
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    map: {
      width: 4000, height: 2000,
      isSolidAtPixel: () => false,
      pixelToTile: () => ({ r: 0, c: 0 }),
      destroyArea: () => [],
    },
    spawnSparks: () => { },
    spawnExplosion: () => { },
    spawnDebris: () => { },
    addScore(n) { this.score += n; },
    triggerBaseEmergencyAlert() { this.baseEmergencyAlert = true; },
  };
}

/** リングが割れ、展開も終わった 6面の基地。位相は呼び出し側で決める。 */
function makeExposedBase(game, phase) {
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  base.orbitDeployTimer = BASE_ORBIT_SHIELD_DEPLOY;
  base.orbitPhase = phase;
  game.enemies.push(base);
  return base;
}

const CORE_X = 112; // 100 + ENEMY_BASE_WIDTH/2
const CORE_Y = 116; // 100 + ENEMY_BASE_HEIGHT/2
const GUARDING = Math.PI / 2; // 羽根が左右の端
const OPEN = 0;               // 羽根が正面と真裏

test('ガード中の基地に当たったプレイヤーミサイルはコアを削れない', () => {
  const game = makeGame();
  const base = makeExposedBase(game, GUARDING);
  const missile = new Missile(game, CORE_X + 2, CORE_Y, Math.PI); // 右から来て命中
  game.projectiles.push(missile);

  new CollisionManager(game).update();

  assert.equal(base.hp, ENEMY_BASE_HP, 'ガードを抜けてコアが削れた');
  assert.equal(base.alive, true);
});

test('羽根が開いていればプレイヤーミサイルはコアに届く', () => {
  const game = makeGame();
  const base = makeExposedBase(game, OPEN);
  game.projectiles.push(new Missile(game, CORE_X + 2, CORE_Y, Math.PI));

  new CollisionManager(game).update();

  assert.equal(base.hp, ENEMY_BASE_HP - 1, '開いているのにコアに届かない');
});

test('ガード中の基地で炸裂したグレネードはコアを削れない', () => {
  const game = makeGame();
  const base = makeExposedBase(game, GUARDING);
  const grenade = new Grenade(game, CORE_X + 6, CORE_Y, 0);

  grenade._explode();

  assert.equal(base.hp, ENEMY_BASE_HP, 'グレネードがガードを抜けた');
});

test('羽根が開いていればグレネードはコアに届く', () => {
  const game = makeGame();
  const base = makeExposedBase(game, OPEN);
  new Grenade(game, CORE_X + 6, CORE_Y, 0)._explode();

  assert.equal(base.hp, ENEMY_BASE_HP - 1);
});

test('ガード中に当たったマシンガン弾は跳弾音になる', () => {
  const game = makeGame();
  makeExposedBase(game, GUARDING);
  game.projectiles.push(new PlayerBullet(game, CORE_X + 2, CORE_Y, Math.PI));

  const spy = spyWeaponSounds();
  try {
    new CollisionManager(game).update();
  } finally {
    spy.restore();
  }
  assert.ok(spy.keys.includes('shieldDeflect'), `跳弾音が鳴っていない: ${spy.keys.join(',')}`);
});

test('マシンガンはガード中でも基地を削らない（従来どおり無効）', () => {
  const game = makeGame();
  const base = makeExposedBase(game, OPEN);
  base.shields = 3;
  game.projectiles.push(new PlayerBullet(game, CORE_X + 2, CORE_Y, Math.PI));

  new CollisionManager(game).update();

  assert.equal(base.shields, 3, 'MG で基地が削れてしまった');
});
