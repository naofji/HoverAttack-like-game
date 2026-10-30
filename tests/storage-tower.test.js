// 格納塔（壊すと中身が出る塔）と、中身の種類→アイテムの表。
// 設計: docs/superpowers/specs/2026-10-31-stage7-storage-towers-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnItem } from '../src/js/entities/itemKinds.js';
import { Game } from '../src/js/main.js';
import { RepairKit } from '../src/js/entities/RepairKit.js';
import { OverdriveKit } from '../src/js/entities/OverdriveKit.js';
import { ExtraLifeKit } from '../src/js/entities/ExtraLifeKit.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

function itemGame() {
  return { repairKits: [], missileKits: [], lifeKits: [] };
}

// ---------- 中身の種類→アイテムの表 ----------

test('spawnItem は kind ごとに正しいクラスを正しい配列に入れる', () => {
  const cases = [
    ['overdrive', OverdriveKit, 'missileKits'],
    ['repair', RepairKit, 'repairKits'],
    ['life', ExtraLifeKit, 'lifeKits'],
  ];
  for (const [kind, cls, list] of cases) {
    const game = itemGame();
    const item = spawnItem(game, kind, 100, 50);
    assert.ok(item instanceof cls, `${kind} のクラスが違う`);
    assert.deepEqual(game[list], [item], `${kind} が ${list} に入っていない`);
    for (const other of ['repairKits', 'missileKits', 'lifeKits'].filter((l) => l !== list)) {
      assert.equal(game[other].length, 0, `${kind} が ${other} にも入った`);
    }
    // PickupItem と同じ座標の約束（x は中心、y は上端）
    assert.equal(item.x + item.width / 2, 100);
    assert.equal(item.y, 50);
  }
});

test('spawnItem は未知の kind で例外を投げる（黙ってリペアにしない）', () => {
  assert.throws(() => spawnItem(itemGame(), 'nope', 0, 0));
});

// ---------- 格納塔の本体 ----------

import { StorageTower, damageTowersInRadius } from '../src/js/entities/StorageTower.js';
import { Missile } from '../src/js/entities/Missile.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { ITEM_SIZE } from '../src/js/entities/PickupItem.js';
import {
  STORAGE_TOWER_W, STORAGE_TOWER_H, STORAGE_TOWER_HP,
  DAMAGE_PLAYER_MISSILE, PLAYER_MG_DAMAGE, GRENADE_DAMAGE_RADIUS,
} from '../src/js/utils/Constants.js';

/** 弾と塔だけの偽ゲーム。地図は何も無い空（グレネードの地形破壊は空振りさせる）。 */
function towerGame() {
  const game = {
    projectiles: [], particles: [], enemies: [], storageTowers: [],
    repairKits: [], missileKits: [], lifeKits: [],
    score: 0,
    addScore(n) { this.score += n; },
    spawnExplosion() {},
    map: {
      width: 10000, height: 10000,
      pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
      destroyArea: () => [],
    },
  };
  return game;
}

function addTower(game, x = 200, y = 300, kind = 'life') {
  const t = new StorageTower(game, { x, y, kind });
  game.storageTowers.push(t);
  return t;
}

/** 塔の中心に自機の弾を置く */
function shootAt(game, t, Cls, ...rest) {
  const p = new Cls(game, t.x + t.width / 2, t.y + t.height / 2, 0, ...rest);
  game.projectiles.push(p);
  return p;
}

test('塔の寸法は自機と同じ 16×24、HP はミサイルちょうど1発', () => {
  assert.equal(STORAGE_TOWER_W, 16);
  assert.equal(STORAGE_TOWER_H, 24);
  assert.equal(STORAGE_TOWER_HP, DAMAGE_PLAYER_MISSILE);
});

test('塔は下端が y、中心が x に立つ', () => {
  const t = addTower(towerGame(), 200, 300);
  assert.equal(t.y + t.height, 300);
  assert.equal(t.x + t.width / 2, 200);
  assert.equal(t.width, 16);
  assert.equal(t.height, 24);
  assert.equal(t.hp, t.maxHp);
});

