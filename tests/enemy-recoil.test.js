import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRecoil, tickRecoil, isRecoiling } from '../src/js/utils/Recoil.js';
import {
  ENEMY_RECOIL_FRAMES, ENEMY_RECOIL_PROFILES, ENEMY_TANK_SPEED,
} from '../src/js/utils/Constants.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';

function movable(profile) {
  return { vx: 0, vy: 0, recoilProfile: profile };
}

// --- ヘルパー単体 -----------------------------------------------------------

test('反動を受けると爆心から離れる向きへ速度が入り、タイマーが立つ', () => {
  const e = movable(ENEMY_RECOIL_PROFILES.drone);
  // dx > 0 は「敵が爆心より右」＝右へ押される
  assert.equal(applyRecoil(e, 10), true);
  assert.ok(e.vx > 0, `右へ押されていない: ${e.vx}`);
  assert.ok(e.vy < 0, `上へ浮いていない: ${e.vy}`);
  assert.equal(e.recoilTimer, ENEMY_RECOIL_FRAMES);
  assert.equal(isRecoiling(e), true);
});

test('爆心より左にいる敵は左へ押される', () => {
  const e = movable(ENEMY_RECOIL_PROFILES.drone);
  applyRecoil(e, -10);
  assert.ok(e.vx < 0, `左へ押されていない: ${e.vx}`);
});

test('反動プロファイルを持たない相手は何も起きない（砲台・基地）', () => {
  const fixed = { vx: 0, vy: 0 };            // プロファイル無し
  assert.equal(applyRecoil(fixed, 10), false);
  assert.equal(fixed.vx, 0);
  assert.equal(fixed.vy, 0);
  assert.ok(!fixed.recoilTimer);
});

test('重い機体ほど吹き飛ばない', () => {
  const P = ENEMY_RECOIL_PROFILES;
  assert.ok(P.heavy.vx < P.standard.vx, 'heavy が standard より飛ぶ');
  assert.ok(P.standard.vx < P.rival.vx, 'rival が standard より飛ばない');
  assert.ok(P.tank.vx < P.drone.vx, 'drone が戦車より飛ばない');
  for (const [name, p] of Object.entries(P)) {
    assert.ok(p.vx > 0, `${name}: 横の押しが0以下`);
    assert.ok(p.vy < 0, `${name}: 上向きに浮かない`);
  }
});

test('tickRecoil は数え下げて、尽きたら false を返す', () => {
  const e = movable(ENEMY_RECOIL_PROFILES.tank);
  applyRecoil(e, 10, 3);
  assert.equal(tickRecoil(e), true);
  assert.equal(tickRecoil(e), true);
  assert.equal(tickRecoil(e), true);
  assert.equal(tickRecoil(e), false, '4回目はもう反動中でない');
  assert.equal(isRecoiling(e), false);
});

test('反動していない相手に tickRecoil を呼んでも副作用がない', () => {
  const e = movable(ENEMY_RECOIL_PROFILES.tank);
  assert.equal(tickRecoil(e), false);
  assert.equal(e.vx, 0);
});

// --- 実際の敵に効くか -------------------------------------------------------

/**
 * 自機は敵の射程外に置く。射撃されると audioManager が window を参照して
 * DOM の無い node:test 環境で落ちるため（helpers の makeAttacker が
 * fireInterval を巨大にしているのも同じ理由）。
 */
function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = {
    x: 900, y: 20 * 16 - 24, width: 16, height: 24,
    alive: true, docked: false, vx: 0, vy: 0, hp: 100, takeDamage() {},
  };
  return game;
}

test('戦車は反動中に巡回速度で上書きされない', () => {
  // これが要点。EnemyTank は毎tick this.vx = patrolDir * SPEED を代入するため、
  // 速度を書き換えるだけでは次のフレームで消えてしまう。
  const game = world();
  const tank = new EnemyTank(game, 200, 20 * 16 - 12);
  game.enemies.push(tank);
  for (let i = 0; i < 10; i++) tank.update();   // 通常の巡回速度に落ち着かせる

  applyRecoil(tank, 10);
  const pushed = tank.vx;
  assert.ok(pushed > 0, `押されていない: ${pushed}`);

  tank.update();
  assert.ok(tank.vx > 0, `1tickで巡回速度に戻された: ${tank.vx}`);
});

test('ドローンは反動中に巡回速度で上書きされない', () => {
  const game = world();
  const drone = new EnemyDrone(game, 200, 100);
  game.enemies.push(drone);
  for (let i = 0; i < 10; i++) drone.update();

  applyRecoil(drone, 10);
  drone.update();
  assert.ok(drone.vx > 0, `巡回速度に戻された: ${drone.vx}`);
});

test('アタッカーは反動中に自分の移動制御で上書きされない', () => {
  const game = world();
  const e = makeAttacker(game, 200, 20 * 16 - 24, 'standard');
  for (let i = 0; i < 10; i++) e.update();

  applyRecoil(e, 10);
  e.update();
  assert.ok(e.vx > 0, `移動制御に戻された: ${e.vx}`);
});

test('反動が明ければ敵は自分の移動制御に戻る', () => {
  const game = world();
  const tank = new EnemyTank(game, 200, 20 * 16 - 12);
  game.enemies.push(tank);
  for (let i = 0; i < 10; i++) tank.update();
  const patrolSpeed = Math.abs(tank.vx);

  applyRecoil(tank, 10);
  for (let i = 0; i < ENEMY_RECOIL_FRAMES + 2; i++) tank.update();

  // 向きでは判定しない。戦車はこの間に壁や崖で正当に反転しうる。
  // 「反動の速度ではなく巡回の速度で動いている」ことを見る。
  assert.equal(isRecoiling(tank), false);
  // 反動の速度(1.0)ではなく、巡回の速度域(<=ENEMY_TANK_SPEED)に戻っていること。
  // 厳密な一致では判定しない。方向転換時は摩擦がかからず 0.5 になるなど、
  // 巡回中でも取りうる値が複数ある。
  const speed = Math.abs(tank.vx);
  assert.ok(speed <= ENEMY_TANK_SPEED + 1e-6,
    `まだ反動の速度で動いている: ${speed} (巡回時 ${patrolSpeed})`);
});

test('反動中も射撃処理は呼ばれ続ける（止まるのは移動だけ）', () => {
  // 実際に撃たせると audioManager が window を触って落ちるので、
  // 「射撃処理が抑制されていない」ことを呼び出し回数で確かめる。
  const game = world();
  const tank = new EnemyTank(game, 200, 20 * 16 - 12);
  game.enemies.push(tank);

  let shootCalls = 0;
  tank._handleShooting = () => { shootCalls++; };

  applyRecoil(tank, 10);
  for (let i = 0; i < ENEMY_RECOIL_FRAMES; i++) tank.update();

  assert.equal(shootCalls, ENEMY_RECOIL_FRAMES,
    '反動中に射撃処理が飛ばされている');
});

test('砲台は据え付けなので反動しない', () => {
  const game = world();
  const turret = new EnemyTurret(game, 200, 300, false);
  assert.equal(applyRecoil(turret, 10), false, '砲台が吹き飛んだ');
});
