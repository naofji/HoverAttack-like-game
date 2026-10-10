// 水中の泡（2026-10-11 ユーザー要望）: 水中でジェットを噴射すると泡が舞い、水中で爆発すると
// 泡が舞い上がる。粒は水の描画の泡（renderer.bubbles）に addBubble で足す。昇り方と描き方は
// environment-water-draw.test.js が縛る。ここは「どこで・いつ・何粒撒くか」。
//
// 撒く入口は SpawnEffects.spawnBubbles の本物を使う（水の中かどうかを粒ごとに見るのはそこなので、
// 差し替えて呼ばれた回数だけ数えると、水の外で噴射しても泡が出るバグを見逃す）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, makeAttacker, flatWaterRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, PLAYER_HEIGHT, BUBBLE_BURSTS, BLAST_BUBBLES_MAX, HOVER_JET_BUBBLE_INTERVAL,
  GRENADE_EXPLOSION_COUNT,
} from '../src/js/utils/Constants.js';

const SURFACE_Y = 20 * TILE_SIZE; // flatWaterRows(): row 20 から下が水（地図は 24 行なので y=384 まで）
const DEEP_Y = SURFACE_Y + 2 * TILE_SIZE;       // 水中の点（上下とも 2 タイルの水）
const UNDERWATER_FEET = SURFACE_Y + 3 * TILE_SIZE; // 機体が丸ごと水に沈む足元の高さ
const EMPTY_WORLD_ROWS = Array.from({ length: 24 }, () => '.'.repeat(24));

/** 水の面の game。renderer.addBubble に来た粒を bubbles に集める */
function waterGame() {
  const game = makeGame(makeMap(EMPTY_WORLD_ROWS, flatWaterRows()));
  const bubbles = [];
  game.env = {
    kind: 'water', sightScale: 1,
    motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }),
    renderer: { addBubble: (b) => bubbles.push(b), addRipple() {} },
  };
  game.landmines = [];
  game.spawnBubbles = SpawnEffects.spawnBubbles;
  game.spawnWaterColumn = SpawnEffects.spawnWaterColumn;
  return { game, bubbles };
}

// --- spawnBubbles ------------------------------------------------------------

test('spawnBubbles は水の中にだけ粒を置く（水面をまたぐ点では水側の粒だけ）', () => {
  const { game, bubbles } = waterGame();
  for (let i = 0; i < 50; i++) SpawnEffects.spawnBubbles.call(game, 100, SURFACE_Y, 'blast', 20);
  assert.ok(bubbles.length > 0, '前提: 水側の粒はある');
  assert.ok(bubbles.length < 50 * 20, '水の外の粒も置かれている');
  for (const b of bubbles) assert.ok(b.y >= SURFACE_Y, `水の外に置いた (y=${b.y})`);
});

test('spawnBubbles は水の外では何も置かない', () => {
  const { game, bubbles } = waterGame();
  SpawnEffects.spawnBubbles.call(game, 100, SURFACE_Y - 40, 'blast', 20);
  assert.deepEqual(bubbles, []);
});

test('spawnBubbles は水の無い面（renderer に addBubble が無い）でも例外を投げない', () => {
  const game = { map: { isWaterAtPixel: () => true }, env: { renderer: {} } };
  assert.doesNotThrow(() => SpawnEffects.spawnBubbles.call(game, 0, 0, 'jet'));
  assert.doesNotThrow(() => SpawnEffects.spawnBubbles.call({}, 0, 0, 'jet'));
});

test('噴射の泡は下向きに押し出され、浮力で昇る速さを持つ', () => {
  const { game, bubbles } = waterGame();
  for (let i = 0; i < 20; i++) SpawnEffects.spawnBubbles.call(game, 100, DEEP_Y, 'jet');
  assert.equal(bubbles.length, 20 * BUBBLE_BURSTS.jet.count);
  for (const b of bubbles) {
    assert.ok(b.up < 0, `下へ押し出されていない (up=${b.up})`);
    assert.ok(b.rise > 0, '昇らない');
  }
});

test('爆発の泡は全方向へ飛び散る', () => {
  const { game, bubbles } = waterGame();
  SpawnEffects.spawnBubbles.call(game, 100, DEEP_Y, 'blast', 200);
  assert.ok(bubbles.some((b) => b.vx < -1) && bubbles.some((b) => b.vx > 1), '左右へ散らない');
  assert.ok(bubbles.some((b) => b.up < -1) && bubbles.some((b) => b.up > 1), '上下へ散らない');
});

