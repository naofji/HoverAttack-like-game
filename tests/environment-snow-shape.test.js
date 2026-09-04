// 5面（積雪）だけタイルの「形」を変えることを縛るテスト。
// 当たり判定は四角のままで、絵だけを 45度の坂／くの字の三角にする。
// 他の面（envKind !== 'snow'）は今までどおり小さな面取りのままであること。
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

// 右上がりの階段: (2,1) が段。上(1,1)空、左(2,0)空、下(3,1)岩、右上(1,2)岩
const STAIRS = ['....', '..##', '.###', '####'];

test('on the snow stage a stair step is drawn as a half-tile triangle (45° ramp)', async () => {
  const m = await blockDrawer(STAIRS, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx);
  // 斜辺の両端（右上と左下）が頂点にあり、左上の角 (x, y) は無い
  assert.ok(pts.some(([px, py]) => px === x + S && py === y), 'top-right vertex');
  assert.ok(pts.some(([px, py]) => px === x && py === y + S), 'bottom-left vertex');
  assert.ok(!pts.some(([px, py]) => px === x && py === y), 'top-left corner must be cut away');
  // 面取りが対角線いっぱいであること（上辺も左辺も残っていない）。
  // 半分だけの面取りでも上の3つは通ってしまうので、辺の消滅まで縛る
  assert.ok(pts.every(([px, py]) => py !== y || px === x + S), `top edge must be gone: ${JSON.stringify(pts)}`);
  assert.ok(pts.every(([px, py]) => px !== x || py === y + S), `left edge must be gone: ${JSON.stringify(pts)}`);
  // 積雪の帯は斜辺に沿う stroke
  const stroked = ctx.calls.some((c) => c.name === 'set:strokeStyle' && c.args[0] === SNOW_CAP_COLOR);
  assert.ok(stroked, 'snow band along the hypotenuse');
});

// 左上がりの階段（鏡像）: (2,2) が段。上(1,2)空、右(2,3)空、下(3,2)岩、左上(1,1)岩
const STAIRS_MIRROR = ['....', '##..', '###.', '####'];

test('the mirrored stair step cuts the top-right corner instead', async () => {
  const m = await blockDrawer(STAIRS_MIRROR, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 2, BLOCK_NORMAL);
  const x = 2 * TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx);
  assert.ok(pts.some(([px, py]) => px === x && py === y), 'top-left vertex kept');
  assert.ok(pts.some(([px, py]) => px === x + S && py === y + S), 'bottom-right vertex');
  // 上辺が残っていないこと（小さい面取りだと (x+S-c, y) が残る）
  assert.ok(pts.every(([px, py]) => py !== y || px === x), `top edge must be gone: ${JSON.stringify(pts)}`);
});

test('on a non-snow stage the same step keeps the small chamfer', async () => {
  const m = await blockDrawer(STAIRS, 'none');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE;
  const pts = basePolygon(ctx);
  // 小さい面取り: 上辺の左端は x+4..x+9 の範囲
  const topLeft = pts[0];
  assert.ok(topLeft[0] > x && topLeft[0] < x + 10 && topLeft[1] === y, `chamfer ${topLeft}`);
});

/** 頂点列を順序に依存しない集合として比べる（時計回りの開始点は実装の都合）。 */
function pointSet(pts) {
  return new Set(pts.map(([px, py]) => `${px},${py}`));
}

// 板状の突出: (1,1) は上下と左が露出、右(1,2)は岩
const PLATE = ['....', '.###', '....', '####'];

test('on the snow stage a 1-high plate tip is a triangle: attached edge as base, apex at the tile centre', async () => {
  const m = await blockDrawer(PLATE, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 1, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx);
  // 岩に接しているのは右辺。底辺＝右辺、頂点＝タイル中心のちょうど3頂点
  assert.equal(pts.length, 3, `exactly 3 vertices, got ${JSON.stringify(pts)}`);
  assert.deepEqual(
    pointSet(pts),
    pointSet([[x + S, y], [x + S, y + S], [x + S / 2, y + S / 2]]),
    `attached-edge corners + centre, got ${JSON.stringify(pts)}`
  );
  // 露出している左辺の上には頂点が1つも無い（先が尖っている）
  assert.ok(pts.every(([px]) => px !== x), 'no vertex on the exposed edge');
  // 坂ではないので斜辺に沿う帯は引かない
  const strokedBand = ctx.calls.some((c) => c.name === 'set:strokeStyle' && c.args[0] === SNOW_CAP_COLOR);
  assert.equal(strokedBand, false, 'a plate tip is not a ramp: no diagonal band');
});

// 鏡像の板状の突出: (1,2) は上下と右が露出、左(1,1)は岩
const PLATE_MIRROR = ['....', '###.', '....', '####'];

test('the mirrored plate tip is the mirrored triangle (base on the left edge)', async () => {
  const m = await blockDrawer(PLATE_MIRROR, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 1, 2, BLOCK_NORMAL);
  const x = 2 * TILE_SIZE, y = TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx);
  assert.equal(pts.length, 3, `exactly 3 vertices, got ${JSON.stringify(pts)}`);
  assert.deepEqual(
    pointSet(pts),
    pointSet([[x, y], [x, y + S], [x + S / 2, y + S / 2]]),
    `attached-edge corners + centre, got ${JSON.stringify(pts)}`
  );
  assert.ok(pts.every(([px]) => px !== x + S), 'no vertex on the exposed edge');
});
