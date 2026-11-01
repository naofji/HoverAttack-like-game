// 町は敵の陣地（ユーザー判断 2026-11-01。直前の「中立」を取り消した）。当たり方のルールは3つと例外1つ:
//   1) 撃った位置に重なる建物は、その弾では通過する（敵も自機も同じ）。逆の「的が重なっている建物を素通りして
//      的に届く」規則は無い。撃たれる側が建物に重なっていても、建物は弾を止める
//   2) 自機側の攻撃は建物に当たり、欠かす・火をつける・誘爆させる（火薬のギミック）
//   3) 敵の攻撃も建物に当たる（止まる・跳ね返る・ビームは貫通）が、建物は無傷（欠けない・燃えない・誘爆しない）。
//      敵の爆風も同じ。待ちの面で敵が町を壊し尽くすと、自機が着いたときには何も残らないため
//   例外) 自機・母艦が重なっている建物だけは、敵の攻撃でも欠け、火がつき、誘爆する。
//      無傷で弾を止めると、自機は建物に重なっているだけで完全防御できてしまう（ユーザー指摘）。
//      削れて壊れれば、その建物はもう遮蔽にならない
// 「敵の攻撃」かどうかは弾の isPlayerOwned === false で決める。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { Landmine } from '../src/js/entities/Landmine.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';
import { drum, shed, unit, world } from './helpers/town-explosive-fixtures.js';

/** 弾が (x0 → x1, y) を 1 tick で動いたことにして、町の当たりを見る */
function sweep(w, p, x0, x1, y) {
  p._prevX = x0; p._prevY = y; p.x = x1; p.y = y;
  w.town.sweepProjectile(p);
}

/** 火をつけた回数を数える */
function igniteCount(w) {
  const calls = { n: 0 };
  const real = w.town.fire.igniteByBullet.bind(w.town.fire);
  w.town.fire.igniteByBullet = (...a) => { calls.n++; return real(...a); };
  return calls;
}

/** グレネード・ミサイル・巡航ミサイルの爆発が引く、地図まわり */
function withMap(w) {
  Object.assign(w.game.map, {
    width: 10000, height: 10000,
    pixelToTile: (x, y) => ({ r: Math.floor(y / TILE_SIZE), c: Math.floor(x / TILE_SIZE) }),
  });
  w.game.addScore = () => {};
  w.game.storageTowers = [];
  return w;
}

// ---------- ルール3: 敵の弾は当たるが無傷 ----------

test('敵の弾は建物で止まる（当たり判定はある）が、建物は欠けず火もつかない', () => {
  const w = world([shed(200, 100)]);
  const b = w.town.buildings[0];
  const ignites = igniteCount(w);
  const bullet = new EnemyBullet(w.game, 150, 116, 0);
  assert.equal(bullet.isPlayerOwned, false, '敵の弾が自機の弾の扱いになっている');
  sweep(w, bullet, 190, 212, 116);
  assert.equal(bullet.alive, false, '通り抜けた');
  assert.ok(bullet.x < 212, `壁の中まで進んだ: ${bullet.x}`);
  assert.equal(b.remaining, b.total, '敵の弾で建物が欠けた');
  assert.equal(ignites.n, 0, '敵の弾で建物に火がついた');
});

test('敵のミサイルも建物で止まって爆発するが、建物は欠けない（爆風も含めて）', () => {
  const w = withMap(world([shed(200, 100)]));
  const b = w.town.buildings[0];
  const m = new Missile(w.game, 150, 116, 0, false);
  sweep(w, m, 190, 212, 116);
  assert.equal(m.alive, false, '敵のミサイルが建物を通り抜けた');
  assert.equal(b.remaining, b.total, '敵のミサイルで建物が欠けた');
});

test('細い部品（手すりなど）も、敵の弾では欠けない', () => {
  const rail = {
    site: 'ceiling', style: 'C', kind: 'lantern', x: 200, y: 0, w: 4, h: 200,
    parts: [{ x: 0, y: 0, w: 4, h: 200, color: '#4a3418', mat: 1, solid: false }],
  };
  const w = world([rail]);
  const b = w.town.buildings[0];
  const bullet = new EnemyBullet(w.game, 150, 100, 0);
  sweep(w, bullet, 196, 210, 100);
  assert.equal(bullet.alive, true, '細い部品で止まった');
  assert.equal(b.remaining, b.total);
});

