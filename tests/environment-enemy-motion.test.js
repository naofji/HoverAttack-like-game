// 敵機・母艦の物理（重力・位置更新）が環境の係数を掛けて動くことを縛る。
// Player.js（タスク4）と同じ形: motionFor() を中心座標で引き、
// vy += GRAVITY * motion.gravity / x,y += v * motion.speed。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, GRAVITY, WATER_GRAVITY_SCALE, WATER_SPEED_SCALE,
  PLAYER_MAX_FALLING_SPEED, WATER_FALL_SPEED_SCALE, ENEMY_ATTACKER_TYPES,
} from '../src/js/utils/Constants.js';
import { LAND_MOTION, WATER_MOTION } from '../src/js/world/StageEnvironment.js';

const WATER = { motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }), sightScale: 1 };

function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  game.input = { isKeyDown: () => false, isKeyPressed: () => false };
  return game;
}

test('tank falls with scaled gravity and scaled displacement', () => {
  const game = world();
  const t = new EnemyTank(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  t.fireInterval = 1e9;
  const y0 = t.y;
  t.update();
  assert.equal(t.vy, GRAVITY * WATER_GRAVITY_SCALE);
  assert.ok(Math.abs((t.y - y0) - t.vy * WATER_SPEED_SCALE) < 1e-9);
});

test('attacker falls with scaled gravity', () => {
  const game = world();
  const a = makeAttacker(game, 5 * TILE_SIZE, 2 * TILE_SIZE, 'standard');
  a.update();
  assert.equal(a.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

test('carrier falls with scaled gravity', () => {
  const game = world();
  const c = new Carrier(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  game.carrier = c;
  c.update();
  assert.equal(c.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

// 水中での落下の上限と浮上の推力は、敵アタッカーの全型で自機と同じ扱いにする。
// 以前は敵だけ落下の上限が空気中の 7.0 のままで、深く沈むと実速度 3.5px/フレーム
// （自機は 7.0×0.42×0.5 ≒ 1.47）まで加速し、推力も水中で半分にしていなかった（実機の指摘）。
const ATTACKER_TYPE_KEYS = Object.keys(ENEMY_ATTACKER_TYPES);

test('全型のアタッカーが水中では自機と同じ落下の上限で止まる', () => {
  const cap = PLAYER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE;
  for (const key of ATTACKER_TYPE_KEYS) {
    const game = world();
    const a = makeAttacker(game, 5 * TILE_SIZE, 2 * TILE_SIZE, key);
    a.vy = PLAYER_MAX_FALLING_SPEED; // 空中で加速しきって水に飛び込んだ
    a.update();
    assert.ok(a.vy <= cap + 1e-9, `${key}: vy ${a.vy} が上限 ${cap} を超えた`);
  }
});

test('全型のアタッカーの浮上の推力は水中で自機と同じく WATER_SPEED_SCALE 倍になる', () => {
  for (const key of ATTACKER_TYPE_KEYS) {
    for (const [motion, scale] of [[LAND_MOTION, 1], [WATER_MOTION, WATER_SPEED_SCALE]]) {
      const game = world();
      const a = makeAttacker(game, 5 * TILE_SIZE, 2 * TILE_SIZE, key);
      a.motion = motion;
      // 'jump' / 'boost' は昇っている最中しか吹かさないので、わずかに上向きから始める
      a.vy = -0.1;
      assert.equal(a._applyAerialThrust(-10), true, `${key}: 推力が掛からなかった`);
      const expected = -0.1 - a.config.climbThrust * scale;
      assert.ok(Math.abs(a.vy - expected) < 1e-9, `${key} (×${scale}): vy ${a.vy}, 期待 ${expected}`);
    }
  }
});
