import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictLeadPoint, AimLeadTracker } from '../src/js/utils/aimLead.js';
import { AUTO_AIM_LEAD_MAX_TICKS } from '../src/js/utils/Constants.js';

const base = {
  shooterX: 0, shooterY: 0,
  targetX: 100, targetY: 0,
  targetVx: 0, targetVy: 0,
  projectileSpeed: 10,
  maxLeadTicks: AUTO_AIM_LEAD_MAX_TICKS,
  strength: 1,
};

test('止まっている敵には偏差を取らない', () => {
  const p = predictLeadPoint(base);
  assert.equal(p.x, 100);
  assert.equal(p.y, 0);
});

test('横切る敵には進行方向へ偏差を取る', () => {
  const p = predictLeadPoint({ ...base, targetVy: 2 });
  assert.equal(p.x, 100, '射線に垂直な移動なのでXは変わらない');
  assert.ok(p.y > 0, `進行方向へずれていない: ${p.y}`);
});

test('着弾予定地点は「そこへ弾が届く時間」と整合する', () => {
  // 収束したリード点では、弾の飛行時間と敵の到達時間が一致するはず
  const opts = { ...base, targetVy: 2, projectileSpeed: 10 };
  const p = predictLeadPoint(opts);
  const flightTicks = Math.hypot(p.x - opts.shooterX, p.y - opts.shooterY) / opts.projectileSpeed;
  const targetTicks = (p.y - opts.targetY) / opts.targetVy;
  assert.ok(Math.abs(flightTicks - targetTicks) < 0.5,
    `飛行時間 ${flightTicks} と敵の到達時間 ${targetTicks} が合わない`);
});

test('遅い弾ほど大きく偏差を取る', () => {
  const fast = predictLeadPoint({ ...base, targetVy: 2, projectileSpeed: 20 });
  const slow = predictLeadPoint({ ...base, targetVy: 2, projectileSpeed: 5 });
  assert.ok(slow.y > fast.y, `遅い弾の偏差が大きくない: ${slow.y} vs ${fast.y}`);
});

test('遠い敵ほど大きく偏差を取る', () => {
  const near = predictLeadPoint({ ...base, targetX: 50, targetVy: 2 });
  const far = predictLeadPoint({ ...base, targetX: 400, targetVy: 2 });
  assert.ok(far.y > near.y, `遠い敵の偏差が大きくない: ${far.y} vs ${near.y}`);
});

test('偏差の上限で頭打ちになる（遠くの高速な敵で暴走しない）', () => {
  const p = predictLeadPoint({
    ...base, targetX: 100000, targetVy: 50, projectileSpeed: 1, maxLeadTicks: 60,
  });
  assert.ok(p.y <= 50 * 60 + 1e-6, `上限を超えて予測した: ${p.y}`);
});

test('strength で偏差を弱められる', () => {
  const full = predictLeadPoint({ ...base, targetVy: 2, strength: 1 });
  const half = predictLeadPoint({ ...base, targetVy: 2, strength: 0.5 });
  assert.ok(half.y > 0 && half.y < full.y, `弱まっていない: ${half.y} vs ${full.y}`);
});

test('strength 0 なら敵の現在位置そのもの', () => {
  const p = predictLeadPoint({ ...base, targetVy: 2, strength: 0 });
  assert.equal(p.y, 0);
});

test('弾速が 0 以下なら偏差を取らない（ゼロ除算を避ける）', () => {
  const p = predictLeadPoint({ ...base, targetVy: 2, projectileSpeed: 0 });
  assert.deepEqual(p, { x: 100, y: 0 });
});

// --- AimLeadTracker -------------------------------------------------------

/** 中心が (cx, cy) になる敵のモック。 */
function enemyAt(cx, cy) {
  return { x: cx - 8, y: cy - 8, width: 16, height: 16 };
}

test('初回の計測では速度がゼロ（前フレームが無いので推測しない）', () => {
  const tracker = new AimLeadTracker(1);
  const v = tracker.measure(enemyAt(100, 100));
  assert.deepEqual(v, { vx: 0, vy: 0 });
});

test('2回目以降は中心座標の差分から速度を得る', () => {
  const tracker = new AimLeadTracker(1);   // smoothing 1 = 平滑化なし
  const e = enemyAt(100, 100);
  tracker.measure(e);
  e.x += 3;
  e.y -= 2;
  const v = tracker.measure(e);
  assert.equal(v.vx, 3);
  assert.equal(v.vy, -2);
});

test('平滑化係数で急な変化がなまる', () => {
  const tracker = new AimLeadTracker(0.5);
  const e = enemyAt(100, 100);
  tracker.measure(e);
  e.x += 4;
  const v = tracker.measure(e);
  assert.equal(v.vx, 2, '0 と 4 の中間になるはず');
});

test('対象が別の敵に変わったら速度をリセットする', () => {
  const tracker = new AimLeadTracker(1);
  const a = enemyAt(100, 100);
  tracker.measure(a);
  tracker.measure(enemyAt(110, 100));   // a と同一オブジェクトではない → リセット
  const v = tracker.measure(enemyAt(120, 100));
  // 直前のリセットで基準位置が入れ替わっているので、速度は 0 から測り直される
  assert.equal(v.vx, 0);
});

test('同じ敵を追い続けている間は速度が積み上がる', () => {
  const tracker = new AimLeadTracker(1);
  const e = enemyAt(100, 100);
  tracker.measure(e);
  e.x += 5;
  const v = tracker.measure(e);
  assert.equal(v.vx, 5);
});

test('reset() で次の計測が初回扱いに戻る', () => {
  const tracker = new AimLeadTracker(1);
  const e = enemyAt(100, 100);
  tracker.measure(e);
  tracker.reset();
  e.x += 5;
  assert.deepEqual(tracker.measure(e), { vx: 0, vy: 0 });
});