test('自機のミサイル1発で壊れ、中身が1個だけ出る', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'life');
  const m = shootAt(game, t, Missile, true);
  t.update();
  assert.equal(t.alive, false);
  assert.equal(game.lifeKits.length, 1);
  assert.equal(game.repairKits.length + game.missileKits.length, 0);
  assert.equal(m.alive, false);
  assert.equal(m.exploded, true, 'ミサイルが消費されていない（地形にも当たって爆発する）');
});

test('機関砲は4発では壊れず5発で壊れる', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'repair');
  assert.equal(STORAGE_TOWER_HP / PLAYER_MG_DAMAGE, 5);
  for (let i = 0; i < 4; i++) {
    const b = shootAt(game, t, PlayerBullet);
    t.update();
    assert.equal(b.alive, false, '当たった弾が消えていない');
  }
  assert.equal(t.alive, true, '4発で壊れた');
  assert.equal(game.repairKits.length, 0);
  shootAt(game, t, PlayerBullet);
  t.update();
  assert.equal(t.alive, false, '5発で壊れない');
  assert.equal(game.repairKits.length, 1);
});

test('自機のグレネードの爆風は中心から半径の内側で壊し、外側では壊さない', () => {
  for (const [d, broken] of [[GRENADE_DAMAGE_RADIUS - 1, true], [GRENADE_DAMAGE_RADIUS + 1, false]]) {
    const game = towerGame();
    const t = addTower(game, 200, 300, 'overdrive');
    const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
    const g = new Grenade(game, cx + d, cy, 0);
    g._explode();
    assert.equal(t.alive, !broken, `距離 ${d}px`);
    assert.equal(game.missileKits.length, broken ? 1 : 0);
  }
});

test('敵のミサイルと敵のグレネードでは削れない', () => {
  const game = towerGame();
  game.player = null; game.carrier = null;
  const t = addTower(game);
  const m = shootAt(game, t, Missile, false);
  t.update();
  assert.equal(t.hp, t.maxHp, '敵のミサイルで削れた');
  assert.equal(m.alive, true, '敵のミサイルを塔が吸った');
  const g = new Grenade(game, t.x + t.width / 2, t.y + t.height / 2, 0);
  g.isPlayerOwned = false;
  g._explode();
  assert.equal(t.hp, t.maxHp, '敵のグレネードで削れた');
});

test('壊れた塔に当たっても2個目は出ず、弾も消費されない', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'repair');
  shootAt(game, t, Missile, true);
  t.update();
  const second = shootAt(game, t, Missile, true);
  t.update();
  assert.equal(game.repairKits.length, 1);
  assert.equal(second.alive, true);
  damageTowersInRadius(game, t.x + t.width / 2, t.y + t.height / 2, 40, 999);
  assert.equal(game.repairKits.length, 1, '爆風で2個目が出た');
});

test('同じフレームに2発当たっても中身は1個', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'repair');
  shootAt(game, t, Missile, true);
  const second = shootAt(game, t, Missile, true);
  t.update();
  assert.equal(game.repairKits.length, 1);
  assert.equal(second.alive, true, '壊れた後の弾まで吸った');
});

test('中身は塔の足元の床の上に出る', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'life');
  shootAt(game, t, Missile, true);
  t.update();
  const item = game.lifeKits[0];
  assert.equal(item.y + ITEM_SIZE, 300);
  assert.equal(item.x + item.width / 2, 200);
});

test('塔を壊してもスコアは入らず、敵の一覧にも入らない', () => {
  const game = towerGame();
  const t = addTower(game);
  shootAt(game, t, Missile, true);
  t.update();
  assert.equal(game.score, 0);
  assert.equal(game.enemies.length, 0);
});

test('塔の外を飛ぶ弾には反応しない', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300);
  const m = new Missile(game, t.x - 2, t.y + 5, 0, true);
  game.projectiles.push(m);
  t.update();
  assert.equal(t.hp, t.maxHp);
  assert.equal(m.alive, true);
});

test('damage を壊れた後に呼んでも2個目は出ない（呼び出し側の見張りに頼らない）', () => {
  const game = towerGame();
  const t = addTower(game, 200, 300, 'repair');
  assert.equal(t.damage(999), true);
  assert.equal(t.damage(999), false);
  assert.equal(game.repairKits.length, 1);
});

// ---------- 絵（黄白色の円筒・足台・オレンジの横縞の明滅） ----------

