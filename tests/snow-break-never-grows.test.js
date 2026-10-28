// 本物の5面の地図で、ブロックを壊しても周りのタイルの岩が増えず、壊した後にだけ出る三角（^ v < >）も
// 絵の輪郭・雪のふちが判定の形と一致することを縛る（設計 決定13）。純関数の側は tile-shape-after-break.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as S, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, SNOW_CAP_COLOR } from '../src/js/utils/Constants.js';
import { shapeContainsPoint, shapeCornerCuts } from '../src/js/utils/tileShape.js';

before(() => {
  globalThis.document = {
    createElement: () => { const ctx = makeFakeCtx(); return { width: 0, height: 0, getContext: () => ctx }; },
  };
});

// 点は斜辺の上に乗らないよう半端をずらす
const PTS = [];
for (let y = 0.375; y < S; y += 0.5) for (let x = 0.25; x < S; x += 0.5) PTS.push([x, y]);
const area = (code) => PTS.filter(([x, y]) => shapeContainsPoint(code, x, y)).length;
const within = (a, b) => PTS.every(([x, y]) => !shapeContainsPoint(a, x, y) || shapeContainsPoint(b, x, y));
const cutsOf = (code) => { const k = shapeCornerCuts(code); return `${k.tl},${k.tr},${k.bl},${k.br}`; };

const isRock = (map, r, c) => {
  const b = map.grid[r][c];
  return b !== BLOCK_EMPTY && b !== BLOCK_INDESTRUCTIBLE && b !== BLOCK_METAL;
};

function inside(pts, px, py) {
  let odd = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < xi + (py - yi) * (xj - xi) / (yj - yi)) odd = !odd;
  }
  return odd;
}

/** タイルを描いて、最初に閉じた経路（ベース塗り）の内外が形と食い違う点の数と、雪のふちの経路 */
function drawn(map, r, c) {
  const ctx = makeFakeCtx();
  map._drawRockyBlock(ctx, r, c, map.grid[r][c]);
  const pts = [];
  let open = false;
  for (const k of ctx.calls) {
    if (k.name === 'beginPath') { open = true; continue; }
    if (open && (k.name === 'moveTo' || k.name === 'lineTo')) pts.push(k.args);
    if (k.name === 'closePath') break;
  }
  const code = map.tileShapeAt(r, c);
  const bad = PTS.filter(([x, y]) => inside(pts, c * S + x, r * S + y) !== shapeContainsPoint(code, x, y)).length;
  const i = ctx.calls.findIndex((k) => k.name === 'set:strokeStyle' && k.args[0] === SNOW_CAP_COLOR);
  let cap = null;
  if (i >= 0) {
    cap = [];
    for (const k of ctx.calls.slice(i)) {
      if (k.name === 'moveTo' || k.name === 'lineTo') cap.push(`${k.args[0] - c * S},${k.args[1] - r * S}`);
      if (k.name === 'stroke') break;
    }
  }
  return { bad, cap };
}

async function snowMap(seed) {
  const { Map } = await import('../src/js/world/Map.js');
  return new Map({ rng: new SeededRNG(seed) }, 4);
}

for (const seed of [1, 2]) {
  test(`5面 seed ${seed}: 空洞に面した岩を順に壊しても、周りのタイルの岩は増えない`, async () => {
    const map = await snowMap(seed);
    const grew = [];
    let n = 0;
    for (let r = 2; r < map.rows - 2; r++) {
      for (let c = 2; c < map.cols - 2; c += 3) {
        if (!isRock(map, r, c) || map.grid[r - 1][c] !== BLOCK_EMPTY) continue;
        const before = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) before.push([r + dr, c + dc, map.tileShapeAt(r + dr, c + dc)]);
        if (!map.damageBlock(r, c, 999)) continue;
        n++;
        for (const [rr, cc, code] of before) {
          if (!within(map.tileShapeAt(rr, cc), code)) grew.push(`(${rr},${cc}) ${cutsOf(code)} -> ${cutsOf(map.tileShapeAt(rr, cc))}`);
        }
      }
    }
    assert.ok(n > 500, `壊した数 ${n}`);
    assert.deepEqual(grew.slice(0, 8), [], `${grew.length} 枚で岩が増えた`);
  });
}

test('5面: 「<>」の左上を壊すと、右上は「^」、左下は「<」になり、絵と雪のふちが形に沿う', async () => {
  const map = await snowMap(1);
  // 空洞の中に、まわり 1 タイルも空いた 4×5 の場所を探して「<>」を置く
  //   . . . . .
  //   . X A B .     B は右上の坂（段が Y へ続く）、C は左下の坂（段が X へ続く）
  //   . . C D Y
  //   . . . . .
  let at = null;
  for (let r = 2; r < map.rows - 6 && !at; r++) {
    for (let c = 2; c < map.cols - 7 && !at; c++) {
      let empty = true;
      for (let dr = -1; dr <= 4 && empty; dr++) for (let dc = -1; dc <= 5 && empty; dc++) if (map.grid[r + dr][c + dc] !== BLOCK_EMPTY) empty = false;
      if (empty) at = [r, c];
    }
  }
  assert.ok(at, '空いた場所がある');
  const rockType = (() => { for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (isRock(map, r, c)) return map.grid[r][c]; })();
  const [r0, c0] = at;
  const put = (dr, dc) => { map.grid[r0 + dr][c0 + dc] = rockType; map.blockHP[r0 + dr][c0 + dc] = 1; };
  put(1, 1); put(1, 2); put(1, 3); put(2, 2); put(2, 3); put(2, 4);
  map.exposedAtGen[(r0 + 1) * map.cols + c0 + 3] = 1;   // B の上に雪のふち
  map._buildTileShapes();
  const B = [r0 + 1, c0 + 3], C = [r0 + 2, c0 + 2];
  assert.equal(cutsOf(map.tileShapeAt(...B)), '0,16,0,0');
  assert.equal(cutsOf(map.tileShapeAt(...C)), '0,0,16,0');
  assert.ok(map.damageBlock(r0 + 1, c0 + 2, 999), 'A を壊す');
  assert.equal(cutsOf(map.tileShapeAt(...B)), '16,16,0,0', '右上は ^');
  assert.equal(cutsOf(map.tileShapeAt(...C)), '16,0,16,0', '左下は <');
  assert.ok(Math.abs(area(map.tileShapeAt(...B)) - PTS.length / 4) < PTS.length * 0.02);
  const b = drawn(map, ...B), c = drawn(map, ...C);
  assert.equal(b.bad, 0, '^ の絵が形と一致');
  assert.equal(c.bad, 0, '< の絵が形と一致');
  assert.deepEqual(b.cap, ['0,16', '8,8', '16,16'], '雪のふちは ^ の2辺に沿う');
});
