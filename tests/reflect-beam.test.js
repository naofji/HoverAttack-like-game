import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  REFLECT_BEAM_SPEED, REFLECT_BEAM_MAX_BOUNCES, REFLECT_BEAM_MAX_DISTANCE,
  REFLECT_BEAM_TAIL_SEGMENTS, COLOR_REFLECT_BEAM_CORE,
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

test('反射回数を使い切ると消える', () => {
  const { beam } = makeBeam({ x: 40, y: 40, angle: 0 });
  for (let i = 0; i < 2000; i++) beam.update();
  assert.equal(beam.alive, false, '消えていない');
  assert.ok(beam.bounces <= REFLECT_BEAM_MAX_BOUNCES + 1,
    `反射回数の上限を超えている: ${beam.bounces}`);
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

test('帯は設定した節の数になる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < 60; i++) beam.update();
  assert.equal(beam.segments().length, REFLECT_BEAM_TAIL_SEGMENTS);
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
