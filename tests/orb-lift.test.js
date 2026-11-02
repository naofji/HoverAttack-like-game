// 自機が Orb を下から持ち上げる（2026-11-03 ユーザー指定）。
// ・上がる速さは横に押すときと同じ PLAYER_MAX_SPEED × pushScale（以前は自機の上昇の速さのまま押し上げられて速すぎた）
// ・持ち上げた Orb も地形に当たる（以前は Orb を重なりの深さだけ直に上へずらしていて、天井の岩にめり込んだ）
// 本物の自機を main.js と同じ順（自機 → Orb）で更新する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Orb } from '../src/js/entities/Orb.js';
import { updateOrbs } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { circleTerrainNormal } from '../src/js/utils/orbPhysics.js';
import { TILE_SIZE as T, PLAYER_MAX_SPEED, ORB_SIZES } from '../src/js/utils/Constants.js';

const FLOOR = 20;

/** 幅 40・高さ 24。床は row 20。ceiling を渡すとその行から上が岩 */
function world({ ceiling = -1 } = {}) {
  const rows = [];
  for (let r = 0; r < 24; r++) rows.push(((r >= FLOOR || r <= ceiling) ? '#' : '.').repeat(40));
  const game = makeGame(makeMap(rows, null, { tileShape: 'caveSlope' }));
  game.camera = { x: 0, y: 0, shake() {} };
  // 燃料が切れて一緒に落ちると、床で止まった自機の頭に Orb が落ちてきて当たる（既存の衝突ダメージの規則どおり）
  game.spawnHeavyDamage = () => {};
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

/** 床に立つ自機の頭の上に Orb を載せて落ち着かせる */
function orbOnHead(game, size) {
  const p = new Player(game, 20 * T, FLOOR * T - 24);
  p.y = FLOOR * T - p.height;
  game.player = p;
  const orb = new Orb(game, { cx: p.x + p.width / 2, cy: p.y - ORB_SIZES[size].diameter / 2 - 2, size });
  game.orbs.push(orb);
  for (let f = 0; f < 60; f++) step(game);
  return { p, orb };
}

function step(game) {
  game.player.update();
  updateOrbs(game);
}

/** Orb が岩に食い込んでいるか（少し縮めた円が岩に触れる） */
const orbInRock = (game, orb) => circleTerrainNormal(game.map, orb.cx, orb.cy, orb.r - 0.5) !== null;

for (const size of ['small', 'large']) {
  const want = PLAYER_MAX_SPEED * ORB_SIZES[size].pushScale;

  test(`${size}: 下から持ち上げると、Orb は横に押すときと同じ ${want} px/フレーム前後で上がり、自機も一緒に上がる`, () => {
    const game = world();
    const { p, orb } = orbOnHead(game, size);
    assert.ok(Math.abs(p.y - (orb.cy + orb.r)) < 1.5, `頭に載っていない: 頭 ${p.y}, Orb の下端 ${orb.cy + orb.r}`);
    game.held.add('KeyW');
    // バーストの勢いが尽きてホバーが効き始める（HOVER_COOLDOWN_AFTER_BURST = 20）までは自機の上昇そのものが緩むので、その後で測る
    for (let f = 0; f < 45; f++) step(game);
    const o0 = orb.cy, p0 = p.y;
    for (let f = 0; f < 30; f++) step(game);
    const ov = (o0 - orb.cy) / 30, pv = (p0 - p.y) / 30;
    assert.ok(Math.abs(ov - want) < want * 0.15, `Orb の上がる速さ ${ov}（期待 ${want}）`);
    assert.ok(Math.abs(pv - ov) < 0.05, `自機 ${pv} と Orb ${ov} が一緒に上がらない`);
    assert.ok(p.y >= orb.cy, '自機が Orb を抜けた');
  });

  test(`${size}: 天井まで持ち上げても Orb は岩にめり込まず、自機も岩に入らない`, () => {
    const game = world({ ceiling: FLOOR - 7 });   // 床から天井まで 6 タイル（96px）
    const { p, orb } = orbOnHead(game, size);
    game.held.add('KeyW');
    let orbIn = 0, playerIn = 0, topMin = Infinity, under = true;
    for (let f = 0; f < 300; f++) {
      step(game);
      if (orbInRock(game, orb)) orbIn++;
      if (collidesWithTerrain(p, game.map)) playerIn++;
      topMin = Math.min(topMin, orb.cy - orb.r);
      if (p.y < orb.cy) under = false;
    }
    assert.equal(orbIn, 0, `Orb が岩に入った（上端 ${orb.cy - orb.r}、天井 ${(FLOOR - 6) * T}）`);
    assert.equal(playerIn, 0, '自機が岩に入った');
    // 燃料が切れると一緒に落ちるので、一番高く上がったときで見る
    assert.ok(topMin <= (FLOOR - 6) * T + 3, `天井まで上がっていない: 上端 ${topMin}`);
    assert.ok(under, '自機が Orb を抜けた');
  });
}
