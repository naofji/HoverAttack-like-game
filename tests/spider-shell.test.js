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
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { shed, world as townWorld } from './helpers/town-explosive-fixtures.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  SPIDER_SHELL_SPEED as V, SPIDER_SHELL_GRAVITY as G, SPIDER_SHELL_FRAGMENTS, SPIDER_SHELL_SPREAD,
  ENEMY_BULLET_DAMAGE, TILE_SIZE, SPIDER_SHELL_SCORE, SPIDER_SHELL_AIM_ABOVE as AIM, SPIDER_SHELL_BURST_DX,
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

// 割れた5発は普通の敵弾（2026-11-23 ユーザー指定）。弾そのもの（EnemyBurstShell）は EnemyBullet ではない
const fragments = (game) => game.enemyBullets.filter((b) => b instanceof EnemyBullet);

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

test('狙いの点に着くと破裂して5発が自機へ向かう', () => {
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const pcx = p.x + 8, pcy = p.y + 12;
  const shell = fireAt(game, 100, 300, pcx, pcy - AIM);
  flyUntilBurst(shell);
  assert.equal(shell.alive, false);
  // 狙いの点の手前（自機の上・横が近い）か、着いたときに破裂する。手前の幅はフレームでなく横の距離で見る
  // （弾の速さを変えるたびに何フレーム手前かが変わるため）
  assert.ok(shell.age <= shell.target.frames, `age ${shell.age} / ${shell.target.frames}`);
  assert.ok(Math.abs(shell.x - shell.target.x) <= SPIDER_SHELL_BURST_DX + 1e-9, `狙いの点から横に ${shell.x - shell.target.x}`);
  const fr = fragments(game);
  assert.equal(fr.length, SPIDER_SHELL_FRAGMENTS);
  const angles = fr.map((f) => Math.atan2(f.vy, f.vx)).sort((a, b) => a - b);
  const toPlayer = Math.atan2(pcy - shell.y, pcx - shell.x);
  const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(Math.abs(mean - toPlayer) < 3 * DEG, `平均 ${mean / DEG} / 自機 ${toPlayer / DEG}`);
  assert.ok(Math.abs((angles[angles.length - 1] - angles[0]) - SPIDER_SHELL_SPREAD) < 0.5 * DEG);
  for (const f of fr) assert.ok(f.vy > 0, '上から下へ');
});

test('自機が弾の下に動いてくると、狙いの点より手前で破裂する', () => {
  const game = openWorld();
  const p = addPlayer(game, 600, 380);
  const shell = fireAt(game, 100, 300, p.x + 8, p.y + 12 - AIM);
  for (let i = 0; i < 20; i++) shell.update();
  assert.equal(shell.alive, true);
  // 弾の真下へ移る
  p.x = shell.x - 8;
  shell.update();
  assert.equal(shell.alive, false);
  assert.ok(shell.age < shell.target.frames - 8);
  assert.equal(fragments(game).length, SPIDER_SHELL_FRAGMENTS);
});

test('自機と同じ高さで横を通る弾は横では破裂しない', () => {
  const game = openWorld();
  // 遠くの点を狙った弾の、弧の頂点に自機の中心を置く。頂点の前後は高さがほとんど変わらないので、
  // 横の距離が近い間ずっと弾は自機の上端より下（＝体の高さ）を通る
  const x0 = 100, y0 = 300, tx = 650, ty = 300;
  const sol = solveLaunch(tx - x0, ty - y0, V, G);
  const pts = simulateShell(x0, y0, sol.angle, V, G, sol.frames);
  let k = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].y < pts[k].y) k = i;
  addPlayer(game, pts[k].x - 8, pts[k].y - 12);
  const shell = fireAt(game, x0, y0, tx, ty);
  for (let i = 0; i <= k; i++) shell.update();
  assert.equal(shell.alive, true, `横を通る途中で破裂した (age ${shell.age})`);
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
  assert.equal(fragments(game).length, SPIDER_SHELL_FRAGMENTS);
});

test('寿命で破裂する', () => {
  const game = openWorld();
  addPlayer(game, 900, 380);
  const shell = fireAt(game, 100, 300, 600, 250);
  shell.lifetime = 5;
  flyUntilBurst(shell);
  assert.equal(shell.age, 5);
  assert.equal(fragments(game).length, SPIDER_SHELL_FRAGMENTS);
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
  assert.equal(fragments(game).length, SPIDER_SHELL_FRAGMENTS);
});

test('直撃では破片を出さない', () => {
  const game = openWorld();
  const p = addPlayer(game, 400, 380);
  const shell = new EnemyBurstShell(game, p.x + 8, p.y + 12, 0, { x: 0, y: 0, frames: 999 });
  shell.vx = 0; shell.vy = 0;
  game.enemyBullets.push(shell);
  new CollisionManager(game).update();
  assert.equal(p.hp, 100 - ENEMY_BULLET_DAMAGE);
  assert.equal(shell.alive, false);
  assert.equal(fragments(game).length, 0);
});

test('走査中の破裂は同じフレームに破片を進めない', () => {
  const game = openWorld();
  addPlayer(game, 800, 380);
  const shell = fireAt(game, 100, 300, 300, 250);
  shell.age = shell.target.frames - 1;
  new CollisionManager(game).update();
  assert.equal(shell.alive, false);
  const fr = fragments(game);
  assert.equal(fr.length, SPIDER_SHELL_FRAGMENTS);
  for (const f of fr) assert.deepEqual([f.x, f.y], [shell.x, shell.y]);
});