test('town.update も、game.projectiles に入っている敵の弾を無傷で止める（自機が重なっていない建物）', () => {
  const w = world([shed(200, 100)]);
  const b = w.town.buildings[0];
  w.game.player = unit(60, 116);   // 建物から離れている自機
  w.game.player.docked = false;
  const bullet = new EnemyBullet(w.game, 190, 116, 0);
  bullet._prevX = 190; bullet._prevY = 116; bullet.x = 212; bullet.y = 116;
  w.game.projectiles.push(bullet);
  w.step(1);
  assert.equal(bullet.alive, false, '建物で止まっていない');
  assert.equal(b.remaining, b.total);
});

test('敵のグレネードは建物で跳ね返るが、建物は欠けない', () => {
  const w = world([shed(200, 100, 32, 64)]);
  const b = w.town.buildings[0];
  const g = new Grenade(w.game, 150, 116, 0, 0);
  g.isPlayerOwned = false;
  g.vx = 10; g.vy = 0;
  sweep(w, g, 190, 203, 116);
  assert.ok(g.vx < 0, '跳ね返らずに素通りした');
  assert.equal(b.remaining, b.total);
});

test('敵のビームは建物を貫通するが、何も欠かさない', () => {
  const w = world([shed(200, 100), shed(300, 100)]);
  const beam = new ReflectBeam(w.game, 150, 116, 0);
  assert.equal(beam.isPlayerOwned, false, '反射ビームは敵の弾の扱い（Town.sweepProjectile はこれで敵か見分ける）');
  beam.segments = () => [{ x1: 150, y1: 116, x2: 340, y2: 116 }];   // 2棟を貫く帯
  w.town.sweepProjectile(beam);
  assert.ok(w.town.buildings.every((b) => b.remaining === b.total), '敵のビームが建物を欠かした');
});

// ---------- 例外: 自機・母艦が重なっている建物は、敵の攻撃でも壊れる ----------

test('自機が重なっている建物だけは、敵の弾が止まり、欠け、火がつく（重なっていない建物は無傷のまま）', () => {
  const w = world([shed(200, 100), shed(300, 100)]);
  const [mine, other] = w.town.buildings;
  const ignites = igniteCount(w);
  const player = unit(216, 116);   // mine（x=200〜232）に重なる
  player.docked = false;
  const under = w.town.buildingsUnder([player]);
  assert.ok(under.has(mine.id) && !under.has(other.id), '前提: 自機は手前の建物にだけ重なる');

  const b1 = new EnemyBullet(w.game, 150, 116, 0);
  b1._prevX = 190; b1._prevY = 116; b1.x = 212; b1.y = 116;
  w.town.sweepProjectile(b1, under);
  assert.equal(b1.alive, false, '重なっている建物で弾が止まらない');
  assert.ok(mine.remaining < mine.total, '重なっている建物が欠けない（完全防御になる）');
  assert.ok(ignites.n >= 1, '重なっている建物に火がつかない');

  const before = ignites.n;
  const b2 = new EnemyBullet(w.game, 250, 116, 0);
  b2._prevX = 290; b2._prevY = 116; b2.x = 312; b2.y = 116;
  w.town.sweepProjectile(b2, under);
  assert.equal(b2.alive, false, '別の建物でも止まる（当たり判定はある）');
  assert.equal(other.remaining, other.total, '自機が重なっていない建物が欠けた');
  assert.equal(ignites.n, before, '自機が重なっていない建物に火がついた');
});

test('town.update は game.projectiles の敵の弾に、自機・母艦が重なっている建物を渡す', () => {
  const w = world([shed(200, 100), shed(300, 100), shed(400, 100)]);
  const [byPlayer, other, byCarrier] = w.town.buildings;
  w.game.player = unit(216, 116); w.game.player.docked = false;
  w.game.carrier = unit(416, 116);
  // 爆発しない弾で見る。ミサイルだと止まった爆風が同じ建物を欠かす別の経路で、同じ結果になってしまう
  for (const [x0, x1] of [[190, 212], [290, 312], [390, 412]]) {
    const b = new EnemyBullet(w.game, x0, 116, 0);
    b._prevX = x0; b._prevY = 116; b.x = x1; b.y = 116;
    w.game.projectiles.push(b);
  }
  w.step(1);
  assert.ok(w.game.projectiles.every((b) => !b.alive), '建物で止まっていない');
  assert.ok(byPlayer.remaining < byPlayer.total, '自機が重なっている建物が欠けない');
  assert.ok(byCarrier.remaining < byCarrier.total, '母艦が重なっている建物が欠けない');
  assert.equal(other.remaining, other.total, 'どちらも重なっていない建物は無傷のはず');
});

