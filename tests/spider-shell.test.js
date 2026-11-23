// スパイダーの弾（entities/EnemyBurstShell.js）の破裂と撃ち落とし。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBurstShell } from '../src/js/entities/EnemyBurstShell.js';
import { solveLaunch, simulateShell } from '../src/js/utils/shellBallistics.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Missile } from '../src/js/entities/Missile.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { SpiderWeb } from '../src/js/entities/SpiderWeb.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { shed, world as townWorld } from './helpers/town-explosive-fixtures.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  SPIDER_SHELL_SPEED as V, SPIDER_SHELL_GRAVITY as G, SPIDER_WEB_STRANDS, SPIDER_WEB_SPREAD,
  ENEMY_BULLET_DAMAGE, TILE_SIZE, SPIDER_SHELL_SCORE, SPIDER_SHELL_AIM_ABOVE as AIM, SPIDER_SHELL_BURST_RANGE as RANGE,
} from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
const DEG = Math.PI / 180;

/** 何も無い 60×40 タイルの空間（範囲外は岩） */
function openWorld(extra = []) {
  const rows = [];
  for (let r = 0; r < 40; r++) rows.push('.'.repeat(60));
  for (const [r, c] of extra) rows[r] = rows[r].slice(0, c) + '#' + rows[r].slice(c + 1);
  const game = makeGame(makeMap(rows));
  return game;
}

function addPlayer(game, x, y) {
  game.player = {
    x, y, width: 16, height: 24, alive: true, docked: false, invincibleTimer: 0, hp: 100,
    takeDamage(n) { this.hp -= n; },
    entangle() { this.webbed = (this.webbed || 0) + 1; },
  };
  return game.player;
}

/** (x0, y0) から点 (tx, ty) を狙った弾を作って enemyBullets に入れる */
function fireAt(game, x0, y0, tx, ty) {
  const sol = solveLaunch(tx - x0, ty - y0, V, G);
  assert.ok(sol);
  const shell = new EnemyBurstShell(game, x0, y0, sol.angle, { x: tx, y: ty, frames: sol.frames });
  game.enemyBullets.push(shell);
  return shell;
}

// 割れると5本の糸（SpiderWeb）を1つ広げる（2026-11-23 ユーザー指定。その前は5発の普通の敵弾）
const webs = (game) => game.enemyBullets.filter((b) => b instanceof SpiderWeb);

function spyWeapon() {
  const calls = [];
  const orig = audioManager.playWeapon;
  audioManager.playWeapon = (kind) => calls.push(kind);
  return { calls, restore() { audioManager.playWeapon = orig; } };
}

/** 弾だけを回す（当たり判定は CollisionManager の仕事なので通さない） */
function flyUntilBurst(shell, max = 400) {
  for (let i = 0; i < max && shell.alive; i++) shell.update();
}

test('自機から SPIDER_SHELL_BURST_RANGE まで近づくと破裂して、5本の糸が自機へ向けて広がる', () => {
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const pcx = p.x + 8, pcy = p.y + 12;
  const shell = fireAt(game, 100, 300, pcx, pcy - AIM);
  flyUntilBurst(shell);
  assert.equal(shell.alive, false);
  // 狙いの点に着く前に、自機の中心から RANGE まで近づいたところで割れる
  assert.ok(shell.age < shell.target.frames, `age ${shell.age} / ${shell.target.frames}`);
  const d = Math.hypot(shell.x - pcx, shell.y - pcy);
  assert.ok(d <= RANGE && d > RANGE - V - 1, `自機から ${d.toFixed(1)}px で割れた`);
  const ws = webs(game);
  assert.equal(ws.length, 1);
  const web = ws[0];
  assert.deepEqual([web.x, web.y], [shell.x, shell.y]);
  assert.equal(web.strands.length, SPIDER_WEB_STRANDS);
  const angles = web.strands.map((s) => s.angle).sort((a, b) => a - b);
  const toPlayer = Math.atan2(pcy - shell.y, pcx - shell.x);
  const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(Math.abs(mean - toPlayer) < 3 * DEG, `平均 ${mean / DEG} / 自機 ${toPlayer / DEG}`);
  assert.ok(Math.abs((angles[angles.length - 1] - angles[0]) - SPIDER_WEB_SPREAD) < 0.5 * DEG);
  // 5発の弾はもう出さない（割れた弾そのものは CollisionManager が取り除くまで残っている）
  assert.equal(game.enemyBullets.filter((b) => b.alive).length, 1);
});

