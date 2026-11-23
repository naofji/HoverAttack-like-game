// スパイダーの糸（entities/SpiderWeb.js）と、絡まった自機（Player の webTimer）。
// 2026-11-23 ユーザー指定: 弾が割れたら5発の弾ではなく5本の糸を広げる。糸は点線、カラム（絡む）感じが出るよう横糸も張る。
// 当たると自機の動きが遅くなる（ダメージなし）。左右に揺さぶると早く取れる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpiderWeb, WebScrap } from '../src/js/entities/SpiderWeb.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { Player } from '../src/js/entities/Player.js';
import { shed, world as townWorld } from './helpers/town-explosive-fixtures.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  TILE_SIZE, SPIDER_WEB_STRANDS, SPIDER_WEB_SPREAD, SPIDER_WEB_SPEED_START, SPIDER_WEB_SPEED_END, SPIDER_WEB_MAX_LENGTH,
  SPIDER_WEB_RING_STEP, SPIDER_WEB_FADE_FRAMES, SPIDER_WEB_ENTANGLE_FRAMES, SPIDER_WEB_SLOW,
  SPIDER_WEB_SHAKE_FRAMES, PLAYER_MAX_SPEED, PLAYER_MAX_HOVER_SPEED,
  SPIDER_WEB_DROOP, SPIDER_WEB_FLUTTER, SPIDER_WEB_CROSS_SAG, SPIDER_WEB_WRAP_FRAMES,
  SPIDER_WEB_CLING_RADIUS, SPIDER_WEB_JOLT_FRAMES, COLOR_SPIDER_WEB, SPIDER_WEB_SINK_SPEED, SPIDER_WEB_DRIFT_SPEED, SPIDER_WEB_DRIFT_DECAY,
  SPIDER_WEB_SCRAPS, SPIDER_WEB_SCRAP_LIFETIME,
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
// 全部の糸が止まるまで（伸び切った最後のフレームで薄れ始める）
const growFull = (web) => { for (let i = 0; i < 1000 && web.strands.some((s) => !s.stopped); i++) web.update(); };

test('5本の糸が、向けた向きを中心に扇に広がり、初めは速く（SPEED_START）だんだん遅く伸びる', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 60 * DEG);
  assert.equal(web.strands.length, SPIDER_WEB_STRANDS);
  const angles = web.strands.map((s) => s.angle);
  const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(Math.abs(mean - 60 * DEG) < 1e-9);
  assert.ok(Math.abs(Math.max(...angles) - Math.min(...angles) - SPIDER_WEB_SPREAD) < 1e-9);
  grow(web, 1);
  for (const s of web.strands) assert.ok(Math.abs(s.len - SPIDER_WEB_SPEED_START) < 1e-9);
  // 1フレームの伸びは減り続け、伸び切る手前で SPEED_END 近くまで落ちる
  const steps = [];
  let prev = web.strands[0].len;
  while (!web.strands[0].stopped) {
    web.update();
    steps.push(web.strands[0].len - prev);
    prev = web.strands[0].len;
  }
  for (let i = 1; i < steps.length - 1; i++) assert.ok(steps[i] < steps[i - 1], `${i} フレーム目で速くなった`);
  assert.ok(steps[steps.length - 2] < SPIDER_WEB_SPEED_END * 1.2, `終わりの速さ ${steps[steps.length - 2]}`);
  grow(web, 500);
  // 伸び切ったら消える（伸びる → 薄れる）
  assert.equal(web.alive, false);
});

// 自機の 140px 先で割れた糸が、狙った自機の中心に届くまでのフレーム数。2026-11-23 に「扇の向きに流れる」を足す前に
// 測った値（ユーザー指定「今の届くまでの時間を保ちたい。あまり速いとストレスフル」）。斜め下・真下ほど沈みが
// 加わって早い。扇の真ん中から外へ出るのに約 29 フレーム（SPIDER_WEB_SPREAD のコメント）
const REACH_FRAMES = [[[-140, 0], 41], [[-99, -99], 32], [[0, -140], 29], [[99, -99], 32], [[-130, -52], 36]];

