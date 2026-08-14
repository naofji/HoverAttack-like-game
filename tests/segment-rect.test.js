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
