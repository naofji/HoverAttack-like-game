// オーバードライブキット（heavy が落とすレア版）。
//
// 通常のミサイル補給を継承していて、満タン補給の上に時限バフを乗せただけ。
// 同じ game.missileKits 配列に入るので、拾得の判定も描画の呼び出し側も
// 変えていない。その「継承で済ませた」形が崩れていないことも縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissileKit } from '../src/js/entities/MissileKit.js';
import { OverdriveKit } from '../src/js/entities/OverdriveKit.js';
import { Player } from '../src/js/entities/Player.js';
import {
  MISSILE_INITIAL_COUNT, OVERDRIVE_DURATION, OVERDRIVE_MAX_DURATION,
  ATTACKER_HEAVY_DROP_CHANCE, ATTACKER_HEAVY_OVERDRIVE_CHANCE,
  ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE, OVERDRIVE_LATE_MISSION,
} from '../src/js/utils/Constants.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';

const FLOOR_Y = 20 * 16 - 24;

function makeStubPlayer() {
  return {
    missiles: 3,
    overdriveTimer: 0,
    overdriveMaxTimer: 0,
    get overdriveActive() { return this.overdriveTimer > 0; },
  };
}

// ------------------------------------------
// 拾ったときの効果
// ------------------------------------------

test('拾うとミサイルが満タンになる（通常のキットと同じ）', () => {
  const p = makeStubPlayer();
  new OverdriveKit({}, 0, 0).onPickup(p);
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
});

test('拾うとオーバードライブが規定時間つく', () => {
  const p = makeStubPlayer();
  new OverdriveKit({}, 0, 0).onPickup(p);
  assert.equal(p.overdriveTimer, OVERDRIVE_DURATION);
});

test('重ね取りで延長できる', () => {
  const p = makeStubPlayer();
  const kit = new OverdriveKit({}, 0, 0);
  kit.onPickup(p);
  p.overdriveTimer -= 60; // 1秒ぶん使った
  kit.onPickup(p);
  assert.equal(p.overdriveTimer, OVERDRIVE_DURATION * 2 - 60);
});

test('重ね取りでも上限は超えない', () => {
  const p = makeStubPlayer();
  const kit = new OverdriveKit({}, 0, 0);
  for (let i = 0; i < 10; i++) kit.onPickup(p);
  assert.equal(p.overdriveTimer, OVERDRIVE_MAX_DURATION);
});

test('HUD バーの分母は「そのとき持っていた最大」になる', () => {
  // autoAim のように分母を上限に固定すると、1個拾っただけでバーが半分しか
  // 溜まらず「損をした」ように見える。拾った直後は必ず満タンで出す
  const p = makeStubPlayer();
  const kit = new OverdriveKit({}, 0, 0);
  kit.onPickup(p);
  assert.equal(p.overdriveMaxTimer, OVERDRIVE_DURATION, '1個目でバーが満タンにならない');
  kit.onPickup(p);
  assert.equal(p.overdriveMaxTimer, OVERDRIVE_DURATION * 2, '重ね取りで分母が伸びていない');
});

test('通常のミサイルキットはオーバードライブを付けない', () => {
  const p = makeStubPlayer();
  new MissileKit({}, 0, 0).onPickup(p);
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
  assert.equal(p.overdriveTimer, 0);
});

test('本物の Player に対しても効く（スタブと食い違っていない）', () => {
  const p = Object.create(Player.prototype);
  p.missiles = 0;
  p.overdriveTimer = 0;
  p.overdriveMaxTimer = 0;
  new OverdriveKit({}, 0, 0).onPickup(p);
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
  assert.equal(p.overdriveActive, true);
});

// ------------------------------------------
// 見た目（通常のキットと見分けがつくこと）
// ------------------------------------------

test('通常のキットと違う色で光る', () => {
  const rare = new OverdriveKit({}, 0, 0);
  const plain = new MissileKit({}, 0, 0);
  assert.notEqual(rare.glowColor, plain.glowColor, '拾う前に見分けがつかない');
});

