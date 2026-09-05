import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Landmine } from '../src/js/entities/Landmine.js';
import { Game } from '../src/js/main.js';
import { playDestruction, DESTRUCTION_PROFILES } from '../src/js/entities/destruction.js';
import {
  LANDMINE_SCORE, LANDMINE_DEATH_TRIGGER_RADIUS,
} from '../src/js/utils/Constants.js';

function makeGame(overrides = {}) {
  const game = {
    particles: [],
    enemies: [],
    landmines: [],
    player: null,
    carrier: null,
    camera: null,
    score: 0,
    addScore(n) { this.score += n; },
    spawnExplosion() {},
    spawnDebris() {},
    ...overrides,
  };
  return game;
}

/** x/y に地雷を1つ置いた game を返す。 */
function withMine(x = 0, y = 0, overrides = {}) {
  const game = makeGame(overrides);
  game.landmines.push(new Landmine(game, x, y));
  return game;
}

/** 地雷の真上に居る弾。collidesWithPoint が拾える位置に置く。 */
function projAt(mine, isPlayerOwned) {
  return {
    x: mine.x + mine.width / 2,
    y: mine.y + mine.height / 2,
    alive: true, exploded: false, isPlayerOwned,
  };
}

test('自機の弾は地雷を起爆し、加点される', () => {
  const game = withMine();
  const mine = game.landmines[0];
  const proj = projAt(mine, true);
  game.projectiles = [proj];
  Game._updateLandmines.call(game);
  assert.equal(mine.alive, false, '自機の弾で地雷が起爆していない');
  assert.equal(proj.alive, false, '弾が消えていない');
  assert.equal(game.score, LANDMINE_SCORE);
});

test('敵の弾では地雷は起爆しない', () => {
  const game = withMine();
  const mine = game.landmines[0];
  const proj = projAt(mine, false);
  game.projectiles = [proj];
  Game._updateLandmines.call(game);
  assert.equal(mine.alive, true, '敵の弾で地雷が起爆している');
  assert.equal(proj.alive, true, '敵の弾が地雷で消えている');
  assert.equal(game.score, 0);
});

test('敵の弾が乗っていても、自機の弾が来れば起爆する', () => {
  // 「敵の弾を見つけた時点で break していて自機の弾に届かない」書き方の防止
  const game = withMine();
  const mine = game.landmines[0];
  const enemyProj = projAt(mine, false);
  const playerProj = projAt(mine, true);
  game.projectiles = [enemyProj, playerProj];
  Game._updateLandmines.call(game);
  assert.equal(mine.alive, false, '敵の弾が先頭にあると自機の弾で起爆できない');
  assert.equal(enemyProj.alive, true);
});

test('敵機の爆発は近くの地雷を誘爆させる', () => {
  for (const kind of ['tank', 'drone', 'turret', 'attacker']) {
    const game = withMine(0, 0);
    const mine = game.landmines[0];
    const enemy = { x: 0, y: 0, width: 20, height: 20, alive: false };
    playDestruction(game, enemy, kind);
    // blast.delay がある機体は DelayedCall を積むので、明けるまで進める
    for (let i = 0; i < 10; i++) for (const p of [...game.particles]) p.update?.();
    assert.equal(mine.alive, false, `${kind} の爆発で地雷が誘爆していない`);
  }
});

test('自機と母艦の爆発では地雷は誘爆しない', () => {
  for (const kind of ['player', 'carrier']) {
    const game = withMine(0, 0);
    const mine = game.landmines[0];
    const ent = { x: 0, y: 0, width: 20, height: 20, alive: false };
    playDestruction(game, ent, kind);
    for (let i = 0; i < 10; i++) for (const p of [...game.particles]) p.update?.();
    assert.equal(mine.alive, true, `${kind} の爆発で地雷が誘爆している`);
  }
});

test('遠い地雷は敵機の爆発では誘爆しない', () => {
  const far = LANDMINE_DEATH_TRIGGER_RADIUS * 3;
  const game = withMine(far, 0);
  const mine = game.landmines[0];
  playDestruction(game, { x: 0, y: 0, width: 20, height: 20, alive: false }, 'tank');
  for (let i = 0; i < 10; i++) for (const p of [...game.particles]) p.update?.();
  assert.equal(mine.alive, true, `${far}px 離れた地雷まで誘爆している`);
});

test('敵機のプロファイルは全部 detonatesMines を持ち、自機と母艦は持たない', () => {
  // 敵を1機足したときに行を書き忘れないように、表そのものを縛る
  for (const kind of ['tank', 'drone', 'turret', 'attacker']) {
    assert.equal(DESTRUCTION_PROFILES[kind].detonatesMines, true, `${kind} に行が無い`);
  }
  for (const kind of ['player', 'carrier']) {
    assert.ok(!DESTRUCTION_PROFILES[kind].detonatesMines, `${kind} に行がある`);
  }
});
