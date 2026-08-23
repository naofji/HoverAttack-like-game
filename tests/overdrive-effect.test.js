// オーバードライブ中の弾の扱い。
//
// 効くのはミサイルと MG の2つだけ。グレネードは「ここぞで使う切り札」の役を
// 残すため対象外にしてある。
//
// MG は mgReload.js の6つの規則に一切触らずに実現している点が肝で、
// 「残弾が満タンのままなら装填条件が成立しない」ことで打ちっぱなしになる。
// その連鎖が本当に成立するかを、本物の shouldStartMGReload() で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import {
  MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT, PLAYER_MG_BURST_SIZE,
  OVERDRIVE_DURATION, OVERDRIVE_MAX_DURATION,
} from '../src/js/utils/Constants.js';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';

function makeGame() {
  return {
    debugInvincible: false,
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [],
    camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
    input: {
      mouse: { x: 0, y: 0, left: false },
      isKeyDown: () => false, isKeyPressed: () => false,
      getTargetWorld: () => ({ x: 0, y: 0 }),
      crosshairLocked: false,
    },
    spawnExplosion() { }, spawnHeavyDamage() { }, spawnSparks() { },
    spawnDebris() { }, addScore() { }, spawnSmokeScreen() { },
  };
}

function makePlayer() {
  return new Player(makeGame(), 100, 100);
}

test('新しい自機はオーバードライブを持っていない', () => {
  const p = makePlayer();
  assert.equal(p.overdriveTimer, 0);
  assert.equal(p.overdriveActive, false);
});

test('オーバードライブ中はミサイルが減らない', () => {
  const p = makePlayer();
  p.overdriveTimer = 10;
  for (let i = 0; i < 30; i++) p.consumeMissile();
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
});

test('切れるとミサイルは元どおり減る', () => {
  const p = makePlayer();
  p.overdriveTimer = 0;
  p.consumeMissile();
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT - 1);
});

test('オーバードライブ中も MG の残弾は減らない', () => {
  const p = makePlayer();
  p.overdriveTimer = 10;
  for (let i = 0; i < 40; i++) p.consumeMGRound();
  assert.equal(p.mgBurstLeft, PLAYER_MG_BURST_SIZE);
});

test('切れると MG の残弾は元どおり減る', () => {
  const p = makePlayer();
  p.consumeMGRound();
  assert.equal(p.mgBurstLeft, PLAYER_MG_BURST_SIZE - 1);
});

test('MG を撃ち続けても装填が始まらない（打ちっぱなしになる）', () => {
  // mgReload.js の規則に触らずに実現できているかを、本物の判定で確かめる。
  // 残弾が満タンのままなら 規則1(弾切れ) も 規則4(しきい値) も成立しない
  const p = makePlayer();
  p.overdriveTimer = 600;
  for (let i = 0; i < 100; i++) {
    p.consumeMGRound();
    const started = shouldStartMGReload(p.mgBurstLeft, PLAYER_MG_BURST_SIZE, true, { mode: 'always' });
    assert.equal(started, false, `${i} 発目で装填が始まった`);
  }
});

test('F の手動装填もオーバードライブ中は空振りする（満タンなので何も起きない）', () => {
  const p = makePlayer();
  p.overdriveTimer = 600;
  p.consumeMGRound();
  assert.equal(
    shouldStartMGReload(p.mgBurstLeft, PLAYER_MG_BURST_SIZE, false, { manual: true }),
    false,
  );
});

test('グレネードは対象外。オーバードライブ中でも減る', () => {
  const p = makePlayer();
  p.overdriveTimer = 600;
  p.consumeGrenade();
  assert.equal(p.grenades, GRENADE_INITIAL_COUNT - 1);
});

test('デバッグ無敵とオーバードライブは同居できる', () => {
  const game = makeGame();
  game.debugInvincible = true;
  const p = new Player(game, 100, 100);
  p.overdriveTimer = 600;
  p.consumeMissile();
  p.consumeMGRound();
  assert.equal(p.missiles, MISSILE_INITIAL_COUNT);
  assert.equal(p.mgBurstLeft, PLAYER_MG_BURST_SIZE);
});

test('リスポーンでオーバードライブは切れる', () => {
  const p = makePlayer();
  p.overdriveTimer = OVERDRIVE_DURATION;
  p.overdriveMaxTimer = OVERDRIVE_MAX_DURATION;
  p.respawn(50, 50);
  assert.equal(p.overdriveTimer, 0);
  assert.equal(p.overdriveMaxTimer, 0);
});

test('効果時間は 30〜45秒の範囲に収まる（normal 0.8x / newtype 1.0x の両方で）', () => {
  // タイマーはシムティックで減る。newtype は 60tick/秒、normal は 48tick/秒
  const newtypeSec = OVERDRIVE_DURATION / 60;
  const normalSec = OVERDRIVE_DURATION / (60 * 0.8);
  assert.ok(newtypeSec >= 30 && newtypeSec <= 45, `newtype で ${newtypeSec}秒`);
  assert.ok(normalSec >= 30 && normalSec <= 45, `normal で ${normalSec}秒`);
});
