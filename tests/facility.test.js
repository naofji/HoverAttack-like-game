// 7面の施設エリア（メタルパネルの地面・壁と金属の斜面）。
// 設計 docs/superpowers/specs/2026-10-31-stage7-facility-metal-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { pickFacilityAreas, metalizeFacilityBand } from '../src/js/world/facility.js';
import { carveSnowStairs } from '../src/js/world/snowStairs.js';
import {
  BLOCK_EMPTY as E, BLOCK_NORMAL as N, BLOCK_HARD as H, BLOCK_METAL as M, BLOCK_INDESTRUCTIBLE as X,
  METAL_BLOCK_HP, FORTRESS_ZONE_MARGIN,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const overlap = (a, b) => a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;

let cache = null;
async function maps(level = 6) {
  const { Map } = await import('../src/js/world/Map.js');
  if (level !== 6) return SEEDS.slice(0, 2).map((s) => new Map({ rng: new SeededRNG(s) }, level));
  cache ??= SEEDS.map((s) => new Map({ rng: new SeededRNG(s) }, 6));
  return cache;
}

// ---------- エリアの選び方 ----------

test('pickFacilityAreas は除外矩形と重ならず、互いにも重ならない', () => {
  const rooms = [];
  for (let r = 10; r < 90; r += 6) for (let c = 10; c < 190; c += 7) rooms.push({ centerR: r, centerC: c });
  const excludeRects = [{ r0: 0, r1: 30, c0: 0, c1: 40 }, { r0: 50, r1: 70, c0: 100, c1: 140 }];
  const areas = pickFacilityAreas({
    rows: 100, cols: 200, rooms, excludeRects, rng: new SeededRNG(7),
    count: 8, wMin: 10, wRange: 10, hMin: 8, hRange: 6, margin: 3,
  });
  assert.ok(areas.length >= 3, `置けたのが ${areas.length} 個`);
  for (const a of areas) {
    for (const x of excludeRects) assert.ok(!overlap(a, x), `除外矩形と重なる ${JSON.stringify(a)}`);
    assert.ok(a.r0 >= 3 && a.c0 >= 3 && a.r1 < 97 && a.c1 < 197, '盤面の縁の余白に掛かる');
  }
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) assert.ok(!overlap(areas[i], areas[j]), '互いに重なる');
  }
});

test('metalizeFacilityBand は縁の岩だけを金属にし、空洞は空洞のまま、内側と壊せない岩は触らない', () => {
  const grid = [
    [N, N, E, N, N],
    [N, H, N, E, X],
    [E, N, N, N, N],
    [N, N, E, H, N],
  ];
  const blockHP = grid.map((row) => row.map((b) => (b === E ? 0 : 1)));
  const n = metalizeFacilityBand(grid, blockHP, { r0: 0, r1: 3, c0: 0, c1: 4 });
  assert.deepEqual(grid, [
    [M, M, E, M, M],
    [M, H, N, E, X],
    [E, N, N, N, M],
    [M, M, E, M, M],
  ]);
  assert.equal(n, 10);
  assert.equal(blockHP[0][0], METAL_BLOCK_HP);
  assert.equal(blockHP[1][1], 1, '内側の HP が変わった');
  assert.equal(blockHP[2][0], 0, '空洞の HP が変わった');
});

// ---------- 実際の7面 ----------

test('実際の7面: 施設エリアが 1 個以上あり、区画（余白込み）・開始の部屋・基地の部屋と重ならない', async () => {
  for (const m of await maps()) {
    assert.ok(m.facilityAreas.length >= 1, '施設エリアが無い');
    const zones = m.fortressZones.map((z) => ({
      r0: z.r0 - FORTRESS_ZONE_MARGIN, r1: z.r1 + FORTRESS_ZONE_MARGIN,
      c0: z.c0 - FORTRESS_ZONE_MARGIN, c1: z.c1 + FORTRESS_ZONE_MARGIN,
    }));
    for (const a of m.facilityAreas) {
      for (const x of [...m._reservedRects(), ...zones]) assert.ok(!overlap(a, x), '予約・区画と重なる');
    }
  }
});

test('実際の7面: facility の印は施設エリアの矩形の中だけに立つ', async () => {
  for (const m of await maps()) {
    let marked = 0;
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const inside = m.facilityAreas.some((a) => r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1);
        assert.equal(m.facility[r * m.cols + c] === 1, inside, `(${r},${c})`);
        if (inside) marked++;
      }
    }
    assert.ok(marked > 0);
  }
});

test('実際の7面: 施設エリアの縁の岩は金属（壊せない岩を除く）', async () => {
  for (const m of await maps()) {
    for (const a of m.facilityAreas) {
      for (let r = a.r0; r <= a.r1; r++) {
        for (let c = a.c0; c <= a.c1; c++) {
          const edge = r === a.r0 || r === a.r1 || c === a.c0 || c === a.c1;
          const b = m.grid[r][c];
          if (edge && b !== E && b !== X) assert.equal(b, M, `縁 (${r},${c}) が ${b}`);
        }
      }
    }
  }
});

