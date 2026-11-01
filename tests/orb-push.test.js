// 機体が Orb を押す・Orb に乗る・Orb に止められる、と Orb どうしの当たり（設計 4.4・4.3）。
// 自機は左右の入力で側面へ進んでいるときだけ押す（母艦を押すときと同じ規則。被弾で飛ばされただけでは押さない）。
// 押して坂を上れるが、重力がかかるので上りはきつい（ユーザー指定）。本物の自機を main.js と同じ順
// （自機 → 敵 → Orb）で更新する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Orb } from '../src/js/entities/Orb.js';
import { updateOrbs, resolveOrbPair } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T, PLAYER_MAX_SPEED, ORB_SIZES, ORB_IMPACT_RESTITUTION } from '../src/js/utils/Constants.js';

const FLOOR = 20;

/** 幅 60・高さ 24。床は row 20。wallFrom の列から右が壁。slope を真にすると列 40〜45 に右上がりの 6段の坂 */
function rows({ wallFrom = 99, slope = false } = {}) {
  const out = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 60; c++) {
      const k = FLOOR - r;
      const step = slope && k >= 1 && k <= 6 && c >= 39 + k;
      s += (r >= FLOOR || c >= wallFrom || c === 0 || step) ? '#' : '.';
    }
    out.push(s);
  }
  return out;
}

