import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  TILE_SIZE, ICE_SLIDE, SLOPE_DOWNHILL_ACCEL, SLOPE_UPHILL_SCALE, PLAYER_MAX_SPEED,
  SNOW_KICK_LAND, SNOW_KICK_WALK,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

// 幅30。左半分は床 row 11、列 10..19 が右へ下る階段（列 10 が row 11、列 19 が row 20）
function slopeRows() {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 30; c++) {
      let floor = 20;
      if (c >= 10 && c < 20) floor = 11 + (c - 10);
      if (c < 10) floor = 11;
      s += r >= floor ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

function snowWorld() {
  const game = makeGame(makeMap(slopeRows()));
  game.env = SNOW;
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  return game;
}

test('standing on a downhill staircase, the player accelerates downhill without input', () => {
  const game = snowWorld();
  game.input = inputWith(new Set());
  // 列 13 の段（row 14）に立つ
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 3; i++) p.update();
  assert.ok(p.vx > 0, `expected downhill (right) drift, vx=${p.vx}`);
  assert.ok(p.slopeDir === -1, `slopeDir ${p.slopeDir}`); // 左へ上る＝右へ下る
});

test('walking uphill on snow is slower than PLAYER_MAX_SPEED', () => {
  const game = snowWorld();
  game.input = inputWith(new Set(['KeyA'])); // 左 = 上り
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 3; i++) p.update();
  assert.ok(Math.abs(p.vx) <= PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE + 1e-9, `vx ${p.vx}`);
});

test('landing on snow kicks up snow; walking kicks a little each frame', () => {
  const game = snowWorld();
  game.input = inputWith(new Set());
  const p = new Player(game, 3 * TILE_SIZE, 9 * TILE_SIZE); // 平地(row 11)の少し上空
  // 高すぎると着地の衝撃でスタンして歩けなくなる（PLAYER_STUN_FALL_SPEED）ので 2 タイル
  game.player = p;
  for (let i = 0; i < 120 && !p.onGround; i++) p.update();
  assert.ok(game.snowKicks.includes(SNOW_KICK_LAND));
  game.snowKicks.length = 0;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  assert.ok(game.snowKicks.filter((n) => n === SNOW_KICK_WALK).length >= 4);
});

test('spawnSnowKick pushes count particles that rise then fall', () => {
  const game = { particles: [] };
  SpawnEffects.spawnSnowKick.call(game, 10, 10, 4);
  assert.equal(game.particles.length, 4);
  const p = game.particles[0];
  const y0 = p.y;
  p.update();
  assert.ok(p.y < y0);
});
