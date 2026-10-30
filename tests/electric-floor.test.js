// 7面の電流の床。設計 docs/superpowers/specs/2026-10-29-stage7-fortress-hazards-design.md
// 置き場所（生成）・段階と当たり（ElectricFloor）・配線（main の更新と描画、スポーン）・音量を見る。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { ElectricFloor, electricPhase, ELECTRIC_PHASE } from '../src/js/entities/ElectricFloor.js';
import { Game } from '../src/js/main.js';
import { SpawnManager } from '../src/js/systems/SpawnManager.js';
import { transientLevel, db } from './helpers/dsp.js';
import { zapGen, absorbGen } from '../tools/render-barrier-sounds.mjs';
import {
  TILE_SIZE as T, BLOCK_EMPTY, BLOCK_METAL,
  ELECTRIC_FLOOR_MIN_LEN, ELECTRIC_FLOOR_BARRIER_GAP, ELECTRIC_FLOOR_H,
  ELECTRIC_FLOOR_WARN_FRAMES, ELECTRIC_FLOOR_ACTIVE_FRAMES, ELECTRIC_FLOOR_REST_FRAMES,
  ELECTRIC_FLOOR_TOUCH_DAMAGE, ELECTRIC_FLOOR_HIT_INTERVAL, ELECTRIC_FLOOR_KICK_VY,
  ELECTRIC_ZAP_DECAY, BARRIER_ABSORB_DECAY,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const PERIOD = ELECTRIC_FLOOR_WARN_FRAMES + ELECTRIC_FLOOR_ACTIVE_FRAMES + ELECTRIC_FLOOR_REST_FRAMES;

async function maps() {
  const { Map } = await import('../src/js/world/Map.js');
  return SEEDS.map((seed) => new Map({ rng: new SeededRNG(seed) }, 6));
}

// ---------- 置き場所 ----------

test('電流の床は、バリアのある廊下の床の上で、バリアから離れ、足元が残っている', async () => {
  let total = 0;
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      for (const f of z.electricFloors) {
        total++;
        const k = z.corridors.find((k) => k.between && f.r === k.bottom && f.c0 >= k.c0 && f.c1 <= k.c1);
        assert.ok(k, `電流の床 ${JSON.stringify(f)} が廊下の中に無い`);
        const b = z.barriers.find((b) => b.top === k.top && b.bottom === k.bottom && b.c >= k.c0 && b.c <= k.c1);
        assert.ok(b, '同じ廊下にバリアが無い');
        // バリアの両側のうち長いほうに敷く（同じ長さなら左）。廊下の端からバリアの GAP 手前までと、GAP 先から端まで
        const leftLen = b.c - ELECTRIC_FLOOR_BARRIER_GAP - k.c0 + 1;
        const rightLen = k.c1 - (b.c + ELECTRIC_FLOOR_BARRIER_GAP) + 1;
        assert.equal(f.c1 - f.c0 + 1, Math.max(leftLen, rightLen), '長いほうの側いっぱいに敷かれていない');
        assert.ok(f.c1 - f.c0 + 1 >= ELECTRIC_FLOOR_MIN_LEN, `短すぎる床 ${f.c1 - f.c0 + 1}`);
        for (let c = f.c0; c <= f.c1; c++) {
          assert.ok(Math.abs(c - b.c) >= ELECTRIC_FLOOR_BARRIER_GAP, `バリアの列 ${b.c} に近すぎる (${c})`);
          assert.equal(m.grid[f.r + 1][c], BLOCK_METAL, `足元 (${f.r + 1},${c}) が床でない`);
          // 放電の高さぶんは空洞（梁や壁に食い込んでいない）
          for (let r = f.r - Math.ceil(ELECTRIC_FLOOR_H / T) + 1; r <= f.r; r++) {
            assert.equal(m.grid[r][c], BLOCK_EMPTY, `放電の空間 (${r},${c}) が空洞でない`);
          }
        }
      }
    }
  }
  // 1本も無ければ上の検証が素通りする。8シードで53本置けている（設計メモ）
  assert.ok(total >= 30, `電流の床が少なすぎる (${total})`);
});

test('どのシードにも電流の床がある（置けるのが一部のシードだけになっていない）', async () => {
  for (const [i, m] of (await maps()).entries()) {
    const n = m.fortressZones.reduce((a, z) => a + z.electricFloors.length, 0);
    assert.ok(n >= 1, `seed ${SEEDS[i]} に電流の床が無い`);
  }
});

