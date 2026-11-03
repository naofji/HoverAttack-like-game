// Orb と弾（設計 決定7・8、4.6）。弾は Orb で止まる（盾）。マシンガン・ミサイルは、跳ね返りで向きが 90度より
// 大きく変わる＝面の法線から 45度より正面寄りに当たると壊れ（マシンガンは消える・ミサイルは爆発）、浅いと跳ね返る。
// グレネードは角度に関係なく跳ね返る。レーザー（基地のレーザー・反射ビーム）は Orb に吸収される。跳ね返った弾は持ち主の陣営のまま
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Orb } from '../src/js/entities/Orb.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { BaseLaser } from '../src/js/entities/BaseLaser.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { sweepProjectileAgainstOrbs } from '../src/js/systems/orbInteractions.js';
import { segmentCircleHit, projectileVelocity } from '../src/js/utils/orbPhysics.js';
import { ImpactFlash } from '../src/js/entities/Particle.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const CX = 500, CY = 500;

/** 岩の無い広い空間に Orb（small、中心 CX, CY）が1つ */
function world() {
  const game = {
    particles: [], landmines: [], enemies: [], projectiles: [], enemyBullets: [], barriers: [], orbs: [],
    spawnExplosion() {}, spawnSparks() {}, spawnHeavyDamage() {}, addScore() {},
    player: null, carrier: null, camera: { x: 0, y: 0, shake() {} }, canvas: { width: 1024, height: 768 },
  };
  game.map = {
    width: 4000, height: 4000, rows: 250, cols: 250,
    isSolid: () => false, isSolidAtPixel: () => false, isSolidPoint: () => false,
    slopeHitAlong: () => null, popOutOfRock: () => null, hasShapedTileIn: () => false,
    pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
    destroyArea: () => 0, isWaterAtPixel: () => false,
  };
  const orb = new Orb(game, { cx: CX, cy: CY, size: 'small' });
  game.orbs.push(orb);
  return { game: Object.assign(game, CombatActions), orb };
}

/**
 * 右向きに飛ぶ弾を、入射角 thetaDeg で Orb の左上に当たる線に置き、Orb の手前から当たった先まで1ティック動いたことにする
 * （_prevX は tick の頭の位置。renderInterp と同じ）
 */
function aim(p, orb, thetaDeg) {
  const th = (thetaDeg * Math.PI) / 180;
  const y = CY - orb.r * Math.sin(th);
  const hitX = CX - orb.r * Math.cos(th);
  p._prevX = hitX - 4; p._prevY = y;
  p.x = hitX + 2; p.y = y;
  return { th };
}

function spyWall(p) {
  const calls = [];
  p.onTownWall = (x, y) => { calls.push([x, y]); p.alive = false; p.exploded = true; };
  return calls;
}

for (const [name, make] of [
  ['自機のマシンガン弾', (g) => new PlayerBullet(g, 0, 0, 0)],
  ['敵のマシンガン弾', (g) => new EnemyBullet(g, 0, 0, 0)],
  ['自機ミサイル', (g) => new Missile(g, 0, 0, 0, true)],
  ['敵の追尾ミサイル', (g) => { const m = new EnemyHomingMissile(g, 0, 0, 0); m.speed = 4; m.driftAngle = 0; return m; }],
]) {
  for (const deg of [0, 30]) {
    test(`${name}: 入射角 ${deg}° では壊れる（固い壁に当たったときと同じ onTownWall を当たった点で呼ぶ）`, () => {
      const { game, orb } = world();
      const p = make(game);
      aim(p, orb, deg);
      const calls = spyWall(p);
      sweepProjectileAgainstOrbs(game, p);
      assert.equal(calls.length, 1);
      assert.ok(Math.abs(Math.hypot(calls[0][0] - CX, calls[0][1] - CY) - orb.r) < 0.01, '当たった点が円周の上でない');
    });
  }
  test(`${name}: 入射角 60° では鏡のように跳ね返り、持ち主は変わらない`, () => {
    const { game, orb } = world();
    const p = make(game);
    const owner = p.isPlayerOwned;
    aim(p, orb, 60);
    const calls = spyWall(p);
    sweepProjectileAgainstOrbs(game, p);
    assert.equal(calls.length, 0);
    assert.ok(p.alive !== false && !p.exploded);
    const v = projectileVelocity(p), s = Math.hypot(v.vx, v.vy);
    // (1, 0) を法線 (−cos60, −sin60) で鏡映すると (−cos120, −sin120) = (0.5, −0.866)
    assert.ok(Math.abs(v.vx / s - 0.5) < 1e-6 && Math.abs(v.vy / s + Math.sqrt(3) / 2) < 1e-6, `向き ${v.vx / s}, ${v.vy / s}`);
    assert.equal(p.isPlayerOwned, owner);
    assert.ok(Math.hypot(p.x - CX, p.y - CY) > orb.r, '円の外へ出ていない');
  });
}

