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

test('破片は全方位へ散りつつ、上向きに偏る（爆発で吹き上がる）', () => {
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  const buckets = new Array(8).fill(0);
  let up = 0;
  let total = 0;
  for (let i = 0; i < 40; i++) {
    for (const d of buildDebris(entity, 'carrier')) {
      const ang = Math.atan2(d.vy, d.vx);
      buckets[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8]++;
      if (d.vy < 0) up++;
      total++;
    }
  }
  // どの方向にも飛ぶ（一方向に潰れていない）
  for (const [i, n] of buckets.entries()) {
    assert.ok(n > 0, `方向 ${i} に破片が1つも飛んでいない`);
  }
  // ただし上向きが優勢。爆発なので吹き上がるのが自然
  const upRatio = up / total;
  assert.ok(upRatio > 0.55, `上向きに偏っていない: ${(upRatio * 100).toFixed(0)}%`);
  assert.ok(upRatio < 0.9, `上ばかりで放射に見えない: ${(upRatio * 100).toFixed(0)}%`);
});

test('初速は破片ごとにばらつく', () => {
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  const speeds = [];
  for (let i = 0; i < 20; i++) {
    for (const d of buildDebris(entity, 'carrier')) speeds.push(Math.hypot(d.vx, d.vy));
  }
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const sd = Math.sqrt(speeds.reduce((a, v) => a + (v - mean) ** 2, 0) / speeds.length);
  // 変動係数。小さいと全部が同じ速さで飛んで単調に見える
  assert.ok(sd / mean > 0.25,
    `初速が揃いすぎている: 変動係数 ${(sd / mean).toFixed(2)}`);
});

test('破片はよく回る（止まって見える破片が少ない）', () => {
  const entity = { x: 0, y: 0, width: 64, height: 32, vx: 0, vy: 0 };
  const spins = [];
  for (let i = 0; i < 20; i++) {
    for (const d of buildDebris(entity, 'carrier')) spins.push(Math.abs(d.spin));
  }
  const mean = spins.reduce((a, b) => a + b, 0) / spins.length;
  assert.ok(mean > 0.12, `回転が遅い: 平均 ${mean.toFixed(3)} rad/tick`);
  const barelySpinning = spins.filter((s) => s < 0.02).length / spins.length;
  assert.ok(barelySpinning < 0.1,
    `ほとんど回らない破片が多い: ${(barelySpinning * 100).toFixed(0)}%`);
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