test('CollisionManager は enemyBullets の敵の弾にも、自機・母艦が重なっている建物を渡す', () => {
  const w = world([shed(200, 100), shed(300, 100), shed(400, 100)]);
  const [byPlayer, other, byCarrier] = w.town.buildings;
  w.game.player = Object.assign(unit(216, 116), { docked: false, invincibleTimer: 1 });
  w.game.carrier = unit(416, 116);
  w.game.enemyBullets = [];
  // 本物の EnemyBullet を、更新のたびに 1 tick で建物の縁まで動かす（update を差し替えるだけ。町の判定は本物）
  for (const [x0, x1] of [[190, 212], [290, 312], [390, 412]]) {
    const b = new EnemyBullet(w.game, x0, 116, 0);
    b.update = function () { this._prevX = x0; this._prevY = 116; this.x = x1; this.y = 116; };
    w.game.enemyBullets.push(b);
  }
  new CollisionManager(w.game)._updateEnemyBullets();
  assert.equal(w.game.enemyBullets.length, 0, '建物で止まっていない');
  assert.ok(byPlayer.remaining < byPlayer.total, '自機が重なっている建物が欠けない');
  assert.ok(byCarrier.remaining < byCarrier.total, '母艦が重なっている建物が欠けない');
  assert.equal(other.remaining, other.total, 'どちらも重なっていない建物は無傷のはず');
});

test('敵のビームも、自機が重なっている建物だけ欠かす', () => {
  const w = world([shed(200, 100), shed(300, 100)]);
  const [mine, other] = w.town.buildings;
  const beam = new ReflectBeam(w.game, 150, 116, 0);
  beam.segments = () => [{ x1: 150, y1: 116, x2: 340, y2: 116 }];
  w.town.sweepProjectile(beam, new Set([mine.id]));
  assert.ok(mine.remaining < mine.total, '自機が重なっている建物が欠けない');
  assert.equal(other.remaining, other.total, '敵のビームが無関係な建物を欠かした');
});

test('敵の爆風も、自機が重なっている建物だけ欠かす。重なっていない建物は欠かさない', () => {
  const w = withMap(world([shed(190, 100), shed(226, 100)]));
  const [left, right] = w.town.buildings;
  w.game.player = unit(206, 116);   // left（x=190〜222）にだけ重なる
  w.game.player.docked = false;
  const g = new Grenade(w.game, 224, 116, 0, 0);   // 2 つの建物のあいだ。どちらにも爆風が届く
  g.isPlayerOwned = false;
  g._explode();
  assert.ok(left.remaining < left.total, '自機が重なっている建物が欠けない');
  assert.equal(right.remaining, right.total, '重なっていない建物が欠けた');
});

test('自機が重なっているドラム缶は、敵のミサイルで爆発する。重なっていないドラム缶は爆発しない', () => {
  for (const [playerX, expectExploded] of [[108, true], [10, false]]) {
    const w = withMap(world([drum(100, 100, 16, 68)]));
    w.game.player = unit(playerX, 120);
    w.game.player.docked = false;
    const m = new Missile(w.game, 92, 104, 0, false);
    m.vx = 4; m.vy = 0; m._prevX = 92; m._prevY = 104; m.x = 108; m.y = 104;
    w.game.projectiles.push(m);
    w.step(40);
    assert.equal(w.town.buildings[0].exploded === true, expectExploded, `自機 x=${playerX}`);
  }
});

// ---------- ルール2: 自機側は壊す ----------

test('同じ当たり方の自機の弾は、建物を欠かし、火をつける（敵の無傷との差）', () => {
  const w = world([shed(200, 100)]);
  const b = w.town.buildings[0];
  const ignites = igniteCount(w);
  const bullet = new PlayerBullet(w.game, 150, 116, 0);
  sweep(w, bullet, 190, 212, 116);
  assert.equal(bullet.alive, false);
  assert.ok(b.remaining < b.total, '自機の弾で欠けなくなっている');
  assert.ok(ignites.n >= 1, '自機の弾が火をつけなくなっている');
});

// ---------- ルール1: 撃った位置に重なる建物は通過する。撃たれる側が重なる建物は止める ----------

