import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShockwaveRing, SpeedLines, FinaleFlash, createDestructionFinale,
} from '../src/js/entities/DestructionFinale.js';
import { makeFakeCtx, extractPolylines, extractSets } from './helpers/fake-ctx.js';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { DESTRUCTION_PROFILES } from '../src/js/entities/destruction.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  FINALE_SHAKE_INTENSITY,
  FINALE_RING_MAX_RADIUS, FINALE_RING_LIFETIME,
  FINALE_LINE_COUNT, FINALE_LINE_LIFETIME,
  FINALE_FLASH_LIFETIME,
  CANVAS_WIDTH, CANVAS_HEIGHT,
} from '../src/js/utils/Constants.js';

const CX = 500;
const CY = 400;

/** arc 呼び出しを {x,y,r} で取り出す。 */
function arcs(calls) {
  return calls.filter((c) => c.name === 'arc').map((c) => ({
    x: c.args[0], y: c.args[1], r: c.args[2],
  }));
}

/** n tick 進めてから描き、その1フレームぶんの呼び出しを返す。 */
function drawAt(fx, n) {
  for (let i = 0; i < n; i++) fx.update();
  const ctx = makeFakeCtx();
  fx.draw(ctx);
  return ctx.calls;
}

// --- 衝撃波リング -----------------------------------------------------------

test('リングの半径は単調増加し、最大半径で頭打ちになる', () => {
  const ring = new ShockwaveRing(CX, CY);
  let prev = -1;
  let last = 0;
  for (let i = 0; i < FINALE_RING_LIFETIME; i++) {
    const circle = arcs(drawAt(ring, 0))[0];
    assert.ok(circle, `${i} tick 目でリングが描かれない`);
    assert.ok(circle.r >= prev, `半径が縮んだ: ${prev} -> ${circle.r}`);
    assert.deepEqual({ x: circle.x, y: circle.y }, { x: CX, y: CY }, '中心がずれた');
    prev = circle.r;
    last = circle.r;
    ring.update();
  }
  assert.ok(last <= FINALE_RING_MAX_RADIUS + 1e-6, `最大半径を超えた: ${last}`);
  assert.ok(last > FINALE_RING_MAX_RADIUS * 0.9, `最大半径まで届いていない: ${last}`);
});

test('リングは序盤ほど速く広がる（減速する）', () => {
  const ring = new ShockwaveRing(CX, CY);
  const radiusAt = (n) => {
    const r = new ShockwaveRing(CX, CY);
    for (let i = 0; i < n; i++) r.update();
    return arcs(drawAt(r, 0))[0].r;
  };
  const q = Math.floor(FINALE_RING_LIFETIME / 4);
  const early = radiusAt(q) - radiusAt(0);
  const late = radiusAt(q * 4 - 1) - radiusAt(q * 3);
  assert.ok(early > late, `減速していない: 序盤${early} 終盤${late}`);
  assert.ok(ring.alive);
});

test('リングの不透明度は単調減少する', () => {
  const ring = new ShockwaveRing(CX, CY);
  let prev = Infinity;
  for (let i = 0; i < FINALE_RING_LIFETIME; i++) {
    const alpha = extractSets(drawAt(ring, 0), 'globalAlpha')[0];
    assert.ok(alpha <= prev, `不透明度が上がった: ${prev} -> ${alpha}`);
    prev = alpha;
    ring.update();
  }
});

test('リングは寿命で消える', () => {
  const ring = new ShockwaveRing(CX, CY);
  for (let i = 0; i < FINALE_RING_LIFETIME - 1; i++) ring.update();
  assert.equal(ring.alive, true);
  ring.update();
  assert.equal(ring.alive, false);
});

// --- 集中線 -----------------------------------------------------------------

test('集中線は中心から放射状に伸びている', () => {
  const lines = new SpeedLines(CX, CY);
  const drawn = extractPolylines(drawAt(lines, 0));
  assert.equal(drawn.length, FINALE_LINE_COUNT);

  for (const [a, b] of drawn) {
    // 始点・終点とも中心から見て同じ向きにあること（＝中心を消失点とする放射）
    const angA = Math.atan2(a.y - CY, a.x - CX);
    const angB = Math.atan2(b.y - CY, b.x - CX);
    let diff = Math.abs(angA - angB) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    assert.ok(diff < 1e-6, `放射状でない: ${angA} vs ${angB}`);

    // 終点のほうが必ず外側
    const distA = Math.hypot(a.x - CX, a.y - CY);
    const distB = Math.hypot(b.x - CX, b.y - CY);
    assert.ok(distB > distA, `内向きに伸びている: ${distA} -> ${distB}`);
  }
});