function world(opts) {
  const game = makeGame(makeMap(rows(opts), null, { tileShape: 'caveSlope' }));
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  game.orbs = [];
  game.landmines = [];
  const held = new Set();
  game.held = held;
  game.input = {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false, getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
  return game;
}

function addOrb(game, cx, size) {
  const orb = new Orb(game, { cx, cy: FLOOR * T - ORB_SIZES[size].diameter / 2, size });
  game.orbs.push(orb);
  return orb;
}

function addPlayer(game, x) {
  const p = new Player(game, x, FLOOR * T - 24);
  p.y = FLOOR * T - p.height;
  game.player = p;
  return p;
}

function step(game) {
  if (game.player) game.player.update();
  for (const e of game.enemies) if (e.step) e.step();
  updateOrbs(game);
}

for (const size of ['small', 'large']) {
  const r = ORB_SIZES[size].diameter / 2;
  const want = PLAYER_MAX_SPEED * ORB_SIZES[size].pushScale;

  test(`${size}: 右キーで Orb の左側面へ歩くと、Orb は ${want} px/フレーム前後で右へ動き、自機も同じ速さで進む`, () => {
    const game = world();
    const orb = addOrb(game, 20 * T, size);
    const p = addPlayer(game, 20 * T - r - 40);
    game.held.add('KeyD');
    for (let f = 0; f < 60; f++) step(game);   // 歩いて当たり、押し始めるまで
    const o0 = orb.cx, p0 = p.x;
    for (let f = 0; f < 60; f++) step(game);
    const ov = (orb.cx - o0) / 60, pv = (p.x - p0) / 60;
    assert.ok(Math.abs(ov - want) < want * 0.15, `Orb の速さ ${ov}（期待 ${want}）`);
    assert.ok(Math.abs(pv - ov) < 0.05, `自機 ${pv} と Orb ${ov} が一緒に進まない`);
    assert.ok(p.x + p.width <= orb.cx - r * 0.5, '自機が Orb に食い込んでいる');
  });

  test(`${size}: キーを離して慣性でぶつかっただけ（heldDir=0）では Orb は動かない`, () => {
    const game = world();
    const orb = addOrb(game, 20 * T, size);
    const p = addPlayer(game, 20 * T - r - p0w() - 1);
    const x0 = orb.x;
    for (let f = 0; f < 30; f++) { p.vx = 1.5; p.heldDir = 0; game.player.update(); p.heldDir = 0; updateOrbs(game); }
    assert.equal(orb.x, x0);
  });

  test(`${size}: Orb が壁に当たって止まったら、自機は Orb の手前で止まり、岩に入らず、左キーで離れられる`, () => {
    const game = world({ wallFrom: 30 });
    const orb = addOrb(game, 30 * T - r - 2, size);
    const p = addPlayer(game, 20 * T);
    game.held.add('KeyD');
    let inRock = 0;
    for (let f = 0; f < 200; f++) { step(game); if (collidesWithTerrain(p, game.map)) inRock++; }
    assert.equal(inRock, 0, '自機が岩に入った');
    assert.ok(orb.cx + r <= 30 * T + 0.01, 'Orb が壁に入った');
    assert.ok(p.x + p.width <= orb.cx, '自機が Orb を抜けた');
    game.held.clear(); game.held.add('KeyA');
    const px = p.x;
    for (let f = 0; f < 30; f++) step(game);
    assert.ok(p.x < px - 10, '左へ離れられない');
  });

  test(`${size}: 自機は Orb の上に乗れる（onGround が立ち、足が Orb の上面に合う）`, () => {
    const game = world();
    const orb = addOrb(game, 20 * T, size);
    const p = addPlayer(game, orb.cx - 8);
    p.y = orb.cy - r - p.height - 20;   // Orb の真上から落とす
    p.vy = 0;
    let onTop = false;
    for (let f = 0; f < 60; f++) {
      step(game);
      if (p.onGround && Math.abs(p.y + p.height - (orb.cy - r)) < 1.5) onTop = true;
    }
    assert.ok(onTop, `乗れない: 足 ${p.y + p.height}, Orb の上面 ${orb.cy - r}`);
  });

  test(`${size}: 押して45度の坂を頂上まで上れる`, () => {
    const game = world({ slope: true });
    const orb = addOrb(game, 30 * T, size);
    const p = addPlayer(game, 30 * T - r - 30);
    game.held.add('KeyD');
    let f = 0;
    while (f < 6000 && orb.cy + r > (FLOOR - 6) * T + 0.5) { step(game); f++; }
    assert.ok(f < 6000, `頂上に着かない: Orb の下端 ${orb.cy + r}`);
    upFrames[size] = f;
  });
}

const upFrames = {};
test('上りは large のほうが small より時間がかかる', () => {
  assert.ok(upFrames.small > 0 && upFrames.large > upFrames.small * 1.5, JSON.stringify(upFrames));
});

function p0w() { return 16; } // 自機の幅（PLAYER_WIDTH）

/** 歩く敵の代わり（戦車・アタッカーの押し方の規則だけを見る）。毎フレーム vx で進む */
function walker(game, x, vx, kind = 'enemy') {
  const e = {
    alive: true, x, y: FLOOR * T - 16, width: 24, height: 16, vx, vy: 0, grounded: true, onGround: true,
    step() { this.x += this.vx; },
  };
  if (kind === 'enemy') game.enemies.push(e); else { game.carrier = e; e.width = 64; e.height = 32; e.y = FLOOR * T - 32; }
  return e;
}

test('歩く敵が側面に当たると Orb を押す（速さは歩く速さ × pushScale）', () => {
  const game = world();
  const orb = addOrb(game, 20 * T, 'small');
  walker(game, 20 * T - 8 - 24 - 4, 0.6);
  for (let f = 0; f < 30; f++) step(game);
  const x0 = orb.cx;
  for (let f = 0; f < 60; f++) step(game);
  const v = (orb.cx - x0) / 60;
  assert.ok(Math.abs(v - 0.6 * ORB_SIZES.small.pushScale) < 0.05, `速さ ${v}`);
});

test('動く母艦が側面に当たると Orb を押す（重いので押し負けない＝母艦の速さで動く）', () => {
  const game = world();
  const orb = addOrb(game, 30 * T, 'large');
  const c = walker(game, 30 * T - 12 - 64 - 4, 0.4, 'carrier');
  game.carrier.step = c.step;
  const stepAll = () => { c.step(); updateOrbs(game); };
  for (let f = 0; f < 30; f++) stepAll();
  const x0 = orb.cx;
  for (let f = 0; f < 60; f++) stepAll();
  assert.ok(Math.abs((orb.cx - x0) / 60 - 0.4) < 0.05);
});

test('Orb どうしがぶつかると重なりが解け、法線方向の相対速度が -0.6 倍になる', () => {
  const game = world();
  const a = addOrb(game, 20 * T, 'small');
  const b = addOrb(game, 20 * T + 17, 'large');
  b.y -= 30;  // 空中で（床との当たりを混ぜない）。中心の高さを揃えて、法線を真横にする
  a.y = b.cy - a.r;
  a.onGround = b.onGround = false;
  a.vx = 3; b.vx = -1; a.vy = b.vy = 0;
  // 1回だけ当たりを解く（重力の効果が出ないよう、update を通さず Orb どうしだけ）
  const before = b.vx - a.vx;
  resolveOrbPair(a, b);
  const after = b.vx - a.vx;
  assert.ok(Math.abs(after - (-ORB_IMPACT_RESTITUTION) * before) < 0.05, `before ${before} after ${after}`);
  assert.ok(b.cx - a.cx >= a.r + b.r - 0.01, '重なりが解けていない');
});

test('壁際に立つ自機へ Orb がゆっくり転がってきても、自機は壁に押し込まれない', () => {
  // 壁は列 0（rows() の c === 0）。自機をその右に接して置き、Orb を左向きにゆっくり転がす
  const game = world();
  const p = addPlayer(game, T);
  const orb = addOrb(game, T + 16 + 8 + 1, 'small');
  let inRock = 0;
  for (let f = 0; f < 60; f++) {
    orb.vx = -1;   // 閾値より遅い（ダメージにならない）速さで押し付け続ける
    step(game);
    if (collidesWithTerrain(p, game.map)) inRock++;
  }
  assert.equal(inRock, 0, '自機が壁に入った');
});
