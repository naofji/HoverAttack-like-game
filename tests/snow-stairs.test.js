import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { carveSnowStairs } from '../src/js/world/snowStairs.js';
import { stairDirection } from '../src/js/utils/slope.js';

// 30x20。row 15 が床、上は空洞。
function world() {
  const grid = [], blockHP = [];
  for (let r = 0; r < 20; r++) {
    grid.push([]); blockHP.push([]);
    for (let c = 0; c < 30; c++) { const s = r >= 15 || r === 0 || c === 0 || c === 29; grid[r].push(s ? 1 : 0); blockHP[r].push(1); }
  }
  return { grid, blockHP, rows: 20, cols: 30, rooms: [{ centerR: 8, centerC: 15 }] };
}

function mapOf(w) {
  return { isSolid: (r, c) => r < 0 || c < 0 || r >= w.rows || c >= w.cols || w.grid[r][c] !== 0 };
}

test('carves a staircase of at least lengthMin steps that stairDirection recognises in the middle', () => {
  const w = world();
  const stairs = carveSnowStairs({ ...w, rng: new SeededRNG(2), count: 1, lengthMin: 5, lengthRange: 0 });
  assert.equal(stairs.length, 1);
  const s = stairs[0];
  assert.equal(s.length, 5);
  const map = mapOf(w);
  // 真ん中の段に立ったときの向きが s.dir
  const midStep = 2;
  const r = s.r - midStep;             // 段が1つ上がるごとに行が1つ減る
  const c = s.c + s.dir * midStep;
  assert.equal(stairDirection(map, r, c), s.dir);
});

test('same rng carves the same stairs', () => {
  const a = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  const b = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  assert.deepEqual(a, b);
});

// レビュー指摘: 開始の部屋・基地の部屋を避けられないと、そこに階段が生えうる。
// 水（generateWaterPools）と同じ形の除外矩形 { r0, r1, c0, c1 } で弾けることを確かめる。
test('excludeRects covering the whole world yields no stairs', () => {
  const w = world();
  const stairs = carveSnowStairs({
    ...w, rng: new SeededRNG(2), count: 3, lengthMin: 5, lengthRange: 0,
    excludeRects: [{ r0: 0, r1: 19, c0: 0, c1: 29 }],
  });
  assert.deepEqual(stairs, []);
});

// 部屋を右端寄りにして、除外矩形（左半分）を避けても dir がどちらでも
// 段が敷地内に収まる余地を残す（60列・部屋の中心は45）
function wideWorld() {
  const grid = [], blockHP = [];
  for (let r = 0; r < 20; r++) {
    grid.push([]); blockHP.push([]);
    for (let c = 0; c < 60; c++) { const s = r >= 15 || r === 0 || c === 0 || c === 59; grid[r].push(s ? 1 : 0); blockHP[r].push(1); }
  }
  return { grid, blockHP, rows: 20, cols: 60, rooms: [{ centerR: 8, centerC: 45 }] };
}

test('excludeRects covering the left half keeps every carved cell out of it', () => {
  const w = wideWorld();
  const excludeRects = [{ r0: 0, r1: 19, c0: 0, c1: 29 }];
  const stairs = carveSnowStairs({
    ...w, rng: new SeededRNG(4), count: 5, lengthMin: 5, lengthRange: 4, excludeRects,
  });
  assert.ok(stairs.length > 0, 'この乱数・部屋配置なら右半分にも置けるはず');
  for (const s of stairs) {
    // モジュールと同じ書き込み規則で全セルを導出する:
    // 段 i (0..length-1) は列 c + dir*i、行は floor-1-k (k=0..i)
    for (let i = 0; i < s.length; i++) {
      const c = s.c + s.dir * i;
      for (let k = 0; k <= i; k++) {
        const r = s.r - k;
        const inRect = r >= excludeRects[0].r0 && r <= excludeRects[0].r1 &&
                       c >= excludeRects[0].c0 && c <= excludeRects[0].c1;
        assert.equal(inRect, false, `stair cell (${r},${c}) は除外矩形の外のはず`);
      }
    }
  }
});