test('140px 先の自機に届くまでの時間は、流れを足す前と ±2 フレームで同じ', () => {
  const game = openWorld();
  for (const [[dx, dy], want] of REACH_FRAMES) {
    const tx = 600;
    const ty = 500;
    const web = new SpiderWeb(game, tx + dx, ty + dy, SpiderWeb.aimAngle(tx + dx, ty + dy, tx, ty));
    const mid = web.strands[(SPIDER_WEB_STRANDS - 1) / 2];
    let n = 0;
    let hit = null;
    while (!mid.stopped && n < 200) {
      web.update();
      n++;
      const p = web.pointAt(mid, mid.len);
      if (hit === null && Math.hypot(p.x - tx, p.y - ty) < 5) hit = n;
    }
    assert.ok(hit !== null && Math.abs(hit - want) <= 2, `(${dx}, ${dy}) から ${hit} フレーム（前は ${want}）`);
  }
});

test('伸び切った糸は SPIDER_WEB_MAX_LENGTH で止まり、SPIDER_WEB_FADE_FRAMES で薄れて消える', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  growFull(web);
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
    const { x: tx, y: ty } = web.pointAt(s, s.len);
    assert.equal(game.map.isSolidAtPixel(tx, ty), false, `先が岩の中 (${tx.toFixed(1)}, ${ty.toFixed(1)})`);
    assert.ok(s.len < 40, `止まっていない ${s.len}`);
  }
});

test('建物に当たった糸はそこで止まる', () => {
  const w = townWorld([shed(200, 100)]);
  const game = w.game;
  game.map.isSolidPoint = () => false;
  game.map.isSolidAtPixel = () => false;
  // 糸は割れた瞬間から沈むので、沈んで小屋（高さ 32）の下へ抜ける前に届く近さで割る
  const web = new SpiderWeb(game, 185, 116, 0);
  grow(web, 60);
  // 外の2本（±20°）は小屋（y 100〜132）の上下をかすめて外れるので、小屋に向かう真ん中の3本を見る
  for (const s of web.strands.filter((st) => Math.abs(st.angle) < 15 * DEG)) {
    const tx = web.pointAt(s, s.len).x;
    assert.ok(tx <= 232, `建物（右端 232）を抜けた糸 x ${tx.toFixed(1)}`);
  }
});

test('横糸: 隣り合う糸の同じ距離の点を、SPIDER_WEB_RING_STEP ごとに、真ん中がたるんだ2本の線で結ぶ', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  for (let i = 0; i < 200 && web.strands.some((s) => s.len < SPIDER_WEB_RING_STEP * 3 + 1); i++) web.update();
  const segs = web.segments();
  const cross = segs.filter((s) => s.kind === 'cross');
  assert.equal(cross.length, 2 * 3 * (SPIDER_WEB_STRANDS - 1));
  const close = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;
  let k = 0;
  for (let i = 0; i + 1 < SPIDER_WEB_STRANDS; i++) {
    for (let ring = 1; ring <= 3; ring++, k += 2) {
      const r = ring * SPIDER_WEB_RING_STEP;
      const a = web.pointAt(web.strands[i], r);
      const b = web.pointAt(web.strands[i + 1], r);
      const [h1, h2] = [cross[k], cross[k + 1]];
      assert.ok(close({ x: h1.x1, y: h1.y1 }, a), '横糸の端が縦糸の上にない');
      assert.ok(close({ x: h2.x2, y: h2.y2 }, b), '横糸の端が縦糸の上にない');
      assert.ok(close({ x: h1.x2, y: h1.y2 }, { x: h2.x1, y: h2.y1 }), '2本がつながっていない');
      assert.ok(Math.abs(h1.y2 - ((a.y + b.y) / 2 + SPIDER_WEB_CROSS_SAG)) < 1e-9, 'たるんでいない');
    }
  }
  // 縦糸は中心から先まで折れ線でつながる
  for (const st of web.strands) {
    const tip = web.pointAt(st, st.len);
    assert.ok(segs.some((s) => s.kind === 'radial' && close({ x: s.x2, y: s.y2 }, tip)), '縦糸の先が無い');
  }
  const o = web.origin();
  assert.ok(segs.some((s) => s.kind === 'radial' && s.x1 === o.x && s.y1 === o.y), '縦糸が起点から出ていない');
});

