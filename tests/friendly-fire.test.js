// 敵どうしの巻き添え（friendly fire）を無効にする。
//   1) 敵（ドローン・アタッカー）のグレネードと敵のミサイルの爆発では、近くの地雷が誘爆しない。
//      以前は爆発がすべて通る SpawnEffects.spawnExplosion() が、持ち主を見ずに範囲内の地雷を起爆していて、
//      地雷の爆風（applyBlastDamage）が game.enemies 全員に当たるので、敵の流れ弾で敵機が壊れていた。
//   2) 地雷は足場のブロックが壊れたら、格納塔と同じ fallToGround で下へ落ちる。
//
// 誘爆させてよいのは自機側の爆発と、倒した敵機の爆発（landmine-trigger.test.js が縛っている）だけ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { Missile } from '../src/js/entities/Missile.js';
import { Landmine } from '../src/js/entities/Landmine.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE, LANDMINE_BLAST_RADIUS, LANDMINE_HEIGHT } from '../src/js/utils/Constants.js';

/** 地雷1つと、その爆風の中に立つ敵1機だけの偽ゲーム。takeDamage の呼ばれた回数を数える */
function mineWorld() {
  const hits = [];
  const game = {
    particles: [], projectiles: [], landmines: [], enemies: [],
    player: null, carrier: null, camera: null, storageTowers: [],
    score: 0,
    addScore(n) { this.score += n; },
    spawnExplosion: SpawnEffects.spawnExplosion,
    map: {
      width: 10000, height: 10000,
      pixelToTile: (x, y) => ({ r: Math.floor(y / TILE_SIZE), c: Math.floor(x / TILE_SIZE) }),
      destroyArea: () => [],
      isSolidPoint: () => false,
    },
  };
  const mine = new Landmine(game, 200, 200);
  game.landmines.push(mine);
  const enemy = {
    x: mine.x + 4, y: mine.y - 20, width: 20, height: 20, alive: true,
    takeDamage(d) { hits.push(d); },
  };
  game.enemies.push(enemy);
  return { game, mine, enemy, hits };
}

function grenadeOn(game, mine, isPlayerOwned) {
  const g = new Grenade(game, mine.x + mine.width / 2, mine.y, 0);
  g.isPlayerOwned = isPlayerOwned;
  return g;
}

test('敵のグレネードの爆発では地雷は誘爆せず、敵機も巻き込まれない', () => {
  const { game, mine, hits } = mineWorld();
  grenadeOn(game, mine, false)._explode();
  assert.equal(mine.alive, true, '敵のグレネードで地雷が誘爆している');
  assert.equal(hits.length, 0, '敵のグレネードで敵機がダメージを受けている');
});

test('自機のグレネードは地雷を誘爆させ、爆風は敵機に届く（巻き添え無効は敵の弾だけ）', () => {
  const { game, mine, hits } = mineWorld();
  grenadeOn(game, mine, true)._explode();
  assert.equal(mine.alive, false, '自機のグレネードでも誘爆しなくなっている');
  assert.ok(hits.length >= 1, '地雷の爆風が敵機に届いていない');
});

test('敵のミサイルが地形で爆発しても地雷は誘爆しない。自機のミサイルは誘爆させる', () => {
  for (const [owned, expectAlive] of [[false, true], [true, false]]) {
    const { game, mine } = mineWorld();
    const m = new Missile(game, mine.x + mine.width / 2, mine.y, 0, owned);
    m.onTownWall(m.x, m.y);
    assert.equal(mine.alive, expectAlive, `isPlayerOwned=${owned} の爆発での地雷の生死が違う`);
  }
});

test('敵の爆発が地雷の爆風半径の中でも外でも、誘爆の判定は持ち主だけで決まる', () => {
  // 半径ぎりぎりの内側に置いても、敵の弾では起爆しない（距離で偶然守られていないこと）
  const { game, mine } = mineWorld();
  const g = new Grenade(game, mine.x + mine.width / 2, mine.y + LANDMINE_BLAST_RADIUS - 2, 0);
  g.isPlayerOwned = false;
  g._explode();
  assert.equal(mine.alive, true);
});

// ---------- 足場が壊れたら地雷は落ちる ----------

