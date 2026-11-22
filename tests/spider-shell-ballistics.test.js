// スパイダーの弾の軌道の逆算（utils/shellBallistics.js）。弾の update() と同じ順で回して狙いを通るかを見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveLaunch, simulateShell } from '../src/js/utils/shellBallistics.js';

const V = 8;
const G = 0.1;

function landsNear(dx, dy) {
  const sol = solveLaunch(dx, dy, V, G);
  assert.ok(sol, `解がある (${dx}, ${dy})`);
  const pts = simulateShell(0, 0, sol.angle, V, G, sol.frames);
  assert.equal(pts.length, sol.frames);
  const p = pts[pts.length - 1];
  const err = Math.hypot(p.x - dx, p.y - dy);
  assert.ok(err <= 6, `狙いからのずれ ${err.toFixed(2)}px (${dx}, ${dy})`);
  return { sol, pts };
}

test('横 300・上 80 の点を低い弧で通る', () => {
  const { sol, pts } = landsNear(300, -80);
  // 低い弧: 最高点が狙いの点からそれほど上に出ない（高い弧なら数百 px 上がる）
  const apex = Math.min(...pts.map((p) => p.y));
  assert.ok(apex > -80 - 60, `最高点 ${apex}`);
  assert.ok(Math.cos(sol.angle) > 0);
});

test('左にある点にも届く', () => {
  const { sol } = landsNear(-250, -60);
  assert.ok(Math.cos(sol.angle) < 0);
});

test('下にある点にも届く（天井から撃つ）', () => {
  landsNear(120, 200);
});

test('真下の狙いでも NaN にならない', () => {
  const sol = solveLaunch(0, 150, V, G);
  assert.ok(sol);
  assert.ok(Number.isFinite(sol.angle));
  assert.ok(Number.isFinite(sol.frames) && sol.frames > 0);
  landsNear(0, 150);
});

test('真上の届く点にも NaN にならない', () => {
  landsNear(0, -100);
});

test('届かない点は null', () => {
  // 平地の最大到達距離は v²/g = 640
  assert.equal(solveLaunch(900, 0, V, G), null);
  // 真上も v²/(2g) = 320 より上は届かない
  assert.equal(solveLaunch(0, -400, V, G), null);
});