test('地形に当たると破裂する', () => {
  // 弾の進路（右へ）に岩の柱
  const extra = [];
  for (let r = 0; r < 40; r++) extra.push([r, 20]);
  const game = openWorld(extra);
  addPlayer(game, 600, 380);
  const shell = fireAt(game, 100, 300, 608, 312);
  flyUntilBurst(shell);
  assert.equal(shell.alive, false);
  // 1フレーム前（岩の外）で割れる
  assert.ok(shell.x < 20 * T && shell.x > 20 * T - 12, `割れた x ${shell.x}`);
  assert.equal(webs(game).length, 1);
});

test('寿命で破裂する', () => {
  const game = openWorld();
  addPlayer(game, 900, 380);
  const shell = fireAt(game, 100, 300, 600, 250);
  shell.lifetime = 5;
  flyUntilBurst(shell);
  assert.equal(shell.age, 5);
  assert.equal(webs(game).length, 1);
});

test('建物に当たると破裂する', () => {
  const game = openWorld();
  addPlayer(game, 600, 380);
  const shell = fireAt(game, 100, 300, 608, 312);
  shell.update();
  shell.onTownWall(150, 290);
  assert.equal(shell.alive, false);
  // 当たった点から、来た向きへ少し戻った所で割れる（建物の中から出すと、その建物を素通りする）
  assert.ok(shell.x < 150);
  assert.equal(webs(game).length, 1);
});

test('直撃では糸を出さない', () => {
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const shell = new EnemyBurstShell(game, p.x + 8, p.y + 12, 0, { x: 0, y: 0, frames: 999 });
  shell.vx = 0; shell.vy = 0;
  game.enemyBullets.push(shell);
  new CollisionManager(game).update();
  assert.equal(p.hp, 100 - ENEMY_BULLET_DAMAGE);
  assert.equal(shell.alive, false);
  assert.equal(webs(game).length, 0);
});

test('走査中の破裂は同じフレームに糸を伸ばさない', () => {
  const game = openWorld();
  addPlayer(game, 800, 380);
  const shell = fireAt(game, 100, 300, 300, 250);
  shell.age = shell.target.frames - 1;
  new CollisionManager(game).update();
  assert.equal(shell.alive, false);
  const ws = webs(game);
  assert.equal(ws.length, 1);
  assert.deepEqual([ws[0].x, ws[0].y], [shell.x, shell.y]);
  for (const st of ws[0].strands) assert.equal(st.len, 0);
});

test('破裂音は1回、敵の弾の発射音は鳴らない', () => {
  const spy = spyWeapon();
  try {
    const game = openWorld();
    addPlayer(game, 600, 380);
    const shell = fireAt(game, 100, 300, 608, 312);
    spy.calls.length = 0;
    flyUntilBurst(shell);
    assert.equal(spy.calls.filter((k) => k === 'spiderBurst').length, 1);
    assert.equal(spy.calls.filter((k) => k === 'enemyMg').length, 0);
  } finally {
    spy.restore();
  }
});

// ------------------------------------------
// 撃ち落とし
// ------------------------------------------

/** 宙に止めた弾（破裂の条件に掛からないよう狙いは遠く・寿命は長く） */
function hangingShell(game, x, y) {
  const shell = new EnemyBurstShell(game, x, y, 0, { x: 0, y: 0, frames: 9999 });
  shell.vx = 0; shell.vy = 0; shell.lifetime = 9999;
  game.enemyBullets.push(shell);
  return shell;
}