test('アイコンを描く（真っ黒のまま出ない）', () => {
  const ctx = makeFakeCtx();
  new OverdriveKit({}, 0, 0).drawIcon(ctx, 0, 0, 0.5);
  assert.ok(ctx.calls.length > 0, 'アイコンが描かれていない');
});

// ------------------------------------------
// ドロップの振り分け
// ------------------------------------------

/**
 * Math.random を固定して die() を回す（既存の attacker-drop-chance.test.js と同じ形）。
 *
 * 出目を「列」で与えないのは、die() が先に破壊演出を回して Math.random を
 * 何度も消費するから。何番目の引きが確率判定に当たるかは当てにできない。
 * 固定なら「落とすか」も「レア版か」も同じ出目としきい値の比較になる。
 */
function dieWith(roll, missionsCompleted = 0) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.missionsCompleted = missionsCompleted;
  game.spawnDebris = () => { };
  const e = makeAttacker(game, 64, FLOOR_Y, 'heavy');
  const original = Math.random;
  Math.random = () => roll;
  try {
    e.die();
  } finally {
    Math.random = original;
  }
  return game;
}

test('レア版に当たるとオーバードライブキットが落ちる', () => {
  const game = dieWith(ATTACKER_HEAVY_OVERDRIVE_CHANCE - 0.01);
  assert.equal(game.missileKits.length, 1);
  assert.ok(game.missileKits[0] instanceof OverdriveKit);
});

test('レア版を外すと通常のミサイルキットが落ちる', () => {
  const roll = (ATTACKER_HEAVY_OVERDRIVE_CHANCE + ATTACKER_HEAVY_DROP_CHANCE) / 2;
  const game = dieWith(roll); // ドロップはする／レア版は外す出目
  assert.equal(game.missileKits.length, 1);
  assert.ok(game.missileKits[0] instanceof MissileKit);
  assert.ok(!(game.missileKits[0] instanceof OverdriveKit), 'レア版が出てしまっている');
});

test('ドロップ自体を外せば何も落ちない（ドロップ率は変えていない）', () => {
  assert.equal(dieWith(ATTACKER_HEAVY_DROP_CHANCE + 0.01).missileKits.length, 0);
});

test('6面以降はレア版の窓が広い', () => {
  // 5面までなら外れ、6面以降なら当たる出目
  const roll = (ATTACKER_HEAVY_OVERDRIVE_CHANCE + ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE) / 2;
  const early = dieWith(roll, OVERDRIVE_LATE_MISSION - 1);
  const late = dieWith(roll, OVERDRIVE_LATE_MISSION);
  assert.ok(!(early.missileKits[0] instanceof OverdriveKit), '5面でレア版が出ている');
  assert.ok(late.missileKits[0] instanceof OverdriveKit, '6面でレア版が出ていない');
});

test('OverdriveKit は MissileKit を継承している（配列も判定も共用できる）', () => {
  assert.ok(new OverdriveKit({}, 0, 0) instanceof MissileKit);
});

// ------------------------------------------
// 音（拾ったときの起動音）
// ------------------------------------------

test('レア版を拾うと専用の起動音が鳴る', () => {
  // 通常の拾得音（playPickup）は PickupItem 側で鳴る。こちらはその上に
  // 重ねる「バフが入った」合図なので、別に鳴っていることを見る
  const original = audioManager.playWeapon;
  const kinds = [];
  audioManager.playWeapon = (kind) => kinds.push(kind);
  try {
    new OverdriveKit({}, 0, 0).onPickup(makeStubPlayer());
  } finally {
    audioManager.playWeapon = original;
  }
  assert.deepEqual(kinds, ['overdrive']);
});

test('通常のミサイルキットは起動音を鳴らさない', () => {
  const original = audioManager.playWeapon;
  const kinds = [];
  audioManager.playWeapon = (kind) => kinds.push(kind);
  try {
    new MissileKit({}, 0, 0).onPickup(makeStubPlayer());
  } finally {
    audioManager.playWeapon = original;
  }
  assert.deepEqual(kinds, []);
});

test('起動音が音の表にある', () => {
  assert.ok(WEAPON_SOUNDS.overdrive, 'WEAPON_SOUNDS に overdrive が無い');
});