test('破裂音は1回、破片の発射音は鳴らない', () => {
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
  assert.equal(fragments(game).length, 0);
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
  assert.equal(fragments(game).length, 0);
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

test('自機より上で横が近くても、頭のすぐ上では割れない（割れるのは頭上 SPIDER_SHELL_BURST_MIN_ABOVE 以上）', async () => {
  const { SPIDER_SHELL_BURST_MIN_ABOVE } = await import('../src/js/utils/Constants.js');
  // スパイダーが自機より下・同じ高さ・上の、左右いろいろな位置から撃つ（自機は止まったまま）
  for (const [x0, y0] of [[150, 470], [250, 440], [650, 470], [200, 392], [600, 392], [250, 250], [560, 200], [380, 470]]) {
    const game = openWorld();
    const p = addPlayer(game, 400, 380);
    const shell = fireAt(game, x0, y0, p.x + 8, p.y + 12 - AIM);
    flyUntilBurst(shell);
    assert.equal(shell.alive, false);
    assert.ok(shell.y <= p.y - SPIDER_SHELL_BURST_MIN_ABOVE + 1e-9,
      `(${x0}, ${y0}) から: 頭上 ${(p.y - shell.y).toFixed(1)}px で割れた`);
  }
});

test('地形に当たって割れたら、5発は岩の外から出る', () => {
  const extra = [];
  for (let r = 0; r < 40; r++) extra.push([r, 20]);
  const game = openWorld(extra);
  addPlayer(game, 100, 380);   // 割れた点から見て左下（岩と反対側）
  const shell = fireAt(game, 200, 300, 700, 250);
  flyUntilBurst(shell);
  assert.equal(shell.alive, false);
  assert.equal(game.map.isSolidPoint(shell.x, shell.y), false, `割れた点が岩の中 (${shell.x}, ${shell.y})`);
  const fr = fragments(game);
  for (const f of fr) f.update();
  assert.equal(fr.filter((f) => f.alive).length, SPIDER_SHELL_FRAGMENTS, '1フレーム目で岩に消えた');
});

test('建物に当たって割れた5発は、その建物を素通りしない', () => {
  const w = townWorld([shed(200, 100)]);
  const game = w.game;
  game.map.isSolidPoint = () => false;
  game.map.isSolidAtPixel = () => false;
  // 自機は建物の向こう側。割れた5発は建物へ向かって飛ぶ
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
  const fr = fragments(game);
  assert.equal(fr.length, SPIDER_SHELL_FRAGMENTS);
  for (let i = 0; i < 60; i++) {
    for (const f of fr) {
      if (!f.alive) continue;
      f.update();
      w.town.sweepProjectile(f, none);
      assert.ok(!(f.alive && f.x > 232), `建物（右端 232）を抜けた破片 (${f.x.toFixed(1)}, ${f.y.toFixed(1)})`);
    }
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
// 2026-11-23 ユーザー指定: 割れた後は普通の弾、割れる場所は自機から離す
// ------------------------------------------
test('割れた5発は普通の敵弾と同じ見た目・速さで、発射音は鳴らさない', async () => {
  const C = await import('../src/js/utils/Constants.js');
  const game = openWorld();
  addPlayer(game, 400, 380);
  const spy = spyWeapon();
  try {
    const shell = new EnemyBurstShell(game, 400, 200, 0, { x: 0, y: 0, frames: 9999 });
    shell.burst();
    const plain = new EnemyBullet(game, 0, 0, 0);
    const fr = fragments(game);
    assert.equal(fr.length, SPIDER_SHELL_FRAGMENTS);
    for (const f of fr) {
      assert.equal(f.bodyColor, plain.bodyColor);
      assert.equal(f.radius, C.ENEMY_BULLET_RADIUS);
      assert.ok(Math.abs(Math.hypot(f.vx, f.vy) - C.ENEMY_BULLET_SPEED) < 1e-9);
    }
    // plain の1回だけ。5発ぶんは鳴らない
    assert.equal(spy.calls.filter((k) => k === 'enemyMg').length, 1);
  } finally { spy.restore(); }
});

test('止まった自機に向けた弾は、自機の上端から 80px 以上上で割れる（狙いは中心の 120px 上）', () => {
  for (const [x0, y0] of [[150, 470], [250, 440], [650, 470], [200, 392], [600, 392], [250, 250], [560, 200], [380, 470]]) {
    const game = openWorld();
    const p = addPlayer(game, 400, 380);
    const shell = fireAt(game, x0, y0, p.x + 8, p.y + 12 - AIM);
    flyUntilBurst(shell);
    assert.equal(shell.alive, false);
    assert.ok(p.y - shell.y >= 80, `(${x0}, ${y0}) から: 頭上 ${(p.y - shell.y).toFixed(1)}px で割れた`);
  }
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

test('止まった自機に向けた弾は、頭のほぼ真上（横 20px 以内）で割れる', () => {
  for (const [x0, y0] of [[150, 470], [250, 440], [650, 470], [200, 392], [600, 392], [250, 250], [560, 200], [380, 470]]) {
    const game = openWorld();
    const p = addPlayer(game, 400, 380);
    const shell = fireAt(game, x0, y0, p.x + 8, p.y + 12 - AIM);
    flyUntilBurst(shell);
    assert.ok(Math.abs(shell.x - (p.x + 8)) <= 20, `(${x0}, ${y0}) から: 横に ${(shell.x - p.x - 8).toFixed(1)}px で割れた`);
  }
});