/** グレネードの爆発が地図・格納塔に触る分の偽物 */
function grenadeReady(game) {
  game.map.pixelToTile = () => ({ r: 0, c: 0 });
  game.map.destroyArea = () => [];
  game.storageTowers = [];
}

test('MG の弾は跳ね返され、弾は飛び続ける', () => {
  const spy = spyWeapon();
  try {
    const game = openWorld();
    addPlayer(game, 900, 600);
    const shell = hangingShell(game, 300, 200);
    const mg = new PlayerBullet(game, 300, 200, 0);
    mg.vx = 0; mg.vy = 0;
    game.projectiles.push(mg);
    spy.calls.length = 0;
    new CollisionManager(game).update();
    assert.equal(shell.alive, true);
    assert.equal(mg.alive, false);
    assert.ok(spy.calls.includes('armorRicochet'));
  } finally {
    spy.restore();
  }
});

test('ミサイルで壊れ、破片を出さず、点が入る', () => {
  const game = openWorld();
  addPlayer(game, 900, 600);
  let score = 0;
  game.addScore = (n) => { score += n; };
  const shell = hangingShell(game, 300, 200);
  const m = new Missile(game, 300, 200, 0, true);
  m.vx = 0; m.vy = 0;
  game.projectiles.push(m);
  new CollisionManager(game).update();
  assert.equal(shell.alive, false);
  assert.equal(m.alive, false);
  assert.equal(webs(game).length, 0);
  assert.equal(score, SPIDER_SHELL_SCORE);
});

test('自機のグレネードの爆風で壊れる', () => {
  const game = openWorld();
  addPlayer(game, 900, 600);
  grenadeReady(game);
  const shell = hangingShell(game, 300, 200);
  const g = new Grenade(game, 310, 210, 0);
  g._explode();
  assert.equal(shell.alive, false);
  assert.equal(webs(game).length, 0);
});

test('グレネードは普通の敵弾を消さない', () => {
  const game = openWorld();
  addPlayer(game, 900, 600);
  grenadeReady(game);
  const b = new EnemyBullet(game, 300, 200, 0);
  game.enemyBullets.push(b);
  new Grenade(game, 305, 205, 0)._explode();
  assert.equal(b.alive, true);
});

test('敵のグレネードではスパイダーの弾は消えない', () => {
  const game = openWorld();
  addPlayer(game, 900, 600);
  grenadeReady(game);
  const shell = hangingShell(game, 300, 200);
  const g = new Grenade(game, 305, 205, 0);
  g.isPlayerOwned = false;
  g._explode();
  assert.equal(shell.alive, true);
});

// ------------------------------------------
// 最終レビューの指摘（Important 1・3）
// ------------------------------------------

test('地形に当たって割れたら、糸は岩の外から伸びる', () => {
  const extra = [];
  for (let r = 0; r < 40; r++) extra.push([r, 20]);
  const game = openWorld(extra);
  addPlayer(game, 100, 380);   // 割れた点から見て左下（岩と反対側）
  const shell = fireAt(game, 200, 300, 700, 250);
  flyUntilBurst(shell);
  assert.equal(shell.alive, false);
  assert.equal(game.map.isSolidPoint(shell.x, shell.y), false, `割れた点が岩の中 (${shell.x}, ${shell.y})`);
  const web = webs(game)[0];
  web.update();
  assert.ok(web.strands.every((st) => st.len > 0), '1フレーム目で岩に止まった');
});

