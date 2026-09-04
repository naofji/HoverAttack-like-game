import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  TILE_SIZE, ICE_SLIDE, SLOPE_UPHILL_SCALE, PLAYER_MAX_SPEED,
  SNOW_KICK_LAND, SNOW_KICK_WALK, SNOW_KICK_SLIDE,
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

test('respawn clears the slope state so the player does not snap to the old direction', () => {
  const game = snowWorld();
  game.input = inputWith(new Set());
  // 列 13 の段（row 14）に立ち、slopeDir を非0にしてから死んだことにする
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 3; i++) p.update();
  assert.notEqual(p.slopeDir, 0, '前提: 階段の上で slopeDir が立っていること');
  p.respawn(3 * TILE_SIZE, 5 * TILE_SIZE);
  assert.equal(p.slopeDir, 0);
  assert.equal(p.slopeCoyote, 0);
  assert.equal(p.drawOffsetY, 0);
});

test('walking uphill on snow is slower than PLAYER_MAX_SPEED', () => {
  const game = snowWorld();
  game.input = inputWith(new Set(['KeyA'])); // 左 = 上り
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  // 1段乗り上げた直後は数フレーム宙に浮く（段差の乗り上げが体を16px持ち上げる）ので、
  // 決め打ちのフレーム数で見ると空中のフレームを掴んでしまう。地上にいたフレームだけを見る
  const cap = PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE + 1e-9;
  let prevGrounded = p.onGround;
  let sampled = 0;
  for (let i = 0; i < 30; i++) {
    p.update();
    if (prevGrounded && p.onGround && p.slopeDir !== 0) {
      sampled++;
      assert.ok(Math.abs(p.vx) <= cap, `frame ${i}: vx ${p.vx}`);
    }
    prevGrounded = p.onGround;
  }
  assert.ok(sampled >= 3, `階段の上で地上にいたフレームが少なすぎる: ${sampled}`);
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

test('descending the staircase, the player is snapped down step by step instead of falling', () => {
  const game = snowWorld();
  game.input = inputWith(new Set(['KeyD'])); // 右 = 下り
  // 階段の2段目（列 11、床 row 12）から。1段目は階段の端で、両側を要求する
  // stairDirection が 0 を返す（設計どおり）ので、そこは吸着の対象外
  const p = new Player(game, 11 * TILE_SIZE, 12 * TILE_SIZE - 24);
  game.player = p;

  const y0 = p.y;
  let airborne = 0;
  let worstRise = 0;
  let prevY = p.y;
  for (let i = 0; i < 120; i++) {
    p.update();
    worstRise = Math.max(worstRise, prevY - p.y);
    prevY = p.y;
    if (!p.onGround) airborne++;
  }

  const steps = (p.y - y0) / TILE_SIZE;
  assert.equal(worstRise, 0, '下りの途中で持ち上がってはいけない');
  assert.ok(steps >= 5, `少なくとも5段は降りる: ${steps}`);
  // 吸着が効いていれば1段あたり空中は1フレーム程度。効かないと16pxの落下を
  // 重力 0.3/F で待つので1段あたり10フレーム前後になる
  assert.ok(airborne <= 2 * steps, `airborne ${airborne} for ${steps} steps`);
});

test('sliding on the staircase kicks the bigger slide-sized puff', () => {
  const game = snowWorld();
  game.input = inputWith(new Set()); // 入力なし。斜面の加速だけで滑る
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 10; i++) p.update();
  assert.ok(game.snowKicks.includes(SNOW_KICK_SLIDE), JSON.stringify(game.snowKicks));
});

/** 階段の上に戦車を置いて数フレーム回し、vx と雪の粒を返す。 */
function runTank(env) {
  const game = snowWorld();
  game.env = env;
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const t = new EnemyTank(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 12);
  t.patrolDir = -1; // 上り（左）向きに巡回させ、下りの加速で差が出るようにする
  t.facingRight = false;
  game.enemies.push(t);
  for (let i = 0; i < 6; i++) t.update();
  return { vx: t.vx, kicks: game.snowKicks };
}

test('a tank on a snow staircase is pushed downhill and kicks snow; on land neither happens', () => {
  const land = runTank(null);
  const snow = runTank(SNOW);
  // 下りは右なので、雪の上では陸上より vx が右寄りになる
  assert.ok(snow.vx > land.vx, `snow ${snow.vx} vs land ${land.vx}`);
  assert.ok(snow.kicks.length > 0, '雪の上では粒が出る');
  assert.equal(land.kicks.length, 0, '陸上では粒が出ない');
});

test('an airborne tank does not kick snow', () => {
  const game = snowWorld();
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  // 階段のはるか上空。落下中でも粒を撒かないこと
  const t = new EnemyTank(game, 13 * TILE_SIZE, 4 * TILE_SIZE);
  game.enemies.push(t);
  for (let i = 0; i < 5; i++) t.update();
  assert.equal(t.grounded, false);
  assert.deepEqual(game.snowKicks, []);
});
