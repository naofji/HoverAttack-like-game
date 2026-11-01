// ミサイル・グレネードなどの爆風で Orb が少し動く（設計 決定6・4.7）。爆心から外向きに、距離で弱め、重さで割る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orb } from '../src/js/entities/Orb.js';
import { pushOrbsByBlast } from '../src/js/systems/orbInteractions.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { ORB_BLAST_RADIUS, ORB_BLAST_IMPULSE, ORB_SIZES } from '../src/js/utils/Constants.js';

function world() {
  const game = { orbs: [], particles: [], landmines: [], map: { isSolidPoint: () => false, isWaterAtPixel: () => false } };
  return game;
}

function orbAt(game, cx, cy, size = 'small') {
  const o = new Orb(game, { cx, cy, size });
  game.orbs.push(o);
  return o;
}

test(`爆心から 16px の small は外向きに ${ORB_BLAST_IMPULSE}×(1−16/${ORB_BLAST_RADIUS}) の速さを得る。large はその 1/${ORB_SIZES.large.mass}`, () => {
  const game = world();
  const s = orbAt(game, 116, 100, 'small');
  const l = orbAt(game, 84, 100, 'large');
  pushOrbsByBlast(game, 100, 100);
  const want = ORB_BLAST_IMPULSE * (1 - 16 / ORB_BLAST_RADIUS);
  assert.ok(Math.abs(s.vx - want) < 1e-9, `small vx ${s.vx}`);
  assert.ok(Math.abs(l.vx + want / ORB_SIZES.large.mass) < 1e-9, `large vx ${l.vx}`);
  assert.ok(Math.abs(s.vy) < 1e-9);
});

test('半径の外の Orb は動かない', () => {
  const game = world();
  const o = orbAt(game, 100 + ORB_BLAST_RADIUS + 1, 100);
  pushOrbsByBlast(game, 100, 100);
  assert.equal(o.vx, 0);
  assert.equal(o.vy, 0);
});

test('爆心が Orb の中心と同じなら真上へ飛ばす', () => {
  const game = world();
  const o = orbAt(game, 100, 100);
  pushOrbsByBlast(game, 100, 100);
  assert.ok(o.vy < 0 && o.vx === 0);
});

test('spawnExplosion を呼ぶと Orb が押される（敵の爆発 fromEnemy でも）', () => {
  for (const fromEnemy of [false, true]) {
    const game = Object.assign(world(), SpawnEffects);
    const o = orbAt(game, 120, 100);
    game.spawnExplosion(100, 100, 20, {}, { fromEnemy });
    assert.ok(o.vx > 0, `fromEnemy=${fromEnemy}: vx ${o.vx}`);
  }
});
