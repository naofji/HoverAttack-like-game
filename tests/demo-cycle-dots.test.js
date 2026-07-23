import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

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
  const texts = render(2, 6);
  texts.forEach((t, i) => {
    assert.equal(t.fill, i === 2 ? '#00FFFF' : '#444444');
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
