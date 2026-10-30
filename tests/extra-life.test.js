// 7面の要塞のお宝の残機アイテム。置き場所（ステージで 1 個・スタートから最も遠い区画・リペアと入れ替え）、
// 拾った瞬間の効果、「1UP」の表示、専用の音、game への配線を見る。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { ExtraLifeKit } from '../src/js/entities/ExtraLifeKit.js';
import { PickupItem } from '../src/js/entities/PickupItem.js';
import { Player } from '../src/js/entities/Player.js';
import { HUD } from '../src/js/ui/HUD.js';
import { Game } from '../src/js/main.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { assignExtraLives } from '../src/js/world/fortress.js';
import {
  PLAYER_INITIAL_LIVES, EXTRA_LIFE_FLASH_FRAMES, FORTRESS_EXTRA_LIFE_SLOT, ITEM_PICKUP_SCORE,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

async function maps() {
  const { Map } = await import('../src/js/world/Map.js');
  return SEEDS.map((s) => new Map({ rng: new SeededRNG(s) }, 6));
}

// ---------- 置き場所 ----------

/** 区画の見本。お宝は [overdrive, repair, repair] */
function zone(c0, c1, { treasures = 3 } = {}) {
  const kinds = ['overdrive', 'repair', 'repair'].slice(0, treasures);
  return { r0: 10, r1: 30, c0, c1, treasures: kinds.map((kind) => ({ kind })) };
}
const START = { centerR: 20, centerC: 5 };

test('残機はスタートから最も遠い区画のリペアと入れ替わる（オーバードライブは動かない）', () => {
  const zones = [zone(40, 60), zone(100, 120), zone(70, 90)];
  assignExtraLives(zones, START, { count: 1, slot: FORTRESS_EXTRA_LIFE_SLOT });
  assert.deepEqual(zones.map((z) => z.treasures.map((t) => t.kind)), [
    ['overdrive', 'repair', 'repair'],
    ['overdrive', 'life', 'repair'],     // 一番右＝スタートから一番遠い
    ['overdrive', 'repair', 'repair'],
  ]);
});

test('置く数は count で決まり、遠い順に配られる', () => {
  const zones = [zone(40, 60), zone(100, 120), zone(70, 90)];
  assignExtraLives(zones, START, { count: 2, slot: 1 });
  assert.deepEqual(zones.map((z) => z.treasures[1].kind), ['repair', 'life', 'life']);
});

test('count が 0 なら何も入れ替えない', () => {
  const zones = [zone(40, 60), zone(100, 120)];
  assignExtraLives(zones, START, { count: 0, slot: 1 });
  assert.ok(zones.every((z) => z.treasures.every((t) => t.kind !== 'life')));
});

test('お宝の列が短くて slot が無い区画は飛ばし、次に遠い区画へ回す', () => {
  const zones = [zone(40, 60), zone(70, 90), zone(100, 120, { treasures: 1 })];
  assignExtraLives(zones, START, { count: 1, slot: 1 });
  assert.deepEqual(zones.map((z) => z.treasures[1]?.kind), ['repair', 'life', undefined]);
});

test('距離が同じなら区画の並び順が先（乱数を使わない＝週次の決定性）', () => {
  const zones = [zone(40, 60), zone(40, 60)];
  assignExtraLives(zones, START, { count: 1, slot: 1 });
  assert.deepEqual(zones.map((z) => z.treasures[1].kind), ['life', 'repair']);
});

test('スタートの部屋が無いとき（rooms が空）は何も入れ替えず落ちない', () => {
  const zones = [zone(40, 60)];
  assignExtraLives(zones, undefined, { count: 1, slot: 1 });
  assert.equal(zones[0].treasures[1].kind, 'repair');
});

test('実際の7面: 残機はステージ全体で 1 個、区画の数だけオーバードライブが残り、リペアは 1 個減る', async () => {
  for (const m of await maps()) {
    const kinds = m.storageTowerSpawns.map((t) => t.kind);
    const zones = m.fortressZones.length;
    assert.equal(kinds.filter((k) => k === 'life').length, 1, `残機が 1 個でない（${kinds}）`);
    assert.equal(kinds.filter((k) => k === 'overdrive').length, zones, 'オーバードライブが動いた');
    assert.equal(kinds.filter((k) => k === 'repair').length, zones * 2 - 1, 'リペアの数が合わない');
  }
});

test('実際の7面: 残機は、スタートの部屋から最も遠い区画にある', async () => {
  for (const m of await maps()) {
    const start = m.rooms[0];
    const d = (z) => ((z.r0 + z.r1) / 2 - start.centerR) ** 2 + ((z.c0 + z.c1) / 2 - start.centerC) ** 2;
    const withLife = m.fortressZones.filter((z) => z.treasures.some((t) => t.kind === 'life'));
    assert.equal(withLife.length, 1);
    const maxD = Math.max(...m.fortressZones.map(d));
    assert.equal(d(withLife[0]), maxD, '最も遠い区画に置かれていない');
  }
});

test('他の面（要塞なし）には残機が出ない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(3) }, 0);
  assert.deepEqual(m.storageTowerSpawns, []);
});

