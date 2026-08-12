import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeFakeCtx, extractFillRects } from './helpers/fake-ctx.js';
import { HOVER_MAX_FUEL, PLAYER_WIDTH, THRUSTER_FLAME_GAP } from '../src/js/utils/Constants.js';

/** コンストラクタを通さずに _drawHoverExhaust() だけ呼べる最小インスタンス。 */
function makePlayer(overrides = {}) {
  const p = Object.create(Player.prototype);
  p.x = 100; p.y = 50;
  p.width = PLAYER_WIDTH;
  p.facingRight = true;
  p.hovering = true;
  p.hoverFuel = HOVER_MAX_FUEL;
  return Object.assign(p, overrides);
}

/**
 * _drawHoverExhaust() は drawThrusterFlame() に flicker / sway を渡さないので、
 * 描画は Math.random() に依存する。長さを比較するテストが確率で落ちないよう、
 * 揺らぎの中央値（0.5 = 伸び縮みも横揺れもゼロ）に固定して描く。
 */
function drawExhaust(overrides) {
  const ctx = makeFakeCtx();
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try {
    makePlayer(overrides)._drawHoverExhaust(ctx);
  } finally {
    Math.random = realRandom;
  }
  return extractFillRects(ctx.calls);
}

test('ホバーしていなければ何も描かない', () => {
  assert.equal(drawExhaust({ hovering: false }).length, 0);
});

test('燃料が多いほど炎が長い', () => {
  const bottom = (rects) => Math.max(...rects.map((r) => r.y + r.h));
  const full = drawExhaust({ hoverFuel: HOVER_MAX_FUEL });
  const low = drawExhaust({ hoverFuel: HOVER_MAX_FUEL * 0.05 });
  assert.ok(bottom(full) > bottom(low));
});

test('炎はノズル（バックパック直下）から下へ伸びる', () => {
  const rects = drawExhaust({});
  const top = Math.min(...rects.map((r) => r.y));
  // _drawBody() のノズル矩形 fillRect(2, 12, 4, 2) の下端 (12+2=14) にノズルを合わせ、
  // そこから THRUSTER_FLAME_GAP ぶん離した位置が炎の根元（機体にめり込ませないため）
  assert.equal(top, 50 + 14 + THRUSTER_FLAME_GAP, 'this.y + 14 + GAP が根元');
  assert.ok(Math.max(...rects.map((r) => r.y + r.h)) > top, '下へ伸びていない');
});

test('左右の向きでノズル位置が入れ替わる', () => {
  const centerOf = (rects) => {
    const widest = rects.reduce((a, b) => (b.w > a.w ? b : a));
    return widest.x + widest.w / 2;
  };
  // 炎の根元の幅は奇数（先端 1px の左右対称な台形にするため）なので、
  // ノズル中心が整数でも描画矩形の中心は 0.5px ずれる。設計どおりの挙動
  // ノズル矩形 (2, 12, 4, 2) の中心 x (2+4/2=4) を向きで場合分け:
  // 右向き x + 4 = 104、左向き x + width - 4 = 112
  const right = centerOf(drawExhaust({ facingRight: true }));
  const left = centerOf(drawExhaust({ facingRight: false }));
  assert.ok(Math.abs(right - (100 + 4)) <= 0.5, `右向き: ${right}`);
  assert.ok(Math.abs(left - (100 + PLAYER_WIDTH - 4)) <= 0.5, `左向き: ${left}`);
});

test('globalAlpha を 1.0 に戻す（後続の描画を薄くしない）', () => {
  const ctx = makeFakeCtx();
  makePlayer()._drawHoverExhaust(ctx);
  assert.equal(ctx.globalAlpha, 1.0);
});