test('集中線は画面の隅まで届く長さがある', () => {
  const diagonal = Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT);
  const drawn = extractPolylines(drawAt(new SpeedLines(CX, CY), 0));
  for (const [, b] of drawn) {
    assert.ok(Math.hypot(b.x - CX, b.y - CY) >= diagonal,
      `画面対角(${diagonal.toFixed(0)})に届かない: ${Math.hypot(b.x - CX, b.y - CY).toFixed(0)}`);
  }
});

test('集中線の角度と長さは1本ずつばらつく（均等配置に見せない）', () => {
  const drawn = extractPolylines(drawAt(new SpeedLines(CX, CY), 0));
  const gaps = [];
  const angles = drawn.map(([a]) => Math.atan2(a.y - CY, a.x - CX)).sort((p, q) => p - q);
  for (let i = 1; i < angles.length; i++) gaps.push(angles[i] - angles[i - 1]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 1e-6, '角度が完全な等間隔になっている');

  const inner = drawn.map(([a]) => Math.hypot(a.x - CX, a.y - CY));
  assert.ok(Math.max(...inner) - Math.min(...inner) > 1e-6, '内側の始点が全部同じ距離');
});

test('集中線は寿命で消え、閃光より長く残る', () => {
  const lines = new SpeedLines(CX, CY);
  for (let i = 0; i < FINALE_LINE_LIFETIME - 1; i++) lines.update();
  assert.equal(lines.alive, true);
  lines.update();
  assert.equal(lines.alive, false);
  assert.ok(FINALE_LINE_LIFETIME > FINALE_FLASH_LIFETIME,
    '閃光より先に集中線が消える');
});

// --- 閃光 -------------------------------------------------------------------

test('閃光は数フレームで消える', () => {
  const flash = new FinaleFlash(CX, CY);
  assert.ok(FINALE_FLASH_LIFETIME <= 8, `閃光が長すぎる: ${FINALE_FLASH_LIFETIME}`);
  for (let i = 0; i < FINALE_FLASH_LIFETIME - 1; i++) flash.update();
  assert.equal(flash.alive, true);
  flash.update();
  assert.equal(flash.alive, false);
});

test('閃光は基地の中心に描かれる', () => {
  const circle = arcs(drawAt(new FinaleFlash(CX, CY), 0))[0];
  assert.ok(circle, '閃光が描かれていない');
  assert.deepEqual({ x: circle.x, y: circle.y }, { x: CX, y: CY });
});

// --- ファクトリ --------------------------------------------------------------

test('ファクトリが3要素すべてを返す', () => {
  const fx = createDestructionFinale(CX, CY);
  assert.equal(fx.length, 3);
  assert.ok(fx.some((f) => f instanceof FinaleFlash), '閃光が無い');
  assert.ok(fx.some((f) => f instanceof SpeedLines), '集中線が無い');
  assert.ok(fx.some((f) => f instanceof ShockwaveRing), '衝撃波リングが無い');
});

test('死んだ要素は描画しない', () => {
  for (const fx of createDestructionFinale(CX, CY)) {
    while (fx.alive) fx.update();
    const ctx = makeFakeCtx();
    fx.draw(ctx);
    assert.equal(ctx.calls.length, 0, '寿命が尽きても描画している');
  }
});

// --- EnemyBase への配線 ------------------------------------------------------

/** EnemyBase._finishDestruction が触る最小限の game。 */
function makeBaseGame() {
  return {
    missionsCompleted: 1,
    score: 0,
    enemies: [],
    particles: [],
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    shakeCalls: [],
    camera: { shake(intensity, duration) { this.game.shakeCalls.push({ intensity, duration }); } },
    spawnSparks() {},
    spawnExplosionCalls: [],
    spawnExplosion(x, y, size) { this.spawnExplosionCalls.push({ x, y, size }); },
    triggerBaseEmergencyAlert() {},
  };
}

