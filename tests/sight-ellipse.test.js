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
    t.skip('16:9 では真円ではない。楕円式そのものの検査は下の "the ellipse matches an independently-normalized circle" で行う');
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

// 上のテストは SIGHT_ASPECT === 1 (4:3) でしか実行されず、現行の 16:9 設定
// （SIGHT_ASPECT ≈ 0.7496）では常にスキップされる。つまり出荷時の設定では
// 「移行で挙動が変わっていない」ことの最有力の裏付けが動いていない。
//
// ここでは実際の SIGHT_ASPECT（1でも1以外でも）で常時走る検査を足す。
// withinSight の実装 (dx/range)**2 + (dy/ry)**2 < 1 をそのまま書き写すと
// 恒真テストになってしまう（実装のバグごと一致してしまい、何も検出できない）。
// そこで「dy を SIGHT_ASPECT で正規化してから円判定する」という、実装と
// 独立に導出できる同値な式 hypot(dx, dy/SIGHT_ASPECT) < range で照合する。
// 楕円の式を代数的に変形すれば同じものだが、コードとしては別の経路を通るため、
// withinSight 側の実装ミス（例: ry の計算を間違える、不等号を変える）を
// 拾える。ミューテーション確認済み: ry を range*0.5 に変えるとこのテストは
// 落ちる（Physics.js は変更していない。確認のためだけに一時的に書き換えて戻した）。
test('the ellipse matches an independently-normalized circle at the current SIGHT_ASPECT', () => {
  const range = 410;
  // 退化テストと同じ格子・同じ range にして、2つが対になって読めるようにする。
  for (let dx = -500; dx <= 500; dx += 7) {
    for (let dy = -500; dy <= 500; dy += 7) {
      const normalizedCircle = Math.hypot(dx, dy / SIGHT_ASPECT) < range;
      assert.equal(
        withinSight(dx, dy, range), normalizedCircle,
        `dx=${dx} dy=${dy} で楕円と正規化円が食い違った`
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
