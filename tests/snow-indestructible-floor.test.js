// 5面でも、敵基地の無敵ブロック（磨いた青い板）の上には雪が無い。描画は積雪の帯を岩にしか描かないので、
// 滑り・雪煙・ホバーの粉雪・着弾の雪も同じく無敵ブロックの上では出さない（2026-11-25 実機の指摘
// 「破壊不能ブロックの上でも雪が舞ったり滑ったりするのはおかしい」）。
// 定義は world/mapShapes.js の blockHoldsSnow 1つで、積雪ビット・滑り・雪煙がみなそれを見る。
//
// 偽地図（tests/helpers/enemy-world.js）の 'B' が無敵ブロック。左半分が岩（雪）、右半分が無敵ブロックの床で、
// 同じ手順を岩の上でも回して「岩の上では出る」ことを毎回確かめる（出ない理由が別にあると恒真になるため）。

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { groundSlide } from '../src/js/utils/surface.js';
import { SHAPE_FULL } from '../src/js/utils/tileShape.js';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import {
  TILE_SIZE as T, ICE_SLIDE, PLAYER_HEIGHT, SNOW_KICK_LAND, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE,
  HOVER_SNOW_MIST_MIN_ALT, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL, ENEMY_SNOW_KICK_MIN_SPEED,
} from '../src/js/utils/Constants.js';

