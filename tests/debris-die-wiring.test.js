// die() が spawnDebris を正しい引数(entity, kind文字列)で1回だけ呼ぶことを、
// 実クラスのインスタンスを使って検証する。
//
// これが無いと、EnemyTank.die() から spawnDebris の呼び出しを1行削っても、
// kind 文字列を 'tanks' のようにタイポして buildDebris が静かに [] を返す
// ようになっても、他のテストは何も気づけない
// （debris-*.test.js の大半は手製オブジェクトや getDebrisParts を直接叩くだけで、
//   die() 経由の配線そのものは見ていない）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { buildDebris } from '../src/js/entities/debris/index.js';

/** spawnDebris の呼び出しだけを記録するスパイを持つゲームを作る。 */
function makeSpyGame() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.calls = [];
  game.spawnDebris = (entity, kind) => { game.calls.push({ entity, kind }); };
  return game;
}

function assertCalledOnceWith(game, entity, kind) {
  assert.equal(game.calls.length, 1, `spawnDebris の呼び出し回数が違う: ${game.calls.length}`);
  assert.equal(game.calls[0].entity, entity, 'spawnDebris に渡されたエンティティが違う');
  assert.equal(game.calls[0].kind, kind, `spawnDebris に渡された kind が違う: ${game.calls[0].kind}`);
}

test('Carrier.die() は spawnDebris を (carrier, "carrier") で1回だけ呼ぶ', () => {
  const game = makeSpyGame();
  const carrier = new Carrier(game, 100, 100);
  carrier.die();
  assertCalledOnceWith(game, carrier, 'carrier');
});

test('EnemyDrone.die() は spawnDebris を (drone, "drone") で1回だけ呼ぶ', () => {
  const game = makeSpyGame();
  const drone = new EnemyDrone(game, 100, 100);
  drone.die();
  assertCalledOnceWith(game, drone, 'drone');
});

test('EnemyTank.die() は spawnDebris を (tank, "tank") で1回だけ呼ぶ', () => {
  const game = makeSpyGame();
  const tank = new EnemyTank(game, 100, 100);
  tank.die();
  assertCalledOnceWith(game, tank, 'tank');
});

test('EnemyTurret.die() は spawnDebris を (turret, "turret") で1回だけ呼ぶ', () => {
  const game = makeSpyGame();
  const turret = new EnemyTurret(game, 100, 100, false);
  turret.die();
  assertCalledOnceWith(game, turret, 'turret');
});

test('EnemyAttacker.die() は spawnDebris を (attacker, "attacker") で1回だけ呼ぶ', () => {
  const game = makeSpyGame();
  const attacker = makeAttacker(game, 40, 16, 'standard');
  attacker.die();
  assertCalledOnceWith(game, attacker, 'attacker');
});

test('die() 経由の spawnDebris で実際に particles へ破片が入る（本物の spawnDebris 実装で確認）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.particles = [];
  game.spawnDebris = (entity, kind) => {
    game.particles.push(...buildDebris(entity, kind));
  };
  const tank = new EnemyTank(game, 100, 100);
  tank.die();
  assert.ok(game.particles.length > 0, '破片が particles に入っていない');
});
