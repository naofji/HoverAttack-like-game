import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBeam, ageSegments } from '../src/js/utils/beamPath.js';
import { makeMap } from './helpers/enemy-world.js';

// 地形はタイル。TILE_SIZE=16 なので、'#' 1つが 16px 四方
//   0123456789
// 0 ##########
// 1 #........#
// 2 #........#
// 3 ##########
const ROOM = [
  '##########',
  '#........#',
  '#........#',
  '##########',
];

test('何も無ければまっすぐ進む', () => {
  const map = makeMap(ROOM);
  const r = stepBeam({ x: 40, y: 24, vx: 4, vy: 0 }, map);
  assert.deepEqual(
    { x: r.x, y: r.y, vx: r.vx, vy: r.vy, bounced: r.bounced },
    { x: 44, y: 24, vx: 4, vy: 0, bounced: false },
  );
});

test('縦の壁で vx が反転する', () => {
  const map = makeMap(ROOM);
  // 右端の壁は c=9（x=144〜159）。x=142 から右へ 4 進むと壁の中
  // 反射後は元位置から新しい速度で進む：142 + (-4) = 138
  const r = stepBeam({ x: 142, y: 24, vx: 4, vy: 0 }, map);
  assert.equal(r.bounced, true, '跳ね返っていない');
  assert.equal(r.vx, -4, 'vx が反転していない');
  assert.equal(r.vy, 0, 'vy まで反転している');
  assert.equal(r.x, 138, '反射後の x が「元位置 + 新速度」ではない');
  assert.equal(r.y, 24, '反射後の y が変わっている');
  assert.equal(map.isSolidAtPixel(r.x, r.y), false, '壁の中に居る');
});

test('床で vy が反転する', () => {
  const map = makeMap(ROOM);
  // 床は r=3（y=48〜63）。y=46 から下へ 4 進むと床の中
  // 反射後は元位置から新しい速度で進む：46 + (-4) = 42
  const r = stepBeam({ x: 40, y: 46, vx: 0, vy: 4 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.vy, -4, 'vy が反転していない');
  assert.equal(r.vx, 0);
  assert.equal(r.x, 40, '反射後の x が変わっている');
  assert.equal(r.y, 42, '反射後の y が「元位置 + 新速度」ではない');
  assert.equal(map.isSolidAtPixel(r.x, r.y), false, '床の中に居る');
});

test('角に斜めから入ると両方反転する', () => {
  const map = makeMap(ROOM);
  // 右下の内側の角へ斜めに向かう
  // 反射後は元位置から新しい速度で進む：142 + (-4) = 138, 46 + (-4) = 42
  const r = stepBeam({ x: 142, y: 46, vx: 4, vy: 4 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.vx, -4);
  assert.equal(r.vy, -4);
  assert.equal(r.x, 138, '反射後の x が「元位置 + 新速度」ではない');
  assert.equal(r.y, 42, '反射後の y が「元位置 + 新速度」ではない');
  assert.equal(map.isSolidAtPixel(r.x, r.y), false);
});

// 渡したものを書き換えると、呼び出し側が「反射前の位置」を経路に積めなくなる
test('引数のオブジェクトを書き換えない', () => {
  const map = makeMap(ROOM);
  const beam = { x: 142, y: 24, vx: 4, vy: 0 };
  stepBeam(beam, map);
  assert.deepEqual(beam, { x: 142, y: 24, vx: 4, vy: 0 });
});

// 単独移動ではどちらもめり込まないが、対角では衝突する場合に
// if (!hitX && !hitY) { rvx = -vx; rvy = -vy; } の分岐が発動するかテスト。
// タイル (1,1) に壁を置き、タイル境界をまたぐ小さな速度で対角に当たる状況を作る。
//   012
// 0 ...
// 1 .#.
// 2 ...
const SINGLE_WALL = [
  '...',
  '.#.',
  '...',
];

test('タイル角に斜めから当たるが単独移動では両軸とも壁に当たらない場合', () => {
  const map = makeMap(SINGLE_WALL);
  // (0,0) のタイルから (1,1) のタイル（壁）へタイル境界を跨ぐ小さな速度で移動
  // x=14, y=14 から vx=2, vy=2 で (16, 16) へ移動
  // (16, 16) → col=1, row=1 で壁 ('#') はソリッド
  // x のみ (16, 14) → col=1, row=0 で '.' はソリッドではない（hitX=false）
  // y のみ (14, 16) → col=0, row=1 で '.' はソリッドではない（hitY=false）
  // したがって if (!hitX && !hitY) { rvx = -vx; rvy = -vy; } が実行される
  const r = stepBeam({ x: 14, y: 14, vx: 2, vy: 2 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.vx, -2, 'タイル角への対角衝突で vx が反転していない');
  assert.equal(r.vy, -2, 'タイル角への対角衝突で vy が反転していない');
  // 反射後は元位置から新速度で進む：14 + (-2) = 12
  assert.equal(r.x, 12, '反射後の x が「元位置 + 新速度」ではない（14 + (-2) = 12）');
  assert.equal(r.y, 12, '反射後の y が「元位置 + 新速度」ではない（14 + (-2) = 12）');
  assert.equal(map.isSolidAtPixel(r.x, r.y), false, '反射後が壁の中に居る');
});

// 節は寿命で消える。古い節（life が小さい）ほど先に消えるので、
// 帯は後ろから順に短くなっていく
test('全部の節の寿命が1ずつ減る', () => {
  const segs = [
    { x1: 0, y1: 0, x2: 10, y2: 0, life: 3 },
    { x1: 10, y1: 0, x2: 20, y2: 0, life: 5 },
  ];
  const out = ageSegments(segs);
  assert.deepEqual(out.map((s) => s.life), [2, 4]);
});

test('寿命が尽きた節は落ちる', () => {
  const segs = [
    { x1: 0, y1: 0, x2: 10, y2: 0, life: 1 },
    { x1: 10, y1: 0, x2: 20, y2: 0, life: 4 },
  ];
  const out = ageSegments(segs);
  assert.equal(out.length, 1, '寿命が尽きた節が残っている');
  assert.equal(out[0].life, 3);
  assert.equal(out[0].x1, 10, '残ったのが違う節');
});

// 呼び出し側が「前のフレームの節」を持ち続けられるよう、元の配列も
// 中の節も書き換えない
test('引数の配列も中の節も書き換えない', () => {
  const segs = [{ x1: 0, y1: 0, x2: 10, y2: 0, life: 3 }];
  ageSegments(segs);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].life, 3);
});

test('空の配列は空のまま', () => {
  assert.deepEqual(ageSegments([]), []);
});