test('グレネードは入射角 0° でも跳ね返る（爆発しない）', () => {
  const { game, orb } = world();
  const g = new Grenade(game, 0, 0, 0, 6);
  aim(g, orb, 0);
  sweepProjectileAgainstOrbs(game, g);
  assert.ok(g.alive && !g.exploded);
  assert.ok(g.vx < 0, `vx ${g.vx}`);
});

// 2026-11-01 ユーザー指定: レーザー（基地のレーザーと反射ビーム）は Orb が打ち消す（吸収する）。以前は反射ビームが跳ね返り、基地のレーザーは素通りした。
// 2026-11-03 ユーザー指定: 吸収するときは、反射ビームが自機に当たったときと同じ派手な演出（閃光・紫の火花・beamHit の音）にする。
// 反射ビームは onTownWall を持たない（以前はそれを呼んでいて、テストでは差し替えていたので本番で落ちることに気づかなかった）。
// ここでは差し替えずに本物の弾で通す
function spyWeapon() {
  const calls = [];
  const saved = audioManager.playWeapon;
  audioManager.playWeapon = (kind, x, y) => { calls.push({ kind, x, y }); };
  return { calls, restore: () => { audioManager.playWeapon = saved; } };
}

/** 反射ビームが自機に当たったときの演出（CollisionManager を通す）を、粒の種類ごとの数にして返す */
function beamHitOnPlayerEffect() {
  const { game } = world();
  game.player = { alive: true, docked: false, invincibleTimer: 0, x: 100, y: 100, width: 16, height: 24, vx: 0, vy: 0, takeDamage() {} };
  const b = new ReflectBeam(game, 90, 112, 0);
  b._prevX = 90; b._prevY = 112;
  new CollisionManager(game)._applyBulletHit(b, game.player, { x: 100, y: 112 });
  return kinds(game.particles);
}

const kinds = (ps) => {
  const out = {};
  for (const q of ps) out[q.constructor.name] = (out[q.constructor.name] || 0) + 1;
  return out;
};

for (const deg of [0, 60]) {
  test(`反射ビームは入射角 ${deg}° でも跳ね返らずに Orb に吸収され、自機に当たったときと同じ演出と音を出す`, () => {
    const s = spyWeapon();
    try {
      const want = beamHitOnPlayerEffect();
      s.calls.length = 0;
      const { game, orb } = world();
      const b = new ReflectBeam(game, 0, 0, 0);
      s.calls.length = 0;   // 撃った音は数えない
      aim(b, orb, deg);
      sweepProjectileAgainstOrbs(game, b);
      assert.equal(b.alive, false);
      assert.deepEqual(kinds(game.particles), want);
      assert.ok(game.particles.some((q) => q instanceof ImpactFlash), '閃光が無い');
      assert.deepEqual(s.calls.map((c) => c.kind), ['beamHit']);
      assert.ok(Math.abs(Math.hypot(s.calls[0].x - CX, s.calls[0].y - CY) - orb.r) < 0.01, '当たった点が円周の上でない');
    } finally { s.restore(); }
  });
}

test('基地のレーザーは Orb に触れると消え、反射ビームが自機に当たったときと同じ演出と音を出す', () => {
  const s = spyWeapon();
  try {
    const want = beamHitOnPlayerEffect();
    s.calls.length = 0;
    const { game } = world();
    const laser = new BaseLaser(game, CX - 30, CY, 0);   // 中心が Orb の 30px 左、帯は ±50px なので先端は Orb の向こう
    s.calls.length = 0;
    sweepProjectileAgainstOrbs(game, laser);
    assert.equal(laser.alive, false);
    assert.deepEqual(kinds(game.particles), want);
    assert.deepEqual(s.calls.map((c) => c.kind), ['beamHit']);
  } finally { s.restore(); }
});

test('Orb に掛からない基地のレーザーはそのまま飛ぶ', () => {
  const { game } = world();
  const laser = new BaseLaser(game, CX - 30, CY + 40, 0);
  sweepProjectileAgainstOrbs(game, laser);
  assert.equal(laser.alive, true);
});

