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

// ============================================
// ここから update() を通す統合テスト。
//
// 上の8本は _updateCoverSeek() を直接呼び、クールダウンの減算をテスト側の
// runChecks() が模倣している。そのため「実装側の減算が壊れる」「inCover の
// 前回値を見誤る」といった update() 内の配線のバグを検出できない
// （実際に修正1のバグをこの層で見逃した）。ここでは e.update() をそのまま
// 回して、AI 状態遷移・クールダウン減算を実装のコードパスで検証する。
// ============================================

/**
 * 自機と敵の間、双方の足場からは離れた1点（x150-220, y300-330）だけを
 * 塞ぐ見えない壁つきのワールド。地形本体（床）は openWorld() のまま
 * isSolidAtPixel に委譲するので、通常の接地・歩行判定には影響しない。
 * state.blocked を切り替えるだけで LOS のオン/オフを制御できる。
 */
function coverableWorld() {
  const map = makeMap(openWorld());
  const floorSolid = map.isSolidAtPixel.bind(map);
  const state = { blocked: true };
  map.isSolidAtPixel = (x, y) => {
    if (state.blocked && x > 150 && x < 220 && y > 300 && y < 330) return true;
    return floorSolid(x, y);
  };
  return { map, state };
}

test('【統合】遮蔽に隠れている状態から露出した最初のチェックで発煙する（修正1のガードが戻ると落ちる）', () => {
  const { map, state } = coverableWorld();
  const game = makeGame(map);
  game.smokeCalls = [];
  game.spawnSmokeScreen = (x, y) => game.smokeCalls.push({ x, y });
  game.player = { x: 4 * TILE_SIZE, y: 19 * TILE_SIZE, width: 16, height: 24, alive: true, docked: false };

  // speed: 0 — cover-seek の「近すぎ」判定（dx < ATTACKER_COVER_MIN_DIST）に
  // 巻き込まれないよう、水平移動をゼロにして距離を固定する。この関心事は
  // fix1 の検証と無関係なので、単純化して排除する。
  const config = { ...ENEMY_ATTACKER_TYPES.artillery, fireInterval: 1e9, speed: 0 };
  const e = new EnemyAttacker(game, 20 * TILE_SIZE, 19 * TILE_SIZE, config);
  game.enemies.push(e);

  // frame1: 最初の cover チェック。壁で LOS が塞がれているので inCover=true に
  // なるだけで、まだ発煙しない（隠れている＝ばれていない）。
  e.update();
  assert.equal(e.inCover, true, '前提が崩れている: 遮蔽に隠れていない');
  assert.equal(game.smokeCalls.length, 0, '隠れているのに発煙した');

  // 壁を取り払って露出させ、次のチェック（ATTACKER_COVER_CHECK_INTERVAL tick後）
  // まで update() を回す。「隠れていた→露出した」その回で撒くのが正しい挙動。
  state.blocked = false;
  for (let i = 0; i < ATTACKER_COVER_CHECK_INTERVAL; i++) e.update();

  assert.equal(e.inCover, false, '露出したのに inCover のまま');
  assert.equal(game.smokeCalls.length, 1,
    `露出した瞬間に発煙していない（!this.inCover ガードが戻っていないか確認: ${game.smokeCalls.length}）`);
});

test('【統合】update() を SMOKE_COOLDOWN 回まわすと2回目が撃てる（クールダウンの減算が update() の中で進む）', () => {
  const { game, e } = setup('artillery'); // openWorld = 常に露出している世界
  e.maxSpeed = 0; // 距離を固定して cover-seek の分岐を安定させる（fix1 と無関係な揺れを排除）

  e.update(); // 最初のチェックで発煙（既存8本と同じ経路）
  assert.equal(game.smokeCalls.length, 1, '前提が崩れている: 最初の発煙が起きていない');

  for (let i = 0; i < SMOKE_COOLDOWN; i++) e.update();

  assert.equal(game.smokeCalls.length, 2,
    `SMOKE_COOLDOWN 回の update() 後に2回目の発煙が起きていない`
    + `（smokeCooldown-- が update() から消えたか、早期 return の先に移った疑い: ${game.smokeCalls.length}）`);
});
