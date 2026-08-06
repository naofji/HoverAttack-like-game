import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRect, buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import {
  DEBRIS_SPLIT_PIECES, DEBRIS_SPLIT_MIN_SIZE, DEBRIS_SLAT_CHANCE,
} from '../src/js/utils/Constants.js';

/** 縦横比（1 に近いほど正方形、大きいほど細長い）。 */
const aspect = (p) => Math.max(p.w, p.h) / Math.min(p.w, p.h);

test('格子分割は正方形に近い破片になる', () => {
  const pieces = splitRect(40, 40, 'grid');
  const worst = Math.max(...pieces.map(aspect));
  assert.ok(worst < 4, `格子なのに細長い破片がある: 縦横比 ${worst.toFixed(1)}`);
});

test('柵状分割は細長い破片になる', () => {
  const pieces = splitRect(40, 40, 'slat');
  const avg = pieces.reduce((a, p) => a + aspect(p), 0) / pieces.length;
  assert.ok(avg > 3, `細長くなっていない: 平均の縦横比 ${avg.toFixed(1)}`);
});

test('柵状分割は全ての破片が同じ向きに伸びる', () => {
  // 短い辺だけを繰り返し割るので、破片は全部が横長か全部が縦長になる
  const pieces = splitRect(40, 40, 'slat');
  const wide = pieces.filter((p) => p.w > p.h).length;
  assert.ok(wide === 0 || wide === pieces.length,
    `向きが混ざっている: 横長 ${wide} / ${pieces.length}`);
});

test('どちらの分割でも面積は保存される', () => {
  for (const style of ['grid', 'slat']) {
    const pieces = splitRect(40, 24, style);
    const total = pieces.reduce((a, p) => a + p.w * p.h, 0);
    assert.ok(Math.abs(total - 40 * 24) < 1e-9, `${style}: 面積が変わった ${total}`);
  }
});

test('どちらの分割でも最小サイズを下回らない', () => {
  for (const style of ['grid', 'slat']) {
    for (const p of splitRect(40, 24, style)) {
      assert.ok(Math.min(p.w, p.h) >= DEBRIS_SPLIT_MIN_SIZE - 1e-9,
        `${style}: ${p.w}x${p.h} が最小(${DEBRIS_SPLIT_MIN_SIZE})を下回る`);
    }
  }
});

test('どちらの分割でも片数の上限を守る', () => {
  for (const style of ['grid', 'slat']) {
    assert.ok(splitRect(40, 24, style).length <= DEBRIS_SPLIT_PIECES);
  }
});

test('柵状分割は一定の割合で混ざる（全部が格子でも全部が柵でもない）', () => {
  assert.ok(DEBRIS_SLAT_CHANCE > 0 && DEBRIS_SLAT_CHANCE < 1,
    `混ざらない設定になっている: ${DEBRIS_SLAT_CHANCE}`);

  // 実際に機体1体ぶんを何度も作って、両方の形が現れることを見る
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  let sawSlat = false;
  let sawBlock = false;
  for (let i = 0; i < 40 && !(sawSlat && sawBlock); i++) {
    for (const d of buildDebris(entity, 'carrier')) {
      const a = Math.max(d.w, d.h) / Math.min(d.w, d.h);
      if (a > 4) sawSlat = true;
      if (a < 2) sawBlock = true;
    }
  }
  assert.ok(sawSlat, '細長い破片が一度も出ない');
  assert.ok(sawBlock, '塊状の破片が一度も出ない');
});

// --- 散らばり方 -------------------------------------------------------------

test('破片は全方位へ散る（機体の輪郭に沿って平たく広がらない）', () => {
  // 母艦は 64x32 と横長。放射方向だけで決めると横に偏る。
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  const buckets = new Array(8).fill(0);
  for (let i = 0; i < 30; i++) {
    for (const d of buildDebris(entity, 'carrier')) {
      const ang = Math.atan2(d.vy, d.vx);
      const idx = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8;
      buckets[idx]++;
    }
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  const expected = total / 8;
  for (const [i, n] of buckets.entries()) {
    assert.ok(n > expected * 0.35,
      `方向 ${i} に破片がほとんど飛んでいない: ${n} (期待 ${expected.toFixed(0)})`);
  }
});

test('細長い破片ほどよく回る', () => {
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  const slat = [];
  const block = [];
  for (let i = 0; i < 40; i++) {
    for (const d of buildDebris(entity, 'carrier')) {
      const a = Math.max(d.w, d.h) / Math.min(d.w, d.h);
      (a > 4 ? slat : block).push(Math.abs(d.spin));
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(slat.length > 0 && block.length > 0, '比較する破片が足りない');
  assert.ok(mean(slat) > mean(block),
    `細長い破片の回転が速くない: ${mean(slat).toFixed(3)} vs ${mean(block).toFixed(3)}`);
});
