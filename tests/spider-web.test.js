// スパイダーの糸（entities/SpiderWeb.js）と、絡まった自機（Player の webTimer）。
// 2026-11-23 ユーザー指定: 弾が割れたら5発の弾ではなく5本の糸を広げる。糸は点線、カラム（絡む）感じが出るよう横糸も張る。
// 当たると自機の動きが遅くなる（ダメージなし）。左右に揺さぶると早く取れる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpiderWeb } from '../src/js/entities/SpiderWeb.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { Player } from '../src/js/entities/Player.js';
import { shed, world as townWorld } from './helpers/town-explosive-fixtures.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  TILE_SIZE, SPIDER_WEB_STRANDS, SPIDER_WEB_SPREAD, SPIDER_WEB_SPEED, SPIDER_WEB_MAX_LENGTH,
  SPIDER_WEB_RING_STEP, SPIDER_WEB_FADE_FRAMES, SPIDER_WEB_ENTANGLE_FRAMES, SPIDER_WEB_SLOW,
  SPIDER_WEB_SHAKE_FRAMES, PLAYER_MAX_SPEED, PLAYER_MAX_HOVER_SPEED,
} from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
const DEG = Math.PI / 180;

function openWorld(extra = []) {
  const rows = [];
  for (let r = 0; r < 40; r++) rows.push('.'.repeat(60));
  for (const [r, c] of extra) rows[r] = rows[r].slice(0, c) + '#' + rows[r].slice(c + 1);
  return makeGame(makeMap(rows));
}

function fakePlayer(game, x, y) {
  game.player = {
    x, y, width: 16, height: 24, alive: true, docked: false, invincibleTimer: 0, hp: 100, webbed: 0,
    takeDamage(n) { this.hp -= n; },
    entangle() { this.webbed++; },
  };
  return game.player;
}

const grow = (web, n) => { for (let i = 0; i < n && web.alive; i++) web.update(); };

test('5本の糸が、向けた向きを中心に扇に広がり、毎フレーム SPIDER_WEB_SPEED ずつ伸びる', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 60 * DEG);
  assert.equal(web.strands.length, SPIDER_WEB_STRANDS);
  const angles = web.strands.map((s) => s.angle);
  const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(Math.abs(mean - 60 * DEG) < 1e-9);
  assert.ok(Math.abs(Math.max(...angles) - Math.min(...angles) - SPIDER_WEB_SPREAD) < 1e-9);
  grow(web, 3);
  for (const s of web.strands) assert.ok(Math.abs(s.len - 3 * SPIDER_WEB_SPEED) < 1e-9);
  grow(web, 500);
  // 伸び切ったら消える（伸びる → 薄れる）
  assert.equal(web.alive, false);
});

test('伸び切った糸は SPIDER_WEB_MAX_LENGTH で止まり、SPIDER_WEB_FADE_FRAMES で薄れて消える', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  const full = Math.ceil(SPIDER_WEB_MAX_LENGTH / SPIDER_WEB_SPEED);
  grow(web, full);
  for (const s of web.strands) assert.ok(Math.abs(s.len - SPIDER_WEB_MAX_LENGTH) < 1e-9);
  assert.equal(web.alive, true);
  grow(web, SPIDER_WEB_FADE_FRAMES - 1);
  assert.equal(web.alive, true);
  grow(web, 2);
  assert.equal(web.alive, false);
});

test('岩に当たった糸はそこで止まる（先が岩に入らない）', () => {
  const extra = [];
  for (let r = 0; r < 40; r++) extra.push([r, 25]);
  const game = openWorld(extra);
  const web = new SpiderWeb(game, 25 * T - 30, 200, 0);   // 右の岩の柱へ向ける
  grow(web, 40);
  for (const s of web.strands) {
    const tx = web.x + Math.cos(s.angle) * s.len;
    const ty = web.y + Math.sin(s.angle) * s.len;
    assert.equal(game.map.isSolidAtPixel(tx, ty), false, `先が岩の中 (${tx.toFixed(1)}, ${ty.toFixed(1)})`);
    assert.ok(s.len < 40, `止まっていない ${s.len}`);
  }
});

test('建物に当たった糸はそこで止まる', () => {
  const w = townWorld([shed(200, 100)]);
  const game = w.game;
  game.map.isSolidPoint = () => false;
  game.map.isSolidAtPixel = () => false;
  const web = new SpiderWeb(game, 150, 116, 0);
  grow(web, 60);
  // 外の2本（±20°）は小屋（y 100〜132）の上下をかすめて外れるので、小屋に向かう真ん中の3本を見る
  for (const s of web.strands.filter((st) => Math.abs(st.angle) < 15 * DEG)) {
    const tx = web.x + Math.cos(s.angle) * s.len;
    assert.ok(tx <= 232, `建物（右端 232）を抜けた糸 x ${tx.toFixed(1)}`);
  }
});

test('横糸: 隣り合う糸の同じ距離の点を、SPIDER_WEB_RING_STEP ごとに結ぶ', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  grow(web, Math.ceil((SPIDER_WEB_RING_STEP * 3 + 1) / SPIDER_WEB_SPEED));
  const segs = web.segments();
  const radial = segs.filter((s) => s.x1 === web.x && s.y1 === web.y);
  const cross = segs.filter((s) => !(s.x1 === web.x && s.y1 === web.y));
  assert.equal(radial.length, SPIDER_WEB_STRANDS);
  assert.equal(cross.length, 3 * (SPIDER_WEB_STRANDS - 1));
  for (const c of cross) {
    const r1 = Math.hypot(c.x1 - web.x, c.y1 - web.y);
    const r2 = Math.hypot(c.x2 - web.x, c.y2 - web.y);
    assert.ok(Math.abs(r1 - r2) < 1e-9);
    assert.ok(Math.abs(r1 / SPIDER_WEB_RING_STEP - Math.round(r1 / SPIDER_WEB_RING_STEP)) < 1e-9);
  }
});