// --- 水中の爆発 ----------------------------------------------------------------

test('水中で爆発すると泡が舞い上がる。数は爆発の大きさに比例し、上限で止まる', () => {
  const grenade = waterGame();
  SpawnEffects.spawnExplosion.call(grenade.game, 100, DEEP_Y, GRENADE_EXPLOSION_COUNT);
  const mg = waterGame();
  SpawnEffects.spawnExplosion.call(mg.game, 100, DEEP_Y, 4);
  assert.ok(grenade.bubbles.length >= 30, `グレネードの泡が少ない (${grenade.bubbles.length})`);
  assert.ok(mg.bubbles.length > 0, '小さな爆発でも泡は出る');
  assert.ok(mg.bubbles.length < grenade.bubbles.length / 4, `小さな爆発の泡が多すぎる (${mg.bubbles.length})`);
  for (const b of grenade.bubbles) assert.ok(b.rise > 0, '昇らない');
});

test('とても大きな爆発でも泡は BLAST_BUBBLES_MAX で止まる', () => {
  const { game, bubbles } = waterGame();
  SpawnEffects.spawnExplosion.call(game, 100, DEEP_Y, 10000);
  assert.equal(bubbles.length, BLAST_BUBBLES_MAX);
});

test('空中の爆発では泡は出ない', () => {
  const { game, bubbles } = waterGame();
  SpawnEffects.spawnExplosion.call(game, 100, SURFACE_Y - 40, GRENADE_EXPLOSION_COUNT);
  assert.deepEqual(bubbles, []);
});

// --- 自機の噴射 ----------------------------------------------------------------

/** 足元が y の位置で自機を置く（ホバー中） */
function hoveringPlayer(feetY) {
  const w = waterGame();
  const p = new Player(w.game, 5 * TILE_SIZE, feetY - PLAYER_HEIGHT);
  p.onGround = false;
  p.onTerrain = false;
  p.hovering = true;
  w.game.player = p;
  return { ...w, p };
}

function callMany(fn, times = HOVER_JET_BUBBLE_INTERVAL * 4) {
  for (let i = 0; i < times; i++) fn();
}

