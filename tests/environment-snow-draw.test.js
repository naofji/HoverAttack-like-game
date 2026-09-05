import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_LAYERS, SNOW_COLOR, SNOW_KICK_COLOR, SNOW_SHEET_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('in-game snow falls behind the terrain (world pass), not over the HUD', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  for (let i = 0; i < 30; i++) env.update();
  const behind = makeFakeCtx();
  env.drawBehindTerrain(behind, 640, 320);
  const draws = behind.calls.filter((c) => c.name === 'drawImage');
  const tilesX = Math.ceil(CANVAS_WIDTH / SNOW_SHEET_SIZE) + 1;
  const tilesY = Math.ceil(CANVAS_HEIGHT / SNOW_SHEET_SIZE) + 1;
  assert.ok(draws.length >= SNOW_LAYERS.length && draws.length <= SNOW_LAYERS.length * tilesX * tilesY, `drawImage ${draws.length}`);
  // ワールド座標: 全ての板がカメラの可視矩形に掛かる位置に置かれる
  for (const d of draws) {
    const [, x, y] = d.args;
    assert.ok(x + SNOW_SHEET_SIZE > 640 && x < 640 + CANVAS_WIDTH, `sheet x ${x} outside view`);
    assert.ok(y + SNOW_SHEET_SIZE > 320 && y < 320 + CANVAS_HEIGHT, `sheet y ${y} outside view`);
  }
  const over = makeFakeCtx();
  env.drawOverlay(over);
  assert.equal(over.calls.filter((c) => c.name === 'drawImage').length, 0, 'in-game overlay must not draw snow');
});

test('layers scroll at different speeds', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const at = () => {
    const ctx = makeFakeCtx();
    env.drawBehindTerrain(ctx, 640, 320);
    return ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[2]); // y
  };
  const y0 = at();
  env.update();
  const y1 = at();
  // 同じ添字の drawImage の y の差が層ごとに違う
  const deltas = new Set(y1.map((y, i) => Math.round((y - y0[i]) * 100) / 100));
  assert.ok(deltas.size >= 2, `expected different scroll speeds, got ${[...deltas]}`);
});

test('demo overlay still scrolls snow in screen space', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const ctx = makeFakeCtx();
  env.drawDemoOverlay(ctx, 0.5);
  assert.ok(ctx.calls.filter((c) => c.name === 'drawImage').length >= SNOW_LAYERS.length);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.includes(0.5));
});

test('falling snow is bright but never white, kicked snow is brighter still, and flakes grow with depth', async () => {
  const lum = (hex) => { const s = hex.slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0); };
  // 雪は地形の奥へ移したので、弾（手前・白）とは層で見分けられる。暗さで見分ける必要がなくなった
  const snowLum = lum(SNOW_COLOR);
  const kickLum = lum(SNOW_KICK_COLOR);
  assert.ok(170 < snowLum && snowLum < 210, `falling snow luminance ${snowLum} out of range for ${SNOW_COLOR}`);
  assert.ok(kickLum > snowLum, `kicked snow must be brighter than falling snow: ${SNOW_KICK_COLOR} (${kickLum}) vs ${SNOW_COLOR} (${snowLum})`);
  assert.ok(kickLum < 235, `kicked snow luminance ${kickLum} must stay below pure white`);
  // 3px の粒は廃止した（実機の指摘。粒が大きすぎて雪に見えない）
  for (const layer of SNOW_LAYERS) assert.ok(layer.size <= 2, `flake size ${layer.size} exceeds max 2`);
  // 奥から手前へ大きく速く
  for (let i = 1; i < SNOW_LAYERS.length; i++) {
    assert.ok(SNOW_LAYERS[i].size >= SNOW_LAYERS[i - 1].size, `size must be non-decreasing at layer ${i}`);
    assert.ok(SNOW_LAYERS[i].speed > SNOW_LAYERS[i - 1].speed, `speed must increase at layer ${i}`);
  }
});

test('2px の粒は2枚あり、落ち方と揺れが「若干」違う', () => {
  // 3px を廃した代わりに、同じ 2px を落下速度と横揺れだけ変えて2枚重ねる。
  // 板は層ごとに別のシードで撒かれ、横揺れの位相も層番号でずれるので、
  // 同じ大きさでも重なって見えない（snow.js の buildSheet と sway の位相）
  const two = SNOW_LAYERS.filter((l) => l.size === 2);
  assert.equal(two.length, 2, '2px の層が2枚ない');

  const [near, far] = [two[1], two[0]];
  assert.ok(near.speed > far.speed, '手前の 2px のほうが速く落ちること');
  assert.ok(near.sway > far.sway, '手前の 2px のほうが大きく揺れること');

  // 「若干」＝手前が奥の1.5倍を超えない。超えると大きさが同じぶん、
  // 速さの差だけが目について2枚に見えてしまう
  assert.ok(near.speed < far.speed * 1.5,
    `落下速度の差が大きすぎる: ${far.speed} → ${near.speed}`);
  assert.ok(near.sway < far.sway * 1.5,
    `揺れの差が大きすぎる: ${far.sway} → ${near.sway}`);
});

test('2枚の 2px の板は別の模様になっている（重なって1枚に見えない）', async () => {
  // 同じ大きさの粒を2枚重ねるので、板の中身まで同じだと「濃い1枚」にしかならない。
  // buildSheet が層ごとに別のシードを使っていることを、撒かれた座標そのもので確かめる
  const made = [];
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      const canvas = { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
      made.push(ctx);
      return canvas;
    },
  };
  try {
    const { createSnowRenderer } = await import('../src/js/world/environment/snow.js');
    createSnowRenderer();
  } finally {
    globalThis.document = prev;
  }
  assert.equal(made.length, SNOW_LAYERS.length, '層の数だけ板が作られていない');

  const spots = (ctx) => new Set(
    ctx.calls.filter((c) => c.name === 'fillRect').map((c) => `${c.args[0]},${c.args[1]}`),
  );
  const twoPx = SNOW_LAYERS.map((l, i) => [l, i]).filter(([l]) => l.size === 2).map(([, i]) => i);
  assert.equal(twoPx.length, 2);
  const a = spots(made[twoPx[0]]);
  const b = spots(made[twoPx[1]]);
  assert.ok(a.size > 0 && b.size > 0, '板に粒が撒かれていない');
  const shared = [...a].filter((k) => b.has(k)).length;
  // 512x512 に数百個なので、別シードならほぼ重ならない。半分も一致したら同じ板
  assert.ok(shared < Math.min(a.size, b.size) * 0.5,
    `2枚の板の粒が重なりすぎている (${shared} / ${Math.min(a.size, b.size)})`);
});
