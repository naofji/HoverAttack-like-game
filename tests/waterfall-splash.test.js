// 滝の着水点で、水しぶき（SplashParticle）と水煙（WaterMistParticle）を上げる
// （2026-10-11 ユーザー指定「もっと派手に」。水面に落ち込む滝も、床に落ちる滝も）。
//
// 描画が組み立てた画面内の滝の一覧から、更新のたびに WATERFALL_SPLASH_INTERVAL おきに
// game.spawnWaterfallSplash(x, y, strength) を呼ぶ。strength は落差に比例（0〜1）。

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeWaterMap } from './helpers/water-map.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SplashParticle, WaterMistParticle } from '../src/js/entities/Particle.js';
import {
  TILE_SIZE as T, WATERFALL_SPLASH_INTERVAL, WATERFALL_SPLASH_FULL_DROP,
} from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
});

/** 岩の口(列3)から落ちる滝。下は床か、満水の水たまり */
function fallMap(height, into) {
  const rows = [' #######'];
  for (let i = 0; i < height; i++) rows.push(' ...1...');
  rows.push(into === 'pool' ? ' 8888888' : ' .......');
  rows.push(' #######');
  return makeWaterMap(rows.join('\n'));
}

async function drawnRenderer(map, camX = 0) {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const calls = [];
  const game = { map, spawnWaterfallSplash: (x, y, strength) => calls.push({ x, y, strength }) };
  const renderer = createWaterRenderer({ game });
  renderer.drawOverWorld(makeFakeCtx(), camX, 0);
  for (let i = 0; i < WATERFALL_SPLASH_INTERVAL; i++) renderer.update();
  return { calls };
}

test('水面に落ち込む滝の着水点で、しぶきと水煙を上げる', async () => {
  const map = fallMap(5, 'pool');
  const { calls } = await drawnRenderer(map);
  assert.ok(calls.length > 0, '一度も上がっていない');
  const surfaceY = map.getSurfaceY(6, 3);
  assert.ok(Math.abs(calls[0].x - (3 * T + T / 2)) <= T / 2, `滝の列の上で上がる（x=${calls[0].x}）`);
  assert.equal(calls[0].y, surfaceY, '水面の高さで上がる');
});

test('床に落ちる滝の着水点でも、しぶきと水煙を上げる', async () => {
  const map = fallMap(5, 'floor');
  const { calls } = await drawnRenderer(map);
  assert.ok(calls.length > 0, '一度も上がっていない');
  assert.ok(calls[0].y > 6 * T && calls[0].y <= 7 * T, `床（の上を流れる水）の高さで上がる（y=${calls[0].y}）`);
});

test('高い滝ほど強く上がる（強さは落差に比例し、WATERFALL_SPLASH_FULL_DROP で頭打ち）', async () => {
  const low = (await drawnRenderer(fallMap(2, 'pool'))).calls[0];
  const high = (await drawnRenderer(fallMap(8, 'pool'))).calls[0];
  assert.ok(low && high);
  assert.ok(high.strength > low.strength, `高い滝 ${high.strength} が低い滝 ${low.strength} より強くない`);
  assert.ok(high.strength <= 1);
  assert.ok(8 * T >= WATERFALL_SPLASH_FULL_DROP || high.strength < 1);
});

test('画面に入っていない滝からは上げない（描いていない滝は一覧に無い）', async () => {
  const { calls } = await drawnRenderer(fallMap(5, 'pool'), 5000);
  assert.deepEqual(calls, []);
});

test('毎フレームは上げない（WATERFALL_SPLASH_INTERVAL おき）', async () => {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const calls = [];
  const game = { map: fallMap(5, 'pool'), spawnWaterfallSplash: () => calls.push(1) };
  const renderer = createWaterRenderer({ game });
  renderer.drawOverWorld(makeFakeCtx(), 0, 0);
  for (let i = 0; i < WATERFALL_SPLASH_INTERVAL * 4; i++) renderer.update();
  assert.equal(calls.length, 4);
});

