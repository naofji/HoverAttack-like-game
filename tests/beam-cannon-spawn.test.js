import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';

/** タレットの湧き場所だけを持つ最小のマップ。他の敵は湧かせない。 */
function makeGame(missionsCompleted, turretCount) {
  const enemyTurretSpawns = [];
  for (let i = 0; i < turretCount; i++) {
    enemyTurretSpawns.push({ x: i * 32, y: 40, isCeiling: i % 3 === 0 });
  }
  let rngCalls = 0;
  return {
    missionsCompleted,
    enemies: [],
    enemyBullets: [],
    particles: [],
    baseEmergencyAlert: false,
    map: {
      enemyTankSpawns: [], landmineSpawns: [], enemyAttackerSpawns: [],
      enemyDroneSpawns: [], enemyTurretSpawns, enemyBaseSpawn: null,
      width: 2048, height: 512,
      isSolidAtPixel: () => false,
    },
    rng: { next: () => { rngCalls++; return 0.5; } },
    get rngCalls() { return rngCalls; },
  };
}

const turretTypes = (game) => game.enemies.map((e) => e.type);
const spawn = (game) => new SpawnManager(game).spawnEnemies();

test('6面までは従来のタレットだけ', () => {
  const game = makeGame(5, 8);
  spawn(game);
  assert.ok(turretTypes(game).every((t) => t === 'gun'), '6面に反射ビームが出ている');
});

test('7面ではタレットの半分が反射ビームになる', () => {
  const game = makeGame(6, 8);
  spawn(game);
  const types = turretTypes(game);
  assert.equal(types.filter((t) => t === 'beam').length, 4, '半分になっていない');
  assert.equal(types.filter((t) => t === 'gun').length, 4);
});

// 週次の決定性（同じ ISO 週なら全員同じステージ）が壊れる。
// 並び順の偶数番目を取るだけなら乱数は要らない
test('差し替えで乱数を消費しない', () => {
  const game = makeGame(6, 8);
  spawn(game);
  assert.equal(game.rngCalls, 0, 'game.rng を消費している');
});

test('奇数個でも偶数番目が反射ビームになる', () => {
  const game = makeGame(6, 5);
  spawn(game);
  assert.deepEqual(turretTypes(game), ['beam', 'gun', 'beam', 'gun', 'beam']);
});
