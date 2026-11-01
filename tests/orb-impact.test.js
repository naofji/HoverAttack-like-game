// 転がってきた Orb が機体に当たったときのダメージと反発（設計 4.5・決定5）。
// ダメージは Orb 自身が相手へ向かう速さで決める（歩いて止まった Orb にぶつかっただけで自機が傷つかないように）。
// 反発は相対速度を反発係数 0.6 で跳ね返す。同じ相手には間隔を空ける。地雷は Orb が触れると爆発する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orb } from '../src/js/entities/Orb.js';
import { Player } from '../src/js/entities/Player.js';
import { updateOrbs, resolveOrbBody } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  TILE_SIZE as T, ORB_SIZES, ORB_IMPACT_RESTITUTION, ORB_IMPACT_MIN_SPEED, ORB_HIT_COOLDOWN, PLAYER_MAX_SPEED,
} from '../src/js/utils/Constants.js';

const FLOOR = 20;

function world() {
  const rows = [];
  for (let r = 0; r < 24; r++) rows.push((r >= FLOOR ? '#' : '.').repeat(60));
  const game = makeGame(makeMap(rows));
  game.orbs = [];
  game.landmines = [];
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  return game;
}

/** 床に止まっている的（戦車の代わり）。受けたダメージを記録する */
function target(game, x, { w = 24, h = 16 } = {}) {
  const e = {
    alive: true, x, y: FLOOR * T - h, width: w, height: h, vx: 0, vy: 0, grounded: true, damage: [],
    takeDamage(d) { this.damage.push(d); },
  };
  game.enemies.push(e);
  return e;
}

/** 的の左側面に接する位置に、空中で右向きに速さ v で飛んでくる Orb を置く（床との当たりを混ぜない） */
function orbHitting(game, e, size, v) {
  const r = ORB_SIZES[size].diameter / 2;
  const orb = new Orb(game, { cx: e.x - r + 0.5, cy: e.y + e.height / 2, size });
  orb.vx = v; orb.vy = 0; orb.onGround = false;
  game.orbs.push(orb);
  return orb;
}

test('small が 4px/フレームで止まっている的に当たると 16、large なら 36 のダメージ', () => {
  for (const [size, want] of [['small', 16], ['large', 36]]) {
    const game = world();
    const e = target(game, 30 * T);
    const orb = orbHitting(game, e, size, 4);
    resolveOrbBody(game, orb, e);
    assert.deepEqual(e.damage, [want], size);
  }
});

test(`Orb の速さ ${ORB_IMPACT_MIN_SPEED} 以下ではダメージにならず（押す扱い）、それより速ければ入る`, () => {
  const g1 = world(), e1 = target(g1, 30 * T);
  resolveOrbBody(g1, orbHitting(g1, e1, 'small', ORB_IMPACT_MIN_SPEED - 0.1), e1);
  assert.deepEqual(e1.damage, []);
  const g2 = world(), e2 = target(g2, 30 * T);
  resolveOrbBody(g2, orbHitting(g2, e2, 'small', ORB_IMPACT_MIN_SPEED + 0.1), e2);
  assert.equal(e2.damage.length, 1);
});

test('自機が歩いて止まっている Orb にぶつかってもダメージにならない（相対速度ではなく Orb の速さで見る）', () => {
  const game = world();
  const p = new Player(game, 20 * T, FLOOR * T - 24);
  p.y = FLOOR * T - p.height;
  game.player = p;
  p.invincibleTimer = 0;
  game.spawnHeavyDamage = () => {};
  const hp = p.hp;
  const r = ORB_SIZES.small.diameter / 2;
  const orb = new Orb(game, { cx: p.x + p.width + r - 0.5, cy: FLOOR * T - r, size: 'small' });
  game.orbs.push(orb);
  p.vx = PLAYER_MAX_SPEED;
  resolveOrbBody(game, orb, p);
  assert.equal(p.hp, hp);
});

