import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractFillRects, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { drawThrusterFlame, attackerFlamePower } from '../src/js/entities/thrusterFlame.js';
import {
  THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
  THRUSTER_FLAME_CORE_WHITE, ATTACKER_FLAME_POWER_MIN,
} from '../src/js/utils/Constants.js';
import { lerpColor } from '../src/js/utils/color.js';

/** 段の最下端（y+h の最大値）。炎の長さの代わりに使う。 */
function bottomOf(rects) {
  return Math.max(...rects.map((r) => r.y + r.h));
}

test('power が大きいほど炎が長い', () => {
  const weak = makeFakeCtx();
  const strong = makeFakeCtx();
  drawThrusterFlame(weak, 100, 50, { color: '#00FFFF', power: 0.1, flicker: 0.5 });
  drawThrusterFlame(strong, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  assert.ok(bottomOf(extractFillRects(strong.calls)) > bottomOf(extractFillRects(weak.calls)));
});

test('炎の長さが LEN_MIN 〜 LEN_MAX に収まる（flicker 込み）', () => {
  for (const flicker of [0, 0.5, 1]) {
    for (const power of [0, 0.5, 1]) {
      const ctx = makeFakeCtx();
      drawThrusterFlame(ctx, 0, 0, { color: '#00FFFF', power, flicker });
      const len = bottomOf(extractFillRects(ctx.calls));
      assert.ok(len >= Math.floor(THRUSTER_FLAME_LEN_MIN * 0.8),
        `len=${len} power=${power} flicker=${flicker}`);
      assert.ok(len <= Math.ceil(THRUSTER_FLAME_LEN_MAX * 1.2),
        `len=${len} power=${power} flicker=${flicker}`);
    }
  }
});

test('下へ行くほど段が狭い（台形になっている）', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  // 外炎だけを取り出す（最初の色で塗られた段）
  const withColor = extractFillRectsWithColor(ctx.calls);
  const outer = withColor.filter((r) => r.color === '#00FFFF');
  assert.equal(outer[0].w, THRUSTER_FLAME_WIDTH);
  for (let i = 1; i < outer.length; i++) {
    assert.ok(outer[i].w <= outer[i - 1].w, `段 ${i} が広がっている`);
    assert.equal(outer[i].y, outer[i - 1].y + 1, '段は 1px ずつ下がる');
  }
  assert.equal(outer[outer.length - 1].w, 1, '先端は 1px');
});

test('段はノズル中心に対して左右対称に置かれる', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  for (const r of extractFillRects(ctx.calls)) {
    const center = r.x + r.w / 2;
    assert.ok(Math.abs(center - 100) <= 0.5, `段の中心が ${center}（ノズルは 100）`);
  }
});

test('芯は外炎より短く、色が白寄り', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  const withColor = extractFillRectsWithColor(ctx.calls);
  const coreColor = lerpColor('#00FFFF', '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
  const outer = withColor.filter((r) => r.color === '#00FFFF');
  const core = withColor.filter((r) => r.color === coreColor);
  assert.ok(core.length > 0, '芯が描かれていない');
  assert.ok(bottomOf(core) < bottomOf(outer), '芯が外炎より長い');
  assert.ok(core[0].w < THRUSTER_FLAME_WIDTH, '芯が外炎より太い');
});

test('flicker を固定すれば描画は決定的', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  drawThrusterFlame(a, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  drawThrusterFlame(b, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  assert.deepEqual(extractFillRects(a.calls), extractFillRects(b.calls));
});

test('globalAlpha は 1.0 に戻される', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  assert.equal(ctx.globalAlpha, 1.0);
});

test('power は 0〜1 の外側でも壊れない', () => {
  const low = makeFakeCtx();
  const high = makeFakeCtx();
  drawThrusterFlame(low, 0, 0, { color: '#00FFFF', power: -5, flicker: 0.5 });
  drawThrusterFlame(high, 0, 0, { color: '#00FFFF', power: 9, flicker: 0.5 });
  assert.ok(bottomOf(extractFillRects(low.calls)) > 0);
  assert.ok(bottomOf(extractFillRects(high.calls)) <= Math.ceil(THRUSTER_FLAME_LEN_MAX * 1.2));
});

test('attackerFlamePower は 0.6〜1.0 に写す', () => {
  assert.equal(attackerFlamePower(0.45), ATTACKER_FLAME_POWER_MIN); // heavy = 最小
  assert.equal(attackerFlamePower(0.75), 1.0);                      // standard = 最大
  const rival = attackerFlamePower(0.65);
  assert.ok(rival > ATTACKER_FLAME_POWER_MIN && rival < 1.0);
  assert.ok(attackerFlamePower(0.65) > attackerFlamePower(0.5));    // rival > artillery
});
