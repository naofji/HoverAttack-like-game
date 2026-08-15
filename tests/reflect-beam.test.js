import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  REFLECT_BEAM_SPEED, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
  REFLECT_BEAM_SEGMENT_FRAMES, REFLECT_BEAM_SEGMENT_LIFE, COLOR_REFLECT_BEAM_CORE,
} from '../src/js/utils/Constants.js';

// 横に長い部屋。左右の壁で跳ね返る
const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

function makeBeam(opts = {}) {
  const map = makeMap(ROOM);
  const game = { map, particles: [] };
  const beam = new ReflectBeam(game, opts.x ?? 40, opts.y ?? 40, opts.angle ?? 0);
  return { beam, game, map };
}

test('まっすぐ飛ぶ', () => {
  const { beam } = makeBeam();
  beam.update();
  assert.equal(beam.x, 40 + REFLECT_BEAM_SPEED);
  assert.equal(beam.y, 40);
  assert.equal(beam.alive, true);
});

test('壁で跳ね返り、反射回数が増える', () => {
  const { beam } = makeBeam({ x: 40, y: 40, angle: 0 });
  for (let i = 0; i < 100; i++) beam.update();
  assert.ok(beam.bounces > 0, '一度も跳ね返っていない');
});

// 「距離を使い切れば消える」テストと対称に、こちらは毎フレーム distance を
// 0 に戻して距離条件を無効化し、反射回数の分岐だけで消えることを確かめる。
// そうしないとこの部屋では distance の上限（1200）のほうが先に尽きてしまい、
// bounces の分岐を一度も踏まないままテストが通ってしまう（実際そうだった）
test('反射回数を使い切ると消える', () => {
  const { beam } = makeBeam({ x: 40, y: 40, angle: 0 });
  let steps = 0;
  while (beam.alive && steps < 5000) {
    beam.distance = 0;   // 距離の予算を使い切らせない
    beam.update();
    steps++;
  }
  assert.equal(beam.alive, false, '消えていない');
  assert.equal(beam.bounces, REFLECT_BEAM_MAX_BOUNCES,
    `反射回数の上限ちょうどで消えていない: ${beam.bounces}`);
});

test('距離は速度ぶんずつ増える', () => {
  const { beam } = makeBeam();
  beam.update();
  beam.update();
  assert.equal(beam.distance, REFLECT_BEAM_SPEED * 2);
});

// 「反射回数と距離の、先に尽きた方」で消える。この部屋では反射のほうが先に
// 尽きるので、距離の上限だけを試すには反射の予算を外して確かめる
test('反射しなくても距離を使い切れば消える', () => {
  const { beam } = makeBeam();
  let steps = 0;
  while (beam.alive && steps < 5000) {
    beam.bounces = 0;   // 反射の予算を使い切らせない
    beam.update();
    steps++;
  }
  assert.equal(beam.alive, false, '距離を使い切っても消えていない');
  assert.ok(beam.distance >= REFLECT_BEAM_MAX_DISTANCE,
    `距離の上限より手前で消えた: ${beam.distance}`);
});

// 1節は SEGMENT_FRAMES フレームぶん。速度4・2フレームなので8px
test('節は SEGMENT_FRAMES ごとに増える', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_FRAMES * 3; i++) beam.update();
  assert.equal(beam.segments().length, 3, '3節ぶん進んだのに節が3つない');
});

// 反射で節を閉じないと、節が折れ点をまたいで角をショートカットする直線になり、
// 反射のたびに帯が角でがたついて見える（実機で指摘された）
//
// 元の案（angle:0 で縦の壁に当てる）は誤検出だった: angle:0 の反射は
// vx の符号だけが反転し vy は 0 のままなので、節を閉じても閉じなくても
// 前後とも水平のまま＝「節が斜めになっているか」では閉じ忘れを検出できない
// （閉じる処理を丸ごと外してもこのテストは通ってしまうことを確認した）。
// 斜め角で撃って上下の壁に当てれば、反射前後で傾きが変わる（vy の符号が
// 反転し vx はそのまま）ので、閉じ忘れると反射点をまたいだ直線になる。
// それを「反射点がどこかの節の境界（始点か終点）に一致しているか」で直接見る。
//
// y:40 だと反射までのフレーム数がたまたま SEGMENT_FRAMES(2) の倍数と重なり、
// 閉じる処理を丸ごと外しても「たまたま」定期クローズが反射点と一致してしまい
// テストが検出に失敗した（実際に試して確認した）。y:36 は反射まで12フレームで
// 定期クローズの周期とズレる（シミュレーションで確認済み）ので、閉じ忘れを
// 確実に検出できる
test('反射した瞬間に節が閉じる', () => {
  const { beam } = makeBeam({ x: 140, y: 36, angle: 0.5 });
  let cornerX = null;
  let cornerY = null;
  for (let i = 0; i < 60; i++) {
    const before = beam.bounces;
    const prevX = beam.x;
    const prevY = beam.y;
    beam.update();
    if (beam.bounces > before) { cornerX = prevX; cornerY = prevY; break; }
  }
  assert.ok(cornerX !== null, '反射していない');

  // 反射点（stepBeam が跳ね返りの起点にする「元の位置」）がどこかの節の
  // 端点になっているはず。なっていなければ、節が反射点をまたいで
  // 一直線に描かれている（角のショートカット）
  const touchesCorner = beam.segments().some((s) => (
    (Math.abs(s.x1 - cornerX) < 1e-9 && Math.abs(s.y1 - cornerY) < 1e-9)
    || (Math.abs(s.x2 - cornerX) < 1e-9 && Math.abs(s.y2 - cornerY) < 1e-9)
  ));
  assert.ok(touchesCorner, `反射点が節の境界になっていない（角をまたいでいる）: corner=(${cornerX},${cornerY})`);
});

