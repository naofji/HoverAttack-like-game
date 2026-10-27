// 5面（積雪）の地形の絵が、当たり判定と同じタイルの形（utils/tileShape.js）で描かれることを縛る
// 小さな例。本物の地図の全タイルでの一致は snow-drawing-matches-shape.test.js が見る。
// 他の面（形の規則が 'square'）は今までどおり乱数の小さな面取り（4〜9px）のままであること。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, BLOCK_NORMAL, BLOCK_EMPTY, SNOW_CAP_COLOR } from '../src/js/utils/Constants.js';

before(() => {
  // Map.js の import 時にキャンバスを触られても落ちないように
  globalThis.document = globalThis.document || {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

/** Map を生成せずに _drawRockyBlock だけを呼ぶための最小の Map もどき。 */
async function blockDrawer(rows, envKind) {
  const { Map } = await import('../src/js/world/Map.js');
  const grid = rows.map((s) => s.split('').map((ch) => (ch === '#' ? BLOCK_NORMAL : BLOCK_EMPTY)));
  const m = Object.create(Map.prototype);
  m.grid = grid; m.rows = grid.length; m.cols = grid[0].length; m.envKind = envKind;
  m.blockStyles = { [BLOCK_NORMAL]: { fill: '#8B4513', border: '#5c2e0b' } };
  m.tileShapeRule = envKind === 'snow' ? 'snowSlope' : 'square';
  m._buildTileShapes();
  m.exposedAtGen = new Uint8Array(m.rows * m.cols);
  for (let r = 1; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (grid[r][c] !== BLOCK_EMPTY && grid[r - 1][c] === BLOCK_EMPTY) m.exposedAtGen[r * m.cols + c] = 1;
    }
  }
  return m;
}

/** 最初の beginPath..closePath の頂点列（ベースの多角形）。 */
function basePolygon(ctx) {
  const pts = [];
  let inPath = false;
  for (const c of ctx.calls) {
    if (c.name === 'beginPath') { if (pts.length) break; inPath = true; continue; }
    if (!inPath) continue;
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(c.args);
    if (c.name === 'closePath') break;
  }
  return pts;
}

/** 頂点列を順序に依存しない集合として比べる（時計回りの開始点・重なった頂点は実装の都合）。 */
function pointSet(pts) {
  return new Set(pts.map(([px, py]) => `${px},${py}`));
}

/** 雪のふちの stroke が通る点 */
function snowCapPath(ctx) {
  const i = ctx.calls.findIndex((c) => c.name === 'set:strokeStyle' && c.args[0] === SNOW_CAP_COLOR);
  if (i < 0) return null;
  const pts = [];
  for (const c of ctx.calls.slice(i)) {
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(c.args);
    if (c.name === 'stroke') break;
  }
  return pointSet(pts);
}

// 右上がりの階段: (2,1) が段。上(1,1)空、左(2,0)空、下(3,1)岩、左下(3,0)岩
const STAIRS = ['....', '..##', '.###', '####'];

test('5面では階段の段がタイル1枚ぶんの斜め（45度の坂）に描かれ、雪のふちも斜辺に沿う', async () => {
  const m = await blockDrawer(STAIRS, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  assert.deepEqual(pointSet(basePolygon(ctx)), pointSet([[x + S, y], [x + S, y + S], [x, y + S]]));
  const cap = snowCapPath(ctx);
  assert.ok(cap && cap.has(`${x},${y + S}`) && cap.has(`${x + S},${y}`), 'snow band along the hypotenuse');
});

// 左上がりの階段（鏡像）: (2,2) が段
const STAIRS_MIRROR = ['....', '##..', '###.', '####'];

test('鏡像の階段の段は右上を斜めに削る', async () => {
  const m = await blockDrawer(STAIRS_MIRROR, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 2, BLOCK_NORMAL);
  const x = 2 * TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  assert.deepEqual(pointSet(basePolygon(ctx)), pointSet([[x, y], [x + S, y + S], [x, y + S]]));
});

// 階段の一番下の段: 露出している左側の下 (3,0) が空で、段が続かない → 8px の小さい面取り
const END_STEP = ['....', '..##', '.###', '.###'];

test('段が続かない角は 8px の小さい面取り（判定と同じ幅。乱数の幅ではない）', async () => {
  const m = await blockDrawer(END_STEP, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  assert.deepEqual(pointSet(basePolygon(ctx)), pointSet([[x + 8, y], [x + S, y], [x + S, y + S], [x, y + S], [x, y + 8]]));
  const cap = snowCapPath(ctx);
  assert.ok(cap && cap.has(`${x},${y + 8}`) && cap.has(`${x + 8},${y}`), 'snow band follows the chamfer');
});

test('生成時に埋まっていた（掘って出た）上面には雪のふちを描かない', async () => {
  const m = await blockDrawer(STAIRS, 'snow');
  m.exposedAtGen.fill(0);
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  assert.ok(basePolygon(ctx).some(([px, py]) => px === x + S && py === y), 'still a ramp');
  const banded = ctx.calls.some((c) => (c.name === 'set:strokeStyle' || c.name === 'set:fillStyle') && c.args[0] === SNOW_CAP_COLOR);
  assert.equal(banded, false, 'no snow on a top exposed by digging');
});

test('5面以外では同じ段も乱数の小さな面取り（4〜9px）のまま', async () => {
  const m = await blockDrawer(STAIRS, 'none');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE;
  const topLeft = basePolygon(ctx)[0];
  assert.ok(topLeft[0] > x && topLeft[0] < x + 10 && topLeft[1] === y, `chamfer ${topLeft}`);
});

// 浮いた2ブロックの板: (1,1)(1,2)
const PLATE = ['....', '.##.', '....', '####'];

test('5面の浮いた板の左は「<=」: 左の上下を 8px 面取りした5角形', async () => {
  const m = await blockDrawer(PLATE, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 1, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = TILE_SIZE, S = TILE_SIZE;
  assert.deepEqual(pointSet(basePolygon(ctx)), pointSet([[x + 8, y], [x + S, y], [x + S, y + S], [x + 8, y + S], [x, y + 8]]));
});

test('板の左を壊すと、右は位置を変えずに菱形「<>」になる（設計 決定2）', async () => {
  const m = await blockDrawer(PLATE, 'snow');
  m.grid[1][1] = BLOCK_EMPTY;
  m._buildTileShapes();
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 1, 2, BLOCK_NORMAL);
  const x = 2 * TILE_SIZE, y = TILE_SIZE, S = TILE_SIZE;
  assert.deepEqual(pointSet(basePolygon(ctx)), pointSet([[x + 8, y], [x + S, y + 8], [x + 8, y + S], [x, y + 8]]));
});