test('電流の床の上（と左右1列）には、砲台・戦車・ドローン・アタッカー・地雷を湧かせない', async () => {
  const rows = Math.ceil(ELECTRIC_FLOOR_H / T);
  const kinds = ['enemyTurretSpawns', 'enemyTankSpawns', 'enemyDroneSpawns', 'enemyAttackerSpawns', 'landmineSpawns'];
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      for (const f of z.electricFloors) {
        for (const kind of kinds) {
          for (const p of m[kind]) {
            const r = Math.floor(p.y / T), c = Math.floor(p.x / T);
            const on = c >= f.c0 - 1 && c <= f.c1 + 1 && r > f.r - rows && r <= f.r;
            assert.ok(!on, `${kind} (${p.x},${p.y}) が電流の床 ${JSON.stringify(f)} の上にある`);
          }
        }
      }
    }
  }
});

test('同じシードなら電流の床は毎回同じ（週次の決定性）', async () => {
  const [a] = await maps();
  const { Map } = await import('../src/js/world/Map.js');
  const b = new Map({ rng: new SeededRNG(SEEDS[0]) }, 6);
  assert.deepEqual(a.fortressZones.map((z) => z.electricFloors), b.fortressZones.map((z) => z.electricFloors));
});

// ---------- 段階 ----------

test('周期は 予兆 → 放電 → 休み の順で、各段階の長さは定数どおり', () => {
  const counts = { [ELECTRIC_PHASE.WARN]: 0, [ELECTRIC_PHASE.ACTIVE]: 0, [ELECTRIC_PHASE.REST]: 0 };
  const seq = [];
  for (let t = 0; t < PERIOD; t++) {
    const p = electricPhase(t);
    counts[p]++;
    if (seq[seq.length - 1] !== p) seq.push(p);
  }
  assert.deepEqual(seq, [ELECTRIC_PHASE.WARN, ELECTRIC_PHASE.ACTIVE, ELECTRIC_PHASE.REST]);
  assert.equal(counts[ELECTRIC_PHASE.WARN], ELECTRIC_FLOOR_WARN_FRAMES);
  assert.equal(counts[ELECTRIC_PHASE.ACTIVE], ELECTRIC_FLOOR_ACTIVE_FRAMES);
  assert.equal(counts[ELECTRIC_PHASE.REST], ELECTRIC_FLOOR_REST_FRAMES);
  assert.equal(electricPhase(PERIOD + 5), electricPhase(5), '周期で繰り返していない');
});

// ---------- 当たり ----------

const SPEC = { r: 20, c0: 10, c1: 13 };   // 床のタイルは行 21

function makeGame(over = {}) {
  const grid = Array.from({ length: 30 }, () => Array(40).fill(BLOCK_EMPTY));
  for (let c = 0; c < 40; c++) grid[21][c] = BLOCK_METAL;
  return {
    map: { grid }, enemies: [], player: null, carrier: null,
    ...over,
  };
}

function makeActor(over = {}) {
  return {
    alive: true, docked: false, invincibleTimer: 0,
    x: SPEC.c0 * T + 4, y: (SPEC.r + 1) * T - 24,   // 床に降りている（足が床の上面）
    width: 16, height: 24, vx: 0, vy: 0, hp: 100,
    takeDamage(a) { this.hp -= a; },
    ...over,
  };
}

/** timer を指定した段階の頭から少し進んだ所へ置く。update() を1回呼ぶとその段階のまま進む */
function atPhase(floor, phase) {
  floor.timer = 0;
  while (electricPhase(floor.timer + 1) !== phase) floor.timer++;
  // 次の update で timer+1 になり、その段階に入っている。1つ進めておく
  floor.timer++;
}

