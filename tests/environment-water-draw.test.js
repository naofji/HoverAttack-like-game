import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, WATER_WAVE_AMPLITUDE, WATER_RIPPLE_DECAY } from '../src/js/utils/Constants.js';
import { makeWaterMap } from './helpers/water-map.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

// 行7が液面、行8が水中の落ち着いた水たまり（列2..5）。床は行9。
// 以前はここで water[] と waterSurface[] を手で組み立てていたが、種別と液面は
// waterQuery が water[] から導くようになったので、共通ヘルパーに寄せた。
// 底を満水にしてあるのは、上下とも満水未満だと「落下中の水柱」と判定されて
// 水たまりにならないため（滝の判定ルールC）。
function mapWithPool() {
  return makeWaterMap(`
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..1111....
    ..8888....
    ##########
  `);
}

test('surface wave stays within the amplitude and ripples decay', async () => {
  const { surfaceOffset } = await import('../src/js/world/environment/water.js');
  for (let x = 0; x < 500; x += 7) {
    for (let t = 0; t < 200; t += 13) {
      assert.ok(Math.abs(surfaceOffset(x, t, [])) <= WATER_WAVE_AMPLITUDE + 1e-9);
    }
  }
  const ripples = [{ x: 100, strength: 4 }];
  const near = Math.abs(surfaceOffset(100, 0, ripples));
  const far = Math.abs(surfaceOffset(400, 0, ripples));
  assert.ok(near > far);
});

test('world pass transfers the water cache once and draws one surface path', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'createLinearGradient' || c.name === 'createRadialGradient').length, 0);
});

test('ripples fade every update', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  env.renderer.addRipple(50, 4);
  const s0 = env.renderer.ripples[0].strength;
  env.update();
  assert.ok(Math.abs(env.renderer.ripples[0].strength - s0 * WATER_RIPPLE_DECAY) < 1e-9);
});

test('surface line is thin and the wave is fine', async () => {
  const { WATER_WAVE_LENGTH, WATER_WAVE_AMPLITUDE, WATER_SURFACE_LINE_WIDTH } = await import('../src/js/utils/Constants.js');
  // 実機の指摘: 波は細かく、線は細く淡く。設計時の 48 / 2.5 / 2 から下げた値を固定する
  assert.ok(WATER_WAVE_LENGTH <= 24, `wave length ${WATER_WAVE_LENGTH}`);
  assert.ok(WATER_WAVE_AMPLITUDE <= 1.5, `amplitude ${WATER_WAVE_AMPLITUDE}`);
  assert.equal(WATER_SURFACE_LINE_WIDTH, 1);

  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  const widths = ctx.calls.filter((c) => c.name === 'set:lineWidth').map((c) => c.args[0]);
  assert.deepEqual(widths, [WATER_SURFACE_LINE_WIDTH]);
});

test('drawBehindTerrain transfers the behind water cache once', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawBehindTerrain(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
});

test('collectBorderBlocks extracts 8-neighbor solid blocks around water cells', async () => {
  const { collectBorderBlocks } = await import('../src/js/world/environment/water.js');
  // 3x3 のマップ: 中央 (1,1) が水、(0,0) と (1,0) が岩ブロック
  const map = {
    rows: 3,
    cols: 3,
    isWater(r, c) { return r === 1 && c === 1; },
    isSolid(r, c) { return (r === 0 && c === 0) || (r === 1 && c === 0); },
  };
  const waterCells = [[1, 1]];
  const border = collectBorderBlocks(map, waterCells);
  // (0,0) は斜め隣接、(1,0) は横隣接。両方とも岩ブロックなので境界ブロックとして抽出される
  assert.equal(border.length, 2);
  const keys = border.map(([r, c]) => `${r},${c}`).sort();
  assert.deepEqual(keys, ['0,0', '1,0']);
});

test('isFullWaterBlock returns true only for full non-surface non-waterfall cells', async () => {
  const { isFullWaterBlock } = await import('../src/js/world/environment/water.js');
  const { MAX_WATER_MASS } = await import('../src/js/utils/Constants.js');
  const map = {
    rows: 4,
    cols: 4,
    water: new Float32Array(16),
    isWater(r, c) { return this.water[r * 4 + c] > 0; },
    isWaterSurface(r, c) { return r === 1 && c === 1; },
    isWaterfallCell(r, c) { return r === 2 && c === 1; },
  };
  // (1,1): 水面（MAX_WATER_MASS だが水面判定） -> false
  map.water[1 * 4 + 1] = MAX_WATER_MASS;
  assert.equal(isFullWaterBlock(map, 1, 1), false);

  // (2,1): 滝セル（MAX_WATER_MASS だが滝判定） -> false
  map.water[2 * 4 + 1] = MAX_WATER_MASS;
  assert.equal(isFullWaterBlock(map, 2, 1), false);

  // (3,1): 水量が満タン未満（MAX_WATER_MASS * 0.5） -> false
  map.water[3 * 4 + 1] = MAX_WATER_MASS * 0.5;
  assert.equal(isFullWaterBlock(map, 3, 1), false);

  // (3,2): 満水水中セル（MAX_WATER_MASS、水面でも滝でもない） -> true
  map.water[3 * 4 + 2] = MAX_WATER_MASS;
  assert.equal(isFullWaterBlock(map, 3, 2), true);
});