test('基地の破壊完了でフィナーレが particles へ入り、カメラが強く揺れる', () => {
  const game = makeBaseGame();
  game.camera.game = game;
  const base = new EnemyBase(game, 100, 100);

  base._finishDestruction();

  assert.equal(base.alive, false);
  // 総数では見ない。最後の大爆発も閃光を撒くようになったため。
  const finale = game.particles.filter(
    (p) => p instanceof ShockwaveRing || p instanceof SpeedLines || p instanceof FinaleFlash);
  assert.equal(finale.length, 3, 'フィナーレ3要素が入っていない');

  assert.equal(game.shakeCalls.length, 1, 'カメラが揺れていない');
  assert.equal(game.shakeCalls[0].intensity, FINALE_SHAKE_INTENSITY);
  assert.ok(game.shakeCalls[0].intensity > 8,
    '死亡シーケンス中の小爆発 shake(8,3) より弱い');
});

test('フィナーレは最後の大爆発より後に push される（手前に描かれる）', () => {
  const game = makeBaseGame();
  game.camera.game = game;
  // 大爆発ぶんのパーティクルが先に入る想定を、既存要素で代用して順序だけ見る
  const marker = { alive: true, update() {}, draw() {} };
  game.spawnExplosion = () => { game.particles.push(marker); };

  new EnemyBase(game, 100, 100)._finishDestruction();

  const markerAt = game.particles.indexOf(marker);
  const ringAt = game.particles.findIndex((p) => p instanceof ShockwaveRing);
  assert.ok(markerAt >= 0 && ringAt > markerAt,
    '爆発より先にフィナーレが入っている');
});

test('母艦の破壊でフィナーレが出て、爆発の後にカメラが強く揺れる', () => {
  // 母艦の喪失は残機1＝必ずゲームオーバー。ゲーム中で最大の見せ場なので、
  // 敵基地と同じフィナーレを共有する。
  // 演出は「閃光 → 分解して爆発」の順なので、揺れは爆発と同時＝遅れて来る。
  const game = makeGame(makeMap(flatFloorRows()));
  game.shakeCalls = [];
  game.camera = { shake: (intensity, duration) => game.shakeCalls.push({ intensity, duration }) };
  game.spawnDebris = () => {};
  game.spawnExplosion = () => {};

  const carrier = new Carrier(game, 100, 100);
  carrier.die();

  const finale = game.particles.filter(
    (p) => p instanceof ShockwaveRing || p instanceof SpeedLines || p instanceof FinaleFlash);
  assert.equal(finale.length, 3, 'フィナーレ3要素が出ていない');
  assert.equal(game.shakeCalls.length, 0, '爆発より先に画面が揺れている');

  // 爆発の遅延ぶん進めると揺れる
  const delay = DESTRUCTION_PROFILES.carrier.blast.delay;
  for (let i = 0; i < delay; i++) {
    for (const p of [...game.particles]) p.update();
    game.particles = game.particles.filter((p) => p.alive);
  }
  assert.equal(game.shakeCalls.length, 1, '爆発と同時に揺れていない');
  assert.equal(game.shakeCalls[0].intensity, FINALE_SHAKE_INTENSITY);
});

test('母艦の破壊では閃光が先に出て、爆発は後から来る', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.camera = { shake: () => {} };
  game.spawnDebris = () => {};
  game.explosions = [];
  game.spawnExplosion = () => { game.explosions.push(1); };

  new Carrier(game, 100, 100).die();
  assert.equal(game.explosions.length, 0, '閃光と同時に爆発している');

  const delay = DESTRUCTION_PROFILES.carrier.blast.delay;
  for (let i = 0; i < delay; i++) {
    for (const p of [...game.particles]) p.update();
    game.particles = game.particles.filter((p) => p.alive);
  }
  assert.equal(game.explosions.length, 1, '遅延後に爆発していない');
});

test('カメラが無くても破壊完了で落ちない', () => {
  const game = makeBaseGame();
  game.camera = null;
  assert.doesNotThrow(() => new EnemyBase(game, 100, 100)._finishDestruction());
});
