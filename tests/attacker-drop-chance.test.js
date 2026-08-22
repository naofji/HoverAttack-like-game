// アタッカーの撃破ドロップ率。die() に直書きされていた確率を Constants へ出した。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACKER_HEAVY_DROP_CHANCE, ATTACKER_RIVAL_DROP_CHANCE, ATTACKER_ARTILLERY_DROP_CHANCE,
  ENEMY_ATTACKER_TYPES, DAMAGE_PLAYER_MISSILE, PLAYER_MG_DAMAGE, PLAYER_MG_BURST_SIZE,
} from '../src/js/utils/Constants.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';

const FLOOR_Y = 20 * 16 - 24;

/** Math.random を固定して die() を回す。確率の境界を跨いだかどうかだけを見る。 */
function dieWith(typeKey, roll) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.spawnDebris = () => { }; // die() は破壊演出を通る。共有ヘルパーには生えていない
  const e = makeAttacker(game, 64, FLOOR_Y, typeKey);
  const original = Math.random;
  Math.random = () => roll;
  try {
    e.die();
  } finally {
    Math.random = original;
  }
  return game;
}

test('ライバルのドロップ率は100%', () => {
  assert.equal(ATTACKER_RIVAL_DROP_CHANCE, 1);
});

test('heavy のドロップ率は 0.6（ライバルとの差は残す）', () => {
  assert.equal(ATTACKER_HEAVY_DROP_CHANCE, 0.6);
  assert.ok(ATTACKER_HEAVY_DROP_CHANCE < ATTACKER_RIVAL_DROP_CHANCE,
    'ライバルと同率になると「heavy を狙って落とす」選択が意味を失う');
});

test('artillery のドロップ率は据え置き', () => {
  assert.equal(ATTACKER_ARTILLERY_DROP_CHANCE, 0.5);
});

test('ライバルは倒せば必ずリペアキットを落とす', () => {
  // 100% なので、最も外れやすい出目でも落ちること
  const game = dieWith('rival', 0.999999);
  assert.equal(game.repairKits.length, 1, 'リペアキットが落ちていない');
});

test('heavy は出目次第でミサイルキットを落とす', () => {
  assert.equal(dieWith('heavy', 0.5).missileKits.length, 1);
  assert.equal(dieWith('heavy', 0.7).missileKits.length, 0);
});

test('artillery は出目次第でオートエイムユニットを落とす（率は変えていない）', () => {
  assert.equal(dieWith('artillery', 0.4).autoAimUnits.length, 1);
  assert.equal(dieWith('artillery', 0.6).autoAimUnits.length, 0);
});

test('ライバルはミサイルキットもオートエイムも落とさない', () => {
  const game = dieWith('rival', 0.1);
  assert.equal(game.missileKits.length, 0);
  assert.equal(game.autoAimUnits.length, 0);
});

// ------------------------------------------
// 耐久（ドロップと同じく「難しすぎる」への対応で触っている）
// ------------------------------------------

test('artillery は自機ミサイル2発ちょうどで落ちる', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.spawnDebris = () => { };
  const e = makeAttacker(game, 64, FLOOR_Y, 'artillery');

  e.takeDamage(DAMAGE_PLAYER_MISSILE);
  assert.equal(e.alive, true, '1発で落ちている（脆すぎる）');

  e.takeDamage(DAMAGE_PLAYER_MISSILE);
  assert.equal(e.alive, false, '2発で落ちていない');
});

test('artillery の HP はミサイル2発ぶんちょうど', () => {
  assert.equal(ENEMY_ATTACKER_TYPES.artillery.hp, DAMAGE_PLAYER_MISSILE * 2);
});

// 「ミサイルなら2発、MG だとなかなか落ちない」を数値で押さえる。
// HP を下げただけだと MG まで楽になってしまうので、MG にだけ効く軽減が要る
test('artillery は MG のダメージを半分しか受けない', () => {
  assert.equal(ENEMY_ATTACKER_TYPES.artillery.mgDamageMult, 0.5);
});

test('artillery を MG で落とすには弾倉1つでは足りない', () => {
  const perShot = PLAYER_MG_DAMAGE * ENEMY_ATTACKER_TYPES.artillery.mgDamageMult;
  const shots = Math.ceil(ENEMY_ATTACKER_TYPES.artillery.hp / perShot);
  assert.equal(shots, 20, `MG で落とすのに必要な弾数が想定外: ${shots}`);
  assert.ok(shots > PLAYER_MG_BURST_SIZE,
    `弾倉(${PLAYER_MG_BURST_SIZE}発)1つで落ちてしまう: ${shots}発`);
});

test('軽減を持たない型は MG の倍率を持たない（既存の敵は変わらない）', () => {
  for (const key of ['standard', 'heavy', 'rival']) {
    assert.equal(ENEMY_ATTACKER_TYPES[key].mgDamageMult, undefined, key);
  }
});

test('アタッカーは config の mgDamageMult を自分の属性として持つ', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  assert.equal(makeAttacker(game, 64, FLOOR_Y, 'artillery').mgDamageMult, 0.5);
  assert.equal(makeAttacker(game, 96, FLOOR_Y, 'heavy').mgDamageMult, 1,
    '軽減の無い型は等倍になっていない');
});
