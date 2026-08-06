import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { UI } from '../src/js/ui/theme.js';

function stubCtx() {
  const texts = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: '',
    save() {}, restore() {},
    fillText(text, x, y) { texts.push({ text, x, y, fill: ctx.fillStyle }); },
  };
  return { ctx, texts };
}

function render(currentIndex, total) {
  const canvas = { width: 1024, height: 768 };
  const renderer = new ScreenRenderer({ canvas });
  const { ctx, texts } = stubCtx();
  renderer.drawDemoCycleDots(ctx, currentIndex, total);
  return texts;
}

test('draws one dot per screen in the demo cycle', () => {
  const texts = render(2, 6);
  assert.equal(texts.length, 6);
  assert.ok(texts.every((t) => t.text === '●'));
});

test('only the current screen dot is highlighted', () => {
  // 色そのものではなく「現在位置だけが強調色、他は控えめな色」であることを見る。
  // 色の値は theme.js が持つので、テーマ調整でこのテストが落ちないようにする。
  const texts = render(2, 6);
  assert.notEqual(UI.info, UI.faint, '強調色と非強調色が同じでは意味が無い');
  texts.forEach((t, i) => {
    assert.equal(t.fill, i === 2 ? UI.info : UI.faint);
  });
});

test('dots are centred on the canvas', () => {
  const texts = render(0, 3);
  const xs = texts.map((t) => t.x);
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  assert.ok(Math.abs(mid - 512) < 1);
});

test('nothing is drawn for a single-screen cycle', () => {
  const texts = render(0, 1);
  assert.equal(texts.length, 0);
});
