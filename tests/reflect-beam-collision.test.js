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

// 斜め角度で撃って壁で跳ねさせる。跳ね返った後の先端は自機からどんどん
// 離れていくが、帯（過去160pxぶんの経路）は自機の位置を横切り続ける。
// 先端の1点だけを見ていると絶対に当たらない（座標は事前にシミュレーションで
// 確認済み。61フレーム目まで先端が触れることはなく、帯だけが触れる）位置。
const BEAM_START = { x: 40, y: 30, angle: 0.6 };
const BAND_ONLY_TARGET = { x: 230, y: 62 };
const FAR_TARGET = { x: 10, y: 60 };

test('帯の途中に触れただけで当たる', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);

  // ビームが消えるか自機に当たるまで進める（跳ね返って61フレーム目に帯が触れる）
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
