import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { BUFF_SPECS } from '../src/js/ui/HUD.js';

// 作り直しでオレンジは #FF6600 から明るい #FF8A1F になった。
// 検査したいのは色の値ではなく「効いている＝オレンジ／解除中＝グレー」という区別。
const ACTIVE_INK = BUFF_SPECS.autoAim.ink;

// A-AIM ゲージは「残り時間」を出すものなので、解除中も減り続ける見た目自体は変えない。
// 変えるのは色だけ — 解除中は効いていないので、武器セレクタが非選択の武器に使っている
// のと同じグレーに寄せる（HUD の中で「有効＝色つき／無効＝グレー」の語彙を揃える）。


/**
 * 旧 API の形で1本だけ描くヘルパー。
 *
 * 実装は「残量と色を決める」(_autoAimState / _overdriveState) と「1本描く」
 * (_drawBuffBar) に分かれたので、テスト側でその2つを繋いでいる。
 * こうしておけば、色・残量・点滅の検査はこれまでどおりの書き方で残せる。
 */
function drawOne(hud, ctx, kind, player, y = 100) {
  const state = kind === 'autoAim' ? hud._autoAimState(player) : hud._overdriveState(player);
  if (!state) return;
  hud._drawBuffBar(ctx, y, 0, BUFF_SPECS[kind], state);
}

/** Auto Aim のバーだけを描いて、使われた色を集める。 */
function drawBar({ autoAimTimer = 1800, autoAimPaused = false } = {}) {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  drawOne(hud, ctx, 'autoAim', { autoAimTimer, autoAimPaused, autoAimMaxTimer: 3600 });
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
  assert.ok(texts.includes('AUTO AIM'), 'ラベルが出ていない');
  assert.ok(fills.includes(ACTIVE_INK), `オレンジで描かれていない: ${fills.join(' / ')}`);
});

test('解除中はオレンジを使わず、グレーで出す', () => {
  const { fills, strokes } = drawBar({ autoAimPaused: true });
  assert.equal(fills.includes(ACTIVE_INK), false, '解除中なのに効いている色のまま');
  assert.equal(strokes.includes(ACTIVE_INK), false, '枠だけオレンジ系が残っている');
  assert.ok(fills.some((c) => /^#6{2}6{2}6{2}$/i.test(c) || c === '#666666'),
    `グレーが使われていない: ${fills.join(' / ')}`);
});

// ゲージは「あと何秒あるか」を示すもの。解除しても時間は減り続けるので、
// 出さなくなると残りが分からなくなる。
test('解除中でもラベルとバーは出る（消さない）', () => {
  const { texts, bars } = drawBar({ autoAimPaused: true });
  assert.ok(texts.includes('AUTO AIM'), '解除中にラベルが消えている');
  assert.ok(bars.length >= 2, `バーが描かれていない: ${bars.length} 個`);
});

test('解除中でも残量に応じてバーの長さが変わる', () => {
  const full = drawBar({ autoAimPaused: true, autoAimTimer: 3600 }).bars;
  const half = drawBar({ autoAimPaused: true, autoAimTimer: 1800 }).bars;
  // 0枚目は地(常に満幅)、1枚目が残量、その後が先端と刻み
  const widthOf = (bars) => bars[1].args[2];
  assert.ok(widthOf(full) > widthOf(half), '残量がバーの長さに出ていない');
});

test('Auto Aim を持っていなければ何も描かない', () => {
  const { ctx } = drawBar({ autoAimTimer: 0 });
  assert.equal(ctx.calls.length, 0, '持っていないのに描いている');
});