before(() => {
  // 本物の Map はタイルのキャッシュを canvas に焼くので、何もしない document を置く
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const FLOOR_Y = 20 * T;
const ROCK_X = 8 * T;    // 岩の床の上
const BASE_X = 28 * T;   // 無敵ブロックの床の上

/** row 20 から下が床。列 0〜19 は岩、列 20〜39 は無敵ブロック */
function rows() {
  const out = [];
  for (let r = 0; r < 20; r++) out.push('.'.repeat(40));
  for (let r = 20; r < 24; r++) out.push('#'.repeat(20) + 'B'.repeat(20));
  return out;
}

function snowGame() {
  const game = makeGame(makeMap(rows(), null, { envKind: 'snow', snowCaps: true }));
  game.env = SNOW;
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.mists = [];
  game.spawnSnowMist = (x, y, n) => game.mists.push(n);
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1366, height: 768 };
  return game;
}

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

/** 床の 2 タイル上から落として着地させ、着地までの雪煙と、着地後に右へ歩いてから離したときの vx を返す */
function landWalkRelease(x) {
  const game = snowGame();
  game.input = inputWith(new Set());
  const p = new Player(game, x, FLOOR_Y - 2 * T - PLAYER_HEIGHT);
  game.player = p;
  for (let i = 0; i < 120 && !p.onGround; i++) p.update();
  const landKicks = [...game.snowKicks];
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  const walkKicks = game.snowKicks.length - landKicks.length;
  game.input = inputWith(new Set());
  p.update();
  return { p, game, landKicks, walkKicks, vxAfterRelease: p.vx };
}

test('自機: 岩の床では着地・歩行で雪を蹴り、離しても滑る（対照）', () => {
  const r = landWalkRelease(ROCK_X);
  assert.ok(r.landKicks.includes(SNOW_KICK_LAND), JSON.stringify(r.landKicks));
  assert.ok(r.walkKicks >= 4, `歩いて ${r.walkKicks} 回`);
  assert.ok(Math.abs(r.vxAfterRelease) > 0.5, `離してすぐ止まった: ${r.vxAfterRelease}`);
});

test('自機: 無敵ブロックの床では着地・歩行で雪を蹴らず、離すとすぐ止まる（滑らない）', () => {
  const r = landWalkRelease(BASE_X);
  assert.ok(r.p.onTerrain, '床に乗っていない');
  assert.deepEqual(r.game.snowKicks, []);
  assert.equal(r.vxAfterRelease, 0);
  assert.equal(groundSlide(r.p, r.game), 0);
});

test('岩と無敵ブロックの境目で、中心が無敵ブロックの上なら滑らない・中心が岩の上なら滑る', () => {
  const game = snowGame();
  const at = (cx) => ({ x: cx - 8, y: FLOOR_Y - PLAYER_HEIGHT, width: 16, height: PLAYER_HEIGHT, onTerrain: true });
  assert.equal(groundSlide(at(20 * T + 4), game), 0);
  assert.equal(groundSlide(at(20 * T - 4), game), ICE_SLIDE);
});

/** 自機・敵アタッカーをホバーさせて、間引きの1周ぶん粉雪を呼ぶ */
function hoverMists(kind, x) {
  const game = snowGame();
  const clearance = (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2;
  const e = kind === 'player'
    ? new Player(game, x, FLOOR_Y - clearance - PLAYER_HEIGHT)
    : makeAttacker(game, x, FLOOR_Y - clearance - 24, 'standard');
  e.onGround = false;
  e.onTerrain = false;
  e.motion = SNOW.motionAt();
  for (let i = 0; i < HOVER_SNOW_MIST_INTERVAL; i++) e._kickHoverSnowMist();
  return game.mists.length;
}

for (const kind of ['player', 'attacker']) {
  test(`${kind}: 無敵ブロックの上でホバーしても粉雪は舞わない（岩の上では舞う）`, () => {
    assert.ok(hoverMists(kind, ROCK_X) > 0, '岩の上で出ていない');
    assert.equal(hoverMists(kind, BASE_X), 0);
  });
}

test('キャリア: 無敵ブロックの上では船体の下に粉雪が舞わない（岩の上では舞う）', () => {
  const run = (x) => {
    const game = snowGame();
    const c = new Carrier(game, x, 0);
    c.y = FLOOR_Y - (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2 - c.height;
    c.motion = SNOW.motionAt();
    for (let i = 0; i < HOVER_SNOW_MIST_INTERVAL; i++) c._kickHoverSnowMist();
    return game.mists.length;
  };
  assert.ok(run(ROCK_X) > 0, '岩の上で出ていない');
  assert.equal(run(BASE_X), 0);
});

test('敵アタッカー: 無敵ブロックの上を走っても雪を蹴らない（岩の上では蹴る）', () => {
  const run = (x) => {
    const game = snowGame();
    const e = makeAttacker(game, x, FLOOR_Y - 24, 'standard');
    e.onTerrain = true;
    e.onGround = true;
    e.vx = ENEMY_SNOW_KICK_MIN_SPEED + 1;
    e._kickSnow();
    return game.snowKicks.length;
  };
  assert.ok(run(ROCK_X) > 0, '岩の上で出ていない');
  assert.equal(run(BASE_X), 0);
});

test('戦車: 無敵ブロックの上を走っても雪を蹴らない（岩の上では蹴る）', () => {
  const run = (x) => {
    const game = snowGame();
    const t = new EnemyTank(game, x, FLOOR_Y - 12);
    game.enemies.push(t);
    for (let i = 0; i < 10; i++) t.update();
    // grounded は見ない: ホバー戦車は床の 0.3px 上を上下していて1フレームおきに途切れる（utils/surface.js）
    assert.ok(t.onTerrain && Math.abs(t.vx) > 0.1, `戦車が床を走っていない: onTerrain=${t.onTerrain} vx=${t.vx}`);
    return game.snowKicks.length;
  };
  assert.ok(run(ROCK_X) > 0, '岩の上で出ていない');
  assert.equal(run(BASE_X), 0);
});

// --- 本物の5面の地図: 積雪ビットと着弾の雪 ------------------------------------------

test('本物の5面: 無敵ブロックの上面には積雪ビットが立たず、着弾の雪（snowSurfaceY）も出ない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  let baseTops = 0, rockTops = 0;
  for (const seed of [1, 2, 3]) {
    const map = new Map({ rng: new SeededRNG(seed) }, 4);
    assert.equal(map.envKind, 'snow');
    for (let r = 1; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.grid[r - 1][c] !== BLOCK_EMPTY) continue;
        const x = c * T + T / 2, y = r * T;
        if (map.grid[r][c] === BLOCK_INDESTRUCTIBLE) {
          baseTops++;
          assert.equal(map.exposedAtGen[r * map.cols + c], 0, `seed ${seed} (${r},${c}) に積雪ビット`);
          assert.equal(map.snowSurfaceY(x, y - T, y + 4), null, `seed ${seed} (${r},${c}) から雪が舞う`);
        } else if (map.grid[r][c] !== BLOCK_EMPTY && map.tileShapeAt(r, c) === SHAPE_FULL) {
          if (map.snowSurfaceY(x, y - T, y + 4) === y) rockTops++;
        }
      }
    }
  }
  assert.ok(baseTops > 0, '無敵ブロックの上面が1つも無い（テストが何も見ていない）');
  assert.ok(rockTops > 0, '岩の上面からも雪が出ない（判定ごと壊れている）');
});

test('本物の5面: 無敵ブロックの上が壊れて空いても、無敵ブロックに積雪ビットは立たない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(1) }, 4);
  let checked = 0;
  for (let r = 1; r < map.rows && checked < 20; r++) {
    for (let c = 0; c < map.cols && checked < 20; c++) {
      if (map.grid[r][c] !== BLOCK_INDESTRUCTIBLE) continue;
      map._snowDressExposedBelow(r - 1, c);
      assert.equal(map.exposedAtGen[r * map.cols + c], 0, `(${r},${c})`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
