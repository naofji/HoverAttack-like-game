// スパイダーが面に沿って這う規則（utils/surfaceCrawl.js）を、ASCII の格子の上で直接試す。
// 体（EnemySpider）を通さずに試すのは、角の回り込みの食い違いを1歩単位で見たいから。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepCrawl, hasSupport, boxHitsSolid, downOf } from '../src/js/utils/surfaceCrawl.js';
import { SPIDER_SIZE, TILE_SIZE } from '../src/js/utils/Constants.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

const T = TILE_SIZE;
const S = SPIDER_SIZE;

/** '#' = 岩。範囲外は岩（本物の地図の外周と同じ）。消したタイルは removed に入れる */
function gridOf(rows) {
  const removed = new Set();
  const isSolid = (r, c) => {
    if (r < 0 || c < 0 || r >= rows.length || c >= rows[0].length) return true;
    if (removed.has(`${r},${c}`)) return false;
    return rows[r][c] === '#';
  };
  return { isSolid, remove: (r, c) => removed.add(`${r},${c}`) };
}

/** 床（row の上面）に立つ箱。col のタイルの左寄せ +1 */
function onFloor(row, col, fwdX = 1) {
  return { x: col * T + 1, y: row * T - S, size: S, surface: 'floor', fwd: { x: fwdX, y: 0 } };
}

function run(isSolid, body, steps, dist = 1.6, until = null) {
  let b = body;
  for (let i = 0; i < steps; i++) {
    b = stepCrawl(isSolid, b, dist);
    if (b.surface === null) return b;
    if (until && until(b)) return b;
  }
  return b;
}

const room = [
  '##########',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '##########',
];

test('downOf は面の向きを返す', () => {
  assert.deepEqual(downOf('floor'), { x: 0, y: 1 });
  assert.deepEqual(downOf('ceiling'), { x: 0, y: -1 });
  assert.deepEqual(downOf('wallL'), { x: -1, y: 0 });
  assert.deepEqual(downOf('wallR'), { x: 1, y: 0 });
});

test('床を右へ進み、前の壁で壁を登る向きに変わる', () => {
  const { isSolid } = gridOf(room);
  const b = run(isSolid, onFloor(9, 2), 200, 1.6, (q) => q.surface !== 'floor');
  assert.equal(b.surface, 'wallR');
  assert.deepEqual(b.fwd, { x: 0, y: -1 });
  assert.equal(b.x + S, 9 * T);
});

test('壁を登りきると天井に移り、壁から離れる向きに進む', () => {
  const { isSolid } = gridOf(room);
  let b = run(isSolid, onFloor(9, 2), 200, 1.6, (q) => q.surface === 'wallR');
  b = run(isSolid, b, 400, 1.6, (q) => q.surface !== 'wallR');
  assert.equal(b.surface, 'ceiling');
  assert.equal(b.fwd.x, -1);
  assert.equal(b.y, T);
});

// 宙に浮いた 3×8 の台
const slab = [
  '..............',
  '..............',
  '..............',
  '...########...',
  '...########...',
  '...########...',
  '..............',
  '..............',
  '..............',
  '..............',
];

test('床の端で外の側面へ回り込み、下へ進む', () => {
  const { isSolid } = gridOf(slab);
  const b = run(isSolid, onFloor(3, 8), 200, 1.6, (q) => q.surface !== 'floor');
  assert.equal(b.surface, 'wallL');
  assert.deepEqual(b.fwd, { x: 0, y: 1 });
  assert.equal(b.x, 11 * T);
  assert.equal(boxHitsSolid(isSolid, b.x, b.y, S), false);
  assert.equal(hasSupport(isSolid, b), true);
});

test('天井の端で回り込んで上へ進む', () => {
  const { isSolid } = gridOf(slab);
  // 台の下面（row 6 の上端）に張り付いて右へ
  const start = { x: 8 * T + 1, y: 6 * T, size: S, surface: 'ceiling', fwd: { x: 1, y: 0 } };
  const b = run(isSolid, start, 200, 1.6, (q) => q.surface !== 'ceiling');
  assert.ok(b.surface === 'wallL' || b.surface === 'wallR');
  assert.equal(b.fwd.y, -1);
  assert.equal(boxHitsSolid(isSolid, b.x, b.y, S), false);
  assert.equal(hasSupport(isSolid, b), true);
});

test('床に立つ1タイル幅の柱を乗り越えて床に戻る', () => {
  const rows = [
    '..............',
    '..............',
    '..............',
    '..............',
    '......#.......',
    '......#.......',
    '......#.......',
    '##############',
  ];
  const { isSolid } = gridOf(rows);
  const seen = [];
  let b = onFloor(7, 2);
  for (let i = 0; i < 400; i++) {
    b = stepCrawl(isSolid, b, 1.6);
    assert.notEqual(b.surface, null);
    if (seen[seen.length - 1] !== b.surface) seen.push(b.surface);
    if (b.surface === 'floor' && b.x > 7 * T) break;
  }
  assert.deepEqual(seen, ['floor', 'wallR', 'floor', 'wallL', 'floor']);
  assert.equal(b.fwd.x, 1);
  assert.ok(b.x > 7 * T);
});

test('足場のタイルが消えたら surface が null', () => {
  const rows = ['......', '......', '######'];
  const g = gridOf(rows);
  const b0 = onFloor(2, 2);
  for (let c = 0; c < 6; c++) g.remove(2, c);
  const b = stepCrawl(g.isSolid, b0, 1.6);
  assert.equal(b.surface, null);
});

test('stepCrawl は引数の body を書き換えない', () => {
  const { isSolid } = gridOf(room);
  const b0 = onFloor(9, 2);
  const copy = structuredClone(b0);
  stepCrawl(isSolid, b0, 1.6);
  assert.deepEqual(b0, copy);
});

test('乱数の格子で、張り付いている間は岩にめり込まず足場がある', () => {
  for (let g = 0; g < 20; g++) {
    const rng = new SeededRNG(1000 + g);
    const W = 40, H = 30;
    const rows = [];
    for (let r = 0; r < H; r++) {
      let s = '';
      for (let c = 0; c < W; c++) s += rng.next() < 0.28 ? '#' : '.';
      rows.push(s);
    }
    const { isSolid } = gridOf(rows);
    // 空いていて真下が岩のタイルから始める
    let start = null;
    for (let r = 1; r < H - 1 && !start; r++) {
      for (let c = 1; c < W - 1 && !start; c++) {
        if (!isSolid(r, c) && isSolid(r + 1, c)) start = onFloor(r + 1, c, rng.next() < 0.5 ? 1 : -1);
      }
    }
    assert.ok(start, `grid ${g}: start`);
    let b = start;
    for (let i = 0; i < 3000; i++) {
      b = stepCrawl(isSolid, b, 1.6);
      assert.notEqual(b.surface, null, `grid ${g} step ${i}: 足場を失った`);
      assert.equal(boxHitsSolid(isSolid, b.x, b.y, S), false, `grid ${g} step ${i}: めり込み ${JSON.stringify(b)}`);
      assert.equal(hasSupport(isSolid, b), true, `grid ${g} step ${i}: 足場なし ${JSON.stringify(b)}`);
    }
  }
});
