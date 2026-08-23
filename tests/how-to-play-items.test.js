// 遊び方画面（HOW TO PLAY, 1ページ目）の ITEMS パネル。
//
// アイコンは実物のアイテムを 2.5倍で描いている（説明用に絵を描き起こすと、
// 実際のアイテムを変えたときに解説だけ古くなる）。アイテムを増やしたのに
// ここへ足し忘れると、拾えるのに説明が無い状態になる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

function drawItemsPanel() {
  const ctx = makeFakeCtx();
  const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
  renderer.drawHowToPlay(ctx, 0);
  return {
    ctx,
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
  };
}

test('拾える4種すべてが載っている', () => {
  const { texts } = drawItemsPanel();
  for (const name of [
    'MISSILE SUPPLY KIT', 'OVERDRIVE KIT', 'AUTO-AIM UNIT', 'CARRIER REPAIR KIT',
  ]) {
    assert.ok(texts.includes(name), `${name} が載っていない`);
  }
});

test('オーバードライブの説明に効果と入手先が書いてある', () => {
  const { texts } = drawItemsPanel();
  const desc = texts.find((t) => typeof t === 'string' && /INFINITE AMMO/.test(t));
  assert.ok(desc, `効果の説明が無い: ${texts.filter((t) => typeof t === 'string').join(' | ')}`);
  assert.match(desc, /HEAVY/, '入手先（HEAVY が落とす）が書かれていない');
});

test('どの説明文もパネルの幅に収まる', () => {
  // 説明は1行で描く（折り返さない）。長いとパネルの枠を越えて切れる
  const { ctx } = drawItemsPanel();
  const PANEL_RIGHT = 512 + 400 - 16; // cx + 幅の半分 - 余白
  const TEXT_LEFT = 512 - 320;
  for (const c of ctx.calls.filter((c) => c.name === 'fillText')) {
    if (c.args[1] !== TEXT_LEFT) continue; // ITEMS パネルの行だけ見る
    const width = String(c.args[0]).length * 14 * 0.6; // small フォントの概算
    assert.ok(TEXT_LEFT + width <= PANEL_RIGHT,
      `パネルからはみ出す: ${c.args[0]}`);
  }
});

test('3枚のパネルが縦に重ならない（行を増やしても破綻しない）', () => {
  // 縦の配分は「残りを3等分して隙間にする」式。行を増やすと隙間が縮み、
  // 増やしすぎると負になって隣のパネルへ食い込む。
  // パネルの枠は幅 800 の roundRect なので、それだけを拾って並びを見る
  const { ctx } = drawItemsPanel();
  const panels = ctx.calls
    .filter((c) => c.name === 'roundRect' && Math.round(c.args[2]) === 800)
    .map((c) => ({ top: c.args[1], bottom: c.args[1] + c.args[3] }))
    .sort((a, b) => a.top - b.top);

  assert.equal(panels.length, 3, `パネルが3枚でない: ${panels.length}`);
  for (let i = 1; i < panels.length; i++) {
    assert.ok(panels[i].top > panels[i - 1].bottom,
      `${i} 枚目が前のパネルに食い込んでいる: ${panels[i - 1].bottom} → ${panels[i].top}`);
  }
  assert.ok(panels[2].bottom <= 768, `最後のパネルが画面下からはみ出す: ${panels[2].bottom}`);
});

test('パネルが画面からはみ出さない', () => {
  // 行を増やすとパネルが伸びる。縦の配分は残りを等分する式なので、
  // 増やしすぎると隣のパネルと重なる
  const { ctx } = drawItemsPanel();
  const H = 768;
  for (const c of ctx.calls.filter((c) => c.name === 'fillText')) {
    const y = c.args[2];
    assert.ok(y >= 0 && y <= H, `画面外に文字が出ている: ${c.args[0]} @ y=${y}`);
  }
});