/** 床（行 10）の列 10〜13 に穴があり、その下の行 20 に床がある地図 */
function holeMap() {
  const rows = [];
  for (let r = 0; r < 10; r++) rows.push('.'.repeat(24));
  rows.push('#'.repeat(10) + '....' + '#'.repeat(10));
  for (let r = 11; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  const map = makeMap(rows);
  map.width = 24 * TILE_SIZE; map.height = 24 * TILE_SIZE;
  return map;
}

function mineAt(map, col, floorRow) {
  const game = { map, particles: [], landmines: [], enemies: [], spawnExplosion() {} };
  const mine = new Landmine(game, col * TILE_SIZE, floorRow * TILE_SIZE - LANDMINE_HEIGHT);
  game.landmines.push(mine);
  return mine;
}

test('床の上の地雷は動かない', () => {
  const mine = mineAt(holeMap(), 3, 10);
  const y0 = mine.y;
  for (let i = 0; i < 120; i++) mine.update();
  assert.equal(mine.y, y0);
});

test('足場が無い地雷は落ちて、下の床に着地する', () => {
  const mine = mineAt(holeMap(), 11, 10);
  mine.update();
  assert.ok(mine.y + mine.height > 10 * TILE_SIZE, '1フレーム目から落ち始めない');
  for (let i = 0; i < 300; i++) mine.update();
  assert.equal(mine.y + mine.height, 20 * TILE_SIZE, '下の床に着地していない');
  const yLanded = mine.y;
  for (let i = 0; i < 60; i++) mine.update();
  assert.equal(mine.y, yLanded, '着地のあとも動く');
  assert.equal(mine.alive, true);
});

// ---------- 落下中に敵以外の構造物に当たったら爆発する ----------
// 対象は格納塔と3面・4面・5面の町の建物（弾が止まる／すり抜けるの区別なく、かけらのある所に触れたら）。
// 敵機は対象外（敵が地雷を踏んで巻き添えになるのは friendly fire なので）。
// 床に乗っている地雷は見ない: 町は地雷の隣にも建つので、置いただけで起爆してはいけない。

import { StorageTower } from '../src/js/entities/StorageTower.js';

/** 穴の列（11）の上空から落とす地雷。mine.game に structures を足して返す */
function fallingMine(extra = {}) {
  const map = holeMap();
  const mine = mineAt(map, 11, 3);   // 行 3 の高さから落ちる（行 10 の穴を抜けて行 20 の床まで）
  Object.assign(mine.game, { storageTowers: [], ...extra });
  return mine;
}

function runUntilStops(mine, frames = 300) {
  for (let i = 0; i < frames && mine.alive; i++) mine.update();
}

test('落下中の地雷が格納塔に当たると爆発する', () => {
  const mine = fallingMine();
  // 塔は自前の game（どこも床の上）。地雷の落ちる道の途中（行 8 の床の上）に立てる
  const towerGame = { map: { isSolidPoint: () => true }, particles: [], projectiles: [], enemies: [] };
  mine.game.storageTowers.push(new StorageTower(towerGame, { x: 11 * TILE_SIZE + 8, y: 8 * TILE_SIZE, kind: 'life' }));
  runUntilStops(mine);
  assert.equal(mine.alive, false, '塔に落ちても爆発していない');
});

test('落下中の地雷が町の建物に当たると爆発する', () => {
  const b = { id: 1, x: 10 * TILE_SIZE, y: 8 * TILE_SIZE, width: 64, height: 16, cw: 16, ch: 4, cells: new Array(64).fill(1) };
  const town = {
    buildingsAt: (x, y) => (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height ? [b] : []),
    cellAt: (bb, x, y) => Math.floor((y - bb.y) / 4) * bb.cw + Math.floor((x - bb.x) / 4),
  };
  const mine = fallingMine();
  mine.game.map.town = town;
  runUntilStops(mine);
  assert.equal(mine.alive, false, '建物に落ちても爆発していない');
});

test('建物のかけらが欠けている（空の）ところを通り抜けるだけなら爆発しない', () => {
  const b = { id: 1, x: 10 * TILE_SIZE, y: 8 * TILE_SIZE, width: 64, height: 16, cw: 16, ch: 4, cells: new Array(64).fill(0) };
  const town = {
    buildingsAt: (x, y) => (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height ? [b] : []),
    cellAt: (bb, x, y) => Math.floor((y - bb.y) / 4) * bb.cw + Math.floor((x - bb.x) / 4),
  };
  const mine = fallingMine();
  mine.game.map.town = town;
  runUntilStops(mine);
  assert.equal(mine.alive, true);
  assert.equal(mine.y + mine.height, 20 * TILE_SIZE, '通り抜けて着地するはず');
});

test('落下中の地雷は、敵機に触れても爆発しない', () => {
  const enemy = { x: 11 * TILE_SIZE, y: 8 * TILE_SIZE, width: 20, height: 20, alive: true, takeDamage() { throw new Error('敵が巻き込まれた'); } };
  const mine = fallingMine({ enemies: [enemy] });
  runUntilStops(mine);
  assert.equal(mine.alive, true);
});

test('床に乗っている地雷は、隣の塔や建物では爆発しない', () => {
  const map = holeMap();
  const mine = mineAt(map, 3, 10);
  const towerGame = { map: { isSolidPoint: () => true }, particles: [], projectiles: [], enemies: [] };
  // 地雷と重なる位置に立つ塔。落下中でなければ見ない
  mine.game.storageTowers = [new StorageTower(towerGame, { x: mine.x + 6, y: 10 * TILE_SIZE, kind: 'life' })];
  for (let i = 0; i < 60; i++) mine.update();
  assert.equal(mine.alive, true);
});