test('撃った位置に重なる建物は、敵の弾も自機の弾も通過する', () => {
  for (const [name, make] of [['敵', (g) => new EnemyBullet(g, 210, 116, 0)], ['自機', (g) => new PlayerBullet(g, 210, 116, 0)]]) {
    const w = world([shed(200, 100)]);
    const bullet = make(w.game);   // 発射位置 (210, 116) は建物の中
    sweep(w, bullet, 210, 224, 116);
    assert.equal(bullet.alive, true, `${name}の弾が、自分の居る建物で止まった`);
    assert.equal(w.town.buildings[0].remaining, w.town.buildings[0].total, `${name}の弾が、居る建物を欠かした`);
  }
});

test('撃たれる側（敵機・自機）が重なっている建物でも、弾は止まる（遮蔽は建物のあるところ全部）', () => {
  // 以前は、的が重なっている建物は弾を止めなかった（的に届くように）。ルール整理（2026-11-01）でなくした
  for (const [name, make, expectChipped] of [
    ['自機の弾 → 敵機', (g) => new PlayerBullet(g, 150, 116, 0), true],
    ['敵の弾 → 自機', (g) => new EnemyBullet(g, 150, 116, 0), false],
  ]) {
    const w = world([shed(200, 100)]);
    const target = unit(216, 116);   // 建物に重なる的
    target.docked = false;
    w.game.enemies.push(target);
    w.game.player = target;
    const b = w.town.buildings[0];
    const bullet = make(w.game);
    sweep(w, bullet, 190, 212, 116);
    assert.equal(bullet.alive, false, `${name}: 的が重なる建物を素通りした`);
    assert.equal(b.remaining < b.total, expectChipped, `${name}: 欠け方が違う`);
  }
});

// ---------- 爆風・誘爆 ----------

test('敵のグレネードの爆風は、近くの建物を欠かさない（自機が重なっていない建物）。自機のグレネードは欠かす', () => {
  for (const [owned, withPlayer, expectChipped] of [[false, false, false], [false, true, false], [true, false, true]]) {
    const w = withMap(world([shed(200, 100)]));
    const b = w.town.buildings[0];
    if (withPlayer) { w.game.player = unit(20, 116); w.game.player.docked = false; }   // 建物から離れている
    const g = new Grenade(w.game, 200, 116, 0, 0);
    g.isPlayerOwned = owned;
    g._explode();
    assert.equal(b.remaining < b.total, expectChipped, `isPlayerOwned=${owned} 自機が重なる=${withPlayer}`);
  }
});

test('敵のグレネード・ミサイルではドラム缶は誘爆しない（自機が重なっていないドラム缶）。自機のグレネードでは誘爆する', () => {
  for (const [owned, expectExploded] of [[false, false], [true, true]]) {
    const w = withMap(world([drum(100, 100)]));
    const b = w.town.buildings[0];
    const g = new Grenade(w.game, 104, 108, 0, 0);
    g.isPlayerOwned = owned;
    g._explode();
    w.step(40);
    assert.equal(b.exploded === true, expectExploded, `グレネード isPlayerOwned=${owned}`);
  }
  const w = withMap(world([drum(100, 100, 16, 68)]));
  w.game.player = unit(10, 120);   // ドラム缶から離れている自機
  w.game.player.docked = false;
  const m = new Missile(w.game, 92, 104, 0, false);
  sweep(w, m, 92, 108, 104);
  w.step(40);
  assert.equal(w.town.buildings[0].exploded === true, false, '敵のミサイルでドラム缶が爆発した');
});

// ---------- 巡航ミサイル ----------

test('敵の巡航ミサイルが建物で爆発しても建物は欠けず、地雷も誘爆しない。自機が撃ち落とした爆発は欠かす', () => {
  for (const [shotDown, expectChipped] of [[false, false], [true, true]]) {
    const w = withMap(world([shed(200, 100)]));
    w.game.map.destroyArea = () => [];
    const b = w.town.buildings[0];
    const mine = new Landmine(w.game, 204, 140);
    w.game.landmines.push(mine);
    const c = new EnemyCruiseMissile(w.game, 216, 116, 0);
    if (shotDown) c._explode(); else c.onTownWall(216, 116);
    assert.equal(b.remaining < b.total, expectChipped, `shotDown=${shotDown} の建物`);
    assert.equal(mine.alive, !shotDown, `shotDown=${shotDown} の地雷（撃ち落とした爆発だけが誘爆させる）`);
  }
});
