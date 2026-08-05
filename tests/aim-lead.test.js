import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictLeadPoint, AimLeadTracker } from '../src/js/utils/aimLead.js';
import {
  AUTO_AIM_LEAD_MAX_TICKS, AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE,
} from '../src/js/utils/Constants.js';

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

/** 敵を毎tick (dx, dy) ずつ動かしながら n 回計測し、最後の速度を返す。 */
function trackLinear(tracker, e, dx, dy, n) {
  let v = { vx: 0, vy: 0 };
  for (let i = 0; i < n; i++) {
    v = tracker.measure(e);
    e.x += dx;
    e.y += dy;
  }
  return v;
}

test('初回の計測では速度がゼロ（履歴が無いので推測しない）', () => {
  const tracker = new AimLeadTracker(13, 0);
  const v = tracker.measure(enemyAt(100, 100));
  assert.deepEqual(v, { vx: 0, vy: 0 });
});

test('等速で動く敵の速度をそのまま測れる', () => {
  const tracker = new AimLeadTracker(13, 0);
  const v = trackLinear(tracker, enemyAt(100, 100), 3, -2, 20);
  assert.ok(Math.abs(v.vx - 3) < 1e-9, `vx=${v.vx}`);
  assert.ok(Math.abs(v.vy + 2) < 1e-9, `vy=${v.vy}`);
});

test('窓が埋まるまでは速度を報告しない', () => {
  // 区間数が半端だと戦車の見かけの往復が打ち消し合わず、
  // ロック直後だけ照準が飛ぶ。埋まるまでは偏差ゼロで待つ。
  const tracker = new AimLeadTracker(13, 0);
  const v = trackLinear(tracker, enemyAt(100, 100), 2, 0, 12);
  assert.deepEqual(v, { vx: 0, vy: 0 });
});

test('窓が埋まった直後から速度を報告する', () => {
  const tracker = new AimLeadTracker(13, 0);
  const v = trackLinear(tracker, enemyAt(100, 100), 2, 0, 13);
  assert.ok(Math.abs(v.vx - 2) < 1e-9, `vx=${v.vx}`);
});

test('デッドゾーン未満の速度はゼロに落とす', () => {
  const tracker = new AimLeadTracker(13, 0.15);
  const v = trackLinear(tracker, enemyAt(100, 100), 0.05, 0, 20);
  assert.equal(v.vx, 0);
});

test('デッドゾーンを超える速度はそのまま通す', () => {
  const tracker = new AimLeadTracker(13, 0.15);
  const v = trackLinear(tracker, enemyAt(100, 100), 0.41, 0, 20);
  assert.ok(Math.abs(v.vx - 0.41) < 1e-9, `戦車の実移動が消えている: ${v.vx}`);
});

// 実機で報告された不具合の回帰テスト。
// 地上の戦車は着地スナップの都合で中心Yが 3 tick 周期で +0.3 / +0.6 / -0.9 と
// 揺れる（正味の移動はゼロ）。1 tick の差分をそのまま使うと、この見かけの
// 往復が飛行時間で増幅されて照準が激しく上下に振動していた。
test('上下していない戦車の見かけの往復を速度として拾わない', () => {
  const tracker = new AimLeadTracker(13, 0.15);
  const e = enemyAt(100, 100);
  const cycle = [0.3, 0.6, -0.9];   // 実測した戦車の中心Yの変位

  let worst = 0;
  for (let i = 0; i < 60; i++) {
    const v = tracker.measure(e);
    worst = Math.max(worst, Math.abs(v.vy));
    e.y += cycle[i % cycle.length];
  }
  assert.equal(worst, 0, `静止している戦車に縦速度が出た: ${worst}`);
});

test('往復しながら本当に下降している敵は下降ぶんを拾う', () => {
  // 見かけの往復を消しても、正味の移動まで消してはいけない
  const tracker = new AimLeadTracker(13, 0.15);
  const e = enemyAt(100, 100);
  const cycle = [0.3 + 0.5, 0.6 + 0.5, -0.9 + 0.5];   // 3tick 周期 + 毎tick 0.5 の下降

  let v = { vx: 0, vy: 0 };
  for (let i = 0; i < 60; i++) {
    v = tracker.measure(e);
    e.y += cycle[i % cycle.length];
  }
  assert.ok(Math.abs(v.vy - 0.5) < 1e-9, `正味の下降を拾えていない: ${v.vy}`);
});

test('対象が別の敵に変わったら履歴を捨てる', () => {
  const tracker = new AimLeadTracker(13, 0);
  const a = enemyAt(100, 100);
  trackLinear(tracker, a, 5, 0, 20);
  const b = enemyAt(400, 100);
  const v = tracker.measure(b);
  assert.deepEqual(v, { vx: 0, vy: 0 }, '前の敵の速度を引き継いでいる');
});

test('reset() で次の計測が初回扱いに戻る', () => {
  const tracker = new AimLeadTracker(13, 0);
  const e = enemyAt(100, 100);
  trackLinear(tracker, e, 5, 0, 20);
  tracker.reset();
  e.x += 5;
  assert.deepEqual(tracker.measure(e), { vx: 0, vy: 0 });
});

test('窓の長さは戦車の振動周期(3tick)の倍数を含む', () => {
  // 窓の区間数が周期の倍数なら、見かけの往復がちょうど打ち消し合う
  assert.equal((AUTO_AIM_LEAD_WINDOW - 1) % 3, 0,
    `窓の区間数 ${AUTO_AIM_LEAD_WINDOW - 1} が 3 の倍数でない`);
});

test('デッドゾーンは戦車の実移動より十分小さい', () => {
  // 戦車の水平移動は実測 0.41px/tick。これを消してしまってはいけない
  assert.ok(AUTO_AIM_LEAD_DEADZONE < 0.41 / 2,
    `デッドゾーンが大きすぎる: ${AUTO_AIM_LEAD_DEADZONE}`);
});
