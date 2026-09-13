// マシンガン発射が薬莢の排出を実際に呼んでいるか。
// ソース文字列の grep では、呼び出しがあっても到達しない経路を拾えないので
// 本物の _fireMachineGun を、実際の spawnCasing 経路（particles への追加）で確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { Player } from '../src/js/entities/Player.js';
import { CasingParticle } from '../src/js/entities/Particle.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';

function makeGame() {
  return {
    debugInvincible: false,
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [],
    landmines: [],
    ...SpawnEffects,
  };
}

test('_fireMachineGun spawns exactly one casing per shot', () => {
  const game = makeGame();
  const p = new Player(game, 100, 100);
  Game._fireMachineGun.call(game, p, 100, 100, 0);
  const casings = game.particles.filter((x) => x instanceof CasingParticle);
  assert.equal(casings.length, 1);
});