test('残機の入った格納塔を壊すと ExtraLifeKit が 1 個出て、lifeKits に入る', async () => {
  const [m] = await maps();
  const game = { map: m, storageTowers: [], repairKits: [], missileKits: [], lifeKits: [], particles: [], spawnExplosion() {} };
  new SpawnManager(game).spawnStorageTowers();
  assert.equal(game.lifeKits.length, 0, '壊す前から出ている');
  for (const t of game.storageTowers.filter((t) => t.kind === 'life')) t.damage(999);
  assert.equal(game.lifeKits.length, 1);
  assert.ok(game.lifeKits[0] instanceof ExtraLifeKit);
});

// ---------- 拾った効果 ----------

function makeGame(player) {
  return {
    map: makeMap(flatFloorRows()),
    player, score: 0,
    addScore(s) { this.score += s; },
  };
}
function makePlayer() {
  const game = makeGame(null);
  const p = new Player(game, 100, 100);
  game.player = p;
  return { p, game };
}

test('残機アイテムは PickupItem で、ExtraLifeKit の拾得は残機を 1 増やす（取った瞬間に）', () => {
  assert.ok(ExtraLifeKit.prototype instanceof PickupItem);
  const { p, game } = makePlayer();
  const kit = new ExtraLifeKit(game, p.x + 8, p.y);
  const lives = p.lives;
  kit.onPickup(p);
  assert.equal(p.lives, lives + 1);
});

test('拾った瞬間（update の重なり判定）に残機が増え、アイテムは消え、点が入る', () => {
  const { p, game } = makePlayer();
  const kit = new ExtraLifeKit(game, p.x + p.width / 2, p.y);
  kit.onGround = true;
  kit.y = p.y;
  const spy = [];
  const orig = { life: audioManager.playExtraLife, pick: audioManager.playPickup };
  audioManager.playExtraLife = () => spy.push('life');
  audioManager.playPickup = () => spy.push('pickup');
  try {
    kit.update();
  } finally {
    audioManager.playExtraLife = orig.life;
    audioManager.playPickup = orig.pick;
  }
  assert.equal(p.lives, PLAYER_INITIAL_LIVES + 1);
  assert.equal(kit.alive, false);
  assert.equal(game.score, ITEM_PICKUP_SCORE);
  // 専用の音だけ。共通の拾得音を重ねると濁る
  assert.deepEqual(spy, ['life']);
});

test('重ねて拾えば重ねて増える（上限は設けない。ステージで 1 個なので届かない）', () => {
  const { p } = makePlayer();
  p.gainLife(); p.gainLife();
  assert.equal(p.lives, PLAYER_INITIAL_LIVES + 2);
});

test('死んでいる間・ドッキング中は拾えない（他のアイテムと同じ）', () => {
  for (const state of [{ alive: false }, { docked: true }]) {
    const { p, game } = makePlayer();
    Object.assign(p, state);
    const kit = new ExtraLifeKit(game, p.x + p.width / 2, p.y);
    kit.onGround = true; kit.y = p.y;
    kit.update();
    assert.equal(p.lives, PLAYER_INITIAL_LIVES);
    assert.equal(kit.alive, true);
  }
});

// ---------- 「1UP」の表示 ----------

