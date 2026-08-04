import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, FAR_BG_PARALLAX,
} from '../src/js/utils/Constants.js';

/** 生成した疑似 canvas を記録しておき、テストから ctx を覗けるようにする。 */
let lastFakeCanvas = null;

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ctx,
        _ctx: ctx,
      };
      lastFakeCanvas = canvas;
      return canvas;
    },
  };
});

function makeBackdrop(BackdropClass, mapW, mapH, seed = 1) {
  return new BackdropClass(mapW, mapH, '#8B4513', new SeededRNG(seed));
}

test('parallax factor constant is 0.25', () => {
  assert.equal(FAR_BG_PARALLAX, 0.25);
});

test('backdrop canvas is sized for the smallest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  assert.equal(bd.width, 1368);
  assert.equal(bd.height, 891);
  assert.equal(bd.canvas.width, 1368);
  assert.equal(bd.canvas.height, 891);
});

test('backdrop canvas is sized for the largest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 4800, 2400);
  assert.equal(bd.width, 1968);
  assert.equal(bd.height, 1191);
});

test('source rect exactly spans the canvas across the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // camXmin = 0, camXmax = 1376 / camYmin = -60, camYmax = 432
  assert.equal(bd.sourceX(0), 0);
  assert.equal(bd.sourceX(1376), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-60), 0);
  assert.equal(bd.sourceY(432), bd.height - CANVAS_HEIGHT);
});

test('source rect is an integer for fractional camera positions', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // floor(500.7 * 0.25) = floor(125.175) = 125
  assert.equal(bd.sourceX(500.7), 125);
  // floor((100.3 - (-60)) * 0.25) = floor(40.075) = 40
  assert.equal(bd.sourceY(100.3), 40);
});

test('source rect clamps outside the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  assert.equal(bd.sourceX(-9999), 0);
  assert.equal(bd.sourceX(9999), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-9999), 0);
  assert.equal(bd.sourceY(9999), bd.height - CANVAS_HEIGHT);
});

test('draw issues exactly one drawImage with the parallax source rect', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  const ctx = makeFakeCtx();
  bd.draw(ctx, 500.7, 100.3);

  const draws = ctx.calls.filter((c) => c.name === 'drawImage');
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].args, [
    bd.canvas,
    125, 40, CANVAS_WIDTH, CANVAS_HEIGHT,   // 転送元 (整数化済み)
    500.7, 100.3, CANVAS_WIDTH, CANVAS_HEIGHT, // 転送先 = ワールド座標
  ]);
});

/** beginPath 〜 fill の間の moveTo/lineTo を1枚の多角形として取り出す。 */
function extractFilledPolygons(calls) {
  const out = [];
  let current = null;
  for (const c of calls) {
    if (c.name === 'beginPath') current = [];
    else if (current && (c.name === 'moveTo' || c.name === 'lineTo')) {
      current.push({ x: c.args[0], y: c.args[1] });
    } else if (c.name === 'fill' && current) {
      out.push(current);
      current = null;
    }
  }
  return out;
}

// 遠景は前景と同じ描画言語で描く必要がある。前景 (Map._drawRockyBlock) は
// 面取り多角形のフラット塗りだけを使い、グラデーションも 1-2px の粒も持たない。
// 遠景がそこから外れると、ドット絵の前景に対して遠景だけ浮いて見える。

test('generation uses only flat fills — no gradients', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  makeBackdrop(CaveBackdrop, 2400, 1200);
  const calls = lastFakeCanvas._ctx.calls;

  const nonStringFills = calls.filter(
    (c) => c.name === 'set:fillStyle' && typeof c.args[0] !== 'string'
  );
  assert.deepEqual(
    nonStringFills.map((c) => c.args[0] && c.args[0].type),
    [],
    'fillStyle must only ever receive flat color strings, never a gradient object'
  );
});

test('generation draws a base fill plus a handful of large polygons', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  const calls = lastFakeCanvas._ctx.calls;

  // 全面の地色塗り1回だけ。点描のような大量の小矩形があってはならない。
  const rects = calls.filter((c) => c.name === 'fillRect');
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0].args, [0, 0, bd.width, bd.height]);

  // 岩は「少数の大きな多角形」。数千の細片ではない。
  const polygons = extractFilledPolygons(calls);
  assert.ok(polygons.length >= 2, `expected at least 2 rock polygons, got ${polygons.length}`);
  assert.ok(polygons.length <= 16, `expected at most 16 rock polygons, got ${polygons.length}`);
});

test('rock shapes are much larger than a foreground tile', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const { TILE_SIZE } = await import('../src/js/utils/Constants.js');
  makeBackdrop(CaveBackdrop, 2400, 1200);

  // 遠景ほど形は大きく単純に見える。前景タイル(16px)と同程度の細片が混ざると
  // 「遠くにある」と読めなくなる。
  const MIN_SPAN = TILE_SIZE * 4;
  for (const poly of extractFilledPolygons(lastFakeCanvas._ctx.calls)) {
    const xs = poly.map((p) => p.x);
    const width = Math.max(...xs) - Math.min(...xs);
    assert.ok(width >= MIN_SPAN, `polygon spans only ${width}px, below ${MIN_SPAN}px`);
  }
});

test('generation never uses globalAlpha', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  makeBackdrop(CaveBackdrop, 2400, 1200);
  const sets = lastFakeCanvas._ctx.calls.filter((c) => c.name === 'set:globalAlpha');
  assert.equal(sets.length, 0);
});

test('same seed and palette produce an identical backdrop', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const a = JSON.stringify(lastFakeCanvas._ctx.calls);
  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const b = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.equal(a, b);
});

