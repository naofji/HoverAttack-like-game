import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamSegments } from '../src/js/utils/beamPath.js';

/** 線分の長さ。 */
const len = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
/** 線分列の合計長。 */
const total = (segs) => segs.reduce((a, s) => a + len(s), 0);

// 帯は「先端から一定の長さ」。経路が十分に長ければ、常に同じ長さで同じ本数
test('まっすぐな経路を等分した帯になる', () => {
  // 先端 (100,0) から後ろへ 10px 刻みで伸びる経路
  const path = [];
  for (let i = 0; i <= 30; i++) path.push({ x: 100 - i * 10, y: 0 });

  const segs = beamSegments(path, 160, 8);
  assert.equal(segs.length, 8, '8等分になっていない');
  assert.ok(Math.abs(total(segs) - 160) < 1e-6, `合計長が 160 でない: ${total(segs)}`);
  for (const s of segs) {
    assert.ok(Math.abs(len(s) - 20) < 1e-6, `1節が 20px でない: ${len(s)}`);
  }
});

// 先端から後ろへ向かう順で、隣り合う線分がつながっていること
test('線分は先端から後ろへ連なる', () => {
  const path = [];
  for (let i = 0; i <= 30; i++) path.push({ x: 100 - i * 10, y: 0 });

  const segs = beamSegments(path, 160, 8);
  assert.deepEqual({ x: segs[0].x1, y: segs[0].y1 }, { x: 100, y: 0 }, '先端から始まっていない');
  for (let i = 1; i < segs.length; i++) {
    assert.ok(Math.abs(segs[i].x1 - segs[i - 1].x2) < 1e-6, `${i} 本目がつながっていない`);
    assert.ok(Math.abs(segs[i].y1 - segs[i - 1].y2) < 1e-6, `${i} 本目がつながっていない`);
  }
});

// 撃った直後。全長で現れると砲口より後ろにビームが生えて見えるので、
// 帯は短いまま返す（等分する数は変えない）
test('経路が短いうちは帯も短い', () => {
  const path = [{ x: 40, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }];
  const segs = beamSegments(path, 160, 8);
  assert.equal(segs.length, 8, '本数は変えない');
  assert.ok(Math.abs(total(segs) - 40) < 1e-6, `経路長 40 に収まっていない: ${total(segs)}`);
});

// 反射した直後。折れ点をまたぐ帯になる（ここが折れないと、当たり判定が
// 見た目と食い違って理不尽になる）
test('折れた経路では帯も折れる', () => {
  // (100,0) が先端。(40,0) で折れて、そこから下へ伸びている
  const path = [{ x: 100, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }];
  const segs = beamSegments(path, 120, 6);

  assert.equal(segs.length, 6);
  assert.ok(Math.abs(total(segs) - 120) < 1e-6);
  // 帯の終端は折れた先（下向き）に来ている
  const last = segs[segs.length - 1];
  assert.ok(Math.abs(last.x2 - 40) < 1e-6, `終端が折れた先に無い: x=${last.x2}`);
  assert.ok(Math.abs(last.y2 - 60) < 1e-6, `終端が折れた先に無い: y=${last.y2}`);
  // 横向きの線分と縦向きの線分が両方ある
  assert.ok(segs.some((s) => Math.abs(s.y2 - s.y1) < 1e-6), '横向きの節が無い');
  assert.ok(segs.some((s) => Math.abs(s.x2 - s.x1) < 1e-6), '縦向きの節が無い');
});

test('経路が1点以下なら空', () => {
  assert.deepEqual(beamSegments([], 160, 8), []);
  assert.deepEqual(beamSegments([{ x: 0, y: 0 }], 160, 8), []);
});