test('invalidate clears behindCache when adjacent water drops or disappears', async () => {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const { MAX_WATER_MASS } = await import('../src/js/utils/Constants.js');
  // 3x3 マップ:
  // (0,0)=岩, (0,1)=岩, (0,2)=岩
  // (1,0)=岩, (1,1)=水(最初は満水), (1,2)=岩
  // (2,0)=岩, (2,1)=岩, (2,2)=岩
  const map = {
    rows: 3,
    cols: 3,
    width: 48,
    height: 48,
    water: new Float32Array(9),
    waterCells: [[1, 1]],
    isWater(r, c) { return this.water[r * 3 + c] > 0; },
    isSolid(r, c) { return !(r === 1 && c === 1); },
    isWaterSurface(r, c) { return false; },
    isWaterfallCell(r, c) { return false; },
  };
  map.water[1 * 3 + 1] = MAX_WATER_MASS;

  const fakeEnv = { game: { map } };
  const clearRectCalls = [];
  const fillRectCalls = [];
  const origCreateElement = document.createElement;
  document.createElement = function(tag) {
    const el = origCreateElement.call(document, tag);
    if (tag === 'canvas') {
      const origGetContext = el.getContext;
      el.getContext = function(type) {
        const ctx = origGetContext.call(el, type);
        const origClear = ctx.clearRect;
        const origFill = ctx.fillRect;
        ctx.clearRect = function(...args) {
          clearRectCalls.push(args);
          return origClear.apply(ctx, args);
        };
        ctx.fillRect = function(...args) {
          fillRectCalls.push(args);
          return origFill.apply(ctx, args);
        };
        return ctx;
      };
    }
    return el;
  };

  let renderer;
  try {
    renderer = createWaterRenderer(fakeEnv);
  } finally {
    document.createElement = origCreateElement;
  }

  // 初期化時の呼び出しをリセット
  clearRectCalls.length = 0;
  fillRectCalls.length = 0;

  // 今、(1,1) の水が抜けて水位が 0 になったとする
  map.water[1 * 3 + 1] = 0;

  // invalidate を呼び出す
  renderer.invalidate([[1, 1]]);

  // invalidate で、岩ブロック (1,0) (x=0, y=16) および (0,0), (0,1), etc. の背後が clearRect されること
  const cleared10 = clearRectCalls.some(([x, y, w, h]) => x === 0 && y === 16 && w === 16 && h === 16);
  assert.equal(cleared10, true, '岩ブロック (1,0) の背後が clearRect されること');

  // 水位が 0 になり周囲に満水ブロックがないので、(1,0) に fillRect（下層水の再描画）は呼ばれないこと
  const filled10 = fillRectCalls.some(([x, y, w, h]) => x === 0 && y === 16 && w === 16 && h === 16);
  assert.equal(filled10, false, '岩ブロック (1,0) に下層水が再描画されないこと');
});


test('水塊の塗りの上端は、どの列でも水面の線と一致する（塗りが段々にならない）', async () => {
  // 実機のスクリーンショットの指摘。液面をひとつに揃えても、塗りが各セルの
  // タイルの中でしか描けないと、水面が1段下にある列で上端がタイルの上辺で
  // 頭打ちになり「線は平らなのに塗りが段々」になっていた（線 73px に対し
  // 塗り 80px）。液面は水塊にひとつなので、水量が届いていない列でも
  // 液面まで塗る。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  // 左半分は水面が行5、右半分は水が1段多くて水面が行4。つながった1つの水たまり
  const map = makeWaterMap(`
    ##############
    #............#
    #............#
    #............#
    #.......88888#
    #.8888888888.#
    ##############
  `);

  const fills = [];
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const ctx = makeFakeCtx();
    const orig = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { fills.push({ x, y, w, h }); return orig(x, y, w, h); };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  try {
    createWaterRenderer({ game: { map } });
  } finally {
    globalThis.document.createElement = origCreateElement;
  }

  // 列ごとの塗りの上端
  const topByCol = new Map();
  for (const f of fills) {
    if (f.h <= 0) continue;
    const c = Math.floor(f.x / TILE_SIZE);
    const cur = topByCol.get(c);
    if (cur === undefined || f.y < cur) topByCol.set(c, f.y);
  }

  for (let c = 2; c <= 12; c++) {
    let lineY = null;
    for (let r = 0; r < map.rows; r++) {
      if (map.isWaterSurface(r, c)) { lineY = map.getSurfaceY(r, c); break; }
    }
    assert.notEqual(lineY, null, `列 ${c} に水面があるはず`);
    assert.equal(topByCol.get(c), lineY,
      `列 ${c}: 塗りの上端 ${topByCol.get(c)} が水面の線 ${lineY} と違う（塗りが段になっている）`);
  }
});