test('水中でホバーすると、ノズルの下から泡が舞う', () => {
  const { p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  callMany(() => p._emitJetBubbles());
  assert.ok(bubbles.length > 0, '泡が出ていない');
  const n = p._hoverNozzle();
  for (const b of bubbles) {
    assert.ok(Math.abs(b.x - n.x) <= BUBBLE_BURSTS.jet.jitter, `ノズルの真下から出ていない (dx=${b.x - n.x})`);
    assert.ok(b.y > n.y, 'ノズルより上から出ている');
  }
});

test('左を向いていてもノズル（炎の出る点）の下から出る', () => {
  const { p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  p.facingRight = false;
  callMany(() => p._emitJetBubbles());
  const nx = p.x + p.width - 4;  // _drawBody のノズル矩形を左右反転した中心
  assert.ok(bubbles.length > 0);
  for (const b of bubbles) assert.ok(Math.abs(b.x - nx) <= BUBBLE_BURSTS.jet.jitter, `dx=${b.x - nx}`);
});

test('水の上空でホバーしても泡は出ない（水面の水滴の領分）', () => {
  const { p, bubbles } = hoveringPlayer(SURFACE_Y - 2 * TILE_SIZE);
  callMany(() => p._emitJetBubbles());
  assert.deepEqual(bubbles, []);
});

test('水中でもホバーしていなければ泡は出ない', () => {
  const { p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  p.hovering = false;
  callMany(() => p._emitJetBubbles());
  assert.deepEqual(bubbles, []);
});

test('噴射の泡は毎フレームは撒かない（HOVER_JET_BUBBLE_INTERVAL で間引く）', () => {
  const { p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  callMany(() => p._emitJetBubbles(), HOVER_JET_BUBBLE_INTERVAL - 1);
  assert.deepEqual(bubbles, []);
  p._emitJetBubbles();
  assert.equal(bubbles.length, BUBBLE_BURSTS.jet.count);
});

test('水中でバーストジャンプすると一吹きの泡が出る（本物の _updateBurstHover を通す）', () => {
  const { p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  p.hovering = false;
  p.onGround = true;
  p.hoverFuel = 9999;
  p._updateBurstHover({ isKeyDown: (k) => k === 'KeyW' });
  assert.equal(p.onGround, false, '前提: バーストジャンプした');
  assert.equal(bubbles.length, BUBBLE_BURSTS.burst.count);
});

test('update() の本物の流れでも水中のホバーで泡が出る', () => {
  const { game, p, bubbles } = hoveringPlayer(UNDERWATER_FEET);
  game.input = {
    isKeyDown: (k) => k === 'KeyW', isMouseDown: () => false, consumeKey: () => false,
    wasKeyPressed: () => false, getTargetWorld: () => ({ x: p.x + 100, y: p.y }),
  };
  p.hoverFuel = 9999;
  for (let i = 0; i < HOVER_JET_BUBBLE_INTERVAL * 4; i++) p.update();
  assert.ok(bubbles.length > 0, 'update() から泡が出ていない');
});

// --- 敵アタッカー ----------------------------------------------------------------

function hoveringAttacker(feetY) {
  const w = waterGame();
  w.game.camera = { x: 0, y: 0 };
  w.game.canvas = { width: 1366, height: 768 };
  const e = makeAttacker(w.game, 200, feetY - 24, 'standard');
  e.onGround = false;
  e.onTerrain = false;
  e.hovering = true;
  e.motion = w.game.env.motionAt();
  return { ...w, e };
}

test('敵アタッカーも水中でホバーすると、ノズルの下から泡が舞う（左右どちら向きでも）', () => {
  for (const facingRight of [true, false]) {
    const { e, bubbles } = hoveringAttacker(UNDERWATER_FEET);
    e.facingRight = facingRight;
    callMany(() => e._emitJetBubbles());
    assert.ok(bubbles.length > 0, `泡が出ていない (facingRight=${facingRight})`);
    // attacker/draw.js: 左向きは translate(x+width) + scale(-1, 1) の座標系に cfg.flameX を置く
    const nx = facingRight ? e.x + e.config.flameX : e.x + e.width - e.config.flameX;
    for (const b of bubbles) assert.ok(Math.abs(b.x - nx) <= BUBBLE_BURSTS.jet.jitter, `dx=${b.x - nx}`);
  }
});

test('敵アタッカーも水の上空やホバーしていないときは泡を出さない', () => {
  const above = hoveringAttacker(SURFACE_Y - 2 * TILE_SIZE);
  callMany(() => above.e._emitJetBubbles());
  assert.deepEqual(above.bubbles, []);

  const idle = hoveringAttacker(UNDERWATER_FEET);
  idle.e.hovering = false;
  callMany(() => idle.e._emitJetBubbles());
  assert.deepEqual(idle.bubbles, []);
});

test('敵アタッカーは画面外なら泡を撒かない', () => {
  const { game, e, bubbles } = hoveringAttacker(UNDERWATER_FEET);
  game.camera = { x: 5000, y: 0 };
  callMany(() => e._emitJetBubbles());
  e._jump();
  assert.deepEqual(bubbles, []);
});

test('敵アタッカーも水中でジャンプすると一吹きの泡が出る', () => {
  const { e, bubbles } = hoveringAttacker(UNDERWATER_FEET);
  e.hovering = false;
  e._jump();
  assert.equal(bubbles.length, BUBBLE_BURSTS.burst.count);
});

test('敵アタッカーの update() の本物の流れでも、水中で上の自機へ昇るホバーで泡が出る', () => {
  const { game, e, bubbles } = hoveringAttacker(UNDERWATER_FEET);
  // 真上の空中に自機を置き、敵が水中から昇ろうとしてホバーする状況にする
  game.player = { x: e.x, y: 4 * TILE_SIZE, width: 16, height: PLAYER_HEIGHT, alive: true, docked: false };
  // 噴射の泡だけを数える。敵は昇る途中でジャンプもするので、粒の数ではジャンプの泡と区別できない
  const kinds = [];
  game.spawnBubbles = function (x, y, kind, count) {
    kinds.push(kind);
    return SpawnEffects.spawnBubbles.call(this, x, y, kind, count);
  };
  let hovered = 0;
  for (let i = 0; i < 60; i++) {
    e.update();
    if (e.hovering) hovered++;
  }
  assert.ok(hovered >= HOVER_JET_BUBBLE_INTERVAL * 2, `前提: 敵がホバーしていない (${hovered} フレーム)`);
  assert.ok(kinds.includes('jet'), `update() から噴射の泡が出ていない (${kinds.join(',')})`);
  assert.ok(bubbles.length > 0, '泡が水の中に置かれていない');
});