test('建物に当たって割れた糸は、その建物を素通りしない', () => {
  const w = townWorld([shed(200, 100)]);
  const game = w.game;
  game.map.isSolidPoint = () => false;
  game.map.isSolidAtPixel = () => false;
  // 自機は建物の向こう側。糸は建物へ向かって伸びる
  addPlayer(game, 300, 104);
  const shell = new EnemyBurstShell(game, 150, 116, 0, { x: 9999, y: 0, frames: 9999 });
  game.enemyBullets.push(shell);
  const none = new Set();
  for (let i = 0; i < 40 && shell.alive; i++) {
    shell.update();
    shell.vy = 0;   // 重力で建物の下へ外れないよう、まっすぐ当てる
    w.town.sweepProjectile(shell, none);
  }
  assert.equal(shell.alive, false, '建物に当たっていない');
  const web = webs(game)[0];
  for (let i = 0; i < 60 && web.alive; i++) web.update();
  // 外の2本は小屋の上下をかすめるので、小屋に向かう真ん中の3本を見る
  for (const st of web.strands.filter((t) => Math.abs(t.angle) < 15 * DEG)) {
    const tx = web.x + Math.cos(st.angle) * st.len;
    assert.ok(tx <= 232, `建物（右端 232）を抜けた糸 x ${tx.toFixed(1)}`);
  }
});

// ------------------------------------------
// 見た目（2026-11-22 ユーザー指定「深紫色の球のような立体的な形」）
// ------------------------------------------
test('弾は深紫の球として、ハイライトを左上にずらした放射グラデーションで描く', async () => {
  const { makeFakeCtx } = await import('./helpers/fake-ctx.js');
  const C = await import('../src/js/utils/Constants.js');
  const game = openWorld();
  const shell = new EnemyBurstShell(game, 100, 200, 0, { x: 0, y: 0, frames: 9999 });
  const ctx = makeFakeCtx();
  shell.draw(ctx);
  // 外の光の輪も放射グラデーションなので、球（外の半径 = 弾の半径）のものを選ぶ
  const grad = ctx.calls.find((c) => c.name === 'createRadialGradient' && c.args[5] === C.SPIDER_SHELL_RADIUS);
  assert.ok(grad, '放射グラデーションで塗っていない');
  const [x0, y0, , x1, y1, r1] = grad.args;
  assert.ok(x0 < x1 && y0 < y1, 'ハイライトが左上にない');
  assert.equal(r1, C.SPIDER_SHELL_RADIUS);
  const colors = grad.grad.stops.map(([, c]) => c);
  assert.ok(colors.includes(C.COLOR_SPIDER_SHELL_BODY), `深紫の地の色が無い: ${colors}`);
  assert.equal(colors[colors.length - 1], C.COLOR_SPIDER_SHELL_RIM, '縁が暗くない');
  assert.ok(ctx.calls.some((c) => c.name === 'arc' && c.args[2] === C.SPIDER_SHELL_RADIUS), '球の大きさで描いていない');
});

test('弾の速さは 4、届く距離（平地で v²/g）は撃つ距離より長い', async () => {
  const C = await import('../src/js/utils/Constants.js');
  assert.equal(C.SPIDER_SHELL_SPEED, 4);
  assert.ok(C.SPIDER_SHELL_SPEED ** 2 / C.SPIDER_SHELL_GRAVITY > C.SPIDER_SIGHT_RANGE);
});

// ------------------------------------------
// 2026-11-23 ユーザー指定: 弾を目立たせる（明滅も可）、頭の真上で割れる
// ------------------------------------------
test('弾の周りに光の輪があり、明るさが明滅する', async () => {
  const { makeFakeCtx } = await import('./helpers/fake-ctx.js');
  const C = await import('../src/js/utils/Constants.js');
  const game = openWorld();
  const shell = new EnemyBurstShell(game, 100, 200, 0, { x: 0, y: 0, frames: 9999 });
  const glowAlpha = () => {
    const ctx = makeFakeCtx();
    shell.draw(ctx);
    const i = ctx.calls.findIndex((c) => c.name === 'arc' && c.args[2] > C.SPIDER_SHELL_RADIUS);
    assert.ok(i >= 0, '球より大きい光の輪が無い');
    // 輪を描いた時点の globalAlpha（その前の最後の代入）
    for (let j = i; j >= 0; j--) if (ctx.calls[j].name === 'set:globalAlpha') return ctx.calls[j].args[0];
    return 1;
  };
  const seen = new Set();
  for (let a = 0; a < 40; a++) { shell.age = a; seen.add(glowAlpha().toFixed(2)); }
  assert.ok(seen.size >= 3, `明滅していない: ${[...seen]}`);
});

