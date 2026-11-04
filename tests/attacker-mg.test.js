// standard アタッカーの一部がミサイルではなくマシンガン（3連射）を撃つ。
// ユーザー指定（2026-11-03）: 1面はミサイルのみ、2面から MG 持ちが増え、
// 7面でミサイル:MG = 1:3。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standardWeaponAt, standardMgShare } from '../src/js/utils/attackerWeapon.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import {
  ENEMY_ATTACKER_TYPES, ATTACKER_MG_BURST_COUNT, ATTACKER_MG_BURST_DELAY, STANDARD_MG_COLORS,
} from '../src/js/utils/Constants.js';
import { STANDARD_MG_CONFIG } from '../src/js/utils/attackerWeapon.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';

const countMg = (mission, n) =>
  Array.from({ length: n }, (_, i) => standardWeaponAt(mission, i)).filter((w) => w === 'mg').length;

// --- 割り当て -------------------------------------------------------------

test('1面（missionsCompleted 0）の standard は全員ミサイル', () => {
  assert.equal(countMg(0, 100), 0);
});

test('7面の standard はミサイル:MG がちょうど 1:3（4機ごとに3機 MG）', () => {
  for (const n of [4, 8, 12, 40]) assert.equal(countMg(6, n), n * 3 / 4, `${n}機`);
});

test('2面から7面へ MG 持ちの割合が増えていき、2面でも少ない機数で1機は出る', () => {
  let prev = 0;
  for (let m = 1; m <= 6; m++) {
    const share = standardMgShare(m);
    assert.ok(share > prev, `${m + 1}面の割合 ${share} が前の面 ${prev} より増えていない`);
    prev = share;
  }
  assert.ok(countMg(1, 4) >= 1, '2面で standard 4機に MG が1機もいない');
});

test('表より先の面は最後の行（7面）の割合を使う', () => {
  assert.equal(standardMgShare(9), standardMgShare(6));
});

// --- SpawnManager が実際に持たせるか ---------------------------------------

function spawnAll(missionsCompleted, rngValues) {
  let k = 0;
  const game = {
    map: {
      isSolidAtPixel: () => false, isSolid: () => false, cols: 1000, rows: 1000,
      enemyTankSpawns: [], enemyDroneSpawns: [], enemyTurretSpawns: [],
      enemyBaseSpawn: null, landmineSpawns: [],
      // 重なり回避で横にずらされないよう十分離す
      enemyAttackerSpawns: Array.from({ length: rngValues.length }, (_, i) => ({ x: i * 100, y: 10 })),
    },
    enemies: [], enemyBullets: [],
    rng: { next: () => rngValues[k++ % rngValues.length] },
    missionsCompleted,
    baseEmergencyAlert: false, emergencyTargetBase: null,
  };
  new SpawnManager(game).spawnEnemies();
  return game.enemies.filter((e) => e instanceof EnemyAttacker);
}

test('7面のスポーン: standard の 3/4 が MG、他の型は MG にならない', () => {
  // rng 0 → 最初の型（standard）、0.99 → 最後の型（artillery）。交互に湧かせる
  const vals = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 0 : 0.99));
  const attackers = spawnAll(6, vals);
  const std = attackers.filter((a) => a.config.name === 'standard');
  const others = attackers.filter((a) => a.config.name !== 'standard');
  assert.equal(std.length, 8);
  assert.equal(std.filter((a) => a.weapon === 'mg').length, 6);
  assert.ok(others.length > 0);
  assert.ok(others.every((a) => a.weapon === 'missile'), '他の型に MG が付いた');
  // 色で見分けられる: MG 持ちは MG の色、ミサイル持ちは standard の色のまま
  for (const a of std) {
    const want = a.weapon === 'mg' ? STANDARD_MG_COLORS.bodyColor : ENEMY_ATTACKER_TYPES.standard.bodyColor;
    assert.equal(a.config.bodyColor, want, `${a.weapon} の機体の色`);
  }
});

