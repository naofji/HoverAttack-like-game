import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris, trimDebris } from '../src/js/entities/debris/index.js';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import { DEBRIS_MAX_ACTIVE, DEBRIS_SPLIT_PIECES } from '../src/js/utils/Constants.js';
import { DEBRIS_SPECS } from '../src/js/entities/debris/index.js';

/**
 * main.js の game オブジェクトは DOM に依存するため import できない。
 * ただし spawnDebris / _trimDebris のロジック自体は main.js から
 * trimDebris() として切り出してあるので、ここでは本物の trimDebris を呼ぶ
 * 薄い器だけを用意する（ロジックのコピーではない）。
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
      trimDebris(this.particles, DEBRIS_MAX_ACTIVE);
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
  // 各パーツがギロチン分割で複数の破片に割れて飛ぶ
  const partCount = DEBRIS_SPECS.drone.parts.length;
  assert.ok(game.particles.length > partCount, '分割されていない');
  assert.ok(game.particles.length <= partCount * DEBRIS_SPLIT_PIECES, '割りすぎ');
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

// trimDebris 自体を直接叩く単体テスト。main.js._trimDebris はこの関数を
// 呼ぶだけの薄いラッパーなので、ここが本当の契約になる。
test('trimDebris は古い DebrisPart から間引く', () => {
  const oldPart = new DebrisPart({ x: 0, y: 0, w: 1, h: 1, color: '#fff', angle: 0, vx: 0, vy: 0, spin: 0, holdFrames: 0, lifetime: 10, game: null });
  const newPart = new DebrisPart({ x: 0, y: 0, w: 1, h: 1, color: '#fff', angle: 0, vx: 0, vy: 0, spin: 0, holdFrames: 0, lifetime: 10, game: null });
  const particles = [oldPart, newPart];
  trimDebris(particles, 1);
  assert.deepEqual(particles, [newPart], '古い破片ではなく新しい破片が残った');
});

test('trimDebris は上限以下なら何もしない', () => {
  const part = new DebrisPart({ x: 0, y: 0, w: 1, h: 1, color: '#fff', angle: 0, vx: 0, vy: 0, spin: 0, holdFrames: 0, lifetime: 10, game: null });
  const particles = [part];
  trimDebris(particles, 5);
  assert.equal(particles.length, 1);
});
