import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractFillRects, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { drawThrusterFlame, attackerFlamePower } from '../src/js/entities/thrusterFlame.js';
import {
  THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
  THRUSTER_FLAME_CORE_WHITE, ATTACKER_FLAME_POWER_MIN,
  ATTACKER_CLIMB_THRUST_MIN, ATTACKER_CLIMB_THRUST_MAX,
  COLOR_HOVER_EXHAUST, ENEMY_ATTACKER_TYPES,
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

// lerpColor() は parseInt で色を解釈するので、hex 以外（例: 'rgba(0, 255, 255, 0.6)'）を
// 渡すと '#NaNNaNNaN' になる。実 canvas ではこれを fillStyle に代入しても無視され、
// 直前の色のまま描画される。つまり芯が外炎と同じ色になるだけの「無言の失敗」になり、
// テストが無ければ気付けない。COLOR_HOVER_EXHAUST は今回 rgba から hex に変えたばかりで、
// 将来また rgba に戻される危険があるため、色の形式そのものを縛る。
test('炎に渡す色はすべて #rrggbb 形式（rgba() 等が紛れ込むと lerpColor が無言で壊れる）', () => {
  const HEX6 = /^#[0-9A-Fa-f]{6}$/;
  assert.match(COLOR_HOVER_EXHAUST, HEX6, `COLOR_HOVER_EXHAUST=${COLOR_HOVER_EXHAUST}`);
  for (const [typeKey, cfg] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.match(cfg.exhaustColor, HEX6, `${typeKey}.exhaustColor=${cfg.exhaustColor}`);
  }
});

// ATTACKER_CLIMB_THRUST_MIN/MAX は ENEMY_ATTACKER_TYPES の climbThrust の実際の
// 最小・最大値を手で二重に持っているだけの定数。どちらかの型の climbThrust を変えて
// この定数を更新し忘れると、attackerFlamePower() が範囲外の値をクランプして型ごとの
// 差が静かに潰れるが、既存のテストはどれも落ちない。ここで整合性を縛る。
test('ATTACKER_CLIMB_THRUST_MIN/MAX は ENEMY_ATTACKER_TYPES の climbThrust の実際の範囲と一致する', () => {
  const climbThrusts = Object.values(ENEMY_ATTACKER_TYPES).map((cfg) => cfg.climbThrust);
  assert.equal(Math.min(...climbThrusts), ATTACKER_CLIMB_THRUST_MIN);
  assert.equal(Math.max(...climbThrusts), ATTACKER_CLIMB_THRUST_MAX);
});