test('MG 持ちの行は色だけ standard と違い、型の名前と数値は standard のまま', () => {
  const std = ENEMY_ATTACKER_TYPES.standard;
  for (const k of ['bodyColor', 'headColor', 'backpackColor', 'exhaustColor']) {
    assert.notEqual(STANDARD_MG_CONFIG[k], std[k], `${k} が standard と同じ`);
  }
  for (const k of ['name', 'hp', 'speed', 'fireInterval', 'score', 'visorColor', 'flameColor']) {
    assert.equal(STANDARD_MG_CONFIG[k], std[k], k);
  }
  assert.equal(STANDARD_MG_CONFIG.weapon, 'mg');
});

test('1面のスポーン: standard は全員ミサイル', () => {
  const attackers = spawnAll(0, Array(12).fill(0));
  assert.equal(attackers.length, 12);
  assert.ok(attackers.every((a) => a.weapon === 'missile'));
});

// --- 撃ち方 ---------------------------------------------------------------

/** 自機を目の前に置き、chase 状態で _handleShooting だけを回す。 */
function shoot(weapon, frames) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.missionsCompleted = 0;
  const a = new EnemyAttacker(game, 100, 20 * 16 - 24, { ...ENEMY_ATTACKER_TYPES.standard, aimAccuracy: 1.0 });
  a.weapon = weapon;
  a.fireTimer = 1;
  a.aiState = 'chase';
  game.player = {
    x: 200, y: 20 * 16 - 24, width: 16, height: 24,
    alive: true, docked: false, vx: 0, vy: 0, hp: 100, takeDamage() {},
  };
  for (let f = 0; f < frames; f++) a._handleShooting();
  return game;
}

test('MG 持ちは1回の射撃で EnemyBullet を3発撃ち、ミサイルは撃たない', () => {
  // 弾数はユーザー指定（5 → 3、2026-11-05）。定数から期待値を作ると値を変えても通ってしまうので、数で縛る
  assert.equal(ATTACKER_MG_BURST_COUNT, 3);
  const frames = 2 + ATTACKER_MG_BURST_COUNT * ATTACKER_MG_BURST_DELAY;
  const game = shoot('mg', frames);
  assert.equal(game.enemyBullets.filter((b) => b instanceof EnemyBullet).length, ATTACKER_MG_BURST_COUNT);
  assert.equal(game.projectiles.filter((p) => p instanceof Missile).length, 0);
  // 弾は自機（右）の方へ飛ぶ
  assert.ok(game.enemyBullets.every((b) => b.vx > 0), '自機と逆へ撃った');
});

test('MG の連射が終わると fireInterval まで撃たない（連射の次の1発が出ない）', () => {
  const frames = 2 + ATTACKER_MG_BURST_COUNT * ATTACKER_MG_BURST_DELAY + ENEMY_ATTACKER_TYPES.standard.fireInterval - 10;
  const game = shoot('mg', frames);
  assert.equal(game.enemyBullets.length, ATTACKER_MG_BURST_COUNT);
});

test('ミサイル持ちは今までどおりミサイル1発で、EnemyBullet は撃たない', () => {
  const game = shoot('missile', 40);
  assert.equal(game.projectiles.filter((p) => p instanceof Missile).length, 1);
  assert.equal(game.enemyBullets.length, 0);
});

test('MG の連射中は立ったまま（しゃがまない）、artillery の連射中はしゃがむ', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const mg = new EnemyAttacker(game, 100, 100, STANDARD_MG_CONFIG);
  const standY = mg._hoverNozzle().y;
  mg.burstCount = 3;
  assert.equal(mg._hoverNozzle().y, standY, 'MG の連射中に噴射口が下がった＝しゃがんだ');
  const art = new EnemyAttacker(game, 100, 100, ENEMY_ATTACKER_TYPES.artillery);
  const artY = art._hoverNozzle().y;
  art.burstCount = 3;
  assert.equal(art._hoverNozzle().y, artY + 4, 'artillery が連射中にしゃがまない');
});

test('コンストラクタは行の weapon を読む（行に無ければミサイル）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  assert.equal(new EnemyAttacker(game, 0, 0, STANDARD_MG_CONFIG).weapon, 'mg');
  assert.equal(new EnemyAttacker(game, 0, 0, ENEMY_ATTACKER_TYPES.standard).weapon, 'missile');
});