import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  STORAGE_TOWER_STRIPE_COLOR, STORAGE_TOWER_STRIPE_COUNT, STORAGE_TOWER_STAND_COLOR,
  STORAGE_TOWER_STAND_H, STORAGE_TOWER_BLINK_PERIOD,
  STORAGE_TOWER_STRIPE_EDGE_COLOR, STORAGE_TOWER_STRIPE_H, STORAGE_TOWER_STRIPE_LIFT,
  STORAGE_TOWER_STRIPE_ALPHA_MIN, STORAGE_TOWER_STRIPE_ALPHA_MAX,
} from '../src/js/utils/Constants.js';

/** fillRect ごとに、その時の fillStyle と globalAlpha を付けて返す */
function fills(ctx) {
  let style = '', alpha = 1;
  const out = [];
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') style = c.args[0];
    else if (c.name === 'set:globalAlpha') alpha = c.args[0];
    else if (c.name === 'fillRect') out.push({ style, alpha, x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3] });
  }
  return out;
}

test('横縞の明るさは時間で MIN と MAX の間をなめらかに往復する', () => {
  const t = addTower(towerGame(), 200, 300);
  const seen = [];
  for (let i = 0; i < STORAGE_TOWER_BLINK_PERIOD; i++) { t.timer = i; seen.push(t.stripeAlpha()); }
  const lo = Math.min(...seen), hi = Math.max(...seen);
  assert.ok(Math.abs(lo - STORAGE_TOWER_STRIPE_ALPHA_MIN) < 0.02, `最小 ${lo}`);
  assert.ok(Math.abs(hi - STORAGE_TOWER_STRIPE_ALPHA_MAX) < 0.02, `最大 ${hi}`);
  // なめらか: 1フレームでの変化は振幅の 1/5 より小さい（ぱっと点いたり消えたりしない）
  for (let i = 1; i < seen.length; i++) {
    assert.ok(Math.abs(seen[i] - seen[i - 1]) < (hi - lo) / 5, `${i} フレーム目で跳んだ`);
  }
});

test('隣の塔（2タイル隣）とは同じ時刻でも明るさが違う', () => {
  const game = towerGame();
  const a = addTower(game, 200, 300);
  const b = addTower(game, 232, 300);
  a.timer = b.timer = 10;
  assert.notEqual(a.stripeAlpha(), b.stripeAlpha());
});

test('draw は足台・円筒・横縞を塔の矩形の中に描く', () => {
  const t = addTower(towerGame(), 200, 300);
  t.timer = 7;
  const ctx = makeFakeCtx();
  t.draw(ctx);
  const f = fills(ctx);
  assert.ok(f.length > 0);
  for (const r of f) {
    assert.ok(r.x >= t.x && r.y >= t.y && r.x + r.w <= t.x + t.width && r.y + r.h <= t.y + t.height,
      `矩形の外に塗った: ${JSON.stringify(r)}`);
  }
  const stripes = f.filter((r) => r.style === STORAGE_TOWER_STRIPE_COLOR);
  assert.equal(stripes.length, STORAGE_TOWER_STRIPE_COUNT, '横縞の本数');
  for (const s of stripes) {
    assert.ok(Math.abs(s.alpha - t.stripeAlpha()) < 1e-9, '横縞の明るさが明滅の値になっていない');
    assert.ok(s.y + s.h <= t.y + t.height - STORAGE_TOWER_STAND_H, '横縞が足台にかかった');
  }
  const stand = f.filter((r) => r.style === STORAGE_TOWER_STAND_COLOR);
  assert.ok(stand.length > 0, '足台が無い');
  for (const s of stand) assert.ok(s.y >= t.y + t.height - STORAGE_TOWER_STAND_H, '足台が円筒にかかった');
});

test('壊れた塔は何も描かない', () => {
  const t = addTower(towerGame());
  t.damage(999);
  const ctx = makeFakeCtx();
  t.draw(ctx);
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, 0);
});

// ---------- 置き場所の一覧とゲームへの組み込み ----------

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { FORTRESS_TREASURE_COUNT, TILE_SIZE, BLOCK_EMPTY } from '../src/js/utils/Constants.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

async function stage7Maps() {
  const { Map } = await import('../src/js/world/Map.js');
  return SEEDS.map((s) => new Map({ rng: new SeededRNG(s) }, 6));
}

