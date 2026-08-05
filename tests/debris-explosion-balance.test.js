import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createExplosion, MACHINE_EXPLOSION_OPTS, PLAYER_EXPLOSION_OPTS,
} from '../src/js/entities/Particle.js';
import {
  PLAYER_DEATH_EXPLOSION_COUNT, EXPLOSION_PARTICLE_COUNT, PLAYER_WIDTH, PLAYER_HEIGHT,
} from '../src/js/utils/Constants.js';

test('既定では従来どおり灰色のデブリ粒子が混ざりうる', () => {
  let sawGrey = false;
  for (let i = 0; i < 40 && !sawGrey; i++) {
    sawGrey = createExplosion(0, 0, 60).some((p) => p.color === '#888888');
  }
  assert.ok(sawGrey, '灰色のデブリ粒子が一度も出ない');
});

test('debrisSmoke:false なら灰色のデブリ粒子を混ぜない', () => {
  for (let i = 0; i < 40; i++) {
    const parts = createExplosion(0, 0, 60, { debrisSmoke: false });
    assert.ok(!parts.some((p) => p.color === '#888888'), '灰色の粒子が混ざった');
  }
});

test('opts を渡してもパーティクル数は変わらない', () => {
  const a = createExplosion(0, 0, 30).length;
  const b = createExplosion(0, 0, 30, MACHINE_EXPLOSION_OPTS).length;
  assert.equal(a, b, 'spread は密度を保ったまま塊を小さくする（数は減らさない）');
});

/** 粒子の初速の大きさの最大値。中央フラッシュは速度を持たないので除く。 */
function maxSpeed(particles) {
  return particles
    .filter((p) => typeof p.vx === 'number')
    .reduce((m, p) => Math.max(m, Math.hypot(p.vx, p.vy)), 0);
}

test('spread を下げると粒子の飛散速度の上限が同じ比率で下がる', () => {
  // count = 30 なので速度は 0.5 + rand*3 の範囲、上限は 3.5。
  // 十分な回数を回せば上限に近い粒子が必ず出る。
  const full = Math.max(...Array.from({ length: 50 }, () => maxSpeed(createExplosion(0, 0, 30))));
  const half = Math.max(...Array.from({ length: 50 }, () => maxSpeed(createExplosion(0, 0, 30, { spread: 0.5 }))));

  assert.ok(full > 3.3 && full <= 3.5, `既定の上限が想定外: ${full}`);
  assert.ok(half > 1.65 && half <= 1.75, `spread 0.5 の上限が想定外: ${half}`);
});

test('spread を下げると中央フラッシュも小さくなる', () => {
  const flashOf = (opts) => createExplosion(0, 0, 40, opts).find((p) => p.maxSize !== undefined).maxSize;
  const full = flashOf(undefined);
  const half = flashOf({ spread: 0.5 });
  assert.equal(half, full * 0.5);
});

test('破片を撒く機体の爆発は、既定より広がりが小さい', () => {
  assert.ok(MACHINE_EXPLOSION_OPTS.spread < 1,
    `spread が絞られていない: ${MACHINE_EXPLOSION_OPTS.spread}`);
  assert.equal(MACHINE_EXPLOSION_OPTS.debrisSmoke, false);
});

// --- 自機の死の爆発 ----------------------------------------------------------
// 実機で「自機の破壊に爆発が無いように見える」と報告された件の回帰テスト。
// 爆発自体は出ていたが、全機体で最小(15粒子・フラッシュ半径8.3px)だったため、
// 自機(16x24px)より小さく、破片の白熱シルエットに埋もれていた。

/** createExplosion が積む中央フラッシュの半径。 */
function flashRadius(count, opts) {
  return createExplosion(0, 0, count, opts).find((p) => p.maxSize !== undefined).maxSize;
}

test('自機の死の爆発は他のどの機体よりも大きい', () => {
  const player = flashRadius(PLAYER_DEATH_EXPLOSION_COUNT, PLAYER_EXPLOSION_OPTS);
  // 他機体の最大はアタッカー/戦車の EXPLOSION_PARTICLE_COUNT
  const biggestEnemy = flashRadius(EXPLOSION_PARTICLE_COUNT, MACHINE_EXPLOSION_OPTS);
  assert.ok(player > biggestEnemy,
    `自機の爆発が敵より小さい: ${player} vs ${biggestEnemy}`);
});

test('自機の死の爆発は自機の体格より確実に大きい', () => {
  // これが破られると「爆発が無いように見える」状態に戻る。
  // maxSize は半径なので、自機を囲む円の半径（対角の半分）と比べる。
  const radius = flashRadius(PLAYER_DEATH_EXPLOSION_COUNT, PLAYER_EXPLOSION_OPTS);
  const playerRadius = Math.hypot(PLAYER_WIDTH, PLAYER_HEIGHT) / 2;
  assert.ok(radius > playerRadius,
    `フラッシュ半径(${radius.toFixed(1)})が自機を囲む円(${playerRadius.toFixed(1)})以下`);
});

test('自機の爆発も擬似デブリ粒子は混ぜない（本物の破片を撒くため）', () => {
  for (let i = 0; i < 40; i++) {
    const parts = createExplosion(0, 0, PLAYER_DEATH_EXPLOSION_COUNT, PLAYER_EXPLOSION_OPTS);
    assert.ok(!parts.some((p) => p.color === '#888888'));
  }
});
