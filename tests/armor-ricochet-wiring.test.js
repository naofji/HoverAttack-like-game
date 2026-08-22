// 装甲軽減の配線。定数と演出が揃っていても、CollisionManager が
// mgDamageMult を読んでいなければ何も変わらない。実物を通して確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { RicochetStreak } from '../src/js/entities/Particle.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { PLAYER_MG_DAMAGE, RICOCHET_STREAK_COUNT } from '../src/js/utils/Constants.js';

/** 当たり判定だけを持つ最小の敵。mgDamageMult の有無だけが違う。 */
function makeEnemy(mgDamageMult) {
  const e = {
    x: 100, y: 100, width: 20, height: 20,
    alive: true, hp: 100,
    takeDamage(n) { this.hp -= n; },
  };
  if (mgDamageMult !== undefined) e.mgDamageMult = mgDamageMult;
  return e;
}

function makeGame(enemy) {
  return {
    enemies: [enemy], projectiles: [], enemyBullets: [], particles: [],
    player: null, carrier: null, camera: null,
    spawnSparks: () => { }, spawnExplosion: () => { }, addScore: () => { },
  };
}

function fireAt(game) {
  game.projectiles.push(new PlayerBullet(game, 110, 110, Math.PI));
  const origPlay = audioManager.playWeapon;
  const sounds = [];
  audioManager.playWeapon = (kind) => sounds.push(kind);
  try {
    new CollisionManager(game).update();
  } finally {
    audioManager.playWeapon = origPlay;
  }
  return sounds;
}

test('mgDamageMult を持つ敵は MG のダメージが軽減される', () => {
  const enemy = makeEnemy(0.5);
  fireAt(makeGame(enemy));
  assert.equal(enemy.hp, 100 - PLAYER_MG_DAMAGE * 0.5);
});

test('mgDamageMult を持たない敵は今までどおり満額のダメージを受ける', () => {
  const enemy = makeEnemy(undefined);
  fireAt(makeGame(enemy));
  assert.equal(enemy.hp, 100 - PLAYER_MG_DAMAGE);
});

test('軽減される敵に当てると跳弾の光が走る', () => {
  const game = makeGame(makeEnemy(0.5));
  fireAt(game);
  const streaks = game.particles.filter((p) => p instanceof RicochetStreak);
  assert.equal(streaks.length, RICOCHET_STREAK_COUNT);
});

test('軽減されない敵では跳弾の光は出ない（従来の着弾のまま）', () => {
  const game = makeGame(makeEnemy(undefined));
  fireAt(game);
  assert.equal(game.particles.filter((p) => p instanceof RicochetStreak).length, 0);
});
