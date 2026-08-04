import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris } from '../src/js/entities/debris/index.js';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import { DEBRIS_MAX_ACTIVE } from '../src/js/utils/Constants.js';

/**
 * main.js の game オブジェクトは DOM に依存するため import できない。
 * spawnDebris と同じ実装を持つ最小の器で振る舞いを固定する。
 * （main.js 側の実装がこの契約から外れたら debris-integration 側で気づく）
 */
function makeGame() {
  return {
    particles: [],
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    spawnDebris(entity, kind) {
      const debris = buildDebris(entity, kind);
      if (debris.length === 0) return;
      this.particles.push(...debris);
      let excess = this.particles.filter((p) => p instanceof DebrisPart).length - DEBRIS_MAX_ACTIVE;
      if (excess <= 0) return;
      for (let i = 0; i < this.particles.length && excess > 0; i++) {
        if (this.particles[i] instanceof DebrisPart) {
          this.particles.splice(i, 1);
          i--;
          excess--;
        }
      }
    },
  };
}

function makeDrone(game, x = 100, y = 100) {
  return {
    game, x, y, width: 24, height: 16,
    vx: 0, vy: 0, patrolDir: 1, tiltAngle: 0,
  };
}

test('spawnDebris が particles に破片を追加する', () => {
  const game = makeGame();
  game.spawnDebris(makeDrone(game), 'drone');
  assert.equal(game.particles.length, 7);
  assert.ok(game.particles.every((p) => p instanceof DebrisPart));
});

test('未登録の kind では何も追加しない', () => {
  const game = makeGame();
  game.spawnDebris(makeDrone(game), 'nope');
  assert.equal(game.particles.length, 0);
});

test('同時存在数の上限を超えない（古いものから落とす）', () => {
  const game = makeGame();
  for (let i = 0; i < 40; i++) game.spawnDebris(makeDrone(game, i * 30, 100), 'drone');
  const count = game.particles.filter((p) => p instanceof DebrisPart).length;
  assert.equal(count, DEBRIS_MAX_ACTIVE);
});

test('上限処理は破片以外のパーティクルを消さない', () => {
  const game = makeGame();
  const marker = { alive: true, update() {}, draw() {} };
  game.particles.push(marker);
  for (let i = 0; i < 40; i++) game.spawnDebris(makeDrone(game, i * 30, 100), 'drone');
  assert.ok(game.particles.includes(marker), '爆発パーティクルが巻き添えで消えた');
});
