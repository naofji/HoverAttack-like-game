// 格納塔（壊すと中身が出る塔）と、中身の種類→アイテムの表。
// 設計: docs/superpowers/specs/2026-10-31-stage7-storage-towers-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnItem } from '../src/js/entities/itemKinds.js';
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
