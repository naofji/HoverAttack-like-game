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

// 2026-11-01 ユーザー指定「もっと神秘的に」: 本体の縁は青みがかり、光の反射を増やし、周囲に紫〜赤紫のにじみ（blur）
const rgb = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  return h ? { r: parseInt(h[1].slice(0, 2), 16), g: parseInt(h[1].slice(2, 4), 16), b: parseInt(h[1].slice(4), 16), a: 1 } : null;
};

test('周囲に紫から赤紫へにじむ光の輪（半径の2倍より外まで広がり、外側で透明になる）', () => {
  const orb = makeOrb();
  const ctx = makeFakeCtx();
  orb.draw(ctx);
  const grads = ctx.calls.filter((c) => c.name === 'createRadialGradient').map((c) => c.grad);
  const aura = grads.find((g) => g.args[5] >= orb.r * 2);
  assert.ok(aura, 'にじみのグラデーションが無い');
  const cols = aura.stops.map(([, c]) => rgb(c));
  assert.ok(cols[0].b > cols[0].r && cols[0].b > cols[0].g, `内側が紫でない: ${aura.stops[0][1]}`);
  assert.ok(cols.some((c) => c.r > c.b && c.r > c.g * 1.5 && c.a > 0), '赤紫の帯が無い');
  assert.equal(cols[cols.length - 1].a, 0, '外側が透明でない');
});

test('本体の縁は青みがかっている（本体の塗りの一番外側の色は青が勝つ）', () => {
  const orb = makeOrb();
  const ctx = makeFakeCtx();
  orb.draw(ctx);
  const grads = ctx.calls.filter((c) => c.name === 'createRadialGradient').map((c) => c.grad);
  const body = grads.find((g) => g.args[5] <= orb.r * 1.1);
  assert.ok(body, '本体のグラデーションが無い');
  const edge = rgb(body.stops[body.stops.length - 1][1]);
  assert.ok(edge.b > edge.r + 20 && edge.b > edge.g, `縁が青くない: ${body.stops[body.stops.length - 1][1]}`);
});

test('光の反射が増えた（回らない艶が3つ以上）', () => {
  const ctx = makeFakeCtx();
  makeOrb().draw(ctx);
  assert.ok(named(ctx.calls, 'ellipse').length >= 3, `艶 ${named(ctx.calls, 'ellipse').length}`);
});

// 2026-11-01 ユーザー指定「縁がカクカクしているのを、もう少しなだらかに」: 輪郭は頂点を直線で結ばず、曲線でつなぐ
test('輪郭（塗りとリムライト）は直線ではなく曲線でつなぐ', () => {
  const ctx = makeFakeCtx();
  makeOrb().draw(ctx);
  const curves = named(ctx.calls, 'quadraticCurveTo').length + named(ctx.calls, 'bezierCurveTo').length;
  assert.ok(curves >= 16, `曲線 ${curves}（塗りとリムライトで頂点数×2 以上）`);
  // 直線は縞の3本だけ
  assert.equal(named(ctx.calls, 'lineTo').length, 3);
});

test('曲線の輪郭も、位置から決まり乱数を使わず、angle で回る', () => {
  const saved = Math.random;
  Math.random = () => { throw new Error('Math.random'); };
  try {
    const a = makeOrb(), b = makeOrb(), c = makeOrb();
    c.angle = 0.7;
    const [ca, cb, cc] = [makeFakeCtx(), makeFakeCtx(), makeFakeCtx()];
    a.draw(ca); b.draw(cb); c.draw(cc);
    assert.deepEqual(named(ca.calls, 'quadraticCurveTo'), named(cb.calls, 'quadraticCurveTo'));
    assert.notDeepEqual(named(ca.calls, 'quadraticCurveTo'), named(cc.calls, 'quadraticCurveTo'));
  } finally {
    Math.random = saved;
  }
});
