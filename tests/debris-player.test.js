import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';

function makeGame() {
  return {
    map: { isSolidAtPixel: () => false, pixelToTile: () => ({ r: 0, c: 0 }) },
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    input: null,
    particles: [],
    carrier: null,
    enemies: [],
    projectiles: [],
    spawnExplosion() {},
    spawnHeavyDamage() {},
    spawnSparks() {},
    // main.js の spawnDebris と同じ振る舞いの最小実装（上限処理は debris-spawn 側で検証済み）
    spawnDebris(entity, kind) { this.particles.push(...buildDebris(entity, kind)); },
  };
}

function makePlayer(overrides = {}) {
  const game = makeGame();
  const p = new Player(game, 100, 200);
  p.docked = false;
  p.crouching = false;
  p.onGround = true;
  Object.assign(p, overrides);
  return p;
}

test('playerDebris スペックが登録されている', () => {
  const spec = DEBRIS_SPECS.player;
  assert.ok(spec);
  assert.ok(spec.holdFrames >= 4, '自機は大物なのでタメを持つ');
});

test('getDebrisParts が静的パーツ・脚・武装をすべて返す', () => {
  const p = makePlayer();
  const parts = p.getDebrisParts();
  assert.ok(parts.length >= 9, `パーツが少なすぎる: ${parts.length}`);
  for (const part of parts) {
    assert.ok(typeof part.color === 'string' && part.color.length > 0);
    assert.ok(part.w > 0 && part.h > 0, `サイズが不正: ${JSON.stringify(part)}`);
    assert.ok(Number.isFinite(part.x) && Number.isFinite(part.y));
  }
});

test('パーツが機体枠から極端に外れていない', () => {
  const p = makePlayer();
  for (const part of p.getDebrisParts()) {
    assert.ok(part.x >= -PLAYER_WIDTH && part.x <= PLAYER_WIDTH * 2, `x=${part.x}`);
    assert.ok(part.y >= -PLAYER_HEIGHT && part.y <= PLAYER_HEIGHT * 2, `y=${part.y}`);
  }
});

test('ホバー中と接地中で脚パーツの座標が変わる', () => {
  const ground = makePlayer({ onGround: true, walkFrame: 0 });
  const air = makePlayer({ onGround: false, vx: 1.5 });
  const gy = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  const ay = air.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  assert.notEqual(gy, ay, '死亡時のポーズが反映されていない');
});

test('武装の種類でパーツが変わる', () => {
  const bazooka = makePlayer({ currentWeapon: 'missile' });
  const mg = makePlayer({ currentWeapon: 'mg' });
  assert.notEqual(
    JSON.stringify(bazooka.getDebrisParts()),
    JSON.stringify(mg.getDebrisParts()),
  );
});

test('左向きなら buildDebris でX座標が反転する', () => {
  const right = makePlayer({ facingRight: true });
  const left = makePlayer({ facingRight: false });
  const [r0] = buildDebris(right, 'player');
  const [l0] = buildDebris(left, 'player');
  const localX = r0.x - right.x;
  assert.ok(Math.abs((l0.x - left.x) - (PLAYER_WIDTH - localX)) < 1e-9);
});

test('die() が破片を particles へ入れる', () => {
  const p = makePlayer();
  p.die();
  assert.ok(p.game.particles.length >= 9, '破片が撒かれていない');
});

test('input が無くても getDebrisParts が例外を投げない', () => {
  const p = makePlayer();
  p.game.input = null;
  assert.doesNotThrow(() => p.getDebrisParts());
});

// これが描画と破片のポーズ一致を守る要のテスト。
// _collectLegPoses() が _drawSingleLeg と別のポーズを返すようになったら、ここで落ちる。
test('_collectLegPoses が実際に描かれた脚のポリラインと一致する', () => {
  const states = [
    { onGround: true, crouching: false, docked: false, walkFrame: 0 },
    { onGround: true, crouching: false, docked: false, walkFrame: 3 },
    { onGround: false, crouching: false, docked: false, vx: 1.2 },
    { onGround: true, crouching: true, docked: false },
  ];
  for (const state of states) {
    const p = makePlayer();
    Object.assign(p, state);
    p.facingRight = true;
    p.invincibleTimer = 0;

    const ctx = makeFakeCtx();
    p.draw(ctx);
    const drawn = extractPolylines(ctx.calls);
    const label = JSON.stringify(state);
    const near = (a, b) => Math.abs(a - b) < 1e-6;

    for (const pose of p._collectLegPoses()) {
      const found = drawn.some((line) =>
        line.length >= 2 &&
        near(line[0].x, pose.hipX) && near(line[0].y, pose.hipY) &&
        near(line[1].x, pose.kneeX) && near(line[1].y, pose.kneeY));
      assert.ok(found, `${label}: 描画に一致する脚が無い hip=(${pose.hipX},${pose.hipY}) knee=(${pose.kneeX},${pose.kneeY})`);
    }
  }
});
