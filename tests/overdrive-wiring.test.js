// オーバードライブが実際の発射経路とシミュレーションに繋がっているか。
//
// 効果そのものは Player 側で押さえてあるので、ここで見るのは「本物の発射処理が
// その入口を通っているか」と「タイマーが減るのはシムティックの内側か」だけ。
// ソース文字列の grep では、呼び出しがあっても到達しない経路を拾えない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { PLAYER_MG_BURST_SIZE, OVERDRIVE_DURATION } from '../src/js/utils/Constants.js';

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

/** 本物の _fireMachineGun を、弾を溜めるだけの最小の Game で走らせる。 */
function fireOnce(player) {
  const host = { projectiles: [] };
  Game._fireMachineGun.call(host, player, 0, 0, 0);
  return host.projectiles.length;
}

test('通常時は MG を撃つと残弾が減る', () => {
  const p = new Player(makeGame(), 100, 100);
  assert.equal(fireOnce(p), 1, '弾が出ていない');
  assert.equal(p.mgBurstLeft, PLAYER_MG_BURST_SIZE - 1);
});

test('オーバードライブ中は MG を撃っても残弾が減らない', () => {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = OVERDRIVE_DURATION;
  for (let i = 0; i < 50; i++) {
    p.mgFireTimer = 0; // 連射間隔を無視して撃ち続ける
    fireOnce(p);
  }
  assert.equal(p.mgBurstLeft, PLAYER_MG_BURST_SIZE, '打ちっぱなしになっていない');
});

test('タイマーはシミュレーションティックで減る', () => {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = 10;
  p.overdriveMaxTimer = OVERDRIVE_DURATION;
  Game._updateOverdrive.call({ player: p });
  assert.equal(p.overdriveTimer, 9);
});

test('尽きたら 0 で止まる（負に潜らない）', () => {
  const p = new Player(makeGame(), 100, 100);
  p.overdriveTimer = 1;
  const host = { player: p };
  Game._updateOverdrive.call(host);
  Game._updateOverdrive.call(host);
  assert.equal(p.overdriveTimer, 0);
});

test('自機がいない・死んでいるときに呼んでも落ちない', () => {
  Game._updateOverdrive.call({ player: null });
  const p = new Player(makeGame(), 100, 100);
  p.alive = false;
  p.overdriveTimer = 5;
  Game._updateOverdrive.call({ player: p });
});
