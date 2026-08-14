import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentIntersectsRect } from '../src/js/utils/Physics.js';

const RECT = { x: 100, y: 100, width: 20, height: 40 };

// 点の判定との差が出るのがここ。細長い自機を横切るビームは、両端が
// 矩形の外にあるのに途中で貫いている、という形になる
test('両端が外でも横切っていれば当たる', () => {
  assert.equal(segmentIntersectsRect(80, 120, 140, 120, RECT), true);
});

test('斜めに貫いても当たる', () => {
  assert.equal(segmentIntersectsRect(80, 90, 140, 150, RECT), true);
});

test('端点が中にあれば当たる', () => {
  assert.equal(segmentIntersectsRect(110, 120, 200, 300, RECT), true);
});

test('線分が矩形の中に完全に入っていれば当たる', () => {
  assert.equal(segmentIntersectsRect(105, 110, 115, 130, RECT), true);
});

test('手前で止まっていれば当たらない', () => {
  assert.equal(segmentIntersectsRect(80, 120, 99, 120, RECT), false);
});

test('矩形の外を素通りすれば当たらない', () => {
  assert.equal(segmentIntersectsRect(80, 200, 140, 200, RECT), false);
});

// 帯の1節が潰れている（長さ0）ことは実際に起きる。撃った直後など
test('長さ0の線分は点として判定する', () => {
  assert.equal(segmentIntersectsRect(110, 120, 110, 120, RECT), true);
  assert.equal(segmentIntersectsRect(10, 10, 10, 10, RECT), false);
});

// 境界を含む判定であることを縛る。ここを厳密不等号に変えると落ちる。
// 帯の判定なので、矩形の縁をかすめて当たらないほうが理不尽に見える。
test('矩形の辺にちょうど接する線分は当たる', () => {
  // 上辺 (y=100) をなぞる水平線。両端が矩形の左右外だが、辺の上を走る
  assert.equal(segmentIntersectsRect(80, 100, 140, 100, RECT), true);
  // 右辺 (x=120) をなぞる垂直線
  assert.equal(segmentIntersectsRect(120, 80, 120, 150, RECT), true);
});

// 境界を含む判定であることを縛る。ここを厳密不等号に変えると落ちる
test('矩形の角だけをかすめる線分は当たる', () => {
  // 左上角 (100, 100) を通る対角線。内部を通らず角だけに接する
  assert.equal(segmentIntersectsRect(90, 110, 110, 90, RECT), true);
  // 右下角 (120, 140) を通る対角線
  assert.equal(segmentIntersectsRect(110, 150, 130, 130, RECT), true);
});
