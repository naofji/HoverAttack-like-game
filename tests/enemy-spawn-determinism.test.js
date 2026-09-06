import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { stageSeed, getCurrentWeek } from '../src/js/utils/WeekSeed.js';
import { spawnStateRng } from '../src/js/utils/spawnState.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('spawnStateRng は同じ週・同じ面・同じ位置なら同じ並びを返す', () => {
  const game = { weekSeed: 202636, missionsCompleted: 6 };
  const a = spawnStateRng(game, 320, 640);
  const b = spawnStateRng(game, 320, 640);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('場所が違えば違う並びになる（全員が同じ向きに揃わない）', () => {
  const game = { weekSeed: 202636, missionsCompleted: 6 };
  const a = spawnStateRng(game, 320, 640).next();
  const b = spawnStateRng(game, 336, 640).next();
  const c = spawnStateRng(game, 320, 656).next();
  assert.notEqual(a, b, '横に1タイル動かしても同じ');
  assert.notEqual(a, c, '縦に1タイル動かしても同じ');
});

test('週や面が違えば違う並びになる', () => {
  const base = { weekSeed: 202636, missionsCompleted: 6 };
  const a = spawnStateRng(base, 320, 640).next();
  const b = spawnStateRng({ ...base, weekSeed: 202637 }, 320, 640).next();
  const c = spawnStateRng({ ...base, missionsCompleted: 5 }, 320, 640).next();
  assert.notEqual(a, b, '週が違うのに同じ');
  assert.notEqual(a, c, '面が違うのに同じ');
});

test('game.rng を消費しない（地形生成との兼ね合いを崩さない）', () => {
  let draws = 0;
  const inner = new SeededRNG(1);
  const game = {
    weekSeed: 202636, missionsCompleted: 6,
    rng: { next: () => { draws++; return inner.next(); } },
  };
  const rng = spawnStateRng(game, 320, 640);
  rng.next(); rng.next();
  assert.equal(draws, 0, 'game.rng を引いている');
});

/** 敵の初期状態のうち、遊びに影響するものだけを取り出す。 */
function playState(e) {
  return [e.constructor.name, e.facingRight, e.patrolDir, e.fireTimer, e.frameCounter].join(',');
}

test('同じ週・同じ面なら、敵の初期状態まで含めて毎回同じになる', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');
  const week = getCurrentWeek();

  const build = (lv) => {
    const game = {
      weekSeed: week.seed, missionsCompleted: lv,
      rng: new SeededRNG(stageSeed(week.seed, lv)),
      enemies: [], enemyBullets: [], landmines: [], repairKits: [], missileKits: [],
    };
    game.map = new Map(game, lv);
    game.spawnManager = new SpawnManager(game);
    game.spawnManager.spawnEnemies();
    return game;
  };

  // 敵の3種（タンク・ドローン・アタッカー）が揃う7面で見る
  const a = build(6);
  const b = build(6);
  assert.ok(a.enemies.length > 50, `敵が少なすぎて検証にならない (${a.enemies.length})`);
  const sa = a.enemies.map(playState);
  const sb = b.enemies.map(playState);
  const diff = sa.filter((v, i) => v !== sb[i]).length;
  assert.equal(diff, 0,
    `${sa.length} 体中 ${diff} 体の初期状態が違う（例: ${sa.find((v, i) => v !== sb[i])}）`);
});

test('敵の向きは全員同じにはならない（決定的だが単調ではない）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');
  const week = getCurrentWeek();
  const game = {
    weekSeed: week.seed, missionsCompleted: 6,
    rng: new SeededRNG(stageSeed(week.seed, 6)),
    enemies: [], enemyBullets: [], landmines: [], repairKits: [], missileKits: [],
  };
  game.map = new Map(game, 6);
  game.spawnManager = new SpawnManager(game);
  game.spawnManager.spawnEnemies();
  const dirs = game.enemies.map((e) => e.patrolDir).filter((d) => d != null);
  const right = dirs.filter((d) => d > 0).length;
  assert.ok(right > dirs.length * 0.2 && right < dirs.length * 0.8,
    `巡回の向きが偏りすぎ（右 ${right} / ${dirs.length}）`);
});

test('湧き位置は重複しない（同じ場所に2体湧くと初期状態も重なる）', async () => {
  // 初期状態は場所から決めるので、同じタイルに2体湧くと向きも散る角度も同じになる。
  // 実際の湧きが重複しないことをここで担保しておく
  const { Map } = await import('../src/js/world/Map.js');
  for (const lv of [3, 6]) {
    const m = new Map({ rng: new SeededRNG(stageSeed(getCurrentWeek().seed, lv)) }, lv);
    const lists = {
      戦車: m.enemyTankSpawns, アタッカー: m.enemyAttackerSpawns,
      ドローン: m.enemyDroneSpawns, 砲台: m.enemyTurretSpawns,
    };
    for (const [name, list] of Object.entries(lists)) {
      const keys = list.map((p) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`);
      assert.equal(new Set(keys).size, keys.length,
        `面${lv + 1}: ${name} の湧き位置に重複がある`);
    }
  }
});