function spawnGame(map) {
  return { map, storageTowers: [], repairKits: [], missileKits: [], lifeKits: [] };
}

test('実際の7面: お宝の位置ごとに塔が1本ずつ立ち、むき出しのアイテムは無い', async () => {
  for (const m of await stage7Maps()) {
    const game = spawnGame(m);
    new SpawnManager(game).spawnStorageTowers();
    assert.equal(game.storageTowers.length, m.fortressZones.length * FORTRESS_TREASURE_COUNT);
    assert.ok(game.storageTowers.every((t) => t instanceof StorageTower));
    assert.equal(game.repairKits.length + game.missileKits.length + game.lifeKits.length, 0,
      'むき出しのアイテムが置かれた');
    // 塔の位置はお宝の位置そのもの（中心x = お宝の列の中心、下端 = お宝の行の下）
    const want = m.fortressZones.flatMap((z) => z.treasures.map((t) => `${t.c * TILE_SIZE + TILE_SIZE / 2},${(t.r + 1) * TILE_SIZE}`));
    const got = game.storageTowers.map((t) => `${t.x + t.width / 2},${t.y + t.height}`);
    assert.deepEqual(got.sort(), want.sort());
  }
});

test('実際の7面: 塔の下は固い床で、塔の高さぶん（2タイル）は空洞', async () => {
  for (const m of await stage7Maps()) {
    for (const s of m.storageTowerSpawns) {
      const c = Math.floor(s.x / TILE_SIZE);
      const floorR = s.y / TILE_SIZE;
      assert.ok(Number.isInteger(floorR), '下端がタイルの境目に無い');
      assert.notEqual(m.grid[floorR][c], BLOCK_EMPTY, '塔の下が空洞（浮く）');
      assert.equal(m.grid[floorR - 1][c], BLOCK_EMPTY, '塔が床に埋まる');
      assert.equal(m.grid[floorR - 2][c], BLOCK_EMPTY, '塔の上半分が天井に埋まる');
    }
  }
});

test('実際の7面: 塔の中身の種類はお宝と同じ（残機 1・オーバードライブ 区画数・リペア 区画数×2−1）', async () => {
  for (const m of await stage7Maps()) {
    const kinds = m.storageTowerSpawns.map((s) => s.kind);
    const zones = m.fortressZones.length;
    assert.equal(kinds.filter((k) => k === 'life').length, 1);
    assert.equal(kinds.filter((k) => k === 'overdrive').length, zones);
    assert.equal(kinds.filter((k) => k === 'repair').length, zones * 2 - 1);
  }
});

test('ほかの面には塔が無い', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (let lv = 0; lv < 6; lv++) {
    const m = new Map({ rng: new SeededRNG(3) }, lv);
    assert.deepEqual(m.storageTowerSpawns, [], `面${lv + 1}`);
    const game = spawnGame(m);
    new SpawnManager(game).spawnStorageTowers();
    assert.equal(game.storageTowers.length, 0);
  }
});

test('汎用: 置き場所の一覧に入れれば7面でなくても立ち、壊すとその中身が出る', () => {
  const map = { storageTowerSpawns: [{ x: 120, y: 200, kind: 'overdrive' }] };
  const game = { ...towerGame(), map };
  new SpawnManager(game).spawnStorageTowers();
  assert.equal(game.storageTowers.length, 1);
  const t = game.storageTowers[0];
  assert.equal(t.y + t.height, 200);
  t.damage(999);
  assert.equal(game.missileKits.length, 1);
});

test('spawnStorageTowers は前の塔を捨てて作り直す', () => {
  const map = { storageTowerSpawns: [{ x: 120, y: 200, kind: 'repair' }] };
  const game = { ...towerGame(), map, storageTowers: ['前の面の塔'] };
  new SpawnManager(game).spawnStorageTowers();
  assert.equal(game.storageTowers.length, 1);
  assert.ok(game.storageTowers[0] instanceof StorageTower);
});