test('当たった後の法線方向の相対速度は、当たる前の -0.6 倍', () => {
  const game = world();
  const e = target(game, 30 * T);
  const orb = orbHitting(game, e, 'small', 4);
  resolveOrbBody(game, orb, e);
  assert.ok(Math.abs(orb.vx - (-ORB_IMPACT_RESTITUTION * 4)) < 1e-9, `vx ${orb.vx}`);
});

test(`同じ Orb は同じ相手に ${ORB_HIT_COOLDOWN} フレーム以内に2回ダメージを与えない。過ぎれば与える`, () => {
  const game = world();
  const e = target(game, 30 * T);
  const orb = orbHitting(game, e, 'small', 4);
  resolveOrbBody(game, orb, e);
  for (let f = 0; f < ORB_HIT_COOLDOWN - 1; f++) {
    orb.update();
    orb.x = e.x - orb.width + 0.5; orb.y = e.y + e.height / 2 - orb.r; orb.vx = 4; orb.vy = 0;
    resolveOrbBody(game, orb, e);
  }
  assert.equal(e.damage.length, 1, '間隔の中で2回目が入った');
  orb.update();
  orb.x = e.x - orb.width + 0.5; orb.y = e.y + e.height / 2 - orb.r; orb.vx = 4; orb.vy = 0;
  resolveOrbBody(game, orb, e);
  assert.equal(e.damage.length, 2, '間隔が過ぎても入らない');
});

test('別の相手には間隔に関係なく入る', () => {
  const game = world();
  const a = target(game, 30 * T), b = target(game, 30 * T);
  const orb = orbHitting(game, a, 'small', 4);
  resolveOrbBody(game, orb, a);
  orb.vx = 4; orb.x = b.x - orb.width + 0.5;
  resolveOrbBody(game, orb, b);
  assert.equal(a.damage.length, 1);
  assert.equal(b.damage.length, 1);
});

test('自機も Orb に当たる（転がり戻ってきた Orb の速さが閾値を超えれば HP が減る）', () => {
  const game = world();
  const p = new Player(game, 20 * T, FLOOR * T - 24);
  p.y = FLOOR * T - p.height;
  game.player = p;
  p.invincibleTimer = 0;            // 出現直後の無敵を切る
  game.spawnHeavyDamage = () => {};
  const hp = p.hp;
  const r = ORB_SIZES.small.diameter / 2;
  const orb = new Orb(game, { cx: p.x + p.width + r - 0.5, cy: FLOOR * T - r, size: 'small' });
  orb.vx = -3;
  game.orbs.push(orb);
  resolveOrbBody(game, orb, p);
  assert.ok(p.hp < hp, `HP ${p.hp}`);
});

test('的の真上に落ちた Orb は1回だけ当たり、200 フレーム以内に止まるか転がり落ちる', () => {
  const game = world();
  const e = target(game, 30 * T, { w: 48, h: 16 });
  const orb = new Orb(game, { cx: e.x + 24, cy: e.y - 80, size: 'small' });
  game.orbs.push(orb);
  let settled = false;
  for (let f = 0; f < 400; f++) {
    updateOrbs(game);
    if (f > 200 && orb.vx === 0 && Math.abs(orb.vy) < 0.31) settled = true;
  }
  assert.equal(e.damage.length, 1, `ダメージ ${JSON.stringify(e.damage)}`);
  const onTop = orb.cy + orb.r <= e.y + 0.5;
  const fellOff = orb.cy + orb.r >= FLOOR * T - 0.5;
  assert.ok(onTop || fellOff, `宙に浮いている: 下端 ${orb.cy + orb.r}`);
  assert.ok(settled || fellOff, '的の上で動き続ける');
});

test('Orb が地雷に触れると地雷が爆発する', () => {
  const game = world();
  let detonated = 0;
  game.landmines.push({ alive: true, x: 30 * T, y: FLOOR * T - 6, width: 16, height: 6, detonate() { detonated++; this.alive = false; } });
  const orb = new Orb(game, { cx: 30 * T - 10, cy: FLOOR * T - 8, size: 'small' });
  orb.vx = 1;
  game.orbs.push(orb);
  for (let f = 0; f < 30; f++) updateOrbs(game);
  assert.equal(detonated, 1);
});