test('7面以外では施設エリアは無く、印も立たない', async () => {
  for (const level of [0, 4]) {
    for (const m of await maps(level)) {
      assert.deepEqual(m.facilityAreas, []);
      assert.ok(m.facility.every((v) => v === 0));
    }
  }
});

test('7面の Map を2回作っても同じ施設エリア（週次の決定性）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = new Map({ rng: new SeededRNG(5) }, 6);
  const b = new Map({ rng: new SeededRNG(5) }, 6);
  assert.deepEqual(a.facilityAreas, b.facilityAreas);
  assert.deepEqual(a.grid, b.grid);
});

test('施設エリアの生成は game.rng を消費しない（消費すると敵の構成が変わる）', async () => {
  // 地形が変われば後の湧き探しの乱数の使い方も変わるので、生成の前後の state を直接比べる
  const { Map } = await import('../src/js/world/Map.js');
  const orig = Map.prototype._generateFacility;
  const seen = [];
  Map.prototype._generateFacility = function () {
    const before = this.game.rng.state;
    orig.call(this);
    seen.push([before, this.game.rng.state, this.facilityAreas.length]);
  };
  try {
    new Map({ rng: new SeededRNG(9) }, 6);
  } finally {
    Map.prototype._generateFacility = orig;
  }
  assert.equal(seen.length, 1);
  assert.ok(seen[0][2] > 0, '施設エリアが置かれていない（見本にならない）');
  assert.equal(seen[0][1], seen[0][0]);
});

// ---------- 金属の階段 ----------

/** 床が行 30 の大きな空洞（周りは岩）と、その中の部屋 */
function cave() {
  const rows = 40, cols = 60;
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
    r >= 5 && r < 30 && c >= 5 && c < 55 ? E : N)));
  const blockHP = grid.map((row) => row.map((b) => (b === E ? 0 : 1)));
  const rooms = [{ centerR: 20, centerC: 20 }, { centerR: 20, centerC: 40 }];
  return { grid, blockHP, rows, cols, rooms };
}
const stairArgs = (w, seed) => ({ ...w, rng: new SeededRNG(seed), count: 4, lengthMin: 3, lengthRange: 3 });

test('carveSnowStairs: block/hp/withinRects を省いた呼び出しと、既定値を明示した呼び出しは同じ階段を盛る', () => {
  for (const seed of [1, 2, 3, 4]) {
    const a = cave(), b = cave();
    const ra = carveSnowStairs(stairArgs(a, seed));
    const rb = carveSnowStairs({ ...stairArgs(b, seed), block: N, hp: 1, withinRects: null });
    assert.ok(ra.length > 0);
    assert.deepEqual(rb, ra);
    assert.deepEqual(b.grid, a.grid);
  }
});

test('carveSnowStairs: block/hp を渡すと、盛った段がそのブロック・HP になる', () => {
  const w = cave();
  const before = w.grid.map((row) => row.slice());
  const stairs = carveSnowStairs({ ...stairArgs(w, 2), block: M, hp: METAL_BLOCK_HP });
  assert.ok(stairs.length > 0);
  let added = 0;
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      if (before[r][c] !== w.grid[r][c]) {
        added++;
        assert.equal(w.grid[r][c], M);
        assert.equal(w.blockHP[r][c], METAL_BLOCK_HP);
      }
    }
  }
  assert.ok(added > 0);
});

test('carveSnowStairs: withinRects を渡すと、段のセルは全部その矩形の中', () => {
  const within = [{ r0: 10, r1: 29, c0: 12, c1: 28 }];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = cave();
    const before = w.grid.map((row) => row.slice());
    carveSnowStairs({ ...stairArgs(w, seed), withinRects: within });
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        if (before[r][c] === w.grid[r][c]) continue;
        assert.ok(r >= 10 && r <= 29 && c >= 12 && c <= 28, `矩形の外に段 (${r},${c})`);
      }
    }
  }
});

test('実際の7面: 金属の階段がある（SEEDS 合計 1 本以上）。段は全部 BLOCK_METAL で施設エリアの中', async () => {
  let total = 0;
  for (const m of await maps()) {
    for (const st of m.metalStairs) {
      total++;
      for (let i = 0; i < st.length; i++) {
        const c = st.c + st.dir * i;
        for (let k = 0; k <= i; k++) {
          const r = st.r - k;
          assert.equal(m.grid[r][c], M, `段 (${r},${c}) が金属でない`);
          assert.equal(m.facility[r * m.cols + c], 1, `段 (${r},${c}) が施設エリアの外`);
        }
      }
    }
  }
  assert.ok(total >= 1, '金属の階段が1本も無い');
});