test('基地のレーザーは、あいだにある Orb に吸収されて向こうの自機に当たらない（CollisionManager を通す）', () => {
  const { game } = world();
  let hits = 0;
  game.player = { alive: true, docked: false, invincibleTimer: 0, x: CX + 60, y: CY - 12, width: 16, height: 24, vx: 0, vy: 0, takeDamage() { hits++; } };
  game.enemyBullets.push(new BaseLaser(game, CX - 160, CY, 0));
  const cm = new CollisionManager(game);
  for (let f = 0; f < 60 && game.enemyBullets.length > 0; f++) cm._updateEnemyBullets();
  assert.equal(hits, 0);
  assert.equal(game.enemyBullets.length, 0, 'レーザーが残っている');
});

test('1フレームに Orb の直径より長く動く弾も、線分で当たる', () => {
  const { game, orb } = world();
  const p = new PlayerBullet(game, 0, 0, 0);
  p._prevX = CX - 30; p._prevY = CY;
  p.x = CX + 30; p.y = CY;   // 1ティックで 60px（直径 16 を飛び越す）
  const calls = spyWall(p);
  sweepProjectileAgainstOrbs(game, p);
  assert.equal(calls.length, 1);
  assert.ok(Math.abs(calls[0][0] - (CX - orb.r)) < 0.01);
});

test('Orb の中から出ていく弾には当てない（始点が円の中）', () => {
  const { game } = world();
  const p = new PlayerBullet(game, 0, 0, 0);
  p._prevX = CX; p._prevY = CY;
  p.x = CX + 20; p.y = CY;
  const calls = spyWall(p);
  sweepProjectileAgainstOrbs(game, p);
  assert.equal(calls.length, 0);
});

test('始点がもう Orb の中でも、中心へ向かう弾は円周で当たる（押し当てたまま撃った弾が素通りしない）', () => {
  const { game, orb } = world();
  const p = new PlayerBullet(game, 0, 0, 0);
  p._prevX = CX - orb.r + 2; p._prevY = CY;   // 銃口が円の中に出た
  p.x = CX + orb.r + 6; p.y = CY;             // そのままだと向こうへ抜ける
  const calls = spyWall(p);
  sweepProjectileAgainstOrbs(game, p);
  assert.equal(calls.length, 1, '素通りした');
  assert.ok(Math.abs(calls[0][0] - (CX - orb.r)) < 0.01 && Math.abs(calls[0][1] - CY) < 0.01, `当たった点 ${calls[0]}`);
});

test('segmentCircleHit: 最初に円へ入る点と t を返し、外れる・始点が中なら null', () => {
  const h = segmentCircleHit(0, 0, 20, 0, 10, 0, 4);
  assert.ok(Math.abs(h.x - 6) < 1e-9 && Math.abs(h.t - 0.3) < 1e-9);
  assert.equal(segmentCircleHit(0, 10, 20, 10, 10, 0, 4), null);
  assert.equal(segmentCircleHit(10, 0, 20, 0, 10, 0, 4), null);
});

test('敵の弾は、あいだにある Orb に止められて向こうの自機に当たらない（CollisionManager を通す）', () => {
  const { game } = world();
  let hits = 0;
  game.player = { alive: true, docked: false, invincibleTimer: 0, x: CX + 40, y: CY - 12, width: 16, height: 24, vx: 0, vy: 0, takeDamage() { hits++; } };
  const b = new EnemyBullet(game, CX - 40, CY, 0);
  game.enemyBullets.push(b);
  const cm = new CollisionManager(game);
  for (let f = 0; f < 40 && game.enemyBullets.length > 0; f++) {
    for (const e of game.enemyBullets) { e._prevX = e.x; e._prevY = e.y; }
    cm._updateEnemyBullets();
  }
  assert.equal(hits, 0);
  assert.equal(game.enemyBullets.length, 0, '弾が残っている');
});

test('グレネードの軌道予測線は Orb で跳ね返る', () => {
  const { game } = world();
  // 近くから真横に投げる（遠いと重力で落ちて Orb の下をくぐる）
  const t = game._calcGrenadeTrajectory(CX - 30, CY, 0, 6);
  const maxX = Math.max(...t.points.map((p) => p.x));
  assert.ok(maxX < CX, `予測線が Orb を素通りした: ${maxX}`);
});
