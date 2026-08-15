import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import {
  REFLECT_BEAM_DAMAGE, BEAM_SPARK_COLORS, BEAM_SPARK_COUNT,
  BEAM_SPARK_FLASH_RADIUS, COLOR_BEAM_HIT_FLASH_CORE, COLOR_BEAM_HIT_FLASH_RING,
  BEAM_SPARK_SIZE,
  IMPACT_FLASH_RADIUS,
} from '../src/js/utils/Constants.js';
import { createSparks, ImpactFlash } from '../src/js/entities/Particle.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

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
// REFLECT_BEAM_SEGMENT_LIFE 分＝80px ぶんしか残らないので、旧実装（帯160px）の
// ときに使っていた座標(230,62)はもう帯が届かず外れてしまう（実際に試して
// 確認した：80フレーム回しても damage は 0 のまま）。BAND_ONLY_TARGET は
// 2本目の脚（1回目の反射から2回目の反射まで、frame12〜28）の上に
// シミュレーションで座標を取り直した。frame21 で当たることを確認済み
const BEAM_START = { x: 40, y: 30, angle: 0.6 };
const BAND_ONLY_TARGET = { x: 122, y: 22 };
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

// --------------------------------------------
// 被弾演出（紫のスパーク）
// --------------------------------------------

/**
 * 「動いた自機が帯の途中に入る」状況を作る。
 *
 * 帯は先端が先に届くので、静止した的では必ず先端で当たり、帯の途中の当たりは
 * 起こらない。実機で起こるのは自機のほうが動いて帯に入る場合なので、
 * ビームを27フレーム進めたあと、自機を帯の中ほど（先端から約55px後ろ）へ移す。
 * 座標はシミュレーションで取った（tools ではなく使い捨てスクリプト）。
 */
const MID_BAND_POINT = { x: 110.2, y: 49.8 };  // frame27 時点の帯の5節目の端

function hitMidBand(game, cm, target) {
  const beam = game.enemyBullets[0];
  for (let i = 0; i < 27; i++) cm._updateEnemyBullets();
  assert.equal(target.damage, 0, '前提が崩れている：途中で当たってしまった');
  target.x = MID_BAND_POINT.x - target.width / 2;
  target.y = MID_BAND_POINT.y - target.height / 2;
  cm._updateEnemyBullets();
  return { x: beam.x, y: beam.y };  // 当たった瞬間の先端
}

test('反射ビームが当たると紫のスパークが出る', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && target.damage === 0 && game.enemyBullets.length > 0; i++) {
    cm._updateEnemyBullets();
  }

  assert.ok(target.damage > 0, '前提が崩れている：当たっていない');
  // 閃光(ImpactFlash)も同じ particles に入るので、粒だけを数える
  const sparks = game.particles.filter((p) => !(p instanceof ImpactFlash));
  assert.equal(sparks.length, BEAM_SPARK_COUNT, 'スパークの数が違う');
  for (const p of sparks) {
    assert.ok(BEAM_SPARK_COLORS.includes(p.color), `紫以外の色が混じっている: ${p.color}`);
  }
});

test('スパークはビームの先端ではなく「当たった場所」に出る', () => {
  const target = makeTarget(FAR_TARGET.x, FAR_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  const tip = hitMidBand(game, cm, target);

  assert.ok(target.damage > 0, '前提が崩れている：帯の途中で当たっていない');
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const tipDist = Math.hypot(tip.x - cx, tip.y - cy);
  // 先端が自機から十分離れていなければ、「先端に出す」実装でも通ってしまう
  assert.ok(tipDist > 30, `前提が崩れている：先端が自機に近すぎる (${tipDist.toFixed(1)}px)`);

  assert.ok(game.particles.length > 0, 'スパークが出ていない');
  for (const p of game.particles) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    assert.ok(d < 16, `スパークが自機から離れすぎ (${d.toFixed(1)}px)`);
  }
});

test('被弾点は自機に記録され、ビーム先端ではない', () => {
  const target = makeTarget(FAR_TARGET.x, FAR_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  const tip = hitMidBand(game, cm, target);

  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  assert.ok(Math.hypot(target.lastHitX - cx, target.lastHitY - cy) < 16, '被弾点が自機から離れている');
  assert.ok(Math.hypot(target.lastHitX - tip.x, target.lastHitY - tip.y) > 10, '被弾点が先端のまま');
});

test('被弾では爆発を鳴らさない', () => {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  let explosions = 0;
  game.spawnExplosion = () => { explosions++; };
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && target.damage === 0 && game.enemyBullets.length > 0; i++) {
    cm._updateEnemyBullets();
  }
  assert.ok(target.damage > 0, '前提が崩れている：当たっていない');
  assert.equal(explosions, 0, '爆発（＝音つき）が呼ばれている');
});

