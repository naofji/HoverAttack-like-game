import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playBlast, BLAST_PROFILES } from '../src/js/entities/destruction.js';
import { ImpactFlash } from '../src/js/entities/Particle.js';

function makeGame() {
  const game = {
    particles: [],
    explosions: [],
    spawnExplosion(x, y, count, opts) { game.explosions.push({ x, y, count, opts }); },
  };
  return game;
}

test('どの爆発にも閃光と粒子の両方がある', () => {
  for (const [kind, p] of Object.entries(BLAST_PROFILES)) {
    assert.ok(p.flash.count > 0, `${kind}: 閃光が無い`);
    assert.ok(p.flash.radius > 0, `${kind}: 閃光の大きさが0`);
    assert.ok(p.blast.count > 0, `${kind}: 粒子が無い`);
  }
});

test('指定した位置に閃光と爆発を出す', () => {
  const game = makeGame();
  playBlast(game, 300, 400, 'missileTerrain');

  const flashes = game.particles.filter((p) => p instanceof ImpactFlash);
  assert.equal(flashes.length, BLAST_PROFILES.missileTerrain.flash.count);
  assert.equal(game.explosions.length, 1);
  assert.deepEqual(
    { x: game.explosions[0].x, y: game.explosions[0].y },
    { x: 300, y: 400 },
  );
});

test('閃光は爆発の範囲に散る（1つなら着弾点そのもの）', () => {
  const game = makeGame();
  playBlast(game, 300, 400, 'grenade');
  const spread = BLAST_PROFILES.grenade.flash.spread;
  for (const f of game.particles) {
    assert.ok(Math.abs(f.x - 300) <= spread, `x が散りすぎ: ${f.x}`);
    assert.ok(Math.abs(f.y - 400) <= spread, `y が散りすぎ: ${f.y}`);
  }
});

test('弾種で閃光の大きさが変わる', () => {
  const B = BLAST_PROFILES;
  assert.ok(B.mgHit.flash.radius < B.missileHit.flash.radius,
    'マシンガンとミサイルの閃光が同じ大きさ');
  assert.ok(B.missileHit.flash.radius < B.grenade.flash.radius,
    'ミサイルとグレネードの閃光が同じ大きさ');
});

test('粒子数の多い爆発ほど閃光も多い（規模が揃う）', () => {
  const B = BLAST_PROFILES;
  assert.ok(B.grenade.blast.count > B.mgHit.blast.count);
  assert.ok(B.grenade.flash.count >= B.mgHit.flash.count);
});

test('大きさを外から渡せる（基地の連続爆発など）', () => {
  const game = makeGame();
  playBlast(game, 100, 100, 'baseDying', 50);
  assert.equal(game.explosions[0].count, 50, '渡した粒子数が使われていない');
});

test('未知の kind では何も起きない', () => {
  const game = makeGame();
  playBlast(game, 100, 100, 'nonexistent');
  assert.equal(game.particles.length, 0);
  assert.equal(game.explosions.length, 0);
});

test('地形に当たったミサイルも敵に当たったときと同じく閃光が出る', () => {
  // 以前は敵に当たったときだけ閃光が出て、地形では出ていなかった
  const terrain = makeGame();
  playBlast(terrain, 0, 0, 'missileTerrain');
  const enemy = makeGame();
  playBlast(enemy, 0, 0, 'missileHit');
  assert.ok(terrain.particles.length > 0, '地形着弾で閃光が出ない');
  assert.ok(enemy.particles.length > 0, '敵着弾で閃光が出ない');
});
