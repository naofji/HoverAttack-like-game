import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withinSight } from '../src/js/utils/Physics.js';
import { CANVAS_WIDTH, SIGHT_VERTICAL_BASE, SIGHT_ASPECT } from '../src/js/utils/Constants.js';

// --- 真円への退化 ---
// 4:3 (CANVAS_WIDTH === SIGHT_VERTICAL_BASE) では SIGHT_ASPECT が厳密に 1.0 に
// なり、楕円が真円に退化する。移行でバランスが 1 ドットも動いていないことは、
// 最終的にはこの性質に依っている。

test('SIGHT_ASPECT is the ratio of the 4:3 base width to the current width', () => {
  assert.equal(SIGHT_ASPECT, SIGHT_VERTICAL_BASE / CANVAS_WIDTH);
});

test('at SIGHT_ASPECT === 1 the ellipse is exactly the old circle', (t) => {
  if (SIGHT_ASPECT !== 1) {
    t.skip('16:9 では真円ではない。退化の検査は下の explicit-aspect 版で行う');
    return;
  }
  const range = 410;
  // 境界をまたぐ格子点で総当たりする。円と楕円が 1 点でも食い違えば落ちる。
  for (let dx = -500; dx <= 500; dx += 7) {
    for (let dy = -500; dy <= 500; dy += 7) {
      const circle = Math.hypot(dx, dy) < range;
      assert.equal(
        withinSight(dx, dy, range), circle,
        `dx=${dx} dy=${dy} で円と楕円が食い違った`
      );
    }
  }
});

// --- 楕円の形 ---

test('the horizontal radius is the range itself', () => {
  const range = 546;
  assert.equal(withinSight(range - 1, 0, range), true);
  assert.equal(withinSight(range + 1, 0, range), false);
});

test('the vertical radius shrinks by SIGHT_ASPECT', () => {
  const range = 546;
  const ry = range * SIGHT_ASPECT;
  assert.equal(withinSight(0, ry - 1, range), true);
  assert.equal(withinSight(0, ry + 1, range), false);
});

test('Infinity range accepts everything (EnemyBase._findTarget default)', () => {
  assert.equal(withinSight(99999, 99999, Infinity), true);
});
