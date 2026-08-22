import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  panelAngles, panelOffsetX, panelDepth, isGuardAngle, guardBlocks, deployEase,
} from '../src/js/utils/orbitShield.js';

const HALF = 0.70; // ≈40°。Constants の初期値と同じ

test('2枚の羽根は180°向かい合う', () => {
  const a = panelAngles(0, 2);
  assert.equal(a.length, 2);
  assert.equal(a[0], 0);
  assert.ok(Math.abs(a[1] - Math.PI) < 1e-12, `${a[1]}`);
});

test('3枚なら120°ずつ離れる', () => {
  const a = panelAngles(0, 3);
  assert.ok(Math.abs(a[1] - (2 * Math.PI / 3)) < 1e-12);
  assert.ok(Math.abs(a[2] - (4 * Math.PI / 3)) < 1e-12);
});

test('位相0では羽根はコアの真正面（横ずれ0・手前）', () => {
  assert.ok(Math.abs(panelOffsetX(0, 16)) < 1e-12);
  assert.ok(panelDepth(0) > 0, '手前に来ていない');
});

test('位相πでは羽根はコアの真裏（横ずれ0・奥）', () => {
  assert.ok(Math.abs(panelOffsetX(Math.PI, 16)) < 1e-12);
  assert.ok(panelDepth(Math.PI) < 0, '奥に回っていない');
});

test('位相90°では羽根は軌道の右端まで出る', () => {
  assert.ok(Math.abs(panelOffsetX(Math.PI / 2, 16) - 16) < 1e-12);
});

test('ガードが成立するのは羽根が左右の端にいるときだけ', () => {
  assert.equal(isGuardAngle(Math.PI / 2, HALF), true, '右端でガードしていない');
  assert.equal(isGuardAngle(-Math.PI / 2, HALF), true, '左端でガードしていない');
  assert.equal(isGuardAngle(0, HALF), false, '真正面でガードしてしまう');
  assert.equal(isGuardAngle(Math.PI, HALF), false, '真裏でガードしてしまう');
});

test('ガード窓の境界は guardHalf ちょうど（内側は成立・外側は不成立）', () => {
  const inside = Math.PI / 2 - HALF + 1e-6;
  const outside = Math.PI / 2 - HALF - 1e-6;
  assert.equal(isGuardAngle(inside, HALF), true);
  assert.equal(isGuardAngle(outside, HALF), false);
});

test('ガード窓を広げるほど防いでいる時間が増える', () => {
  const duty = (half) => {
    let hit = 0;
    const N = 3600;
    for (let i = 0; i < N; i++) if (isGuardAngle((i / N) * Math.PI * 2, half)) hit++;
    return hit / N;
  };
  assert.ok(duty(0.9) > duty(0.7), 'ガード窓を広げても防御時間が増えない');
  assert.ok(Math.abs(duty(0.70) - 0.445) < 0.01, `初期値のデューティが想定外: ${duty(0.70)}`);
});

test('右から来た攻撃は右端の羽根で弾かれる', () => {
  assert.equal(guardBlocks([Math.PI / 2, -Math.PI / 2], 5, HALF), true);
});

test('左から来た攻撃も、2枚対向なら同時に弾かれる', () => {
  assert.equal(guardBlocks([Math.PI / 2, -Math.PI / 2], -5, HALF), true);
});

test('羽根が正面と真裏にいる間はどちらから来ても素通しする', () => {
  assert.equal(guardBlocks([0, Math.PI], 5, HALF), false);
  assert.equal(guardBlocks([0, Math.PI], -5, HALF), false);
});

test('1枚だけなら、その羽根がいる側からの攻撃しか弾かない', () => {
  assert.equal(guardBlocks([Math.PI / 2], 5, HALF), true, '右にいる羽根が右を守っていない');
  assert.equal(guardBlocks([Math.PI / 2], -5, HALF), false, '右にいる羽根が左まで守ってしまう');
});

test('真上（横ずれ0）からの攻撃は弾かれる側に倒す', () => {
  // 鉛直軸まわりの羽根に真上から撃ち込む理屈では通るべきだが、v1では
  // 「とどめの1発」しか関わらないので単純さを優先して弾く側に寄せている
  assert.equal(guardBlocks([Math.PI / 2, -Math.PI / 2], 0, HALF), true);
});

test('展開のイージングは0から1へ単調に上がりきる', () => {
  assert.equal(deployEase(0), 0);
  assert.equal(deployEase(1), 1);
  assert.ok(deployEase(0.5) > 0.5, '立ち上がりが速くない（ease-out になっていない）');
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = deployEase(i / 20);
    assert.ok(v >= prev, `単調でない: ${v} < ${prev}`);
    prev = v;
  }
});

test('展開の進捗は0..1にクランプされる', () => {
  assert.equal(deployEase(-1), 0);
  assert.equal(deployEase(3), 1);
});
