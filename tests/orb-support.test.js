// Orb が地形でない足場（ほかの Orb・機体の上面）に乗る（最終レビューの Minor 2件の直し、2026-11-03）。
// 以前は地形しか接地と読まず、
//   ・真上に乗せた Orb の2個が毎フレーム 0.0625px 揺れ続けて眠らなかった
//   ・甲板の上の Orb に転がりの抵抗が効かず、速さ 2 で転がって甲板から落ちた。走る母艦の甲板は下から抜けた
// （どれも本物の Orb と updateOrbs で実測）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orb } from '../src/js/entities/Orb.js';
import { updateOrbs } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';

const FLOOR = 20;

function world() {
  const rows = [];
  for (let r = 0; r < 24; r++) rows.push((r >= FLOOR ? '#' : '.').repeat(60));
  const game = makeGame(makeMap(rows, null, { tileShape: 'caveSlope' }));
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  game.orbs = [];
  game.landmines = [];
  return game;
}

/** 床の上の Orb と、その上に中心を dx ずらして接するよう乗せた Orb（どちらも 24px） */
function stacked(dx) {
  const game = world();
  const a = new Orb(game, { cx: 30 * T, cy: FLOOR * T - 12, size: 'large' });
  const b = new Orb(game, { cx: 30 * T + dx, cy: FLOOR * T - 12 - Math.sqrt(24 * 24 - dx * dx), size: 'large' });
  game.orbs.push(a, b);
  return { game, a, b };
}

/** 甲板の上に Orb を1つ乗せた母艦（幅 64・高さ 32 の箱。速さ vx で毎フレーム動く） */
function deck(vx) {
  const game = world();
  const c = { alive: true, x: 25 * T, y: FLOOR * T - 32, width: 64, height: 32, vx, vy: 0, grounded: true, onGround: true };
  game.carrier = c;
  const orb = new Orb(game, { cx: c.x + 32, cy: c.y - 12, size: 'large' });
  game.orbs.push(orb);
  const step = () => { c.x += c.vx; updateOrbs(game); };
  return { game, c, orb, step };
}

test('真上に乗せた Orb は、上も下も揺れずに止まって眠る', () => {
  const { game, a, b } = stacked(0);
  for (let f = 0; f < 200; f++) updateOrbs(game);
  let maxMove = 0;
  for (let f = 0; f < 100; f++) {
    const pa = [a.cx, a.cy], pb = [b.cx, b.cy];
    updateOrbs(game);
    maxMove = Math.max(maxMove, Math.hypot(a.cx - pa[0], a.cy - pa[1]), Math.hypot(b.cx - pb[0], b.cy - pb[1]));
  }
  assert.equal(maxMove, 0, `揺れている: ${maxMove}`);
  assert.ok(a.sleeping && b.sleeping, '眠っていない');
  assert.ok(Math.abs(b.cy - (a.cy - 24)) < 0.05, `上の Orb が乗っていない: ${a.cy - b.cy}`);
});

test('中心から 2px ずれて乗った Orb は、今までどおり転がり落ちて床に止まる', () => {
  const { game, a, b } = stacked(2);
  for (let f = 0; f < 400; f++) updateOrbs(game);
  assert.ok(Math.abs(b.cy - a.cy) < 1, `床まで落ちていない: 下 ${a.cy} 上 ${b.cy}`);
});

test('下の Orb がどいたら、上の Orb は落ちる（足場は毎ティック置き直す）', () => {
  const { game, a, b } = stacked(0);
  for (let f = 0; f < 50; f++) updateOrbs(game);
  const y0 = b.cy;
  a.x += 100;   // 下から抜く
  for (let f = 0; f < 30; f++) updateOrbs(game);
  assert.ok(b.cy > y0 + 10, `落ちていない: ${y0} → ${b.cy}`);
});

test('止まっている甲板の上で転がした Orb は、転がりの抵抗で甲板の上に止まる', () => {
  const { c, orb, step } = deck(0);
  orb.vx = 2;
  for (let f = 0; f < 200; f++) step();
  assert.ok(orb.cy < c.y, `甲板から落ちた: Orb の中心 ${orb.cy}、甲板 ${c.y}`);
  assert.equal(orb.vx, 0);
  assert.ok(orb.cx > c.x && orb.cx < c.x + c.width, `甲板の外: ${orb.cx - c.x}`);
});

test('走る母艦の甲板の上の Orb は、摩擦で母艦についていき、運ばれているだけなので回らない', () => {
  const { c, orb, step } = deck(0.5);
  for (let f = 0; f < 200; f++) step();
  assert.ok(orb.cy < c.y, '甲板から落ちた');
  assert.ok(Math.abs(orb.vx - 0.5) < 0.01, `母艦の速さで動いていない: ${orb.vx}`);
  const a0 = orb.angle;
  for (let f = 0; f < 30; f++) step();
  assert.ok(Math.abs(orb.angle - a0) < 1e-6, `運ばれているだけなのに回った: ${orb.angle - a0}`);
});

test('甲板の上で眠った Orb は、母艦が走り出すと起きてついていく', () => {
  const { c, orb, step } = deck(0);
  for (let f = 0; f < 60; f++) step();
  assert.ok(orb.sleeping, '眠っていない');
  c.vx = 0.5;
  const rel0 = orb.cx - c.x;
  for (let f = 0; f < 120; f++) step();
  assert.ok(orb.cy < c.y, '甲板から落ちた');
  assert.ok(Math.abs((orb.cx - c.x) - rel0) < 4, `置いていかれた: ${rel0} → ${orb.cx - c.x}`);
});

test('床の 1px 手前でゆっくり降りてきた Orb は、宙で止まらず床まで降りる', () => {
  const game = world();
  const orb = new Orb(game, { cx: 30 * T, cy: FLOOR * T - 12 - 0.8, size: 'large' });   // 接地の判定（1px）の内側に浮かせる
  game.orbs.push(orb);
  for (let f = 0; f < 60; f++) updateOrbs(game);
  const gap = FLOOR * T - (orb.cy + orb.r);
  assert.ok(gap >= 0 && gap <= 0.3, `床とのすき間 ${gap}`);
});

test('甲板の 1px 手前に置いた Orb も、宙で止まらず甲板まで降りる', () => {
  const { c, orb, step } = deck(0);
  orb.y -= 0.8;
  for (let f = 0; f < 60; f++) step();
  const gap = c.y - (orb.cy + orb.r);
  assert.ok(gap >= 0 && gap <= 0.3, `甲板とのすき間 ${gap}`);
});