test('面を作り直すと前の面の塔は消え、spawnStorageTowers が呼ばれる', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
  const stubCtx = new Proxy({}, {
    get: (t, prop) => (prop in t ? t[prop] : (typeof prop === 'string' ? () => ({ addColorStop() { } }) : undefined)),
    set: () => true,
  });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx }) };
  try {
    let called = 0;
    const game = {
      score: 0, missionsCompleted: 1, debugStartMission: 0, totalTime: 0, stageResults: [], weekSeed: 1,
      storageTowers: ['前の面の塔'],
      spawnManager: {
        findSpawnPosition: () => ({ x: 0, y: 0 }), spawnLandmines() { }, spawnStorageTowers() { called++; },
        spawnBarriers() { }, spawnElectricFloors() { }, spawnEnemies() { },
      },
      camera: { follow() { }, snapToTarget() { } },
    };
    new GameStateManager(game).resetLevel(false);
    assert.deepEqual(game.storageTowers, []);
    assert.equal(called, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});


test('_simulationTick が格納塔を更新し、壊れた塔を外す（配線）', () => {
  const noop = () => { };
  const game = towerGame();
  const t = addTower(game, 200, 300, 'repair');
  shootAt(game, t, Missile, true);
  // 塔の更新だけを本物にする（弾・アイテムの更新は地形を見るので、ここでは動かさない）
  const fake = new Proxy(Object.assign(game, {
    barriers: [], electricFloors: [], landmines: [], smokeScreens: [], autoAimUnits: [],
    env: { update: noop }, map: { ...game.map, update: noop }, collisionManager: { update: noop },
  }), {
    get: (o, k) => (k in o ? o[k] : (k === '_updateAndPrune'
      ? (list) => { if (list === game.storageTowers) Game._updateAndPrune(list); }
      : noop)),
  });
  Game._simulationTick.call(fake);
  assert.equal(t.alive, false, '1ティックで塔が更新されていない');
  assert.equal(game.storageTowers.length, 0, '壊れた塔が残った');
  assert.equal(game.repairKits.length, 1);
});

test('_drawWorld が格納塔を描く（配線）', () => {
  const noop = () => { };
  const drawn = [];
  const tower = { alive: true, x: 10, y: 10, width: 16, height: 24, draw: () => drawn.push('tower') };
  const world = {
    gameState: 'playing', simAlpha: 1, canvas: { width: 1024, height: 768 },
    camera: { x: 0, y: 0, renderX: () => 0, renderY: () => 0 },
    map: { backdrop: null, draw: noop },
    env: { update: noop, drawBehindTerrain: noop, drawOverWorld: noop, drawOverlay: noop },
    carrier: null, player: null, flag: null, grenadeTrajectory: null,
    enemies: [], landmines: [], barriers: [], electricFloors: [], storageTowers: [tower],
    projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
    missileKits: [], lifeKits: [], enemyBullets: [], smokeScreens: [],
    _applyRenderInterpolation: noop, _restoreRenderInterpolation: noop,
    _drawHpBarIfDamaged: noop, _drawGrenadeTrajectory: noop,
  };
  Game._drawWorld.call(world, makeFakeCtx());
  assert.deepEqual(drawn, ['tower']);
});

// ---------- 最終レビューの指摘 ----------

import { Landmine } from '../src/js/entities/Landmine.js';

test('実際の7面: 塔の足元に地雷が埋まらない（塔の陰で見えず、拾いに降りると踏む）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  let checked = 0;
  for (let s = 1; s <= 60; s++) {
    const m = new Map({ rng: new SeededRNG(s) }, 6);
    const game = { map: m };
    const towers = m.storageTowerSpawns.map((spec) => new StorageTower(game, spec));
    for (const pos of m.landmineSpawns) {
      const mine = new Landmine(game, pos.x, pos.y);
      for (const t of towers) {
        const hit = mine.x < t.x + t.width && mine.x + mine.width > t.x
          && mine.y < t.y + t.height && mine.y + mine.height > t.y;
        assert.ok(!hit, `seed ${s}: 塔 (${t.x},${t.y}) の足元に地雷 (${mine.x},${mine.y})`);
      }
    }
    checked += towers.length;
  }
  assert.ok(checked > 0);
});

