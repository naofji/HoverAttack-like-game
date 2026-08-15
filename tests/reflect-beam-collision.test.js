import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { REFLECT_BEAM_DAMAGE } from '../src/js/utils/Constants.js';

const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

/** 自機の代わり。takeDamage を記録するだけ。 */
function makeTarget(x, y) {
  return {
    x, y, width: 16, height: 16, alive: true, docked: false, invincibleTimer: 0,
    damage: 0,
    takeDamage(d) { this.damage += d; },
  };
}

function makeGame(beamStart, target) {
  const map = makeMap(ROOM);
  const game = {
    map, particles: [], enemies: [], projectiles: [], enemyBullets: [],
    player: target, carrier: null,
    addScore() {}, spawnSparks() {}, spawnExplosion() {},
  };
  game.enemyBullets.push(new ReflectBeam(game, beamStart.x, beamStart.y, beamStart.angle));
  return game;
}

// 斜め角度で撃って壁で跳ねさせる。帯（節を積み上げたもの・タスク2で
// beamSegments() の固定長切り出しから節モデルへ変更）は先端から遡って
// REFLECT_BEAM_SEGMENT_LIFE 分＝64px（速度4）ぶんしか残らないので、旧実装
// （帯160px）のときに使っていた座標(230,62)はもう帯が届かず外れてしまう
// （実際に試して確認した：80フレーム回しても damage は 0 のまま）。
// BAND_ONLY_TARGET は2本目の脚の上にシミュレーションで座標を取り直した。
// frame27 で当たることを確認済み（速度は実機調整で 5→4 に戻っており、
// フレーム数はその時点の速度4での実測値）
const BEAM_START = { x: 40, y: 30, angle: 0.6 };
const BAND_ONLY_TARGET = { x: 122, y: 22 };
const FAR_TARGET = { x: 10, y: 60 };

test('帯の途中に触れただけで当たる', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);

  // ビームが消えるか自機に当たるまで進める（跳ね返って27フレーム目に帯が触れる）
  for (let i = 0; i < 80 && target.damage === 0 && game.enemyBullets.length > 0; i++) {
    cm._updateEnemyBullets();
  }

  assert.ok(target.damage > 0, '帯が触れているのに当たっていない');
  assert.equal(target.damage, REFLECT_BEAM_DAMAGE, 'ダメージ量が違う');
});

test('離れていれば当たらない', () => {
  const target = makeTarget(FAR_TARGET.x, FAR_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && game.enemyBullets.length > 0; i++) cm._updateEnemyBullets();
  assert.equal(target.damage, 0, '離れているのに当たっている');
});

test('当たったビームは消える', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && target.damage === 0 && game.enemyBullets.length > 0; i++) {
    cm._updateEnemyBullets();
  }
  assert.equal(game.enemyBullets.length, 0, 'ビームが残っている');
});

test('ドッキング中の自機には当たらない', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  target.docked = true;
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && game.enemyBullets.length > 0; i++) cm._updateEnemyBullets();
  assert.equal(target.damage, 0);
});
