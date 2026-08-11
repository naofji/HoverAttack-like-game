import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  ENEMY_ATTACKER_TYPES, TILE_SIZE, SMOKE_COOLDOWN, ATTACKER_COVER_CHECK_INTERVAL,
} from '../src/js/utils/Constants.js';

/** 24x24。床は row 20。遮蔽物なしなので LOS は常に通る（＝ばれている） */
function openWorld() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

function setup(typeKey = 'artillery') {
  const game = makeGame(makeMap(openWorld()));
  game.smokeScreens = [];
  game.smokeCalls = [];
  game.spawnSmokeScreen = (x, y) => game.smokeCalls.push({ x, y });

  // 自機は artillery の射程内・遮蔽を挟まない位置（ATTACKER_COVER_MIN_DIST=160 より遠く）
  game.player = { x: 4 * TILE_SIZE, y: 19 * TILE_SIZE, width: 16, height: 24, alive: true, docked: false };

  const config = { ...ENEMY_ATTACKER_TYPES[typeKey], fireInterval: 1e9 };
  const e = new EnemyAttacker(game, 20 * TILE_SIZE, 19 * TILE_SIZE, config);
  game.enemies.push(e);
  return { game, e };
}

/** cover チェックが必ず1回起きるぶんだけ回す */
function runChecks(e, count = 1) {
  const cx = () => e.x + e.width / 2;
  const cy = () => e.y + e.height / 2;
  for (let i = 0; i < ATTACKER_COVER_CHECK_INTERVAL * count + count; i++) {
    e._updateCoverSeek(e.game.player.x + 8, e.game.player.y + 12);
    if (e.smokeCooldown > 0) e.smokeCooldown--;
    void cx(); void cy();
  }
}

test('artillery は自機から見えている（＝ばれた）と判定した回に発煙する', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  assert.equal(game.smokeCalls.length, 1, `発煙していない: ${game.smokeCalls.length}`);
});

test('発煙位置は機体の中心', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  assert.ok(Math.abs(game.smokeCalls[0].x - (e.x + e.width / 2)) < 1);
  assert.ok(Math.abs(game.smokeCalls[0].y - (e.y + e.height / 2)) < 1);
});

test('クールダウン中は続けて発煙しない', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 3);   // チェック3回ぶん回してもクールダウン480 tick には届かない
  assert.equal(game.smokeCalls.length, 1, `連発している: ${game.smokeCalls.length}`);
});

test('クールダウンが明ければまた発煙する', () => {
  const { game, e } = setup('artillery');
  runChecks(e, 1);
  e.smokeCooldown = 0;   // 時間が経ったことにする
  runChecks(e, 1);
  assert.equal(game.smokeCalls.length, 2);
});

test('発煙するとクールダウンが入る', () => {
  const { e } = setup('artillery');
  runChecks(e, 1);
  assert.ok(e.smokeCooldown > 0, 'クールダウンが入っていない');
  assert.ok(e.smokeCooldown <= SMOKE_COOLDOWN);
});

test('遮蔽に隠れている間は発煙しない（ばれていない）', () => {
  const { game, e } = setup('artillery');
  // 自機との間を塞ぐ: LOS が通らない世界に差し替える
  game.map.isSolidAtPixel = () => true;
  runChecks(e, 2);
  assert.equal(game.smokeCalls.length, 0, '隠れているのに発煙した');
});

test('usesSmoke を持たない型は発煙しない', () => {
  for (const typeKey of ['standard', 'heavy', 'rival']) {
    const { game, e } = setup(typeKey);
    runChecks(e, 2);
    assert.equal(game.smokeCalls.length, 0, `${typeKey} が発煙した`);
  }
});

test('artillery だけが usesSmoke を持つ', () => {
  assert.equal(ENEMY_ATTACKER_TYPES.artillery.usesSmoke, true);
  for (const key of ['standard', 'heavy', 'rival']) {
    assert.ok(!ENEMY_ATTACKER_TYPES[key].usesSmoke, `${key} に usesSmoke がある`);
  }
});
