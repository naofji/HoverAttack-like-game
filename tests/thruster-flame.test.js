import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractFillRects, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { drawThrusterFlame, attackerFlamePower } from '../src/js/entities/thrusterFlame.js';
import {
  THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
  THRUSTER_FLAME_CORE_WHITE, THRUSTER_FLAME_FLICKER,
  THRUSTER_FLAME_GAP, THRUSTER_FLAME_SWAY,
  ATTACKER_FLAME_POWER_MIN,
  ATTACKER_CLIMB_THRUST_MIN, ATTACKER_CLIMB_THRUST_MAX,
  COLOR_HOVER_EXHAUST, ENEMY_ATTACKER_TYPES,
} from '../src/js/utils/Constants.js';
import { lerpColor } from '../src/js/utils/color.js';

/** 段の最下端（y+h の最大値）。炎の長さの代わりに使う。 */
function bottomOf(rects) {
  return Math.max(...rects.map((r) => r.y + r.h));
}

/** 揺らぎを両方ゼロに固定した描画（幾何だけを見たいとき用）。 */
const STILL = { flicker: 0.5, sway: 0.5 };

test('power が大きいほど炎が長い', () => {
  const weak = makeFakeCtx();
  const strong = makeFakeCtx();
  drawThrusterFlame(weak, 100, 50, { color: '#00FFFF', power: 0.1, ...STILL });
  drawThrusterFlame(strong, 100, 50, { color: '#00FFFF', power: 1.0, ...STILL });
  assert.ok(bottomOf(extractFillRects(strong.calls)) > bottomOf(extractFillRects(weak.calls)));
});

// 期待値は定数から計算する。実機の見え方で LEN_* や FLICKER を動かしても、
// 「長さが定数の意味どおりに収まる」という主張だけが残るようにするため。
test('炎の長さが LEN_MIN 〜 LEN_MAX に収まる（flicker と GAP 込み）', () => {
  const minLen = Math.floor(THRUSTER_FLAME_LEN_MIN * (1 - THRUSTER_FLAME_FLICKER));
  const maxLen = Math.ceil(THRUSTER_FLAME_LEN_MAX * (1 + THRUSTER_FLAME_FLICKER));
  for (const flicker of [0, 0.5, 1]) {
    for (const power of [0, 0.5, 1]) {
      const ctx = makeFakeCtx();
      drawThrusterFlame(ctx, 0, 0, { color: '#00FFFF', power, flicker, sway: 0.5 });
      // nozzleY=0 なので、最下端 = GAP + 炎の長さ
      const len = bottomOf(extractFillRects(ctx.calls)) - THRUSTER_FLAME_GAP;
      assert.ok(len >= minLen, `len=${len} power=${power} flicker=${flicker}`);
      assert.ok(len <= maxLen, `len=${len} power=${power} flicker=${flicker}`);
    }
  }
});

test('炎の根元はノズル下端から GAP ぶん離れる（機体にめり込ませない）', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, ...STILL });
  const top = Math.min(...extractFillRects(ctx.calls).map((r) => r.y));
  assert.equal(top, 50 + THRUSTER_FLAME_GAP);
});

test('下へ行くほど段が狭い（台形になっている）', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, ...STILL });
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

test('sway=0.5 なら段はノズル中心に対して左右対称に置かれる', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, ...STILL });
  for (const r of extractFillRects(ctx.calls)) {
    const center = r.x + r.w / 2;
    assert.ok(Math.abs(center - 100) <= 0.5, `段の中心が ${center}（ノズルは 100）`);
  }
});

// 長さの伸び縮みだけだと「息をしている」だけで勢いに見えなかったので、先端の横揺れを足した。
// 根元まで一緒に振れるとノズルから炎が外れて見えるため、根元が動かないことも縛る。
test('sway は先端だけを左右に振る（根元は動かない）', () => {
  const left = makeFakeCtx();
  const right = makeFakeCtx();
  drawThrusterFlame(left, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5, sway: 0 });
  drawThrusterFlame(right, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5, sway: 1 });
  const lr = extractFillRects(left.calls);
  const rr = extractFillRects(right.calls);

  const rootCenter = (rects) => { const r = rects[0]; return r.x + r.w / 2; };
  assert.equal(rootCenter(lr), rootCenter(rr), '根元が振れている');

  const tipCenter = (rects) => { const r = rects[rects.length - 1]; return r.x + r.w / 2; };
  // 外炎の先端どうしで比べたいので、外炎の段だけを取り出す
  const outerOf = (ctx) => extractFillRectsWithColor(ctx.calls).filter((r) => r.color === '#00FFFF');
  const spread = tipCenter(outerOf(right)) - tipCenter(outerOf(left));
  assert.ok(spread >= THRUSTER_FLAME_SWAY, `先端の振れ幅 ${spread} が SWAY の2倍に届かない`);
});

