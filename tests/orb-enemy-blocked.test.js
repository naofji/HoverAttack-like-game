// 戦車・敵アタッカーが押しても Orb が動かない（Orb の向こうが壁など）ときは、壁に当たったときと同じく
// 戦車は折り返し、アタッカーは跳び越える（跳べなければ折り返す）（2026-11-03 ユーザー指定）。
// 以前は動かない Orb を押したまま、その場で歩き続けた。動く Orb はこれまでどおり押し続ける
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Orb } from '../src/js/entities/Orb.js';
import { updateOrbs } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { TILE_SIZE as T, ORB_SIZES } from '../src/js/utils/Constants.js';

const FLOOR = 20;

/** 幅 60。床は row 20。wallFrom の列から右は、床から wallTiles 段の高さの壁 */
function world({ wallFrom = 99, wallTiles = 4 } = {}) {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 60; c++) s += (r >= FLOOR || c === 0 || c === 59 || (c >= wallFrom && r >= FLOOR - wallTiles)) ? '#' : '.';
    rows.push(s);
  }
  const game = makeGame(makeMap(rows, null, { tileShape: 'caveSlope' }));
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  game.orbs = [];
  game.landmines = [];
  return game;
}

function addOrb(game, cx) {
  const r = ORB_SIZES.large.diameter / 2;
  const orb = new Orb(game, { cx, cy: FLOOR * T - r, size: 'large' });
  game.orbs.push(orb);
  return orb;
}

function addTank(game, x) {
  const t = new EnemyTank(game, x, FLOOR * T - 20);
  t.y = FLOOR * T - t.height - 0.01;
  t.patrolDir = 1;
  t.facingRight = true;
  t.fireTimer = 1e9;
  game.enemies.push(t);
  return t;
}

function step(game) {
  for (const e of game.enemies) e.update();
  updateOrbs(game);
}

test('戦車: 壁の手前で動かない Orb を押すと、折り返して離れていく', () => {
  const game = world({ wallFrom: 30 });
  const orb = addOrb(game, 30 * T - 12 - 1);
  const t = addTank(game, 20 * T);
  let turned = -1;
  for (let f = 0; f < 600; f++) {
    step(game);
    if (turned < 0 && t.patrolDir < 0) turned = f;
  }
  assert.ok(turned >= 0, '折り返さない');
  assert.ok(t.x + t.width < orb.cx - orb.r - 2 * T, `離れていかない: 戦車の右端 ${t.x + t.width}, Orb の左端 ${orb.cx - orb.r}`);
});

test('戦車: 動く Orb はこれまでどおり押し続ける（折り返さない）', () => {
  const game = world();
  const orb = addOrb(game, 20 * T);
  const t = addTank(game, 20 * T - 12 - 32 - 4);
  const x0 = orb.cx;
  for (let f = 0; f < 400; f++) step(game);
  assert.equal(t.patrolDir, 1, '動く Orb で折り返した');
  assert.ok(orb.cx > x0 + 2 * T, `Orb が押されていない: ${orb.cx - x0}`);
});

// heavy は跳ぶ力が弱く、Orb を越えきれずに Orb の上へ乗る。乗った Orb の上で前を「崖」と読んで毎フレーム向きを変え、
// 上から降りられなくなった（地形しか見ない崖の判定）。standard は跳び越える。壁が高ければ越えられないので折り返す
for (const [type, wallTiles] of [['heavy', 1], ['standard', 1], ['heavy', 4]]) test(`アタッカー（${type}・壁 ${wallTiles} 段）: 壁の手前で動かない Orb に当たると、跳んで越えるか折り返し、その場で歩き続けない`, () => {
  const game = world({ wallFrom: 30, wallTiles });
  const orb = addOrb(game, 30 * T - 12 - 1);
  const a = makeAttacker(game, 22 * T, FLOOR * T - 24, type);
  a.y = FLOOR * T - a.height;
  a.patrolDir = 1;
  a.facingRight = true;
  let jumped = false, turned = false, beyond = false, flips = 0, dir = a.patrolDir;
  for (let f = 0; f < 900; f++) {
    step(game);
    if (!a.onGround && a.vy < 0 && Math.abs(a.x + a.width / 2 - orb.cx) < 3 * T) jumped = true;
    if (a.patrolDir !== dir) { flips++; dir = a.patrolDir; turned = true; }
    if (a.x > orb.cx) beyond = true;
  }
  assert.ok(jumped || turned, '跳びも折り返しもしない（Orb を押したまま歩き続けた）');
  assert.ok(beyond || turned, `越えも折り返しもしない: x ${a.x}`);
  // 900 フレームのうちに左の端の壁まで歩いて戻ることもあるので、数回までは許す
  assert.ok(flips <= 4, `向きを ${flips} 回変えた（その場で向きを変え続けている）`);
  assert.ok(Math.abs(a.x + a.width / 2 - orb.cx) > orb.r || !a.onGround, `Orb の上で止まっている: x ${a.x}`);
});

test('アタッカー: 動く Orb はこれまでどおり押し続ける（跳ばない）', () => {
  const game = world();
  const orb = addOrb(game, 20 * T);
  const a = makeAttacker(game, 20 * T - 12 - 24 - 4, FLOOR * T - 24, 'heavy');
  a.y = FLOOR * T - a.height;
  a.patrolDir = 1;
  a.facingRight = true;
  const x0 = orb.cx;
  let jumped = false;
  for (let f = 0; f < 400; f++) {
    step(game);
    if (!a.onGround && a.vy < 0) jumped = true;
  }
  assert.equal(jumped, false, '動く Orb の前で跳んだ');
  assert.equal(a.patrolDir, 1, '動く Orb で折り返した');
  assert.ok(orb.cx > x0 + T, `Orb が押されていない: ${orb.cx - x0}`);
});
