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

test('collectBorderBlocks は水に接する岩を集めるが、液面より上の岩は集めない', async () => {
  const { collectBorderBlocks } = await import('../src/js/world/environment/water.js');
  // 3x3 のマップ: 中央 (1,1) が満水、(0,0) と (1,0) が岩ブロック
  const map = makeWaterMap(`
    #..
    #8.
    ...
  `);
  const border = collectBorderBlocks(map, [[1, 1]]);
  // (1,0) は水と同じ行なので背後を埋める必要がある。(0,0) は水面(y=16)より
  // 完全に上のタイルなので、面取りの隙間は水の外＝埋めてはいけない
  assert.deepEqual(border.map(([r, c]) => `${r},${c}`).sort(), ['1,0']);
});

test('waterBackdropTopY は隣の水の液面から下だけを埋める（水際の岩が黒く抜けない）', async () => {
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const { TILE_SIZE } = await import('../src/js/utils/Constants.js');
  // 4x4。列2が水で、液面は行1の途中 y=26（行1のタイルは 16..32）
  const cols = 4;
  const surfaceY = new Int16Array(16).fill(-1);
  surfaceY[1 * cols + 2] = 26;
  surfaceY[2 * cols + 2] = 26;
  const water = new Uint8Array(16);
  water[1 * cols + 2] = 3;
  water[2 * cols + 2] = 8;
  const map = {
    rows: 4, cols, water, waterSurfaceY: surfaceY,
    isWater(r, c) { return water[r * cols + c] > 0; },
    isSolid(r, c) { return c !== 2; },
    isWaterfallCell() { return false; },
  };
  // 水際の岩 (1,1): 液面 26 から下だけ。以前はここが「隣が満水でない」として
  // 1ドットも塗られず、面取りの角が黒く抜けていた（実機の指摘）
  assert.equal(waterBackdropTopY(map, 1, 1), 26);
  // 水中の岩 (2,1): 液面はタイルより上なのでタイルの上辺から
  assert.equal(waterBackdropTopY(map, 2, 1), 2 * TILE_SIZE);
  // 液面より完全に上の岩 (0,1): 埋めない
  assert.equal(waterBackdropTopY(map, 0, 1), -1);
  // 水から離れた岩: 埋めない
  assert.equal(waterBackdropTopY(map, 3, 0), -1);
});

test('滝の帯は岩の背後を埋める根拠にしない（帯は細いので周りは水ではない）', async () => {
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const cols = 3;
  const water = new Uint8Array(9);
  water[1 * cols + 1] = 2;
  const map = {
    rows: 3, cols, water, waterSurfaceY: new Int16Array(9).fill(-1),
    isWater(r, c) { return water[r * cols + c] > 0; },
    isSolid(r, c) { return c !== 1; },
    isWaterfallCell(r, c) { return r === 1 && c === 1; },
  };
  assert.equal(waterBackdropTopY(map, 1, 0), -1);
});

test('invalidate clears behindCache when adjacent water drops or disappears', async () => {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const { MAX_WATER_MASS } = await import('../src/js/utils/Constants.js');
  // 3x3 マップ: 中央 (1,1) だけが満水で、周りは全部岩
  const map = makeWaterMap(`
    ###
    #${MAX_WATER_MASS}#
    ###
  `);

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

  // 今、(1,1) の水が抜けて水位が 0 になったとする（本番では onWaterChanged が
  // キャッシュを dirty にしてから invalidate を呼ぶので、その順を再現する）
  map.water[1 * 3 + 1] = 0;
  map.refresh();

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

test('浮いた岩の真下の浅い水は、実際の水量ぶんだけ浅く塗る（水面が岩に吸い付かない）', async () => {
  // 実機のスクリーンショットの指摘。浅い湖の途中に浮いた岩（下は水でつながっている）
  // があると、その真下のセルは「天井付き＝水面を持たない」扱いになり、実際の
  // 水量に関わらずタイル全体を塗っていた。浅い湖（水量4/8）で水面が半分の高さ
  // なのに、岩の真下だけタイル全体まで塗られ、水面が岩に吸い付いたように見える。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  // 行4が水面の行。列4-7に浮いた岩(行0-3)があり、その真下(行4)もつながった
  // 同じ浅い水たまり（水量4=半分）。行5以降は満水。
  const map = makeWaterMap(`
    ............
    ....####....
    ....####....
    ....####....
    44444444444.
    88888888888.
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

  // 列ごとの、行4のタイル内での塗りの上端
  const topByCol = new Map();
  for (const f of fills) {
    if (f.h <= 0) continue;
    if (f.y < 4 * TILE_SIZE || f.y >= 5 * TILE_SIZE) continue; // 行4のタイル範囲だけ見る
    const c = Math.floor(f.x / TILE_SIZE);
    const cur = topByCol.get(c);
    if (cur === undefined || f.y < cur) topByCol.set(c, f.y);
  }

  // 水面(列0-3)の塗りの上端
  const surfaceTop = topByCol.get(1);
  assert.notEqual(surfaceTop, undefined, '水面側に塗りがあるはず');
  assert.ok(surfaceTop > 4 * TILE_SIZE, '前提: 水量4/8なので満タンより浅いはず');

  // 岩の真下(列4-7、水量は同じ4)も、同じ高さから塗られるべき
  for (let c = 4; c <= 7; c++) {
    assert.equal(topByCol.get(c), surfaceTop,
      `列${c}(岩の真下)の塗りの上端 ${topByCol.get(c)} が水面側 ${surfaceTop} と違う（吸い付いている）`);
  }
});

test('沈んだ岩の真下は、水量が満タンに届いていなくてもタイル全体を塗る', async () => {
  // 上のテストの裏返し。浮いた岩（上が空気）の下は水量ぶんだけ浅く塗るのが
  // 正しいが、**沈んだ岩**（上にも水がある）の下をそれでやると、量子化で
  // 1つ足りないだけのセルに透明な帯が残り、岩の真下に黒い線が見える。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  const map = makeWaterMap(`
    ............
    88888888888.
    8888####888.
    88887777888.
    88888888888.
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

  for (let c = 4; c <= 7; c++) {
    const inTile = fills.filter((f) => f.h > 0
      && Math.floor(f.x / TILE_SIZE) === c
      && f.y >= 3 * TILE_SIZE && f.y < 4 * TILE_SIZE);
    assert.ok(inTile.length > 0, `列${c} の行3 に塗りが無い`);
    const top = Math.min(...inTile.map((f) => f.y));
    assert.equal(top, 3 * TILE_SIZE,
      `列${c}(沈んだ岩の真下, 水量7/8) の塗りがタイル上辺から始まっていない: ${top}`);
  }
});

test('沈んだ浅いセルの隣の岩は、前景の塗りと同じ高さ（タイルの上辺）から背後を埋める', async () => {
  // 塗り（paint）は「沈んでいる＝覆う岩の上にも水がある」セルをタイル全体で塗るのに、
  // 背後の水（waterBackdropTopY）は沈み判定を持たず水量ぶんの高さから敷いていた。
  // 水量7だと 2px ずれて、面取りの角が黒く抜ける。塗りの上端の決め方を1つにする
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const { TILE_SIZE } = await import('../src/js/utils/Constants.js');
  const map = makeWaterMap(`
    #...#
    #888#
    #####
    ##7##
    #####
  `);
  assert.equal(map.waterSurfaceY[3 * map.cols + 2], -1, '前提: (3,2) は液面を持たない（天井付き）');
  // (3,1) の岩にとって、水に接しているのは (3,2) だけ
  assert.equal(waterBackdropTopY(map, 3, 1), 3 * TILE_SIZE);
});
