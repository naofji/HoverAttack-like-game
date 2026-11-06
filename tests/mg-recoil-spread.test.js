// 自機のマシンガンの反動: 連射の1発目は照準どおり、2発目から広がる（utils/mgSpread.js と、その配線）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { Player } from '../src/js/entities/Player.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { nextMgShotIndex, mgShotSpread } from '../src/js/utils/mgSpread.js';
import {
  PLAYER_MG_SPREAD, PLAYER_MG_RECOIL_RAMP, PLAYER_MG_BURST_DELAY, PLAYER_MG_RECOIL_RECOVER, PLAYER_MG_BURST_SIZE,
} from '../src/js/utils/Constants.js';

test('ばらつきの幅は1発目が 0、RAMP 発かけて PLAYER_MG_SPREAD まで広がり、それ以上は増えない', () => {
  assert.equal(mgShotSpread(0), 0);
  assert.ok(mgShotSpread(1) > 0 && mgShotSpread(1) < PLAYER_MG_SPREAD);
  for (let i = 1; i < PLAYER_MG_RECOIL_RAMP; i++) assert.ok(mgShotSpread(i + 1) > mgShotSpread(i));
  assert.equal(mgShotSpread(PLAYER_MG_RECOIL_RAMP), PLAYER_MG_SPREAD);
  assert.equal(mgShotSpread(100), PLAYER_MG_SPREAD);
});

test('連射の間隔なら発数を数え続け、間が空いたら1発目に戻る', () => {
  const limit = PLAYER_MG_BURST_DELAY + PLAYER_MG_RECOIL_RECOVER;
  assert.equal(nextMgShotIndex(5, PLAYER_MG_BURST_DELAY), 5);
  assert.equal(nextMgShotIndex(5, limit), 5);
  assert.equal(nextMgShotIndex(5, limit + 1), 0);
  assert.equal(nextMgShotIndex(0, Infinity), 0);
});

function makeGame() {
  return {
    debugInvincible: false,
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [], landmines: [],
    ...SpawnEffects,
  };
}

// 引き金を握っている入力（弾切れのリロードを始めるのは自機の _updateMGReload）
const HELD = { mouse: { left: true }, isKeyDown: () => false };

/** 本物の自機のタイマー・リロード判定と本物の _fireMachineGun で、引き金を ticks の間握り続ける。撃った弾の角度を返す */
function hold(game, p, ticks, aim = 0) {
  const angles = [];
  for (let t = 0; t < ticks; t++) {
    p._updateTimers();
    p._updateMGReload(HELD);
    const before = game.projectiles.length;
    Game._fireMachineGun.call(game, p, 100, 100, aim);
    for (const b of game.projectiles.slice(before)) {
      if (b instanceof PlayerBullet) angles.push(Math.atan2(b.vy, b.vx));
    }
  }
  return angles;
}

test('押しっぱなしの連射: 1発目は照準どおり、2発目から広がる。離して間が空くと、また1発目は照準どおり', (tc) => {
  // 乱数を最大の側に固定して、ばらつきの幅そのものを角度で読む（(0.999999 - 0.5) × 幅 ≒ 幅/2）
  tc.mock.method(Math, 'random', () => 0.999999);
  const game = makeGame();
  const p = new Player(game, 100, 100);
  const aim = 0.3;
  const first = hold(game, p, PLAYER_MG_BURST_DELAY * 5, aim);
  assert.ok(first.length >= 5, `連射できていない: ${first.length} 発`);
  const off = first.map((a) => a - aim);
  assert.ok(Math.abs(off[0]) < 1e-12, `1発目がずれた: ${off[0]}`);
  for (let i = 1; i < off.length; i++) {
    assert.ok(Math.abs(off[i] - mgShotSpread(i) * 0.499999) < 1e-9, `${i + 1} 発目のずれ ${off[i]}`);
  }
  // 引き金を離す（撃たずにタイマーだけ進める）
  for (let t = 0; t < PLAYER_MG_BURST_DELAY + PLAYER_MG_RECOIL_RECOVER + 1; t++) p._updateTimers();
  const again = hold(game, p, PLAYER_MG_BURST_DELAY * 2, aim);
  assert.ok(Math.abs(again[0] - aim) < 1e-12, `撃ち直しの1発目がずれた: ${again[0] - aim}`);
  assert.ok(Math.abs(again[1] - aim) > 1e-6, '撃ち直しの2発目がずれていない');
});

test('弾倉を撃ち切ってリロードを挟んだあとの1発目も照準どおり', (tc) => {
  tc.mock.method(Math, 'random', () => 0.999999);
  const game = makeGame();
  const p = new Player(game, 100, 100);
  p.currentWeapon = 'mg';   // 既定はミサイル。mg でないと _updateMGReload が装填を始めない
  const angles = hold(game, p, PLAYER_MG_BURST_SIZE * PLAYER_MG_BURST_DELAY + 200, 0);
  assert.ok(angles.length > PLAYER_MG_BURST_SIZE, `リロード後に撃てていない: ${angles.length} 発`);
  assert.ok(Math.abs(angles[PLAYER_MG_BURST_SIZE]) < 1e-12, `リロード後の1発目がずれた: ${angles[PLAYER_MG_BURST_SIZE]}`);
});
