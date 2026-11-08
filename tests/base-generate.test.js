// 7面の施設エリアに並べる基地の建物（壊せる町並み）。
// 設計: docs/superpowers/specs/2026-11-08-stage7-base-facilities-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, BLOCK_EMPTY, BLOCK_NORMAL } from '../src/js/utils/Constants.js';
import { generateTown } from '../src/js/world/town/generate.js';
import { FACTORY_THEME } from '../src/js/world/town/themes.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

// ---------- generateTown の置ける範囲（includeRects）と足元の判定（accept） ----------

/** 岩の中に、床の平らな部屋を左右に2つ掘った地図（行 8〜19 が空洞、行 20 から下が床） */
function twoRooms() {
  const rows = 40, cols = 64;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const inA = c >= 4 && c < 28, inB = c >= 36 && c < 60;
      row.push(r >= 8 && r < 20 && (inA || inB) ? BLOCK_EMPTY : BLOCK_NORMAL);
    }
    grid.push(row);
  }
  return { grid, rows, cols };
}
const ROOM_A = { r0: 7, r1: 20, c0: 3, c1: 28 };
// 2つの部屋の中心に密な村（村の外でも少しは建つので、その差を includeRects で見る）
const VILLAGES = [{ c: 16, r: 14, radius: 20, peak: 1 }, { c: 48, r: 14, radius: 20, peak: 1 }];

function gen(seed, extra = {}) {
  const { grid, rows, cols } = twoRooms();
  return generateTown({ grid, rows, cols, rng: new SeededRNG(seed), villages: VILLAGES, theme: FACTORY_THEME, ...extra });
}

const insideRect = (s, rc) => s.x >= rc.c0 * T && s.y >= rc.r0 * T
  && s.x + s.w <= (rc.c1 + 1) * T && s.y + s.h <= (rc.r1 + 1) * T;

test('includeRects を渡すと、建物の外接矩形はどれかの矩形に収まる', () => {
  let total = 0, outsideWithout = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const specs = gen(seed, { includeRects: [ROOM_A] });
    for (const s of specs) assert.ok(insideRect(s, ROOM_A), `seed ${seed}: 矩形の外 ${s.site} (${s.x},${s.y},${s.w},${s.h})`);
    total += specs.length;
    outsideWithout += gen(seed).filter((s) => !insideRect(s, ROOM_A)).length;
  }
  assert.ok(total > 0, '矩形の中に1棟も建たない');
  assert.ok(outsideWithout > 0, '前提: 渡さなければ矩形の外（右の部屋）にも建つ');
});

test('includeRects も accept も省略したときと null を渡したときで、設計図は同じ', () => {
  for (const seed of [1, 2, 3]) {
    assert.deepEqual(gen(seed, { includeRects: null, accept: null }), gen(seed));
  }
});

test('accept が false を返した建物は置かれない', () => {
  let walls = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    walls += gen(seed).filter((s) => s.site === 'wall').length;
    const specs = gen(seed, { accept: (s) => s.site !== 'wall' });
    assert.equal(specs.filter((s) => s.site === 'wall').length, 0, `seed ${seed}`);
  }
  assert.ok(walls > 0, '前提: 渡さなければ壁の建物がある');
});