test('spawnWaterfallSplash は上向きのしぶきと横へ広がる水煙を出し、強いほど多い', () => {
  const weak = { particles: [] };
  const strong = { particles: [] };
  // spawnWaterMist も同じ SpawnEffects のものを使う（this 経由で呼ぶ）
  weak.spawnWaterMist = SpawnEffects.spawnWaterMist;
  strong.spawnWaterMist = SpawnEffects.spawnWaterMist;
  for (let i = 0; i < 50; i++) {
    SpawnEffects.spawnWaterfallSplash.call(weak, 100, 200, 0);
    SpawnEffects.spawnWaterfallSplash.call(strong, 100, 200, 1);
  }
  const count = (g, cls) => g.particles.filter((p) => p instanceof cls).length;
  assert.ok(count(strong, SplashParticle) > count(weak, SplashParticle), 'しぶきが増えていない');
  assert.ok(count(strong, WaterMistParticle) > count(weak, WaterMistParticle), '水煙が増えていない');
  assert.ok(count(weak, SplashParticle) > 0 && count(weak, WaterMistParticle) > 0, '低い滝でも少しは上がる');
  for (const p of strong.particles.filter((q) => q instanceof SplashParticle)) {
    assert.ok(p.vy < 0, `しぶきが下向き: vy=${p.vy}`);
  }
});

test('水面に落ち込む滝の着水点の波紋は WATERFALL_SPLASH_RIPPLE の強さで起こす', async () => {
  // 以前は 0.4 で、しぶきを派手にしても水面はほとんど揺れなかった
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const { WATERFALL_SPLASH_RIPPLE } = await import('../src/js/utils/Constants.js');
  const map = fallMap(5, 'pool');
  const renderer = createWaterRenderer({ game: { map } });
  const strengths = [];
  renderer.addRipple = (x, s) => strengths.push(s);
  for (let i = 0; i < 12; i++) renderer.update();
  assert.ok(strengths.length > 0, '前提: 波紋が起きた');
  assert.ok(strengths.every((s) => s === WATERFALL_SPLASH_RIPPLE), `強さ ${strengths}`);
});

/** 落差が最大（強さ1）の着水点から出した粒を飛ばしきって、95% の粒が届いた横の距離と高さを返す */
function reach(surface) {
  const g = { particles: [], spawnWaterMist: SpawnEffects.spawnWaterMist,
    map: { isWaterAtPixel: (x, y) => surface === 'pool' && y > 200 } };
  for (let i = 0; i < 400; i++) SpawnEffects.spawnWaterfallSplash.call(g, 0, 200, 1);
  const out = { spray: { dx: [], up: [] }, mist: { dx: [], up: [] } };
  for (const p of g.particles) {
    if (p instanceof WaterMistParticle) p.game = g;
    const kind = p instanceof SplashParticle ? 'spray' : 'mist';
    let dx = 0, up = 0;
    for (let f = 0; f < 80 && p.alive; f++) {
      p.update();
      dx = Math.max(dx, Math.abs(p.x));
      up = Math.max(up, 200 - p.y);
    }
    out[kind].dx.push(dx);
    out[kind].up.push(up);
  }
  const p95 = (a) => a.sort((x, y) => x - y)[Math.floor(0.95 * (a.length - 1))];
  return { sprayDx: p95(out.spray.dx), sprayUp: p95(out.spray.up), mistDx: p95(out.mist.dx), mistUp: p95(out.mist.up) };
}

test('しぶきと水煙は着水点のまわりに収まる（95% の粒が しぶき横±32px・高さ32px、水煙横±40px）', () => {
  // 「派手すぎ。散らばる範囲を狭く」（2026-10-11 実機の指摘）。調整前は落差最大で しぶき横±64・高さ45、
  // 水煙は床の上で横±102（水に落ちて消えないので寿命いっぱい流れた）
  for (const surface of ['pool', 'floor']) {
    const r = reach(surface);
    assert.ok(r.sprayDx <= 32, `${surface}: しぶきの横 ${r.sprayDx.toFixed(0)}px`);
    assert.ok(r.sprayUp <= 32, `${surface}: しぶきの高さ ${r.sprayUp.toFixed(0)}px`);
    assert.ok(r.mistDx <= 40, `${surface}: 水煙の横 ${r.mistDx.toFixed(0)}px`);
    // 狭めるのは横だけ。上向きの勢いまで絞ると、水面の上の水煙が1px しか浮かずにすぐ水へ落ちて消えた
    assert.ok(r.mistUp >= 8, `${surface}: 水煙が浮かない（高さ ${r.mistUp.toFixed(0)}px）`);
  }
});

test('ホバーの水滴（spawnWaterMist を倍率なしで呼ぶ）の散らばりは変えない', () => {
  // 滝の水煙だけを狭める。spawnWaterMist の散らばりの倍率は省略時 1
  const g = { particles: [] };
  for (let i = 0; i < 400; i++) SpawnEffects.spawnWaterMist.call(g, 0, 0, 1, 1);
  const maxSpeed = Math.max(...g.particles.map((p) => Math.hypot(p.vx, p.vy)));
  assert.ok(maxSpeed > 1.9, `速さの上限 ${maxSpeed}（(0.6+1.2)×1.2=2.16 まで出るはず）`);
});