test('放電中に触れるとダメージを受け、上へ弾かれる', () => {
  const player = makeActor();
  const floor = new ElectricFloor(makeGame({ player }), SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  assert.equal(player.hp, 100 - ELECTRIC_FLOOR_TOUCH_DAMAGE);
  assert.ok(player.vy <= ELECTRIC_FLOOR_KICK_VY, '弾かれていない');
});

test('予兆と休みの間は触れてもダメージが無い', () => {
  for (const phase of [ELECTRIC_PHASE.WARN, ELECTRIC_PHASE.REST]) {
    const player = makeActor();
    const floor = new ElectricFloor(makeGame({ player }), SPEC);
    atPhase(floor, phase);
    floor.update();
    assert.equal(electricPhase(floor.timer), phase);
    assert.equal(player.hp, 100, `${phase} でダメージを受けた`);
  }
});

test('放電の高さより上を飛んでいれば当たらない', () => {
  const player = makeActor({ y: (SPEC.r + 1) * T - ELECTRIC_FLOOR_H - 24 - 1 });
  const floor = new ElectricFloor(makeGame({ player }), SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  assert.equal(player.hp, 100);
});

test('同じ相手への次のダメージは HIT_INTERVAL フレーム空く', () => {
  const player = makeActor();
  const floor = new ElectricFloor(makeGame({ player }), SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  const first = player.hp;
  for (let i = 1; i < ELECTRIC_FLOOR_HIT_INTERVAL; i++) { floor.update(); }
  assert.equal(player.hp, first, '間隔の途中でまたダメージが入った');
  floor.update();
  assert.equal(player.hp, first - ELECTRIC_FLOOR_TOUCH_DAMAGE, '間隔が過ぎても入らない');
});

test('ドッキング中の自機・無敵中の自機には入らない。母艦は受ける', () => {
  const docked = makeActor({ docked: true });
  const carrier = makeActor({ width: 64, height: 32, x: SPEC.c0 * T, y: (SPEC.r + 1) * T - 32 });
  const floor = new ElectricFloor(makeGame({ player: docked, carrier }), SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  assert.equal(docked.hp, 100, 'ドッキング中の自機に入った');
  assert.equal(carrier.hp, 100 - ELECTRIC_FLOOR_TOUCH_DAMAGE, '母艦に入っていない');

  const inv = makeActor({ invincibleTimer: 10 });
  const f2 = new ElectricFloor(makeGame({ player: inv }), SPEC);
  atPhase(f2, ELECTRIC_PHASE.ACTIVE);
  f2.update();
  assert.equal(inv.hp, 100, '無敵中に入った');
});

test('敵は電流の影響を受けない', () => {
  const enemy = makeActor();
  const floor = new ElectricFloor(makeGame({ enemies: [enemy] }), SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  assert.equal(enemy.hp, 100);
  assert.equal(enemy.vy, 0);
});

test('壊れた足元のタイルは放電しない（残っているタイルだけ）', () => {
  const player = makeActor({ x: 11 * T });       // 列 11 の上（幅16 = 1タイルぴったり）
  const game = makeGame({ player });
  game.map.grid[21][11] = BLOCK_EMPTY;            // 足元を壊した
  const floor = new ElectricFloor(game, SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  floor.update();
  assert.equal(player.hp, 100, '壊れた床の上で放電した');

  const other = makeActor({ x: 12 * T });       // 残っている列 12
  const g2 = makeGame({ player: other });
  g2.map.grid[21][11] = BLOCK_EMPTY;
  const f2 = new ElectricFloor(g2, SPEC);
  atPhase(f2, ELECTRIC_PHASE.ACTIVE);
  f2.update();
  assert.equal(other.hp, 100 - ELECTRIC_FLOOR_TOUCH_DAMAGE, '残っている床で放電しない');
});

test('壊れた足元のタイルは描かない', () => {
  const game = makeGame();
  const floor = new ElectricFloor(game, SPEC);
  atPhase(floor, ELECTRIC_PHASE.ACTIVE);
  const whole = makeFakeCtx();
  floor.draw(whole);
  game.map.grid[21][11] = BLOCK_EMPTY;
  const part = makeFakeCtx();
  floor.draw(part);
  const count = (ctx) => ctx.calls.filter((c) => c.name === 'fillRect').length;
  assert.ok(count(part) < count(whole), '壊れても描く量が減らない');
  const xs = part.calls.filter((c) => c.name === 'fillRect').map((c) => c.args[0]);
  assert.ok(xs.every((x) => x < 11 * T || x >= 12 * T), '壊れた列に描いている');
});

test('放電に入る瞬間にだけ justFired が立つ', () => {
  const floor = new ElectricFloor(makeGame(), SPEC);
  floor.timer = 0;
  let fired = 0;
  for (let i = 0; i < PERIOD * 3; i++) { floor.update(); if (floor.justFired) fired++; }
  assert.equal(fired, 3, '周期ごとに1回ずつでない');
});

// ---------- 配線 ----------

function spyAudio(names) {
  const calls = [];
  const originals = {};
  for (const n of names) {
    originals[n] = audioManager[n];
    audioManager[n] = (...args) => calls.push({ name: n, args });
  }
  return { calls, restore() { for (const n of names) audioManager[n] = originals[n]; } };
}

test('放電が始まったときだけ、画面の近くの床の音が鳴る', () => {
  const spy = spyAudio(['playElectricZap']);
  try {
    const near = new ElectricFloor(makeGame(), SPEC);
    const far = new ElectricFloor(makeGame(), { r: 20, c0: 900, c1: 903 });
    for (const f of [near, far]) atPhase(f, ELECTRIC_PHASE.WARN);
    // 予兆の最後の1フレームまで進め、次の update で放電に入る状態にする
    for (const f of [near, far]) f.timer = ELECTRIC_FLOOR_WARN_FRAMES - 1;
    const fake = {
      electricFloors: [near, far], storageTowers: [],
      _viewRect: () => ({ cx: near.x, cy: near.y, halfW: 683, halfH: 384 }),
    };
    Game._updateElectricFloors.call(fake);
    assert.equal(spy.calls.length, 1, `鳴った回数 ${spy.calls.length}（近い1本だけのはず）`);
    const [x, volume] = spy.calls[0].args;
    assert.ok(Math.abs(x - (near.x + near.width / 2)) < 1, '近い床の位置で鳴っていない');
    assert.ok(volume > 0 && volume <= 1);
    // 放電が続いている間は鳴らない
    spy.calls.length = 0;
    Game._updateElectricFloors.call(fake);
    assert.equal(spy.calls.length, 0, '放電中に鳴り続けた');
  } finally { spy.restore(); }
});

test('電流の床は画面内だけ描く', () => {
  const noop = () => {};
  const inView = new ElectricFloor(makeGame(), { r: 40, c0: 70, c1: 73 });
  const far = new ElectricFloor(makeGame(), { r: 400, c0: 700, c1: 703 });
  const drawn = [];
  for (const f of [inView, far]) f.draw = () => drawn.push(f);
  const world = {
    gameState: 'playing', simAlpha: 1, canvas: { width: 1024, height: 768 },
    camera: { x: 1000, y: 500, renderX: () => 1000, renderY: () => 500 },
    map: { backdrop: null, draw: noop },
    env: { update: noop, drawBehindTerrain: noop, drawOverWorld: noop, drawOverlay: noop },
    carrier: null, player: null, flag: null, grenadeTrajectory: null,
    enemies: [], landmines: [], barriers: [], electricFloors: [inView, far], storageTowers: [],
    projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
    missileKits: [], lifeKits: [], enemyBullets: [], smokeScreens: [],
    _applyRenderInterpolation: noop, _restoreRenderInterpolation: noop,
    _drawHpBarIfDamaged: noop, _drawGrenadeTrajectory: noop,
  };
  Game._drawWorld.call(world, makeFakeCtx());
  assert.deepEqual(drawn, [inView]);
});

test('SpawnManager は区画の electricFloors から床を作り、他の面（区画なし）では空', async () => {
  const [m] = await maps();
  const game = { map: m, electricFloors: ['古い'] };
  new SpawnManager(game).spawnElectricFloors();
  const expected = m.fortressZones.reduce((a, z) => a + z.electricFloors.length, 0);
  assert.ok(expected > 0);
  assert.equal(game.electricFloors.length, expected);
  assert.ok(game.electricFloors.every((f) => f instanceof ElectricFloor));

  const other = { map: { fortressZones: [] }, electricFloors: ['古い'] };
  new SpawnManager(other).spawnElectricFloors();
  assert.deepEqual(other.electricFloors, []);
  const none = { map: {}, electricFloors: ['古い'] };
  new SpawnManager(none).spawnElectricFloors();
  assert.deepEqual(none.electricFloors, []);
});

// ---------- 音 ----------

test('放電音は引数なしでも呼べる', () => {
  audioManager.playElectricZap();
  assert.ok(true);
});

test('放電音は吸収音より少し大きく、大きすぎない（A特性）', () => {
  const absorb = transientLevel(absorbGen(), BARRIER_ABSORB_DECAY);
  const zap = transientLevel(zapGen(), ELECTRIC_ZAP_DECAY);
  const diff = db(zap / absorb);
  assert.ok(diff > 0, `放電音(${db(zap).toFixed(1)}dB)が吸収音(${db(absorb).toFixed(1)}dB)に埋もれる`);
  assert.ok(diff < 6, `放電音が大きすぎる（吸収との差 ${diff.toFixed(1)}dB）`);
});