test('芯は外炎より短く、色が白寄り', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, ...STILL });
  const withColor = extractFillRectsWithColor(ctx.calls);
  const coreColor = lerpColor('#00FFFF', '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
  const outer = withColor.filter((r) => r.color === '#00FFFF');
  const core = withColor.filter((r) => r.color === coreColor);
  assert.ok(core.length > 0, '芯が描かれていない');
  assert.ok(bottomOf(core) < bottomOf(outer), '芯が外炎より長い');
  assert.ok(core[0].w < THRUSTER_FLAME_WIDTH, '芯が外炎より太い');
});

// 芯の sway は長さの比で割り戻している。同じ px を渡すと短い芯のほうが急に傾いて
// 外炎からはみ出すため（_drawTaper の t は「その炎自身の先端まで」の比）。
test('芯は横に振れても外炎からはみ出さない', () => {
  for (const sway of [0, 1]) {
    const ctx = makeFakeCtx();
    drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5, sway });
    const withColor = extractFillRectsWithColor(ctx.calls);
    const coreColor = lerpColor('#00FFFF', '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
    const outer = withColor.filter((r) => r.color === '#00FFFF');
    const core = withColor.filter((r) => r.color === coreColor);
    for (const c of core) {
      const o = outer.find((r) => r.y === c.y);
      assert.ok(o, `芯の段 y=${c.y} に対応する外炎の段が無い`);
      assert.ok(c.x >= o.x && c.x + c.w <= o.x + o.w,
        `sway=${sway} y=${c.y}: 芯 [${c.x},${c.x + c.w}] が外炎 [${o.x},${o.x + o.w}] からはみ出した`);
    }
  }
});

test('flicker と sway を固定すれば描画は決定的', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  drawThrusterFlame(a, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3, sway: 0.8 });
  drawThrusterFlame(b, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3, sway: 0.8 });
  assert.deepEqual(extractFillRects(a.calls), extractFillRects(b.calls));
});

test('globalAlpha は 1.0 に戻される', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  assert.equal(ctx.globalAlpha, 1.0);
});

test('power は 0〜1 の外側でも壊れない', () => {
  const maxLen = Math.ceil(THRUSTER_FLAME_LEN_MAX * (1 + THRUSTER_FLAME_FLICKER));
  const low = makeFakeCtx();
  const high = makeFakeCtx();
  drawThrusterFlame(low, 0, 0, { color: '#00FFFF', power: -5, ...STILL });
  drawThrusterFlame(high, 0, 0, { color: '#00FFFF', power: 9, ...STILL });
  assert.ok(bottomOf(extractFillRects(low.calls)) > 0);
  assert.ok(bottomOf(extractFillRects(high.calls)) - THRUSTER_FLAME_GAP <= maxLen);
});

test('sway は 0〜1 の外側でも壊れない', () => {
  for (const sway of [-9, 9]) {
    const ctx = makeFakeCtx();
    drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5, sway });
    const rects = extractFillRects(ctx.calls);
    assert.ok(rects.length > 0);
    for (const r of rects) {
      assert.ok(Math.abs(r.x + r.w / 2 - 100) <= THRUSTER_FLAME_SWAY + 0.5,
        `sway=${sway} でクランプが効いていない（中心 ${r.x + r.w / 2}）`);
    }
  }
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
    assert.match(cfg.flameColor, HEX6, `${typeKey}.flameColor=${cfg.flameColor}`);
    assert.match(cfg.exhaustColor, HEX6, `${typeKey}.exhaustColor=${cfg.exhaustColor}`);
  }
});

// 炎を機体色に馴染ませると機体に溶けて見分けがつかなかったので、flameColor を
// exhaustColor（機体側の部品の色）から分離した。うっかり同じ値に戻すと元の見づらさに戻る。
test('4型とも炎の色が機体側の部品の色（exhaustColor）と別の色', () => {
  for (const [typeKey, cfg] of Object.entries(ENEMY_ATTACKER_TYPES)) {
    assert.notEqual(cfg.flameColor, cfg.exhaustColor, `${typeKey}`);
    assert.notEqual(cfg.flameColor, cfg.bodyColor, `${typeKey}`);
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