test('拾うと lifeUpTimer が立ち、毎フレーム減って 0 で止まる。リスポーンで消える', () => {
  const { p } = makePlayer();
  assert.equal(p.lifeUpTimer, 0);
  p.gainLife();
  assert.equal(p.lifeUpTimer, EXTRA_LIFE_FLASH_FRAMES);
  p._updateTimers();
  assert.equal(p.lifeUpTimer, EXTRA_LIFE_FLASH_FRAMES - 1);
  p.lifeUpTimer = 1;
  p._updateTimers(); p._updateTimers();
  assert.equal(p.lifeUpTimer, 0);
  p.gainLife();
  p.respawn(100, 100);
  assert.equal(p.lifeUpTimer, 0);
});

function texts(ctx) {
  return ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

test('「1UP」は拾った直後だけ頭の上に出て、時間とともに昇る', () => {
  const { p } = makePlayer();
  p.alive = true;
  const none = makeFakeCtx();
  p.draw(none);
  assert.ok(!texts(none).includes('1UP'), '拾っていないのに出ている');

  p.gainLife();
  const first = makeFakeCtx();
  p.draw(first);
  assert.ok(texts(first).includes('1UP'));
  const yOf = (ctx) => ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === '1UP').args[2];
  p.lifeUpTimer = EXTRA_LIFE_FLASH_FRAMES / 2;
  const mid = makeFakeCtx();
  p.draw(mid);
  assert.ok(yOf(mid) < yOf(first), '昇っていない');
  assert.ok(yOf(first) < p.y, '頭の上に出ていない');
});

test('HUD の残機の数字は、拾った直後だけ金色に点滅する（自機のみ。母艦には lifeUpTimer が無い）', () => {
  const colorAt = (unit) => {
    const ctx = makeFakeCtx();
    HUD.prototype._drawUnitHpBar.call({}, ctx, unit, 100, 'ATTACKER', 0, 20);
    // 数字の fillText の直前の fillStyle
    const i = ctx.calls.findIndex((c) => c.name === 'fillText' && c.args[0] === String(unit.lives));
    for (let k = i - 1; k >= 0; k--) if (ctx.calls[k].name === 'set:fillStyle') return ctx.calls[k].args[0];
    return null;
  };
  const base = { alive: false, lives: 4 };
  assert.equal(colorAt({ ...base, lifeUpTimer: 0 }), '#FFFFFF');
  assert.equal(colorAt(base), '#FFFFFF');   // 母艦
  // 6 フレームごとの交互。点灯側と消灯側が両方あること
  const seen = new Set();
  for (let t = EXTRA_LIFE_FLASH_FRAMES; t > EXTRA_LIFE_FLASH_FRAMES - 24; t--) {
    seen.add(colorAt({ ...base, lifeUpTimer: t }));
  }
  assert.deepEqual([...seen].sort(), ['#FFE066', '#FFFFFF']);
});

// ---------- 見た目 ----------

test('アイコンは自機の配色（銀の体・頭、橙のバックパック）で、星が瞬く', () => {
  const kit = new ExtraLifeKit(makeGame(null), 100, 50);
  const ctx = makeFakeCtx();
  kit.draw(ctx);
  const colors = new Set(ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]));
  for (const robot of ['#E8E8E8', '#CCCCCC', '#FF6600']) {
    assert.ok(colors.has(robot), `自機の色 ${robot} が絵に無い`);
  }
  // 星: sin が正の位相のフレームでは細い線の fillRect が増え、負のフレームでは出ない
  const rects = (frame) => {
    kit.frameCounter = frame;
    const c = makeFakeCtx();
    kit.draw(c);
    return c.calls.filter((x) => x.name === 'fillRect').length;
  };
  const counts = new Set();
  for (let f = 0; f < 60; f++) counts.add(rects(f));
  assert.ok(counts.size >= 2, '星が常に同じ（瞬いていない）');
});