test('different palettes produce different colors', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const rngA = new SeededRNG(7);
  const rngB = new SeededRNG(7);

  new CaveBackdrop(2400, 1200, '#8B4513', rngA); // ステージ1: 茶
  const brown = JSON.stringify(lastFakeCanvas._ctx.calls);
  new CaveBackdrop(2400, 1200, '#4682B4', rngB); // ステージ5: 青
  const blue = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.notEqual(brown, blue);
});

/** Map 生成用の軽量 DOM スタブ。呼び出しを記録しないので大きなマップでも軽い。 */
function withNoopDocument(fn) {
  const saved = globalThis.document;
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
  try {
    return fn();
  } finally {
    globalThis.document = saved;
  }
}

test('Map owns a backdrop sized for its own dimensions', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  const map = withNoopDocument(() => new Map({ rng: new SeededRNG(99) }, 0)); // 最小マップ
  assert.ok(map.backdrop instanceof CaveBackdrop, 'map.backdrop should exist');
  assert.equal(map.backdrop.width, 1368);
  assert.equal(map.backdrop.height, 891);
});

test('Map builds the backdrop from the same stage palette as its blocks', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { BLOCK_NORMAL, STAGE_PALETTES } = await import('../src/js/utils/Constants.js');

  const level = 4; // STAGE_PALETTES[4] = '#4682B4'
  const map = withNoopDocument(() => new Map({ rng: new SeededRNG(5) }, level));
  assert.equal(map.backdrop.paletteFill, map.blockStyles[BLOCK_NORMAL].fill);
  assert.equal(map.backdrop.paletteFill, STAGE_PALETTES[level].fill);
});

test('backdrop generation does not perturb the shared game.rng stream (regression)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  const seed = 12345;

  // Run 1: backdrop generates normally (thousands of draws against ITS OWN rng).
  const game1 = { rng: new SeededRNG(seed) };
  withNoopDocument(() => new Map(game1, 0));
  const stateAfterFullBackdrop = game1.rng.state;

  // Run 2: stub the backdrop's pixel generation to a no-op, so it performs
  // zero rng draws, while Map still constructs a CaveBackdrop the same way.
  const originalGenerate = CaveBackdrop.prototype._generate;
  CaveBackdrop.prototype._generate = function () {};
  let stateAfterEmptyBackdrop;
  try {
    const game2 = { rng: new SeededRNG(seed) };
    withNoopDocument(() => new Map(game2, 0));
    stateAfterEmptyBackdrop = game2.rng.state;
  } finally {
    CaveBackdrop.prototype._generate = originalGenerate;
  }

  // Terrain generation ahead of the backdrop step is identical in both runs
  // (same seed, same missionLevel). If Map correctly hands the backdrop a
  // DERIVED rng stream, then whether the backdrop's own generation draws 0
  // or thousands of numbers has zero effect on game.rng's state. If Map
  // instead passes game.rng straight through (the bug), the two states
  // diverge because run 1 additionally drains ~11,900 draws from game.rng.
  assert.equal(
    stateAfterFullBackdrop, stateAfterEmptyBackdrop,
    'backdrop generation must not consume the shared game.rng stream'
  );
});

// --- 階調 ---
// 遠景は「目立たないが構造は読める」ことが要件。両側に外れると壊れる:
// 暗くしすぎれば黒一色に潰れ (実際に一度そうなった)、明るくしすぎれば
// 前景のシルエットと競合する。3階調の並びと最小/最大の差を固定する。

/** ITU-R BT.709 相対輝度 (0-255)。 */
function luminance(hex) {
  const s = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('backdrop tones are ordered void < rockDark < rockLight', async () => {
  const { backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const { STAGE_PALETTES } = await import('../src/js/utils/Constants.js');

  for (const palette of STAGE_PALETTES) {
    const { voidColor, rockDark, rockLight } = backdropColors(palette.fill);
    assert.ok(
      luminance(voidColor) < luminance(rockDark) && luminance(rockDark) < luminance(rockLight),
      `tones out of order for ${palette.fill}: `
      + `${luminance(voidColor).toFixed(1)} / ${luminance(rockDark).toFixed(1)} / ${luminance(rockLight).toFixed(1)}`
    );
  }
});

test('backdrop reads as dark rock: structure visible but never competing with the foreground', async () => {
  const { backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const { STAGE_PALETTES } = await import('../src/js/utils/Constants.js');

  const MIN_VOID = 3;          // 完全な黒ではない
  const MIN_STRUCTURE = 6;     // 岩と空洞の差がこれ未満だと黒一色に見える
  const MAX_STRUCTURE = 30;    // これを超えると遠景が主張しすぎる
  const MAX_VS_FOREGROUND = 0.45; // 前景ブロックに対する遠景最明部の輝度比

  for (const palette of STAGE_PALETTES) {
    const { voidColor, rockLight } = backdropColors(palette.fill);
    const structure = luminance(rockLight) - luminance(voidColor);

    assert.ok(luminance(voidColor) >= MIN_VOID,
      `void ${voidColor} for ${palette.fill} is effectively pure black`);
    assert.ok(structure >= MIN_STRUCTURE,
      `structure contrast ${structure.toFixed(1)} for ${palette.fill} is below ${MIN_STRUCTURE}`);
    assert.ok(structure <= MAX_STRUCTURE,
      `structure contrast ${structure.toFixed(1)} for ${palette.fill} exceeds ${MAX_STRUCTURE}`);
    assert.ok(luminance(rockLight) <= luminance(palette.fill) * MAX_VS_FOREGROUND,
      `rockLight ${rockLight} is too close to foreground block ${palette.fill}`);
  }
});
