import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris } from '../src/js/entities/debris/index.js';

function carrier(extra = {}) {
  return { x: 500, y: 300, width: 64, height: 32, vx: 0, vy: 0, ...extra };
}

/** 破片群の平均の飛ぶ向き。 */
function meanDir(debris) {
  const n = debris.length;
  return {
    x: debris.reduce((a, d) => a + d.vx, 0) / n,
    y: debris.reduce((a, d) => a + d.vy, 0) / n,
  };
}

test('被弾点が記録されていれば、そこを爆心として散る', () => {
  // 機体の左端を撃たれたら、破片は全体として右へ流れるはず
  const e = carrier({ lastHitX: 500, lastHitY: 316 });   // 左端
  let sum = 0;
  for (let i = 0; i < 60; i++) sum += meanDir(buildDebris(e, 'carrier')).x;
  assert.ok(sum / 60 > 0, `左端を撃たれたのに右へ流れない: ${(sum / 60).toFixed(2)}`);
});

test('反対側を撃たれれば反対へ流れる', () => {
  const e = carrier({ lastHitX: 564, lastHitY: 316 });   // 右端
  let sum = 0;
  for (let i = 0; i < 60; i++) sum += meanDir(buildDebris(e, 'carrier')).x;
  assert.ok(sum / 60 < 0, `右端を撃たれたのに左へ流れない: ${(sum / 60).toFixed(2)}`);
});

test('被弾点が無ければ従来どおりパーツの重心を爆心にする', () => {
  const e = carrier();
  const debris = buildDebris(e, 'carrier');
  assert.ok(debris.length > 0);
  // 左右対称な機体なので、横方向の平均はほぼ0に近いはず
  let sum = 0;
  for (let i = 0; i < 60; i++) sum += meanDir(buildDebris(e, 'carrier')).x;
  assert.ok(Math.abs(sum / 60) < 0.5, `中心から散っていない: ${(sum / 60).toFixed(2)}`);
});

test('被弾点が機体の外でも壊れない（範囲攻撃の巻き添えなど）', () => {
  const e = carrier({ lastHitX: 300, lastHitY: 100 });   // かなり離れた位置
  const debris = buildDebris(e, 'carrier');
  assert.ok(debris.length > 0);
  for (const d of debris) {
    assert.ok(Number.isFinite(d.vx) && Number.isFinite(d.vy), '速度が有限でない');
    assert.ok(Number.isFinite(d.spin), '角速度が有限でない');
  }
});

test('被弾点が破片とちょうど重なっても壊れない', () => {
  const e = carrier({ lastHitX: 532, lastHitY: 316 });   // 機体中心あたり
  for (const d of buildDebris(e, 'carrier')) {
    assert.ok(Number.isFinite(d.vx) && Number.isFinite(d.spin));
  }
});

test('被弾点を使うと回転しない破片が減る', () => {
  // 中心を爆心にすると、長軸が爆心方向と平行な破片はトルクが立たない。
  // 被弾点は中心からずれるので、軸が揃いにくくなる。
  const rev = (v) => Math.abs(v) * 60 / (2 * Math.PI);
  const stalled = (e) => {
    const spins = [];
    for (let i = 0; i < 80; i++) for (const d of buildDebris(e, 'drone')) spins.push(d.spin);
    return spins.filter((s) => rev(s) < 0.5).length / spins.length;
  };
  const base = { x: 0, y: 0, width: 24, height: 16, vx: 0, vy: 0, patrolDir: 1, tiltAngle: 0 };
  const centered = stalled(base);
  const hit = stalled({ ...base, lastHitX: 4, lastHitY: 3 });   // 左上を被弾
  assert.ok(hit < centered,
    `被弾点を使っても改善しない: 中心 ${(centered * 100).toFixed(0)}% → 被弾点 ${(hit * 100).toFixed(0)}%`);
});
