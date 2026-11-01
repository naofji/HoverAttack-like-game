// Orb の絵（ブラックオニキス風。設計 4.8）。光源は動かないので、石が回ってもハイライトは回さない。
// 縞と輪郭は転がった角度ぶん回る。黒い石が背景に溶けないよう縁にリムライトを入れる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Orb } from '../src/js/entities/Orb.js';

function makeOrb(size = 'small') {
  const game = { map: { isSolidPoint: () => false } };
  return new Orb(game, { cx: 100, cy: 100, size });
}

const named = (calls, name) => calls.filter((c) => c.name === name).map((c) => c.args);

test('Orb.draw は例外を投げず、塗りと縁取りをする', () => {
  for (const size of ['small', 'large']) {
    const ctx = makeFakeCtx();
    makeOrb(size).draw(ctx);
    assert.ok(named(ctx.calls, 'fill').length >= 2);
    assert.ok(named(ctx.calls, 'stroke').length >= 1);
  }
});

test('ハイライト（arc / ellipse）の位置は angle を変えても同じ、縞と輪郭の頂点は angle で回る', () => {
  const a = makeOrb(), b = makeOrb();
  b.angle = 1.3;
  const ca = makeFakeCtx(), cb = makeFakeCtx();
  a.draw(ca); b.draw(cb);
  const hl = (calls) => [...named(calls, 'arc'), ...named(calls, 'ellipse')].map((args) => args.slice(0, 2).map((v) => v.toFixed(3)).join(','));
  assert.deepEqual(hl(ca.calls), hl(cb.calls));
  const pts = (calls) => [...named(calls, 'moveTo'), ...named(calls, 'lineTo')].map((p) => p.map((v) => v.toFixed(3)).join(','));
  assert.notDeepEqual(pts(ca.calls), pts(cb.calls));
  assert.equal(pts(ca.calls).length, pts(cb.calls).length);
});

test('輪郭は Orb ごとに決まったいびつな多角形（位置から決まり、同じ位置なら同じ。乱数を使わない）', () => {
  const saved = Math.random;
  Math.random = () => { throw new Error('Math.random'); };
  try {
    const c1 = makeFakeCtx(), c2 = makeFakeCtx();
    makeOrb().draw(c1); makeOrb().draw(c2);
    assert.deepEqual(named(c1.calls, 'lineTo'), named(c2.calls, 'lineTo'));
  } finally {
    Math.random = saved;
  }
});