test('createSparks は引数なしなら今までどおりの黄色系', () => {
  const sparks = createSparks(10, 20);
  assert.ok(sparks.length >= 3 && sparks.length <= 5, '既定の個数が変わっている');
  const legacy = ['#FFFFE0', '#FFD700', '#FFA500'];
  for (const p of sparks) assert.ok(legacy.includes(p.color), `色が変わっている: ${p.color}`);
  // size を opts に足したときの回帰。既定は従来の 2
  for (const p of sparks) assert.equal(p.size, 2, `既定の粒の大きさが変わっている: ${p.size}`);
});

// 「もっと明るいスパークの方が良い」への対応。明るさは色だけでなく面積でも
// 決まるので、粒を1px 大きくしている
test('反射ビームの被弾スパークは通常より大きい粒で出る', () => {
  const { game } = hitOnce();
  const sparks = game.particles.filter((p) => !(p instanceof ImpactFlash));
  assert.ok(sparks.length > 0, 'スパークが出ていない');
  for (const p of sparks) {
    assert.equal(p.size, BEAM_SPARK_SIZE, `粒の大きさが違う: ${p.size}`);
    assert.ok(p.size > 2, '通常のスパーク(2)より大きくない');
  }
});

// ============================================
// 実機フィードバック(3回目): 被弾が地味すぎて見えない
// ============================================
//
// 粒を増やすだけでは効きが薄いと見て、被弾点に**紫の閃光**（既存の ImpactFlash）
// を1つ足し、専用の効果音も鳴らす。閃光は「命中した」という一瞬の合図で、
// 爆発（playBlast）とは別物＝爆発音が付いてこない。

/** particles から閃光(ImpactFlash)だけを抜き出す。 */
function flashesOf(game) {
  return game.particles.filter((p) => p instanceof ImpactFlash);
}

function hitOnce() {
  const target = makeTarget(BAND_ONLY_TARGET.x, BAND_ONLY_TARGET.y);
  const game = makeGame(BEAM_START, target);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 80 && target.damage === 0 && game.enemyBullets.length > 0; i++) {
    cm._updateEnemyBullets();
  }
  assert.ok(target.damage > 0, '前提が崩れている：当たっていない');
  return { game, target };
}

test('反射ビームの被弾点に閃光が1つ出る', () => {
  const { game } = hitOnce();
  const flashes = flashesOf(game);
  assert.equal(flashes.length, 1, `閃光の数が違う: ${flashes.length}`);
  assert.equal(flashes[0].radius, BEAM_SPARK_FLASH_RADIUS, '閃光の半径が専用の値になっていない');
});

test('被弾の閃光は紫（既定の白/橙ではない）', () => {
  const { game } = hitOnce();
  const ctx = makeFakeCtx();
  flashesOf(game)[0].draw(ctx);

  const styles = ctx.calls
    .filter((c) => c.name === 'set:fillStyle' || c.name === 'set:strokeStyle')
    .map((c) => c.args[0]);
  assert.ok(styles.includes(COLOR_BEAM_HIT_FLASH_CORE), `芯が紫でない: ${styles.join()}`);
  assert.ok(styles.includes(COLOR_BEAM_HIT_FLASH_RING), `リングが紫でない: ${styles.join()}`);
});

// createSparks に opts を足したときと同じ流儀。既存の呼び出し（ミサイル着弾・
// 破壊時の連鎖）の見た目が変わっていないことを縛る
test('ImpactFlash は色を指定しなければ従来どおりの白＋淡い橙', () => {
  const ctx = makeFakeCtx();
  new ImpactFlash(10, 20).draw(ctx);
  const styles = ctx.calls
    .filter((c) => c.name === 'set:fillStyle' || c.name === 'set:strokeStyle')
    .map((c) => c.args[0]);
  assert.ok(styles.includes('#FFFFFF'), '既定の芯の色が変わっている');
  assert.ok(styles.includes('#FFE8A0'), '既定のリングの色が変わっている');
  assert.equal(new ImpactFlash(10, 20).radius, IMPACT_FLASH_RADIUS, '既定の半径が変わっている');
});

test('反射ビームの被弾で beamHit の音が鳴る', () => {
  const played = [];
  const original = audioManager.playWeapon;
  audioManager.playWeapon = (kind, x, y) => { played.push({ kind, x, y }); };
  let game, target;
  try {
    ({ game, target } = hitOnce());
  } finally {
    audioManager.playWeapon = original;
  }
  const hits = played.filter((p) => p.kind === 'beamHit');
  assert.equal(hits.length, 1, `beamHit が ${hits.length} 回（1回のはず）`);

  // 被弾点で鳴らす（位置を持つ音は座標を渡すと定位・減衰する）
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  assert.ok(
    Math.hypot(hits[0].x - cx, hits[0].y - cy) < 16,
    `音の座標が被弾点から離れている: (${hits[0].x}, ${hits[0].y})`,
  );
});
