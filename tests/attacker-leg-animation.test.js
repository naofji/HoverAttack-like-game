import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractPolylines, extractFillRects } from './helpers/fake-ctx.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

function makeConfig(overrides = {}) {
  return {
    hp: 30, speed: 1.0, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', aimAccuracy: 1.0,
    bodyColor: '#55CCDD', headColor: '#338899',
    visorColor: '#FF0000', backpackColor: '#888888', exhaustColor: '#00FFFF',
    ...overrides
  };
}

/** コンストラクタのスポーン処理を通さずに描画可能な最小インスタンスを作る。 */
function makeAttacker(overrides = {}) {
  const { config: configOverrides, ...state } = overrides;
  const config = makeConfig(configOverrides);
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  a.x = 0; a.y = 0; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = true;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.facingRight = true;
  a.walkFrame = 2;
  a.walkTimer = 0;
  a.hovering = false;
  a.crouching = false;
  a.burstCount = 0;
  a.frameCounter = 0;
  Object.assign(a, state);
  return a;
}

test('_legStyle: 既知の型はそれぞれ専用スタイルを返す', () => {
  assert.equal(makeAttacker({ config: { name: 'heavy' } })._legStyle().lineWidth, 4);
  assert.equal(makeAttacker({ config: { name: 'standard' } })._legStyle().lineWidth, 3);
});

test('_legStyle: rival は standard と同一のスタイル（プレイヤー同等）', () => {
  const rival = makeAttacker({ config: { name: 'rival' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(rival, standard);
});

test('_legStyle: 未知の型は standard にフォールバックする', () => {
  const unknown = makeAttacker({ config: { name: 'nonexistent-type' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(unknown, standard);
});

test('_hoverSwing: maxSpeed で正規化され -1..+1 に収まる', () => {
  const a = makeAttacker({ vx: 0.5, config: { speed: 1.0 } });
  assert.equal(a._hoverSwing(), 0.5);

  a.vx = 5.0; // maxSpeed を大きく超える
  assert.equal(a._hoverSwing(), 1);

  a.vx = -5.0;
  assert.equal(a._hoverSwing(), -1);
});

test('_hoverSwing: 左向きのときは進行方向ローカルに反転する', () => {
  const right = makeAttacker({ vx: 0.5, facingRight: true, config: { speed: 1.0 } });
  const left = makeAttacker({ vx: 0.5, facingRight: false, config: { speed: 1.0 } });
  assert.equal(left._hoverSwing(), -right._hoverSwing());
});

test('_hoverSwing: 型ごとの maxSpeed で正規化される（rival が振り切れない）', () => {
  const rival = makeAttacker({ vx: 1.2, config: { name: 'rival', speed: 1.2 } });
  const heavy = makeAttacker({ vx: 0.5, config: { name: 'heavy', speed: 0.5 } });
  assert.equal(rival._hoverSwing(), 1);
  assert.equal(heavy._hoverSwing(), 1);
});