test('塔は自機より奥に描く（通り抜けたとき自機が塔の陰に隠れない）', () => {
  const noop = () => { };
  const order = [];
  const tower = { alive: true, x: 10, y: 10, width: 16, height: 24, draw: () => order.push('tower') };
  const world = {
    gameState: 'playing', simAlpha: 1, canvas: { width: 1024, height: 768 },
    camera: { x: 0, y: 0, renderX: () => 0, renderY: () => 0 },
    map: { backdrop: null, draw: noop },
    env: { update: noop, drawBehindTerrain: noop, drawOverWorld: noop, drawOverlay: noop },
    carrier: { draw: () => order.push('carrier') }, player: { draw: () => order.push('player') },
    flag: null, grenadeTrajectory: null,
    enemies: [], landmines: [], barriers: [], electricFloors: [], storageTowers: [tower],
    projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
    missileKits: [], lifeKits: [], enemyBullets: [], smokeScreens: [],
    _applyRenderInterpolation: noop, _restoreRenderInterpolation: noop,
    _drawHpBarIfDamaged: noop, _drawGrenadeTrajectory: noop,
  };
  Game._drawWorld.call(world, makeFakeCtx());
  assert.ok(order.indexOf('tower') < order.indexOf('player'), `描く順: ${order}`);
  assert.ok(order.indexOf('tower') < order.indexOf('carrier'), `描く順: ${order}`);
});

test('オレンジの帯の上下に、明滅しない暗い帯が接している（明滅のコントラストを出す。ユーザー案）', () => {
  const t = addTower(towerGame(), 200, 300);
  t.timer = 7;
  const ctx = makeFakeCtx();
  t.draw(ctx);
  const f = fills(ctx);
  const stripes = f.filter((r) => r.style === STORAGE_TOWER_STRIPE_COLOR);
  const edges = f.filter((r) => r.style === STORAGE_TOWER_STRIPE_EDGE_COLOR);
  assert.equal(edges.length, STORAGE_TOWER_STRIPE_COUNT * 2, '暗い帯の本数');
  for (const e of edges) assert.equal(e.alpha, 1, '暗い帯まで明滅している');
  for (const s of stripes) {
    assert.ok(edges.some((e) => e.y + e.h === s.y && e.x === s.x && e.w === s.w), `帯 y=${s.y} の上に暗い帯が無い`);
    assert.ok(edges.some((e) => e.y === s.y + s.h && e.x === s.x && e.w === s.w), `帯 y=${s.y} の下に暗い帯が無い`);
  }
  // 暗い帯はオレンジより後に描いて上書きしない（帯の幅が欠ける）
  const lastEdge = Math.max(...f.map((r, i) => (r.style === STORAGE_TOWER_STRIPE_EDGE_COLOR ? i : -1)));
  const firstStripe = f.findIndex((r) => r.style === STORAGE_TOWER_STRIPE_COLOR);
  assert.ok(lastEdge < firstStripe, '暗い帯がオレンジの帯の上に描かれた');
});

test('オレンジの帯は 2px の1本（縞を何本も入れると、暗い縁と合わせてしましまが汚く見えた。4px は太すぎた。ユーザー判断）', () => {
  assert.equal(STORAGE_TOWER_STRIPE_COUNT, 1);
  assert.equal(STORAGE_TOWER_STRIPE_H, 2);
  const t = addTower(towerGame(), 200, 300);
  const ctx = makeFakeCtx();
  t.draw(ctx);
  const stripes = fills(ctx).filter((r) => r.style === STORAGE_TOWER_STRIPE_COLOR);
  assert.equal(stripes.length, 1);
  assert.equal(stripes[0].h, STORAGE_TOWER_STRIPE_H);
  // 円筒（ふたと足台のあいだ）のまん中から STRIPE_LIFT だけ上に来る（まん中では低く見えた。ユーザー判断）
  assert.ok(STORAGE_TOWER_STRIPE_LIFT > 0);
  const bodyTop = t.y + 2, bodyBottom = t.y + t.height - STORAGE_TOWER_STAND_H;
  const mid = stripes[0].y + stripes[0].h / 2;
  const want = (bodyTop + bodyBottom) / 2 - STORAGE_TOWER_STRIPE_LIFT;
  assert.ok(Math.abs(mid - want) <= 0.5, `帯の中心 ${mid}、期待 ${want}`);
  // 上の暗い縁が円筒からはみ出さない
  assert.ok(stripes[0].y - 1 >= bodyTop, '上げすぎてふたにかかった');
});
