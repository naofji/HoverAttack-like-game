// アタッカーの撃破ドロップは「スポーン時点」「週シード＋面＋位置」だけから決まる。
// 同じ週なら何度遊んでも同じ場所に同じ物が置かれる、という要望(戦略性)を
// 直接縛るテスト。境界値（率そのもの）は attacker-drop-chance.test.js が持つので、
// ここでは「決定論」「位置依存」「game.rng を汚さない」「die() がもう乱数を引かない」
// ことだけを見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackerDropSeed, decideAttackerDrop } from '../src/js/utils/drops.js';
import { stageSeed } from '../src/js/utils/WeekSeed.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { ATTACKER_HEAVY_DROP_CHANCE, TILE_SIZE } from '../src/js/utils/Constants.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';

const FLOOR_Y = 20 * 16 - 24;

/** 200タイルぶんの散らばった位置（x, y とも変化させる）。 */
function samplePositions(n = 200) {
  const positions = [];
  for (let i = 0; i < n; i++) {
    positions.push({ x: i * TILE_SIZE, y: (i * 37) * TILE_SIZE });
  }
  return positions;
}

function rollHeavyAt(game, positions) {
  return positions.map((p) => decideAttackerDrop(game, p.x, p.y, 'heavy'));
}

test('同じシード・同じ位置・同じ型なら2回とも同じ結果', () => {
  const game = { weekSeed: 12345, missionsCompleted: 2 };
  const a = decideAttackerDrop(game, 320, 480, 'heavy');
  const b = decideAttackerDrop(game, 320, 480, 'heavy');
  assert.equal(a, b);
});

test('200箇所に heavy を撒くと、結果は全部同じにはならず、観測率が ATTACKER_HEAVY_DROP_CHANCE の近くに収まる', () => {
  const game = { weekSeed: 777, missionsCompleted: 0 };
  const positions = samplePositions(200);
  const results = rollHeavyAt(game, positions);

  const distinct = new Set(results);
  assert.ok(distinct.size > 1, 'ハッシュが位置で変わっていない（全部同じ結果）');

  const dropped = results.filter((r) => r !== null).length;
  const observedRate = dropped / results.length;
  const BAND = 0.15; // ハッシュの分布に対する緩いバンド。フレーキーにしないための余裕
  assert.ok(
    Math.abs(observedRate - ATTACKER_HEAVY_DROP_CHANCE) <= BAND,
    `観測率 ${observedRate} が ATTACKER_HEAVY_DROP_CHANCE(${ATTACKER_HEAVY_DROP_CHANCE}) から離れすぎ`,
  );
});

test('週シードが変わると、同じ位置群での結果の集合が変わる', () => {
  const positions = samplePositions(200);
  const gameA = { weekSeed: 111, missionsCompleted: 0 };
  const gameB = { weekSeed: 222, missionsCompleted: 0 };
  const resultsA = rollHeavyAt(gameA, positions);
  const resultsB = rollHeavyAt(gameB, positions);
  assert.notDeepEqual(resultsA, resultsB, '週シードを変えても配置が変わっていない');
});

test('decideAttackerDrop は game.rng（マップ生成用の共有ストリーム）を消費しない', () => {
  const rng = new SeededRNG(stageSeed(999, 3));
  const game = { weekSeed: 999, missionsCompleted: 3, rng };
  const stateBefore = rng.state;
  decideAttackerDrop(game, 200, 400, 'heavy');
  decideAttackerDrop(game, 500, 100, 'rival');
  decideAttackerDrop(game, 900, 900, 'artillery');
  assert.equal(rng.state, stateBefore, 'game.rng.state が変わっている＝マップ生成用の乱数を消費した');
});

test('同じ位置に作った2体の EnemyAttacker は同じ dropKind を持ち、die() はその物だけを積む', () => {
  const FIXED_ROLL = 0.5; // 旧しきい値(0.6 / 0.25 / 1.0 / 0.5)のうち複数をひっくり返す値
  const game1 = makeGame(makeMap(flatFloorRows()));
  game1.weekSeed = 4242;
  game1.missionsCompleted = 1;
  game1.spawnDebris = () => {};

  const game2 = makeGame(makeMap(flatFloorRows()));
  game2.weekSeed = 4242;
  game2.missionsCompleted = 1;
  game2.spawnDebris = () => {};

  const e1 = makeAttacker(game1, 160, FLOOR_Y, 'heavy');
  const e2 = makeAttacker(game2, 160, FLOOR_Y, 'heavy');
  assert.equal(e1.dropKind, e2.dropKind, '同じ週・同じ位置なのに dropKind が違う');

  // Math.random を固定しても die() の結果が変わらないことを示す＝もう乱数を引いていない証明
  const original = Math.random;
  Math.random = () => FIXED_ROLL;
  try {
    e1.die();
  } finally {
    Math.random = original;
  }

  switch (e1.dropKind) {
    case 'missile':
      assert.equal(game1.missileKits.length, 1);
      break;
    case 'overdrive':
      assert.equal(game1.missileKits.length, 1);
      break;
    case 'repair':
      assert.equal(game1.repairKits.length, 1);
      break;
    case 'autoaim':
      assert.equal(game1.autoAimUnits.length, 1);
      break;
    case null:
      assert.equal(game1.missileKits.length, 0);
      assert.equal(game1.repairKits.length, 0);
      assert.equal(game1.autoAimUnits.length, 0);
      break;
    default:
      assert.fail(`未知の dropKind: ${e1.dropKind}`);
  }
});

test('attackerDropSeed はスポーン位置ごとに違う種を作る（同じ面シードでも位置が違えば変わる）', () => {
  const stage = stageSeed(555, 0);
  const s1 = attackerDropSeed(stage, 0, 0);
  const s2 = attackerDropSeed(stage, TILE_SIZE, 0);
  assert.notEqual(s1, s2);
});
