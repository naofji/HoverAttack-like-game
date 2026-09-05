// tests/environment-player-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, GRAVITY, PLAYER_MAX_SPEED, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE,
} from '../src/js/utils/Constants.js';

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

/** 決め打ちの係数を返す env。 */
function fixedEnv(motion) {
  return { motionAt: () => motion, sightScale: 1 };
}

function airbornePlayer(env) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = env;
  game.input = inputWith(new Set());
  // 床(row 20 = y 320)のはるか上に置く
  const p = new Player(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  game.player = p;
  return { game, p };
}

test('gravity is scaled by motion.gravity while falling', () => {
  const { p } = airbornePlayer(fixedEnv({ speed: 1, gravity: WATER_GRAVITY_SCALE, slide: 0 }));
  p.update();
  assert.equal(p.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

test('position advances by vy * speed', () => {
  const { p } = airbornePlayer(fixedEnv({ speed: WATER_SPEED_SCALE, gravity: 1, slide: 0 }));
  const y0 = p.y;
  p.update();
  // 1フレーム目: vy = GRAVITY、y は vy * speed だけ進む。
  // y0(=32) に加算してから引き戻す都合上、桁の丸めで最終ビットがずれる
  // （0.3*0.5 単体は誤差なしで正確に半分になるが、32 との加減算で桁落ちする）
  // ため、strict equal ではなく浮動小数の誤差を許すテストにする
  assert.ok(
    Math.abs((p.y - y0) - GRAVITY * WATER_SPEED_SCALE) < 1e-9,
    `y diff ${p.y - y0}`
  );
});

test('horizontal input on ice keeps full speed, releasing it slides instead of stopping', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = fixedEnv({ speed: 1, gravity: 1, slide: ICE_SLIDE });
  const p = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
  game.player = p;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  assert.equal(p.vx, PLAYER_MAX_SPEED);
  assert.ok(p.onGround);
  game.input = inputWith(new Set());
  p.update();
  assert.ok(Math.abs(p.vx - PLAYER_MAX_SPEED * ICE_SLIDE) < 1e-9, `vx ${p.vx}`);
  for (let i = 0; i < 200; i++) p.update();
  assert.equal(p.vx, 0); // いずれ止まる
});

test('ice slide is tuned to slide further (real-device: もう少し滑る)', () => {
  assert.ok(ICE_SLIDE >= 0.94, `ICE_SLIDE ${ICE_SLIDE}`);
});

test('on land releasing input still stops instantly', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const p = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
  game.player = p;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  game.input = inputWith(new Set());
  p.update();
  assert.equal(p.vx, 0);
});
