// 無敵モードは戻し忘れると「当たっても減らない」と後で混乱する。
// ON の間は HUD に出して、気づけるようにしておく。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

function drawBadge(debugInvincible) {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  hud.game = { debugInvincible };
  hud._drawDebugInvincibleBadge(ctx, 1024, 40);
  return ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

test('無敵モードが切れているときは何も出さない', () => {
  assert.deepEqual(drawBadge(false), []);
});

test('無敵モードの間は INVINCIBLE と出る', () => {
  assert.deepEqual(drawBadge(true), ['INVINCIBLE']);
});
