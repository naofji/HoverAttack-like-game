import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falloff, envelope, puffAlphaAt, coverageAt, isConcealed } from '../src/js/utils/concealment.js';
import {
  SMOKE_PUFF_ALPHA_MAX, SMOKE_PUFF_LIFETIME, SMOKE_CONCEAL_THRESHOLD,
} from '../src/js/utils/Constants.js';

// --- 空間の減衰 ---------------------------------------------------------------

test('falloff は中心で1、半径で0', () => {
  assert.equal(falloff(0, 30), 1);
  assert.equal(falloff(30, 30), 0);
  assert.equal(falloff(45, 30), 0, '半径の外は0');
});

test('falloff は半ばまで濃さを保ち、端で急に落ちる', () => {
  // 指数2.5: 距離半分でまだ0.17、8割で0.009。中心が濃く縁が急、が数値で担保される
  assert.ok(falloff(15, 30) > 0.15, `半径の半分で薄すぎる: ${falloff(15, 30)}`);
  assert.ok(falloff(24, 30) < 0.02, `半径の8割で濃すぎる: ${falloff(24, 30)}`);
  // 単調減少
  let prev = Infinity;
  for (let d = 0; d <= 30; d += 3) {
    assert.ok(falloff(d, 30) <= prev, `d=${d} で増えている`);
    prev = falloff(d, 30);
  }
});

// --- 時間の包絡 ---------------------------------------------------------------

test('envelope は寿命の終わりで厳密に0（煙が残留しない）', () => {
  assert.equal(envelope(1), 0);
  assert.equal(envelope(1.5), 0, '寿命を過ぎても0');
});

test('envelope は生まれた瞬間ではなく立ち上がってから濃くなる', () => {
  assert.equal(envelope(0), 0, '生まれた瞬間は透明');
  assert.ok(envelope(0.05) > 0.9, `立ち上がり切っていない: ${envelope(0.05)}`);
});

test('envelope は立ち上がり後は単調に薄れる', () => {
  let prev = Infinity;
  for (let u = 0.05; u <= 1.0001; u += 0.05) {
    const e = envelope(u);
    assert.ok(e <= prev + 1e-9, `u=${u.toFixed(2)} で濃くなっている`);
    prev = e;
  }
});

test('envelope は消える直前でも十分薄い（ぷつりと切れない）', () => {
  assert.ok(envelope(0.95) < 0.1, `消える寸前が濃い: ${envelope(0.95)}`);
});

// --- パフ1枚の alpha ----------------------------------------------------------

test('puffAlphaAt は空間と時間の積で、最大でも SMOKE_PUFF_ALPHA_MAX', () => {
  const peak = puffAlphaAt(0, 30, 0.05);
  assert.ok(peak <= SMOKE_PUFF_ALPHA_MAX + 1e-9);
  assert.ok(peak > SMOKE_PUFF_ALPHA_MAX * 0.9, `頂点が出ていない: ${peak}`);
  assert.equal(puffAlphaAt(0, 30, 1), 0, '寿命の終わりは0');
});

// --- 重なりの濃度 -------------------------------------------------------------

function puff(x, y, radius = 30, age = SMOKE_PUFF_LIFETIME * 0.2) {
  return { x, y, radius, age };
}

test('coverageAt は重なった枚数だけ濃くなる', () => {
  const one = coverageAt(100, 100, [{ puffs: [puff(100, 100)] }]);
  const three = coverageAt(100, 100, [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100)] }]);
  assert.ok(three > one, '重なっても濃くならない');
  // 透過率の積: 1-(1-a)^3
  const a = puffAlphaAt(0, 30, SMOKE_PUFF_LIFETIME * 0.2 / SMOKE_PUFF_LIFETIME);
  assert.ok(Math.abs(three - (1 - Math.pow(1 - a, 3))) < 1e-9, '合成式が透過率の積になっていない');
});

test('coverageAt は煙の外では0', () => {
  assert.equal(coverageAt(500, 500, [{ puffs: [puff(100, 100)] }]), 0);
});

test('煙が無ければ何も隠れない', () => {
  assert.equal(coverageAt(100, 100, []), 0);
  assert.equal(isConcealed(100, 100, []), false);
});

test('重なり3枚で隠れ、薄れると隠れなくなる', () => {
  const dense = [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100), puff(100, 100)] }];
  assert.equal(isConcealed(100, 100, dense), true);

  // 同じ枚数でも寿命の終わり際なら隠れない（見た目が薄いなら狙える）
  const old = [{ puffs: [
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
    puff(100, 100, 30, SMOKE_PUFF_LIFETIME * 0.95),
  ] }];
  assert.equal(isConcealed(100, 100, old), false);
});

test('しきい値は 0 と 1 の間にある（無効化・常時発動を防ぐ）', () => {
  assert.ok(SMOKE_CONCEAL_THRESHOLD > 0 && SMOKE_CONCEAL_THRESHOLD < 1);
});
