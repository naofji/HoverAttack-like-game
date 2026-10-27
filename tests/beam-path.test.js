import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBeam, ageSegments } from '../src/js/utils/beamPath.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE as T, REFLECT_BEAM_SPEED } from '../src/js/utils/Constants.js';

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

test('水面で vy が反転して跳ね返り、waterBounced が true になる', () => {
  // y < 32 は空気、y >= 32 は水
  const map = {
    isSolidAtPixel: () => false,
    isSolidPoint: () => false,
    slopeHitAlong: () => null, popOutOfRock: () => null,
    isWaterAtPixel: (x, y) => y >= 32,
  };
  // x=40, y=28 から右下 (vx=4, vy=4) へ向かうと (44, 32) は水中
  const r = stepBeam({ x: 40, y: 28, vx: 4, vy: 4 }, map);
  assert.equal(r.bounced, true, '水面で跳ね返っていない');
  assert.equal(r.waterBounced, true, 'waterBounced が true になっていない');
  assert.equal(r.vx, 4, 'vx が変化している');
  assert.equal(r.vy, -4, 'vy が反転していない');
  assert.equal(r.x, 44, '反射後の x が不正');
  assert.equal(r.y, 24, '反射後の y が不正（元位置 28 + 新速度 -4 = 24）');
  assert.equal(map.isWaterAtPixel(r.x, r.y), false, '反射後が水中にめり込んでいる');
});

test('通常の固体壁での反射では waterBounced は false になる', () => {
  const map = {
    isSolidAtPixel: (x, y) => y >= 32,
    isSolidPoint: (x, y) => y >= 32,
    slopeHitAlong: () => null, popOutOfRock: () => null,
    isWaterAtPixel: () => false,
  };
  const r = stepBeam({ x: 40, y: 28, vx: 4, vy: 4 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.waterBounced, false);
});


// 5面と同じ形の地図。tests/player-slope.test.js と同じ坂（列 10〜19 が 45度で上る。上面 y = 30T − x）。
// 坂の上は台地（row 10）、右端と天井は地図の外（岩）
function rampRows() {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 40; c++) {
      let floor = 20;
      if (c >= 10 && c <= 19) floor = 29 - c;
      else if (c >= 20 && c <= 29) floor = 10;
      s += r >= floor ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

test('斜辺に真下から当たった反射ビームは横へ跳ね返る', () => {
  const map = makeMap(rampRows(), null, { tileShape: 'snowSlope' });
  const x = 15 * T + 4, surface = 30 * T - x;
  const r = stepBeam({ x, y: surface - 3, vx: 0, vy: 5 }, map);
  assert.equal(r.bounced, true);
  assert.equal(r.waterBounced, false);
  // 右へ上る坂の法線は左上。真下の光は左へ折れる
  assert.equal(r.vx, -5);
  assert.ok(r.vy === 0, `vy=${r.vy}`); // 成分の入れ替えで −0 になる（=== では 0 と同じ）
  assert.equal(r.x, x - 5, '元の位置から新しい速度で動いていない');
  assert.equal(r.y, surface - 3);
});

test('斜辺で跳ね返っても速さは REFLECT_BEAM_SPEED のまま変わらず、岩の中に入らない', () => {
  const map = makeMap(rampRows(), null, { tileShape: 'snowSlope' });
  let b = { x: 5 * T, y: 12 * T, vx: 3, vy: 4 };
  assert.equal(Math.hypot(b.vx, b.vy), REFLECT_BEAM_SPEED, '前提');
  let diagonal = 0;
  for (let f = 0; f < 2000; f++) {
    const prev = b;
    b = stepBeam(b, map);
    // 斜辺の反射は vx と vy が入れ替わる（軸の反射は符号だけが変わる）
    if (b.bounced && Math.abs(b.vx) === Math.abs(prev.vy) && Math.abs(prev.vx) !== Math.abs(prev.vy)) diagonal++;
    assert.equal(Math.hypot(b.vx, b.vy), REFLECT_BEAM_SPEED, `フレーム ${f} で速さが変わった`);
    assert.equal(map.isSolidPoint(b.x, b.y), false, `フレーム ${f} で岩の中 (${b.x}, ${b.y})`);
  }
  assert.ok(diagonal > 0, '斜辺で一度も跳ね返っていない');
});

test('左へ上る斜辺（法線は右上）に真下から当たると、右へ跳ね返る', () => {
  // rampRows() を左右反転した坂。列 c の上面は元の列 39 − c と同じ
  const map = makeMap(rampRows().map((s) => s.split('').reverse().join('')), null, { tileShape: 'snowSlope' });
  const x = 40 * T - (15 * T + 4), surface = 30 * T - (40 * T - x);
  assert.equal(map.isSolidPoint(x, surface + 1), true, '前提: 斜辺の下は岩');
  const r = stepBeam({ x, y: surface - 3, vx: 0, vy: 5 }, map);
  assert.equal(r.vx, 5);
  assert.ok(r.vy === 0, `vy=${r.vy}`);
});

test('壊れて形が作り直され、反射ビームの居る所が岩になっても、次のフレームで岩の外へ出る（最終レビュー I1）', () => {
  const broken = makeMap(rampRows().map((s, r) => (r === 17 ? s.slice(0, 12) + '.' + s.slice(13) : s)), null, { tileShape: 'snowSlope' });
  const x = 13 * T + 8, y = 30 * T - x - 0.5;
  assert.equal(broken.isSolidPoint(x, y), true, '前提: 壊れた後はビームの位置が岩');
  const r = stepBeam({ x, y, vx: 3, vy: 4 }, broken);
  assert.equal(broken.isSolidPoint(r.x, r.y), false, `岩の中に残った (${r.x}, ${r.y})`);
});
