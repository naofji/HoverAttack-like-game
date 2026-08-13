import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crosshair } from '../src/js/ui/Crosshair.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { COLOR_CROSSHAIR } from '../src/js/utils/Constants.js';

/** Crosshair が触る最小限の game。カメラ原点は 0 にしてワールド＝スクリーンにする。 */
function draw({ autoAimTimer = 100, autoAimPaused = false, target = null } = {}) {
  const ctx = makeFakeCtx();
  new Crosshair({
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    player: { autoAimTimer, autoAimPaused },
    autoAimTarget: target,
    autoAimLeadPoint: null,
    input: {
      crosshairLocked: false,
      lockedWorldX: 0, lockedWorldY: 0,
      mouse: { x: 400, y: 300 },
    },
  }).draw(ctx);
  return {
    ctx,
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
    strokes: ctx.calls.filter((c) => c.name === 'set:strokeStyle').map((c) => c.args[0]),
  };
}

test('Auto Aim 中は AUTO が出て、赤い照準になる（現行どおり）', () => {
  const { texts, strokes } = draw();
  assert.ok(texts.includes('AUTO'), 'AUTO が出ていない');
  assert.equal(texts.includes('AUTO OFF'), false, '解除していないのに AUTO OFF が出ている');
  assert.ok(strokes.includes('#FF3300'), '赤くなっていない');
});

test('解除中は AUTO OFF が出て、AUTO は出ない', () => {
  const { texts } = draw({ autoAimPaused: true });
  assert.ok(texts.includes('AUTO OFF'), 'AUTO OFF が出ていない');
  assert.equal(texts.includes('AUTO'), false, '解除中なのに AUTO も出ている');
});

// 解除したのに赤いままだと、切れたのか壊れたのか分からない。
test('解除中の照準は通常色に戻る', () => {
  const { strokes } = draw({ autoAimPaused: true });
  assert.equal(strokes.includes('#FF3300'), false, '解除中なのに赤いまま');
  assert.ok(strokes.includes(COLOR_CROSSHAIR), '通常色になっていない');
});

// Auto Aim をそもそも持っていない（拾っていない）ときの表示。
test('Auto Aim を持っていなければ何のラベルも出ない', () => {
  const { texts } = draw({ autoAimTimer: 0 });
  assert.equal(texts.includes('AUTO'), false);
  assert.equal(texts.includes('AUTO OFF'), false);
});

// 不変条件（解除中なら必ず残り時間 > 0）が崩れても、表示だけは破綻させない。
// Crosshair.js の autoAimPaused は `player.autoAimPaused && player.autoAimTimer > 0`
// の両方を見ており、後半の `autoAimTimer > 0` はこの不変条件が別の場所で壊れても
// 表示側だけは巻き込まれないための防御。ここでは意図的に不変条件を破った
// 入力（timer 0 なのに paused true）を渡し、その防御が実際に効いていることを確かめる。
test('不変条件が崩れて残り時間 0 なのに解除中フラグが立っていても、AUTO も AUTO OFF も出ない', () => {
  const { texts } = draw({ autoAimTimer: 0, autoAimPaused: true });
  assert.equal(texts.includes('AUTO'), false);
  assert.equal(texts.includes('AUTO OFF'), false);
});

// 真上・真横だと照準の線と重なって読みにくく、狙っている相手も隠す。
test('AUTO OFF はクロスヘアの右下に出る', () => {
  const { ctx } = draw({ autoAimPaused: true });
  const label = ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === 'AUTO OFF');
  assert.ok(label, 'AUTO OFF が描かれていない');
  assert.ok(label.args[1] > 400, `右側に出ていない: x=${label.args[1]}`);
  assert.ok(label.args[2] > 300, `下側に出ていない: y=${label.args[2]}`);
});
