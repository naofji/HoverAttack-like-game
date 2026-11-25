// CollisionManager は敵の弾の種類を判別フラグ（isCruiseMissile / isHomingMissile）で見分ける（2026-11-26。
// 以前は constructor.name の文字列だった。isBurstShell・isBaseLaser と同じ作法にそろえた）。
// 偽物のテスト（cruise-missile-score など）はフラグを自分で立てるので、**本物のクラスがフラグを持つこと**は
// ここで見る。本物を当たり・迎撃の処理へ通し、種類ごとの結果（ダメージ・得点）になることを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import {
  CRUISE_MISSILE_DAMAGE, ENEMY_HOMING_MISSILE_DAMAGE, ENEMY_BULLET_DAMAGE,
  CRUISE_MISSILE_SCORE, HOMING_INTERCEPT_SCORE,
} from '../src/js/utils/Constants.js';

function makeGame() {
  const scores = [];
  const game = {
    particles: [], enemies: [], landmines: [], projectiles: [], enemyBullets: [], smokeScreens: [],
    player: null, carrier: null, camera: null, canvas: null,
    // 巡航ミサイルの爆発は地形を壊す（pixelToTile → destroyArea）ので、その入口だけ持たせる
    map: { isSolidAtPixel: () => false, isSolidPoint: () => false, pixelToTile: (x, y) => ({ c: Math.floor(x / 16), r: Math.floor(y / 16) }), destroyArea() {}, town: null },
    addScore: (n) => scores.push(n), spawnExplosion() {}, spawnSparks() {},
  };
  return { game, scores };
}

function target() {
  return {
    x: 80, y: 80, width: 40, height: 40, vx: 0, vy: 0, alive: true, damage: [],
    takeDamage(d) { this.damage.push(d); },
  };
}

test('本物の巡航ミサイルとホーミングミサイルは判別フラグを持つ', () => {
  const { game } = makeGame();
  assert.equal(new EnemyCruiseMissile(game, 100, 100, 0).isCruiseMissile, true);
  assert.equal(new EnemyHomingMissile(game, 100, 100, 0).isHomingMissile, true);
});

test('本物の巡航ミサイルが当たると巡航ミサイルのダメージ（普通の敵弾のダメージではない）', () => {
  assert.notEqual(CRUISE_MISSILE_DAMAGE, ENEMY_BULLET_DAMAGE, '前提: 区別できる値であること');
  const { game } = makeGame();
  const t = target();
  new CollisionManager(game)._applyBulletHit(new EnemyCruiseMissile(game, 100, 100, 0), t);
  assert.deepEqual(t.damage, [CRUISE_MISSILE_DAMAGE]);
});

test('本物のホーミングミサイルが当たるとホーミングのダメージ', () => {
  assert.notEqual(ENEMY_HOMING_MISSILE_DAMAGE, ENEMY_BULLET_DAMAGE, '前提: 区別できる値であること');
  const { game } = makeGame();
  const t = target();
  new CollisionManager(game)._applyBulletHit(new EnemyHomingMissile(game, 100, 100, 0), t);
  assert.deepEqual(t.damage, [ENEMY_HOMING_MISSILE_DAMAGE]);
});

test('本物のホーミングミサイルを撃ち落とすと迎撃の得点', () => {
  const { game, scores } = makeGame();
  const homing = new EnemyHomingMissile(game, 100, 100, 0);
  game.enemyBullets.push(homing);
  const consumed = new CollisionManager(game)._checkInterception({ x: 100, y: 100, vx: 0, vy: 0, alive: true });
  assert.equal(consumed, true);
  assert.deepEqual(scores, [HOMING_INTERCEPT_SCORE]);
  assert.equal(homing.alive, false);
});

test('本物の巡航ミサイルを撃ち落とすと巡航ミサイルの得点', () => {
  const { game, scores } = makeGame();
  const cruise = new EnemyCruiseMissile(game, 100, 100, 0);
  cruise.hp = 1;
  game.enemyBullets.push(cruise);
  const consumed = new CollisionManager(game)._checkInterception({ x: 100, y: 100, vx: 0, vy: 0, alive: true });
  assert.equal(consumed, true);
  assert.deepEqual(scores, [CRUISE_MISSILE_SCORE]);
});
