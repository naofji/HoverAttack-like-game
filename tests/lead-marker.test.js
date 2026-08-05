import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crosshair } from '../src/js/ui/Crosshair.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';
import {
  LEAD_MARKER_MIN_OFFSET, LEAD_MARKER_RADIUS, LEAD_MARKER_DASH,
  HUD_TOP_HEIGHT,
} from '../src/js/utils/Constants.js';

/** Crosshair が触る最小限の game。カメラ原点は 0 にしてワールド＝スクリーンにする。 */
function makeGame({ target, lead }) {
  return {
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    player: { autoAimTimer: 100 },
    autoAimTarget: target,
    autoAimLeadPoint: lead,
    input: {
      crosshairLocked: false,
      lockedWorldX: 0, lockedWorldY: 0,
      mouse: { x: 0, y: 0 },
    },
  };
}

/** setLineDash の呼び出し履歴。 */
function dashCalls(calls) {
  return calls.filter((c) => c.name === 'setLineDash').map((c) => c.args[0]);
}

/** arc 呼び出しを {x,y,r} で取り出す。 */
function arcs(calls) {
  return calls.filter((c) => c.name === 'arc').map((c) => ({
    x: c.args[0], y: c.args[1], r: c.args[2],
  }));
}

const TARGET = { x: 400, y: 300 };

test('偏差が無ければリードマーカーを出さない', () => {
  const game = makeGame({ target: TARGET, lead: { ...TARGET } });
  const ctx = makeFakeCtx();
  new Crosshair(game).draw(ctx);
  assert.equal(arcs(ctx.calls).length, 0, '円が描かれている');
  assert.equal(dashCalls(ctx.calls).length, 0, '破線が引かれている');
});

test('ずれが閾値未満ならリードマーカーを出さない', () => {
  const lead = { x: TARGET.x + LEAD_MARKER_MIN_OFFSET - 0.5, y: TARGET.y };
  const ctx = makeFakeCtx();
  new Crosshair(makeGame({ target: TARGET, lead })).draw(ctx);
  assert.equal(arcs(ctx.calls).length, 0);
});

test('ずれが閾値を超えたら予測地点にリードサークルを描く', () => {
  const lead = { x: TARGET.x + 40, y: TARGET.y - 20 };
  const ctx = makeFakeCtx();
  new Crosshair(makeGame({ target: TARGET, lead })).draw(ctx);

  const circles = arcs(ctx.calls);
  assert.equal(circles.length, 1);
  assert.deepEqual(circles[0], { x: lead.x, y: lead.y, r: LEAD_MARKER_RADIUS });
});

test('照準から予測地点へ破線を引く', () => {
  const lead = { x: TARGET.x + 40, y: TARGET.y - 20 };
  const ctx = makeFakeCtx();
  new Crosshair(makeGame({ target: TARGET, lead })).draw(ctx);

  // 破線パターンを立ててから、また空に戻していること
  assert.deepEqual(dashCalls(ctx.calls), [LEAD_MARKER_DASH, []],
    '破線を解除しないと後続の描画まで破線になる');

  const line = extractPolylines(ctx.calls).find((l) =>
    l.length === 2 && l[0].x === TARGET.x && l[0].y === TARGET.y);
  assert.ok(line, '照準を始点とする線分が無い');
  assert.deepEqual(line[1], { x: lead.x, y: lead.y });
});

test('照準そのものは敵の位置から動かない', () => {
  // これがこの設計の要件。照準ごと予測地点へ動かすと敵から外れて目障りになる
  const lead = { x: TARGET.x + 60, y: TARGET.y };
  const ctx = makeFakeCtx();
  new Crosshair(makeGame({ target: TARGET, lead })).draw(ctx);

  // 中心ドットは 2x2 の fillRect として敵の中心に描かれる
  const dot = ctx.calls.find((c) => c.name === 'fillRect' && c.args[2] === 2 && c.args[3] === 2);
  assert.ok(dot, '照準の中心ドットが無い');
  assert.deepEqual({ x: dot.args[0] + 1, y: dot.args[1] + 1 }, TARGET);
});

test('ロックしていなければリードマーカーは出ない', () => {
  const ctx = makeFakeCtx();
  new Crosshair(makeGame({ target: null, lead: null })).draw(ctx);
  assert.equal(arcs(ctx.calls).length, 0);
});

test('カメラのスクロールぶんだけマーカーがずれる', () => {
  const lead = { x: TARGET.x + 40, y: TARGET.y };
  const game = makeGame({ target: TARGET, lead });
  game.camera = { x: 100, y: HUD_TOP_HEIGHT };
  const ctx = makeFakeCtx();
  new Crosshair(game).draw(ctx);

  const circle = arcs(ctx.calls)[0];
  assert.deepEqual(circle, {
    x: lead.x - 100, y: lead.y - HUD_TOP_HEIGHT, r: LEAD_MARKER_RADIUS,
  });
});
