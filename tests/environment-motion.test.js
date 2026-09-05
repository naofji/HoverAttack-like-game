import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE, FOG_SIGHT_SCALE,
} from '../src/js/utils/Constants.js';

// 水タイルを持つ最小のマップ
function mapWithWater(isWater) {
  return { isWaterAtPixel: isWater };
}

test('motionFor falls back to land when the game has no env (test stubs)', async () => {
  const { motionFor, LAND_MOTION } = await import('../src/js/world/StageEnvironment.js');
  assert.deepEqual(motionFor({}, 0, 0), { speed: 1, gravity: 1, slide: 0 });
  assert.ok(Object.isFrozen(LAND_MOTION));
});

test('stage 1 (none) returns land motion everywhere and full sight', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => true) }, 0);
  assert.equal(env.kind, 'none');
  assert.deepEqual(env.motionAt(10, 10), { speed: 1, gravity: 1, slide: 0 });
  assert.equal(env.sightScale, 1);
});

test('stage 4 (water) returns water motion only inside water tiles', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithWater((x, y) => y >= 100) };
  const env = new StageEnvironment(game, 3);
  assert.equal(env.kind, 'water');
  assert.deepEqual(env.motionAt(0, 50), { speed: 1, gravity: 1, slide: 0 });
  assert.deepEqual(env.motionAt(0, 150),
    { speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 });
});

test('stage 5 (snow) returns ice slide with normal speed and gravity', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => false) }, 4);
  assert.deepEqual(env.motionAt(0, 0), { speed: 1, gravity: 1, slide: ICE_SLIDE });
});

test('stage 6 (fog) shrinks sight and keeps land motion', async () => {
  const { StageEnvironment, sightScaleFor } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => false) }, 5);
  assert.equal(env.sightScale, FOG_SIGHT_SCALE);
  assert.equal(sightScaleFor({ env }), FOG_SIGHT_SCALE);
  assert.equal(sightScaleFor({}), 1);
  assert.deepEqual(env.motionAt(0, 0), { speed: 1, gravity: 1, slide: 0 });
});

test('env without document (node) still updates and draws without throwing', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  for (const idx of [0, 3, 4, 5, 6]) {
    const env = new StageEnvironment({ map: mapWithWater(() => false), enemies: [], projectiles: [], enemyBullets: [], particles: [] }, idx);
    env.update();
    env.drawBehindTerrain({ drawImage() {} }, 0, 0);
    env.drawOverWorld({ drawImage() {} }, 0, 0);
    env.drawOverlay({ drawImage() {}, fillRect() {} });
    // デモ画面（面別ランキングなど）用の入口も同じ環境で呼ばれるので、ここでも網羅する
    env.drawDemoOverlay({ drawImage() {}, fillRect() {} });
  }
});
