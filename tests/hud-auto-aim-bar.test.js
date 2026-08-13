import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

// A-AIM ゲージは「残り時間」を出すものなので、解除中も減り続ける見た目自体は変えない。
// 変えるのは色だけ — 解除中は効いていないので、武器セレクタが非選択の武器に使っている
// のと同じグレーに寄せる（HUD の中で「有効＝色つき／無効＝グレー」の語彙を揃える）。

/** _drawAutoAimBar だけを呼び、使われた色を集める。 */
function drawBar({ autoAimTimer = 1800, autoAimPaused = false } = {}) {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  hud._drawAutoAimBar(ctx, { autoAimTimer, autoAimPaused, autoAimMaxTimer: 3600 }, 100);
  return {
    ctx,
    fills: ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    strokes: ctx.calls.filter((c) => c.name === 'set:strokeStyle').map((c) => c.args[0]),
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
    bars: ctx.calls.filter((c) => c.name === 'fillRect'),
  };
}

test('Auto Aim が効いている間はオレンジで出る（現行どおり）', () => {
  const { fills, texts } = drawBar();
  assert.ok(texts.includes('A-AIM'), 'ラベルが出ていない');
  assert.ok(fills.includes('#FF6600'), 'オレンジで描かれていない');
});

test('解除中はオレンジを使わず、グレーで出す', () => {
  const { fills, strokes } = drawBar({ autoAimPaused: true });
  assert.equal(fills.includes('#FF6600'), false, '解除中なのに効いている色のまま');
  assert.equal(strokes.includes('#663300'), false, '枠だけオレンジ系が残っている');
  assert.ok(fills.some((c) => /^#6{2}6{2}6{2}$/i.test(c) || c === '#666666'),
    `グレーが使われていない: ${fills.join(' / ')}`);
});

// ゲージは「あと何秒あるか」を示すもの。解除しても時間は減り続けるので、
// 出さなくなると残りが分からなくなる。
test('解除中でもラベルとバーは出る（消さない）', () => {
  const { texts, bars } = drawBar({ autoAimPaused: true });
  assert.ok(texts.includes('A-AIM'), '解除中にラベルが消えている');
  assert.ok(bars.length >= 2, `バーが描かれていない: ${bars.length} 個`);
});

test('解除中でも残量に応じてバーの長さが変わる', () => {
  const full = drawBar({ autoAimPaused: true, autoAimTimer: 3600 }).bars;
  const half = drawBar({ autoAimPaused: true, autoAimTimer: 1800 }).bars;
  const widthOf = (bars) => bars[bars.length - 1].args[2];
  assert.ok(widthOf(full) > widthOf(half), '残量がバーの長さに出ていない');
});

test('Auto Aim を持っていなければ何も描かない', () => {
  const { ctx } = drawBar({ autoAimTimer: 0 });
  assert.equal(ctx.calls.length, 0, '持っていないのに描いている');
});
