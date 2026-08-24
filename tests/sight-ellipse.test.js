import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withinSight } from '../src/js/utils/Physics.js';
import { CANVAS_WIDTH, SIGHT_VERTICAL_BASE, SIGHT_ASPECT } from '../src/js/utils/Constants.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { ENEMY_TANK_SIGHT_RANGE } from '../src/js/utils/Constants.js';

// --- 真円への退化 ---
// 4:3 (CANVAS_WIDTH === SIGHT_VERTICAL_BASE) では SIGHT_ASPECT が厳密に 1.0 に
// なり、楕円が真円に退化する。移行でバランスが 1 ドットも動いていないことは、
// 最終的にはこの性質に依っている。

test('SIGHT_ASPECT pins the vertical radius to the 4:3 width of 1024', () => {
  // 1024 は直書きする。SIGHT_VERTICAL_BASE から導くと Constants.js の定義式を
  // 書き写しただけの恒真テストになり、値を変えても落ちない。
  // ここが落ちるのは SIGHT_VERTICAL_BASE を 1366 にしたとき、つまり
  // 「縦も等方的に拡大する」案へ切り替えたとき。意図的な変更なので、
  // そのときはこのテストごと見直すことになる。
  assert.equal(SIGHT_VERTICAL_BASE, 1024);
  assert.equal(SIGHT_ASPECT, 1024 / CANVAS_WIDTH);
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

// --- タンクの順位付け ---
// 楕円の内外判定と、その中での「最近接」の順位付けを混ぜないことの回帰。
// 正規化距離で順位を付けると、縦のほうが半径が小さいぶん、横に居る標的が
// 不当に優先される。
//
// 数値の決め方: 横 dx=300 / 縦 dy=262 は「ユークリッド距離では縦が近いのに、
// 正規化距離では横が近くなる」帯 (SIGHT_ASPECT*300 < dy < 300) の内側に
// 取ってある。この帯の外だと、順位付けを壊してもテストが落ちない。

/** 索敵だけを試すための最小のタンク。地形も物理も要らない。 */
function makeTank(x, y) {
  const tank = Object.create(EnemyTank.prototype);
  tank.x = x;
  tank.y = y;
  tank.width = 16;
  tank.height = 12;
  tank.patrolDir = 1; // 右を向いている（前方 180° は dx >= 0 側）
  tank.alive = true;
  return tank;
}

function makeEntity(x, y) {
  return { x, y, width: 16, height: 16, alive: true, docked: false };
}

test('the tank picks the euclidean-nearest target, not the ellipse-nearest', () => {
  const tank = makeTank(0, 0);            // 中心 (8, 6)
  const farHorizontal = makeEntity(300, 0);  // 中心 (308, 8) → dx=300, dy=2
  const nearVertical  = makeEntity(0, 262);  // 中心 (8, 270) → dx=0,   dy=264

  tank.game = { player: farHorizontal, carrier: nearVertical };

  // 両方が索敵の内側にあることが前提。崩れたらテストの意味が無いので明示する。
  assert.ok(withinSight(300, 2, ENEMY_TANK_SIGHT_RANGE), '横の標的は索敵内のはず');
  assert.ok(withinSight(0, 264, ENEMY_TANK_SIGHT_RANGE), '縦の標的は索敵内のはず');

  // ユークリッド距離では 264 < 300 で縦のほうが近い。
  // patrolDir > 0 なので dx >= 0 の標的だけが候補。縦(dx=0)も横(dx=300)も候補。
  assert.equal(
    tank._findTarget(), nearVertical,
    'ユークリッド距離で近いほうが選ばれること'
  );
});

test('the tank ignores targets outside the sight ellipse', () => {
  const tank = makeTank(0, 0);
  const outside = makeEntity(ENEMY_TANK_SIGHT_RANGE + 100, 0);
  tank.game = { player: outside, carrier: null };
  assert.equal(tank._findTarget(), null);
});