// 2026-11-23 ユーザー指定: 「弾自体が大きすぎ」「フレアが明るすぎてお手玉みたい」。弾に見える大きさと光り方に収める
test('弾は普通の敵弾の2倍より小さく、光の輪は球にまとわる程度で淡い', async () => {
  const C = await import('../src/js/utils/Constants.js');
  assert.ok(C.SPIDER_SHELL_RADIUS < C.ENEMY_BULLET_RADIUS * 2, `球の半径 ${C.SPIDER_SHELL_RADIUS}`);
  assert.ok(C.SPIDER_SHELL_GLOW_RADIUS <= C.SPIDER_SHELL_RADIUS * 2, `輪の半径 ${C.SPIDER_SHELL_GLOW_RADIUS}`);
  assert.ok(C.SPIDER_SHELL_GLOW_ALPHA[1] <= 0.5, `輪の一番明るいとき ${C.SPIDER_SHELL_GLOW_ALPHA[1]}`);
});

// ------------------------------------------
// 2026-11-23 ユーザー指定: 狙いは頭上 50px、自機から 140px まで近づいたら割れて5発（少し高めの位置から出る）
// ------------------------------------------
const LAUNCHES = [[150, 470], [250, 440], [650, 470], [200, 392], [600, 392], [250, 250], [560, 200], [100, 300], [700, 300]];

test('止まった自機に向けた弾は、どこから撃っても自機の中心から 140px で割れる', () => {
  for (const [x0, y0] of LAUNCHES) {
    const game = openWorld();
    const p = addPlayer(game, 400, 380);
    const pcx = p.x + 8, pcy = p.y + 12;
    const shell = fireAt(game, x0, y0, pcx, pcy - AIM);
    flyUntilBurst(shell);
    const d = Math.hypot(shell.x - pcx, shell.y - pcy);
    assert.ok(Math.abs(d - RANGE) <= V, `(${x0}, ${y0}) から: 自機から ${d.toFixed(1)}px で割れた`);
    assert.equal(webs(game).length, 1);
  }
});

test('狙いは頭の上端の 50px 上（中心の 62px 上）', () => {
  assert.equal(AIM, 50 + 12);
});

test('自機の 140px より内側から撃った弾は、すぐには割れず狙いの点で割れる', () => {
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const pcx = p.x + 8, pcy = p.y + 12;
  const shell = fireAt(game, pcx - 100, pcy, pcx, pcy - AIM);
  shell.update();
  assert.equal(shell.alive, true, '撃った直後に割れた');
  flyUntilBurst(shell);
  assert.equal(shell.age, shell.target.frames);
});

test('自機が近づいてくると、狙いの点の手前でも 140px で割れる', () => {
  const game = openWorld();
  const p = addPlayer(game, 600, 380);
  const shell = fireAt(game, 100, 300, p.x + 8, p.y + 12 - AIM);
  for (let i = 0; i < 20; i++) shell.update();
  assert.equal(shell.alive, true);
  // 弾の 130px 先へ移る
  p.x = shell.x + 130 - 8;
  p.y = shell.y - 12;
  shell.update();
  assert.equal(shell.alive, false);
  assert.ok(shell.age < shell.target.frames - 8);
});

test('自機の 140px に入る少し前から点滅する（狙いの点がまだ遠くても）', async () => {
  const C = await import('../src/js/utils/Constants.js');
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const shell = new EnemyBurstShell(game, p.x + 8 - RANGE - 10, p.y + 12, 0, { x: 0, y: 0, frames: 9999 });
  const colors = new Set();
  for (let a = 0; a < 10; a++) { shell.age = a; colors.add(shell.bodyColor); }
  assert.ok(colors.has(C.COLOR_SPIDER_SHELL_BLINK), `点滅していない: ${[...colors]}`);
});