test('古い節から順に消える', () => {
  const { beam } = makeBeam();
  // 帯がいっぱいになるまで進める
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE * 2; i++) beam.update();
  const full = beam.segments().length;
  assert.ok(full > 1, '節が増えていない');
  // 帯の長さは寿命で決まるので、これ以上は増えない
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_FRAMES * 3; i++) beam.update();
  assert.equal(beam.segments().length, full, '節が寿命を超えて増えている');
});

test('新しい節ほど寿命が残っている', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE; i++) beam.update();
  const lives = beam.segments().map((s) => s.life);
  // segments() は先端が先（[0] が新しい）
  for (let i = 1; i < lives.length; i++) {
    assert.ok(lives[i] < lives[i - 1], `寿命の並びが古い順になっていない: ${lives}`);
  }
});

// 上限に達した瞬間に帯ごと消えると唐突に見える。先端だけ止めて、
// 残った節が後ろから薄れて消えていく
test('上限に達しても節が残る間は生きている', () => {
  const { beam } = makeBeam();
  let steps = 0;
  while (!beam.spent && steps < 5000) { beam.update(); steps++; }
  assert.ok(beam.spent, '先端が止まっていない');
  assert.equal(beam.alive, true, '節が残っているのに消えている');
  assert.ok(beam.segments().length > 0, '節が残っていない');

  const headX = beam.x;
  const headY = beam.y;
  beam.update();
  assert.equal(beam.x, headX, '先端が止まっていない');
  assert.equal(beam.y, headY, '先端が止まっていない');

  // 節が全部消えたら初めて alive が false になる
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE + 2; i++) beam.update();
  assert.equal(beam.segments().length, 0);
  assert.equal(beam.alive, false, '節が尽きたのに消えていない');
});

// 古い節ほど薄く描く（ぼやけながら消える）
test('古い節ほど薄く描かれる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE; i++) beam.update();
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.length > 1, '節ごとに濃さを変えていない');
  assert.ok(Math.max(...alphas) > Math.min(...alphas), '全部同じ濃さで描いている');
});

// 地形を壊すと跳ね返り方がその場の破壊状況しだいになって読めなくなる
test('地形にダメージを与えない', () => {
  const { beam, map } = makeBeam({ x: 40, y: 40, angle: 0 });
  let damaged = 0;
  map.damageBlock = () => { damaged++; };
  for (let i = 0; i < 200; i++) beam.update();
  assert.equal(damaged, 0, '地形を壊している');
});

test('芯の色で描かれる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < 60; i++) beam.update();
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  const colors = ctx.calls.filter((c) => c.name === 'set:strokeStyle').map((c) => c.args[0]);
  assert.ok(colors.includes(COLOR_REFLECT_BEAM_CORE), '芯の色が使われていない');
});

test('死んだら描かない', () => {
  const { beam } = makeBeam();
  beam.alive = false;
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

// makeMap() は width/height を持たないので、update() の「マップ外なら消す」
// 分岐（`map.width !== undefined` のガード）がここまでのテストでは一度も
// 踏まれていない。tests/helpers/enemy-world.js 自体は共有ヘルパーなので触らず、
// このテストの中だけで width/height を持つ最小限のマップを組む。
// ROOM のような四方を壁で囲った部屋だと、外へ抜ける前に必ず壁で跳ね返って
// しまい、マップ外判定を踏めない。そこで地形が一切ない（常に非固体の）
// マップにして、まっすぐ境界の外まで飛ばす
test('マップ外に出ると消える', () => {
  const map = { isSolidAtPixel: () => false, width: 100, height: 100 };
  const game = { map, particles: [] };
  // 下向き(+y)に撃ち、y=90 から速度4で進めば数フレームで height=100 を超える
  const beam = new ReflectBeam(game, 40, 90, Math.PI / 2);
  let steps = 0;
  while (beam.alive && steps < 50) {
    beam.update();
    steps++;
  }
  assert.equal(beam.alive, false, 'マップ外に出ても消えていない');
  assert.ok(beam.y > map.height, `マップ外判定より先に別の理由で消えている: y=${beam.y}`);
});
