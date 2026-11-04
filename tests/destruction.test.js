import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DelayedCall } from '../src/js/entities/DelayedCall.js';
import { playDestruction, DESTRUCTION_PROFILES } from '../src/js/entities/destruction.js';
import { ImpactFlash } from '../src/js/entities/Particle.js';
import { DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { IMPACT_FLASH_LIFETIME, IMPACT_FLASH_RADIUS } from '../src/js/utils/Constants.js';

// --- 遅延実行 ---------------------------------------------------------------

test('DelayedCall は指定tick後に一度だけ呼ぶ', () => {
  let calls = 0;
  const d = new DelayedCall(3, () => calls++);

  d.update(); assert.equal(calls, 0);
  d.update(); assert.equal(calls, 0);
  d.update();
  assert.equal(calls, 1, '3tick目に呼ばれていない');
  assert.equal(d.alive, false, '呼んだ後も生きている');

  d.update();
  assert.equal(calls, 1, '2回呼ばれた');
});

test('DelayedCall は何も描かない（particles に混ざるだけ）', () => {
  const ctx = makeFakeCtx();
  new DelayedCall(1, () => {}).draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

test('遅延0なら次のtickで即座に呼ぶ', () => {
  let called = false;
  const d = new DelayedCall(0, () => { called = true; });
  d.update();
  assert.equal(called, true);
});

// --- 破壊演出の組み立て -----------------------------------------------------

function makeGame() {
  const game = {
    particles: [],
    explosions: [],
    debris: [],
    camera: { shake() {} },
    canvas: { width: 1024, height: 768 },
    spawnExplosion(x, y, count, opts) { game.explosions.push({ x, y, count, opts }); },
    spawnDebris(entity, kind) { game.debris.push({ entity, kind }); },
  };
  return game;
}

function makeEntity() {
  return { x: 100, y: 200, width: 16, height: 24, vx: 0, vy: 0 };
}

/** particles を n tick 進める（死んだものは取り除く）。 */
function run(game, n) {
  for (let i = 0; i < n; i++) {
    for (const p of [...game.particles]) p.update();
    game.particles = game.particles.filter((p) => p.alive);
  }
}

test('全ての機体にプロファイルがあり、破片スペックと対応している', () => {
  for (const kind of Object.keys(DEBRIS_SPECS)) {
    const p = DESTRUCTION_PROFILES[kind];
    assert.ok(p, `${kind} のプロファイルが無い`);
    assert.ok(p.flash.count > 0, `${kind}: 閃光が無い`);
    assert.ok(p.blast.count > 0, `${kind}: 爆発が無い`);
  }
});

test('閃光が先、爆発は後（順序が逆転しない）', () => {
  // これがこの設計の要点。以前は破片・爆発・閃光が同時に出て competing していた。
  const game = makeGame();
  playDestruction(game, makeEntity(), 'player');

  const flashes = game.particles.filter((p) => p instanceof ImpactFlash);
  assert.ok(flashes.length > 0, '閃光が出ていない');
  assert.equal(game.explosions.length, 0, '爆発が閃光と同時に出ている');

  const delay = DESTRUCTION_PROFILES.player.blast.delay;
  run(game, delay);
  assert.equal(game.explosions.length, 1, `${delay}tick 後に爆発していない`);
});

// 以前は Particle.js の createDeathFlashes（本番では呼ばれていない旧実装）で見ていたのを、
// 本番の経路へ移した（2026-11-04）。上限 36 tick は旧テストの値で、閃光5つの機体に掛ける
test('破壊時の閃光は複数が時間をずらして瞬く', () => {
  for (const kind of ['attacker', 'player']) {
    const game = makeGame();
    playDestruction(game, makeEntity(), kind);
    const delays = game.particles.filter((p) => p instanceof ImpactFlash).map((f) => f.delay).sort((a, b) => a - b);
    assert.equal(delays.length, DESTRUCTION_PROFILES[kind].flash.count);
    assert.equal(delays[0], 0, `${kind}: 最初の1つは即座に光ってほしい`);
    assert.ok(new Set(delays).size > 1, `${kind}: 全部同時に光っている（連なって見えない）`);
    // 「何tick目までに始まるか」ではなく「連鎖全体が一瞬で終わるか」を見る。
    // 遅延には乱数の倍率(最大1.4)が乗るので、刻み×個数では上限を割ってしまう。
    const burstEnd = Math.max(...delays) + IMPACT_FLASH_LIFETIME;
    assert.ok(burstEnd <= 36,
      `${kind}: 連鎖が長すぎて瞬きに見えない: ${burstEnd} tick (約${(burstEnd / 60).toFixed(2)}秒)`);
  }
});

test('破壊時の閃光は機体の範囲に散る', () => {
  const game = makeGame();
  const e = makeEntity();
  playDestruction(game, e, 'attacker');
  for (const f of game.particles.filter((p) => p instanceof ImpactFlash)) {
    assert.ok(f.x >= e.x - e.width && f.x <= e.x + e.width * 2, `x が機体から離れすぎ: ${f.x}`);
    assert.ok(f.y >= e.y - e.height && f.y <= e.y + e.height * 2, `y が機体から離れすぎ: ${f.y}`);
  }
});

test('アタッカーの破壊時の閃光はミサイル着弾と同じくらいの大きさ', () => {
  const game = makeGame();
  playDestruction(game, makeEntity(), 'attacker');
  for (const f of game.particles.filter((p) => p instanceof ImpactFlash)) {
    assert.ok(f.radius >= IMPACT_FLASH_RADIUS * 0.6 && f.radius <= IMPACT_FLASH_RADIUS * 1.2,
      `ミサイル着弾(${IMPACT_FLASH_RADIUS})と大きさが違いすぎる: ${f.radius}`);
  }
});

test('破片は閃光と同時に出る（ホールド中に光る）', () => {
  const game = makeGame();
  playDestruction(game, makeEntity(), 'player');
  assert.equal(game.debris.length, 1, '破片が出ていない');
  assert.equal(game.debris[0].kind, 'player');
});

test('爆発の遅延は破片のホールド時間と揃っている', () => {
  // ホールドが明けてパーツが飛び出す瞬間に爆発する、という組み立て
  for (const [kind, profile] of Object.entries(DESTRUCTION_PROFILES)) {
    const spec = DEBRIS_SPECS[kind];
    if (!spec) continue;
    assert.equal(profile.blast.delay, spec.holdFrames,
      `${kind}: 爆発の遅延(${profile.blast.delay})とホールド(${spec.holdFrames})がずれている`);
  }
});

test('閃光の数と大きさはプロファイルどおり', () => {
  const game = makeGame();
  const profile = DESTRUCTION_PROFILES.carrier;
  playDestruction(game, makeEntity(), 'carrier');

  const flashes = game.particles.filter((p) => p instanceof ImpactFlash);
  assert.equal(flashes.length, profile.flash.count);
  for (const f of flashes) {
    assert.ok(f.radius > 0);
    assert.ok(f.radius <= profile.flash.radius * 1.2 + 1e-6,
      `指定より大きい閃光がある: ${f.radius}`);
  }
});

test('大きい機体ほど閃光が多く大きい', () => {
  const P = DESTRUCTION_PROFILES;
  assert.ok(P.carrier.flash.count > P.drone.flash.count, '母艦の閃光がドローン以下');
  assert.ok(P.carrier.flash.radius > P.drone.flash.radius, '母艦の閃光がドローン以下の大きさ');
  assert.ok(P.player.blast.count > P.drone.blast.count, '自機の爆発がドローン以下');
});

test('未知の kind では何も起きない', () => {
  const game = makeGame();
  playDestruction(game, makeEntity(), 'nonexistent');
  assert.equal(game.particles.length, 0);
  assert.equal(game.explosions.length, 0);
  assert.equal(game.debris.length, 0);
});

test('カメラの揺れを指定した機体だけ揺れる', () => {
  const game = makeGame();
  let shakes = 0;
  game.camera.shake = () => shakes++;

  playDestruction(game, makeEntity(), 'drone');
  assert.equal(shakes, 0, 'ドローンで画面が揺れている');

  playDestruction(game, makeEntity(), 'carrier');
  run(game, DESTRUCTION_PROFILES.carrier.blast.delay);
  assert.equal(shakes, 1, '母艦で画面が揺れていない');
});