test('自機に触れると絡まって消え、ダメージは無い', () => {
  const game = openWorld();
  const p = fakePlayer(game, 300, 280);
  const web = new SpiderWeb(game, 308, 200, 90 * DEG);
  game.enemyBullets.push(web);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 40 && web.alive; i++) cm.update();
  assert.equal(web.alive, false);
  assert.equal(p.webbed, 1);
  assert.equal(p.hp, 100);
});

test('横糸だけが触れても絡まる（糸と糸の間をすり抜けられない）', () => {
  const game = openWorld();
  // 真ん中の糸（真下）と隣の糸の間に、小さな箱を置く
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  const gap = SPIDER_WEB_SPREAD / (SPIDER_WEB_STRANDS - 1);
  const r = SPIDER_WEB_RING_STEP * 4;   // 横糸の上（縦糸と縦糸の真ん中）
  const mx = 300 + Math.cos(90 * DEG + gap / 2) * r;
  const my = 200 + Math.sin(90 * DEG + gap / 2) * r;
  const p = fakePlayer(game, mx - 2, my - 2);
  p.width = 4; p.height = 4;
  game.enemyBullets.push(web);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 60 && web.alive; i++) cm.update();
  assert.equal(p.webbed, 1);
});

test('母艦には絡まない', () => {
  const game = openWorld();
  fakePlayer(game, 900, 600);
  game.carrier = { x: 290, y: 260, width: 40, height: 30, alive: true, hp: 100, takeDamage(n) { this.hp -= n; } };
  const web = new SpiderWeb(game, 308, 200, 90 * DEG);
  game.enemyBullets.push(web);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 30; i++) cm.update();
  assert.equal(game.carrier.hp, 100);
  assert.equal(web.alive, true);
});

test('糸は点線で描き、縦糸と横糸を引く', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  grow(web, 30);
  const ctx = makeFakeCtx();
  web.draw(ctx);
  const dash = ctx.calls.find((c) => c.name === 'setLineDash' && c.args[0].length > 0);
  assert.ok(dash, '点線にしていない');
  const lines = ctx.calls.filter((c) => c.name === 'lineTo').length;
  assert.ok(lines >= web.segments().length, `線 ${lines} 本`);
  // 点線は描き終えたら戻す（後に描くものが点線にならないように）
  const last = ctx.calls.filter((c) => c.name === 'setLineDash').pop();
  assert.ok(last.args[0].length === 0 || ctx.calls.some((c) => c.name === 'restore'));
});

// ------------------------------------------
// 絡まった自機
// ------------------------------------------
function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

function realPlayer() {
  const game = makeGame(makeMap(flatFloorRows()));
  const held = new Set();
  game.input = inputWith(held);
  const p = new Player(game, 5 * T, 2 * T);
  p.docked = false;
  game.player = p;
  return { game, p, held };
}

test('絡まると横の速さが SPIDER_WEB_SLOW 倍に落ち、時間で取れる', () => {
  const { p, held } = realPlayer();
  held.add('KeyD');
  p.update();
  assert.equal(p.vx, PLAYER_MAX_SPEED);
  p.entangle();
  assert.equal(p.webTimer, SPIDER_WEB_ENTANGLE_FRAMES);
  p.update();
  assert.ok(Math.abs(p.vx - PLAYER_MAX_SPEED * SPIDER_WEB_SLOW) < 1e-9, `vx ${p.vx}`);
  for (let i = 0; i < SPIDER_WEB_ENTANGLE_FRAMES; i++) p.update();
  assert.equal(p.webTimer, 0);
  assert.equal(p.vx, PLAYER_MAX_SPEED);
});

test('絡まるとホバーで昇る速さも落ちる', () => {
  const { p, held } = realPlayer();
  p.entangle();
  held.add('KeyW');
  let minVy = 0;
  for (let i = 0; i < 40; i++) { p.update(); minVy = Math.min(minVy, p.vy); }
  assert.ok(minVy >= PLAYER_MAX_HOVER_SPEED * SPIDER_WEB_SLOW - 1e-9, `昇る速さ ${minVy}`);
});

test('左右に揺さぶると早く取れる（向きを変えるたびに SPIDER_WEB_SHAKE_FRAMES 減る）', () => {
  const { p, held } = realPlayer();
  p.entangle();
  held.add('KeyA');
  p.update();
  const t0 = p.webTimer;
  held.delete('KeyA'); held.add('KeyD');
  p.update();
  assert.equal(p.webTimer, t0 - 1 - SPIDER_WEB_SHAKE_FRAMES);
  // 同じ向きを押し続けても減らない（1フレームずつだけ）
  p.update();
  assert.equal(p.webTimer, t0 - 2 - SPIDER_WEB_SHAKE_FRAMES);
});

test('絡まっている間にもう一度当たっても、時間は足し算でなく最初からやり直し', () => {
  const { p } = realPlayer();
  p.entangle();
  p.update();
  p.entangle();
  assert.equal(p.webTimer, SPIDER_WEB_ENTANGLE_FRAMES);
});

test('絡まった自機には糸がかかって見える（点線）', () => {
  const { p } = realPlayer();
  p.entangle();
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.ok(ctx.calls.some((c) => c.name === 'setLineDash' && c.args[0].length > 0));
  const plain = makeFakeCtx();
  p.webTimer = 0;
  p.draw(plain);
  assert.ok(!plain.calls.some((c) => c.name === 'setLineDash' && c.args[0].length > 0));
});
