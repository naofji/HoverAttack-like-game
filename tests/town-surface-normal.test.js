// 町の建物・木に当たったグレネードの跳ね返りの向き。
// 縦横の軸だけで反転すると、三角形（円錐）の木の斜めの面で不自然に跳ねる（ユーザー指摘 2026-10-31）。
// かけら（4px）の並びから局所的な面の向き（法線）を推定し、その向きで反射する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { buildFir } from '../src/js/world/town/snowTrees.js';
import { surfaceNormal } from '../src/js/world/town/surfaceNormal.js';
import { bounceOffSurface, bounceOffTown } from '../src/js/utils/grenadePhysics.js';
import { GRENADE_BOUNCE, GRENADE_FRICTION, TOWN_BOUNCE_NORMAL_RADIUS } from '../src/js/utils/Constants.js';
import { fakeCanvas } from './helpers/town-fixtures.js';

const deg = (n) => (Math.atan2(n[0], -n[1]) * 180) / Math.PI;   // 0 = 真上、正 = 右へ傾く

test('法線: 横の壁（右が岩）は左向き、床（下が岩）は上向き', () => {
  const wall = surfaceNormal((x) => x >= 100, 100, 50, TOWN_BOUNCE_NORMAL_RADIUS);
  assert.ok(Math.abs(wall[0] + 1) < 1e-9 && Math.abs(wall[1]) < 1e-9, `${wall}`);
  const floor = surfaceNormal((x, y) => y >= 100, 50, 100, TOWN_BOUNCE_NORMAL_RADIUS);
  assert.ok(Math.abs(floor[0]) < 1e-9 && Math.abs(floor[1] + 1) < 1e-9, `${floor}`);
});

test('法線: 45° の斜面は 45° の向きを出す（縦横の軸に丸めない）', () => {
  // 岩は y > x（右上が空）。外向きの法線は右上 45°
  const n = surfaceNormal((x, y) => y > x, 100, 100, TOWN_BOUNCE_NORMAL_RADIUS);
  assert.ok(Math.abs(deg(n) - 45) < 8, `${deg(n)}°`);
});

test('法線: 周りが全部岩・全部空なら推定できない（null）', () => {
  assert.equal(surfaceNormal(() => true, 0, 0, TOWN_BOUNCE_NORMAL_RADIUS), null);
  assert.equal(surfaceNormal(() => false, 0, 0, TOWN_BOUNCE_NORMAL_RADIUS), null);
});

test('反射: 床（法線が真上）は縦だけ GRENADE_BOUNCE で跳ね返り、横は保つ', () => {
  const g = { vx: 2, vy: 3 };
  bounceOffSurface(g, 0, -1);
  assert.ok(Math.abs(g.vy + 3 * GRENADE_BOUNCE) < 1e-9, `${g.vy}`);
  assert.equal(g.vx, 2);
});

test('反射: 法線の向きの速さが遅ければ、跳ねずに面に沿わせて摩擦をかける', () => {
  const g = { vx: 2, vy: 0.3 };
  bounceOffSurface(g, 0, -1);
  assert.equal(g.vy, 0);
  assert.ok(Math.abs(g.vx - 2 * GRENADE_FRICTION) < 1e-9);
});

test('反射: 斜面（法線が右上 45°）に真下から当たると、右へ逸れる', () => {
  const s = Math.SQRT1_2;
  const g = { vx: 0, vy: 4 };
  bounceOffSurface(g, s, -s);
  assert.ok(g.vx > 1, `横へ逸れていない: ${g.vx}`);
  // 法線の向きの成分は GRENADE_BOUNCE 倍で反転、面に沿った成分は保たれる
  const vn = g.vx * s + g.vy * -s;
  assert.ok(Math.abs(vn - 4 * s * GRENADE_BOUNCE) < 1e-9, `${vn}`);
});

test('反射: 面に向かっていない速度（法線と同じ向き）には何もしない', () => {
  const g = { vx: 1, vy: -2 };
  bounceOffSurface(g, 0, -1);
  assert.deepEqual(g, { vx: 1, vy: -2 });
});

test('退避: 法線が無い（推定できない）ときは、動いた軸で反射する', () => {
  const side = { vx: 3, vy: 1 };
  bounceOffTown(side, true, false, null);
  assert.ok(Math.abs(side.vx + 3 * GRENADE_BOUNCE) < 1e-9 && side.vy === 1, `${side.vx},${side.vy}`);
  const top = { vx: 1, vy: 3 };
  bounceOffTown(top, false, true, null);
  assert.ok(Math.abs(top.vy + 3 * GRENADE_BOUNCE) < 1e-9 && top.vx === 1, `${top.vx},${top.vy}`);
});

test('退避: 推定した法線が面から離れる向き（速度と同じ向き）のときも、動いた軸で反射する', () => {
  const g = { vx: 3, vy: 0 };
  bounceOffTown(g, true, false, [1, 0]);   // 法線が進行方向と同じ = 当てにならない推定
  assert.ok(g.vx < 0, `${g.vx}`);
});

// ---------- 本物の木（針葉樹）に落とす ----------

const FLOOR_ROW = 20;
function firTown() {
  const b = buildFir(new SeededRNG(5), { maxH: 400 });
  const spec = {
    site: 'floor', style: 'P', soft: true, kind: b.kind,
    x: 100 - b.footX, y: FLOOR_ROW * 16 + 4 - b.h, w: b.w, h: b.h, parts: b.parts,
  };
  return new Town([spec], { createCanvas: fakeCanvas, isSolidTile: (r) => r >= FLOOR_ROW });
}

/** 真上から落とす弾の最小限。止まったら（bounce 以外の反応なら）stopped */
function dropper(town, x) {
  const b = town.buildings[0];
  const p = {
    townKind: 'grenade', alive: true, x, y: b.y + b.height - 1, vx: 0, vy: 0,
    _prevX: x, _prevY: b.y - 8, stopped: false,
  };
  p.onTownWall = () => { p.stopped = true; };
  p.vy = 6;
  p.y = b.y + b.height;   // 木の下端まで一気に落ちる 1 tick。途中で必ず木の外形に当たる
  return p;
}

test('円錐の木: 右の斜面に落ちたグレネードは右へ、左の斜面では左へはっきり逸れる（縦横の軸だけなら横は 0 のまま）', () => {
  // 実測（真上から 6px/フレームで落とした）: 斜面では横へ約 ±2.6〜3.3 逸れる。軸だけで反射する
  // 以前の実装は、斜面でも縦だけ反転するので横の速度が 0 のままだった
  const town = firTown();
  const b = town.buildings[0];
  for (const dx of [8, 12, 16]) {
    for (const sign of [1, -1]) {
      const p = dropper(town, 100 + sign * dx);
      town.sweepProjectile(p);
      assert.equal(p.stopped, false, '止まった（爆発した）');
      assert.ok(sign * p.vx > 1.5, `斜面で横へ逸れていない dx=${sign * dx}: vx=${p.vx}`);
    }
  }
  assert.equal(b.remaining, b.total, '欠かしてはいけない');
});

test('円錐の木: 頂点の近くに落ちると、斜面より上向きに跳ねる', () => {
  // 頂（x = 100）の真上は、面がほぼ水平なので、上へ跳ね返る（実測 vy = -1.1）
  const town = firTown();
  const p = dropper(town, 100);
  town.sweepProjectile(p);
  assert.ok(p.vy < 0, `頂で跳ね上がっていない: vy=${p.vy}`);
});