test('拾われた後は描かない', () => {
  const kit = new ExtraLifeKit(makeGame(null), 100, 50);
  kit.alive = false;
  const ctx = makeFakeCtx();
  kit.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

// ---------- 音 ----------

test('残機の音は 6 音で、1 音の頂点は拾得音(0.07)を超えない。引数なしでも呼べる', () => {
  audioManager.playExtraLife();   // ctx なしの環境で黙る
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => audioManager.playExtraLife());
  const oscs = ctx.created.filter((n) => n.name === 'oscillator');
  assert.equal(oscs.length, 6);
  const peaks = ctx.created.filter((n) => n.name === 'gain').flatMap((g) => g.gain.events
    .filter((e) => e[0] === 'exp').map((e) => e[1]));
  assert.ok(Math.max(...peaks) <= 0.07 + 1e-9, `音が大きい（${Math.max(...peaks)}）`);
  assert.ok(Math.max(...peaks) >= 0.05, '音が小さすぎる');
  // 全音が音量バスへ繋がる
  assert.ok(oscs.every((o) => o.stopped === 1 && o.started === 1));
});

// ---------- game への配線 ----------

test('毎 tick、lifeKits も更新され、拾われた（alive=false）ものは取り除かれる', () => {
  const live = { alive: true, updated: 0, update() { this.updated++; } };
  const taken = { alive: true, update() { this.alive = false; } };
  const fake = new Proxy({ lifeKits: [live, taken] }, {
    get: (t, k) => (k in t ? t[k] : (k === '_updateAndPrune' ? Game._updateAndPrune : () => { })),
  });
  Game._updateAndPrune.call(fake, fake.lifeKits);
  assert.equal(live.updated, 1);
  assert.deepEqual(fake.lifeKits, [live]);
});

test('_simulationTick が lifeKits を更新する（配線）', () => {
  const calls = [];
  const kit = { alive: true, update() { calls.push('update'); } };
  const noop = () => { };
  const fake = new Proxy({
    lifeKits: [kit], barriers: [], electricFloors: [], landmines: [], projectiles: [], particles: [],
    smokeScreens: [], repairKits: [], autoAimUnits: [], missileKits: [], enemies: [],
    env: { update: noop }, map: { update: noop }, collisionManager: { update: noop },
  }, {
    get: (t, k) => (k in t ? t[k] : (k === '_updateAndPrune' ? Game._updateAndPrune : noop)),
  });
  Game._simulationTick.call(fake);
  assert.deepEqual(calls, ['update']);
});

test('_drawWorld が lifeKits を描く', () => {
  const noop = () => { };
  const drawn = [];
  const kit = { alive: true, draw: () => drawn.push('kit') };
  const world = {
    gameState: 'playing', simAlpha: 1, canvas: { width: 1024, height: 768 },
    camera: { x: 0, y: 0, renderX: () => 0, renderY: () => 0 },
    map: { backdrop: null, draw: noop },
    env: { update: noop, drawBehindTerrain: noop, drawOverWorld: noop, drawOverlay: noop },
    carrier: null, player: null, flag: null, grenadeTrajectory: null,
    enemies: [], landmines: [], barriers: [], electricFloors: [],
    projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
    missileKits: [], lifeKits: [kit], enemyBullets: [], smokeScreens: [], storageTowers: [],
    _applyRenderInterpolation: noop, _restoreRenderInterpolation: noop,
    _drawHpBarIfDamaged: noop, _drawGrenadeTrajectory: noop,
  };
  Game._drawWorld.call(world, makeFakeCtx());
  assert.deepEqual(drawn, ['kit']);
});

test('補間の対象に lifeKits が入る（落下中にカメラに対してかくつかない）', () => {
  const seen = [];
  const kit = { id: 'k' };
  const fake = {
    player: null, carrier: null, enemies: [], projectiles: [], enemyBullets: [],
    repairKits: [], autoAimUnits: [], missileKits: [], lifeKits: [kit], map: {},
  };
  Game._forEachMovingEntity.call(fake, (e) => seen.push(e));
  assert.deepEqual(seen, [kit]);
});

test('面を作り直すと前の面の lifeKits は消える', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
  const stubCtx = new Proxy({}, {
    get: (t, prop) => (prop in t ? t[prop] : (typeof prop === 'string' ? () => ({ addColorStop() { } }) : undefined)),
    set: () => true,
  });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx }) };
  try {
    const game = {
      score: 0, missionsCompleted: 1, debugStartMission: 0, totalTime: 0, stageResults: [], weekSeed: 1,
      lifeKits: ['前の面の残機'],
      spawnManager: {
        findSpawnPosition: () => ({ x: 0, y: 0 }), spawnLandmines() { }, spawnStorageTowers() { },
        spawnBarriers() { }, spawnElectricFloors() { }, spawnEnemies() { },
      },
      camera: { follow() { }, snapToTarget() { } },
    };
    new GameStateManager(game).resetLevel(false);
    assert.deepEqual(game.lifeKits, []);
  } finally {
    globalThis.document = originalDocument;
  }
});