test('糸はまっすぐでなく、先ほど下へ垂れる（柔らかい布）', () => {
  const game = openWorld();
  const web = new SpiderWeb(game, 300, 200, 0);   // 真横へ
  growFull(web);
  const mid = web.strands[(SPIDER_WEB_STRANDS - 1) / 2];
  // 伸び切ったフレームから薄れ始めて沈むので、その分を引く
  const sagAt = (r) => web.pointAt(mid, r).y - web.y - web.offset.y;
  assert.ok(Math.abs(sagAt(SPIDER_WEB_MAX_LENGTH) - SPIDER_WEB_DROOP) <= SPIDER_WEB_FLUTTER + 1e-9,
    `先の垂れ ${sagAt(SPIDER_WEB_MAX_LENGTH)}`);
  assert.ok(Math.abs(sagAt(SPIDER_WEB_MAX_LENGTH / 2) - SPIDER_WEB_DROOP / 4) <= SPIDER_WEB_FLUTTER + 1e-9,
    `半ばの垂れ ${sagAt(SPIDER_WEB_MAX_LENGTH / 2)}`);
  // 揺れている（同じ点がフレームごとに動く）
  const before = web.pointAt(mid, 150);
  web.update();
  const after = web.pointAt(mid, 150);
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.05, '揺れていない');
});

test('垂れ・沈み・流れのぶん扇の向きを直すので、伸びていく真ん中の糸の先は狙った点を通る', () => {
  const game = openWorld();
  const tx = 600;
  const ty = 500;
  for (const [dx, dy] of [[-140, 0], [-99, -99], [0, -140], [99, -99]]) {
    const x = tx + dx;
    const y = ty + dy;
    const web = new SpiderWeb(game, x, y, SpiderWeb.aimAngle(x, y, tx, ty));
    const mid = web.strands[(SPIDER_WEB_STRANDS - 1) / 2];
    // 狙った点の周り（自機の大きさ 16×24 の半分ほど）を、伸びていく先が通る
    let best = Infinity;
    while (!mid.stopped) {
      web.update();
      const p = web.pointAt(mid, mid.len);
      best = Math.min(best, Math.hypot(p.x - tx, p.y - ty));
    }
    assert.ok(best < 5, `(${dx}, ${dy}) から 狙いと ${best.toFixed(1)}px ずれた`);
  }
});

test('網は扇の向きへ流れながら（だんだん遅く）沈む。起点も糸も一緒に動く', () => {
  const game = openWorld();
  const a = 60 * DEG;
  const web = new SpiderWeb(game, 300, 200, a);
  const origin = () => web.segments().find((sg) => sg.kind === 'radial');
  const n = 10;
  grow(web, n);
  assert.ok(web.strands.every((s) => !s.stopped), 'まだ伸びている最中のはず');
  // 流れ: 1フレーム目 DRIFT_SPEED、以後 DRIFT_DECAY 倍ずつ。沈み: 毎フレーム SINK_SPEED
  let drift = 0;
  for (let i = 0; i < n; i++) drift += SPIDER_WEB_DRIFT_SPEED * SPIDER_WEB_DRIFT_DECAY ** i;
  const ex = Math.cos(a) * drift;
  const ey = Math.sin(a) * drift + n * SPIDER_WEB_SINK_SPEED;
  const o1 = origin();
  assert.ok(Math.abs(o1.x1 - 300 - ex) < 1e-9 && Math.abs(o1.y1 - 200 - ey) < 1e-9,
    `起点の動き (${(o1.x1 - 300).toFixed(2)}, ${(o1.y1 - 200).toFixed(2)}) / (${ex.toFixed(2)}, ${ey.toFixed(2)})`);
  // 糸の点も同じだけ動いている（垂れ・揺れを除いて）
  const mid = web.strands[(SPIDER_WEB_STRANDS - 1) / 2];
  const r = 30;
  const sx = 300 + Math.cos(mid.angle) * r;
  const sy = 200 + Math.sin(mid.angle) * r + SPIDER_WEB_DROOP * (r / SPIDER_WEB_MAX_LENGTH) ** 2;
  const q = web.pointAt(mid, r);
  assert.ok(Math.hypot(q.x - sx - ex, q.y - sy - ey) <= SPIDER_WEB_FLUTTER, '糸の点が一緒に動いていない');
  // 流れはやがて止まり、沈むだけになる
  grow(web, 80);
  const o2 = origin();
  grow(web, 1);
  const o3 = origin();
  assert.ok(Math.abs(o3.x1 - o2.x1) < 0.01, `まだ横へ流れている ${o3.x1 - o2.x1}`);
});

