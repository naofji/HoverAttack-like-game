import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FortressBarrier } from '../src/js/entities/FortressBarrier.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';
import {
  BARRIER_EMITTER_HP, BARRIER_TOUCH_DAMAGE,
  BARRIER_KNOCKBACK_VX, BARRIER_KNOCKBACK_VY,
} from '../src/js/utils/Constants.js';

function makeGame(over = {}) {
  return {
    particles: [], projectiles: [], enemies: [],
    player: null, carrier: null, camera: null,
    spawnExplosion() {}, spawnDebris() {}, addScore() {},
    ...over,
  };
}

/** 列 c、行 top..bottom に張るバリア。 */
function makeBarrier(game, { c = 10, top = 4, bottom = 8 } = {}) {
  return new FortressBarrier(game, { c, top, bottom });
}

function makePlayer(x, y) {
  return {
    x, y, width: 16, height: 24, alive: true, docked: false, invincibleTimer: 0,
    vx: 0, vy: 0, hp: 100,
    takeDamage(n) { this.hp -= n; },
  };
}

test('バリアは上下2基のユニットを両方壊すまで消えない', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  assert.equal(b.active, true, '最初から消えている');
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  assert.equal(b.active, true, '片方だけで消えてしまった');
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  assert.equal(b.active, false, '両方壊しても消えない');
});

test('ユニットはミサイル2発ぶんの硬さ', async () => {
  const { DAMAGE_PLAYER_MISSILE } = await import('../src/js/utils/Constants.js');
  assert.equal(BARRIER_EMITTER_HP, DAMAGE_PLAYER_MISSILE * 2);
});

test('自機が触れるとダメージを受け、来た方向へ押し戻される', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  // バリアの左から突っ込む
  const player = makePlayer(b.fieldX - 8, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.ok(player.hp < 100, 'ダメージを受けていない');
  assert.ok(player.vx < 0, `左から来たのに左へ押し戻されていない (vx=${player.vx})`);
  assert.equal(player.vy, BARRIER_KNOCKBACK_VY);
  assert.equal(Math.abs(player.vx), BARRIER_KNOCKBACK_VX);
});

test('右から突っ込めば右へ押し戻される', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  // 場に重なりつつ、中心より右に居る位置
  const player = makePlayer(b.fieldX + b.fieldW - 2, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.ok(player.vx > 0, `右から来たのに右へ押し戻されていない (vx=${player.vx})`);
});

test('消えたバリアは自機に何もしない', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  const player = makePlayer(b.fieldX, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.equal(player.hp, 100, '消えたのにダメージを受けた');
  assert.equal(player.vx, 0);
});

test('弾もグレネードも吸収される（自機の弾も敵の弾も）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const at = (isPlayerOwned) => ({
    x: b.fieldX + 1, y: (4 + 1) * TILE_SIZE, alive: true, exploded: false, isPlayerOwned,
  });
  const mine = at(true);
  const theirs = at(false);
  game.projectiles = [mine, theirs];
  b.update();
  assert.equal(mine.alive, false, '自機の弾が吸収されていない');
  assert.equal(theirs.alive, false, '敵の弾が吸収されていない');
  // 吸収なので爆発しない（exploded を立てて爆発処理を抑える）
  assert.equal(mine.exploded, true);
});

test('ユニットに当たった自機の弾はユニットを削る（吸収されない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const proj = { x: b.topUnit.x + 2, y: b.topUnit.y + 2, alive: true, exploded: false, isPlayerOwned: true };
  game.projectiles = [proj];
  const before = b.emitterHP.top;
  b.update();
  assert.ok(b.emitterHP.top < before, 'ユニットが削れていない');
  assert.equal(proj.alive, false, '弾が消えていない');
});

test('敵は押し戻されるがダメージは受けない（守備隊が自滅しない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  let damaged = false;
  const enemy = {
    x: b.fieldX - 6, y: (4 + 1) * TILE_SIZE, width: 16, height: 12, alive: true,
    vx: 0, vy: 0, takeDamage() { damaged = true; },
  };
  game.enemies = [enemy];
  b.update();
  assert.equal(damaged, false, '守備隊が自分のバリアで削れている');
  assert.ok(enemy.vx < 0, '敵が押し戻されていない');
});

test('引数なしで update しても例外を投げない', () => {
  const b = makeBarrier(makeGame());
  b.update();
  b.update();
  assert.ok(true);
});

test('バリアは7面にだけ立ち、階の数だけある', async () => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const { Map } = await import('../src/js/world/Map.js');
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');

  for (const lv of [0, 6]) {
    const map = new Map({ rng: new SeededRNG(1) }, lv);
    const game = makeGame({ map });
    new SpawnManager(game).spawnBarriers();
    const want = map.fortressZones.reduce((a, z) => a + z.barriers.length, 0);
    assert.equal(game.barriers.length, want, `面${lv + 1} のバリアの数`);
    if (lv === 0) assert.equal(game.barriers.length, 0, '7面以外にバリアがある');
    else assert.ok(game.barriers.length > 0, '7面にバリアが無い');
  }
});

test('バリアは階の中に収まる（床や天井に埋まらない）', async () => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const { Map } = await import('../src/js/world/Map.js');
  const { BLOCK_EMPTY } = await import('../src/js/utils/Constants.js');
  const map = new Map({ rng: new SeededRNG(2) }, 6);
  for (const z of map.fortressZones) {
    for (const spec of z.barriers) {
      const b = new FortressBarrier(makeGame({ map }), spec);
      assert.ok(b.fieldH > 0, 'バリアの高さが 0 以下');
      // 帯が通る行が全部空洞であること
      for (let r = spec.top; r <= spec.bottom; r++) {
        assert.equal(map.grid[r][spec.c], BLOCK_EMPTY,
          `バリアの通り道が岩 (${r},${spec.c})`);
      }
    }
  }
});