test('沈むが、岩の中へは沈まない', () => {
  // 下に床（row 18 = y 288〜）
  const extra = [];
  for (let c = 0; c < 60; c++) extra.push([18, c]);
  const game = openWorld(extra);
  const web = new SpiderWeb(game, 300, 100, 30 * DEG);
  growFull(web);
  web.update();
  const free = web.strands[0];
  const y0 = web.pointAt(free, 60).y;
  grow(web, 20);
  assert.ok(web.alive);
  assert.ok(web.pointAt(free, 60).y > y0 + 5, '沈んでいない');
  for (const sg of web.segments()) {
    for (const [x, y] of [[sg.x1, sg.y1], [sg.x2, sg.y2]]) {
      assert.equal(game.map.isSolidAtPixel(x, y), false, `岩の中 (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
});

test('自機に触れると絡まり、糸は急に消えずに機体へ覆い被さるように縮んで消える。ダメージは無い', () => {
  const game = openWorld();
  const p = fakePlayer(game, 300, 280);
  const web = new SpiderWeb(game, 308, 200, 90 * DEG);
  game.enemyBullets.push(web);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 40 && p.webbed === 0; i++) cm.update();
  assert.equal(p.webbed, 1);
  assert.equal(p.hp, 100);
  assert.equal(web.alive, true, '当たった瞬間に消えた');
  assert.ok(web.wrapping, '覆い被さっていない');
  // 自機が動いてもついて行く
  p.x += 40;
  for (let i = 0; i < SPIDER_WEB_WRAP_FRAMES - 1; i++) cm.update();
  assert.equal(web.alive, true);
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  for (const s of web.segments()) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      assert.ok(Math.hypot(x - cx, y - cy) <= SPIDER_WEB_CLING_RADIUS + 1e-6,
        `機体から ${Math.hypot(x - cx, y - cy).toFixed(1)}px`);
    }
  }
  // 覆い被さっている間に重ねて絡めない
  assert.equal(p.webbed, 1);
  cm.update();
  assert.equal(web.alive, false);
  assert.equal(game.enemyBullets.includes(web), false);
});

test('横糸だけが触れても絡まる（糸と糸の間をすり抜けられない）', () => {
  const game = openWorld();
  // 真ん中の糸（真下）と隣の糸の間に、小さな箱を置く
  const web = new SpiderWeb(game, 300, 200, 90 * DEG);
  const r = SPIDER_WEB_RING_STEP * 4;   // 横糸の上（縦糸と縦糸の真ん中の、たるんだ点）
  const a = web.pointAt(web.strands[2], r);
  const b = web.pointAt(web.strands[3], r);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + SPIDER_WEB_CROSS_SAG;
  const p = fakePlayer(game, mx - 2, my - 2);
  p.width = 4; p.height = 4;
  game.enemyBullets.push(web);
  const cm = new CollisionManager(game);
  for (let i = 0; i < 60 && p.webbed === 0; i++) cm.update();
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

/** 自機の描画のうち、糸（COLOR_SPIDER_WEB）で引いた点の外接矩形 */
function webBox(p) {
  const ctx = makeFakeCtx();
  p.draw(ctx);
  const start = ctx.calls.findIndex((c) => c.name === 'set:strokeStyle' && c.args[0] === COLOR_SPIDER_WEB);
  assert.ok(start >= 0, '糸を描いていない');
  const pts = [];
  for (let i = start; i < ctx.calls.length && ctx.calls[i].name !== 'restore'; i++) {
    const c = ctx.calls[i];
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(c.args);
  }
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

test('機体にまとわりつく糸は、覆い被さる間に育ち、振りほどくほど小さくなる', () => {
  const { p, held } = realPlayer();
  p.entangle();
  const first = webBox(p);
  for (let i = 0; i < SPIDER_WEB_WRAP_FRAMES; i++) p.update();
  const full = webBox(p);
  assert.ok(full.w > first.w * 1.5, `育っていない ${first.w.toFixed(1)} → ${full.w.toFixed(1)}`);
  assert.ok(full.w > SPIDER_WEB_CLING_RADIUS * 1.5, `機体を覆っていない 幅 ${full.w.toFixed(1)}`);
  // 左右に揺さぶる
  for (const key of ['KeyA', 'KeyD', 'KeyA', 'KeyD']) {
    held.clear(); held.add(key);
    p.update();
  }
  held.clear();
  for (let i = 0; i < SPIDER_WEB_JOLT_FRAMES + 30; i++) p.update();
  assert.ok(p.webTimer > 0);
  const shaken = webBox(p);
  assert.ok(shaken.w < full.w * 0.75, `小さくなっていない ${full.w.toFixed(1)} → ${shaken.w.toFixed(1)}`);
});

test('揺さぶった瞬間、機体の糸がはねる', () => {
  const { p, held } = realPlayer();
  p.entangle();
  for (let i = 0; i < SPIDER_WEB_WRAP_FRAMES; i++) p.update();
  held.add('KeyA');
  p.update();
  held.clear();
  for (let i = 0; i < SPIDER_WEB_JOLT_FRAMES + 1; i++) p.update();
  assert.equal(p._webJolt, 0);
  held.add('KeyD');
  p.update();
  held.clear(); held.add('KeyA');
  p.update();
  assert.equal(p._webJolt > 0, true, 'はねていない');
});

const scrapsOf = (game) => game.particles.filter((q) => q instanceof WebScrap);

test('揺さぶって振りほどくたびに、糸の切れ端が SPIDER_WEB_SCRAPS 本飛び散る（同じ向きを押し続けても出ない）', () => {
  const { game, p, held } = realPlayer();
  p.entangle();
  held.add('KeyA');
  for (let i = 0; i < 5; i++) p.update();
  assert.equal(scrapsOf(game).length, 0, '揺さぶっていないのに飛んだ');
  held.clear(); held.add('KeyD');
  p.update();
  assert.equal(scrapsOf(game).length, SPIDER_WEB_SCRAPS);
  held.clear(); held.add('KeyA');
  p.update();
  assert.equal(scrapsOf(game).length, 2 * SPIDER_WEB_SCRAPS);
  // 絡まっていなければ、左右に切り返しても出ない
  const fresh = realPlayer();
  for (const key of ['KeyA', 'KeyD', 'KeyA']) {
    fresh.held.clear(); fresh.held.add(key);
    fresh.p.update();
  }
  assert.equal(scrapsOf(fresh.game).length, 0);
});

test('切れ端は機体から外へ飛び、ふわっと落ちながら薄れて消える', () => {
  const { game, p, held } = realPlayer();
  p.entangle();
  held.add('KeyA'); p.update();
  held.clear(); held.add('KeyD'); p.update();
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  const scraps = scrapsOf(game);
  const d0 = scraps.map((q) => Math.hypot(q.x - cx, q.y - cy));
  // 向きがばらけている（全部が同じ向きへ飛ばない）
  const dirs = new Set(scraps.map((q) => Math.sign(q.vx)));
  assert.ok(dirs.size >= 2, '片側にしか飛ばない');
  const alpha = (q) => {
    const ctx = makeFakeCtx();
    q.draw(ctx);
    const a = ctx.calls.filter((c) => c.name === 'set:globalAlpha').pop();
    assert.ok(ctx.calls.some((c) => c.name === 'set:strokeStyle' && c.args[0] === COLOR_SPIDER_WEB), '糸の色でない');
    return a ? a.args[0] : 1;
  };
  const a0 = alpha(scraps[0]);
  for (let i = 0; i < 12; i++) scraps.forEach((q) => q.update());
  scraps.forEach((q, i) => assert.ok(Math.hypot(q.x - cx, q.y - cy) > d0[i] + 4, '外へ飛んでいない'));
  assert.ok(alpha(scraps[0]) < a0, '薄れていない');
  // 上へ飛んだものも下へ飛んだものも、やがてみな同じゆっくりした速さで落ちる（布の切れ端なので石のようには落ちない）
  for (let i = 0; i < 18; i++) scraps.forEach((q) => q.update());
  scraps.forEach((q) => assert.ok(q.vy > 0.3 && q.vy < 1, `落ちる速さ ${q.vy.toFixed(2)}`));
  for (let i = 0; i < SPIDER_WEB_SCRAP_LIFETIME; i++) scraps.forEach((q) => q.update());
  scraps.forEach((q) => assert.equal(q.alive, false));
});

test('沈む糸は薄い床（1タイル）をすり抜けて下へ出ない（消えるまでずっと床の上）', () => {
  const extra = [];
  for (let c = 0; c < 60; c++) extra.push([18, c]);   // y 288〜304 の薄い床、その下は空洞
  const game = openWorld(extra);
  const web = new SpiderWeb(game, 300, 100, 30 * DEG);
  for (let i = 0; i < 300 && web.alive; i++) {
    web.update();
    for (const sg of web.segments()) {
      for (const y of [sg.y1, sg.y2]) assert.ok(y < 288, `${i} フレーム目: 床を抜けた y ${y.toFixed(1)}`);
    }
  }
});
