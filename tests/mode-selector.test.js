import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { MODES, MODE_ORDER } from '../src/js/utils/modes.js';

/** Canvas 2D stub that records what was drawn and in which colour. */
function stubCtx() {
  const texts = [];
  const rects = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '',
    lineWidth: 0, shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    save() {}, restore() {},
    measureText: (s) => ({ width: s.length * 12 }),
    fillText(text, x, y) { texts.push({ text, x, y, fill: ctx.fillStyle }); },
    strokeRect(x, y, w, h) { rects.push({ x, y, w, h, stroke: ctx.strokeStyle, type: 'stroke' }); },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: ctx.fillStyle, type: 'fill' }); },
  };
  return { ctx, texts, rects };
}

function render(mode) {
  const canvas = { width: 1024, height: 768 };
  const renderer = new ScreenRenderer({ mode, canvas });
  const { ctx, texts, rects } = stubCtx();
  renderer._drawModeSelector(ctx, canvas);
  const find = (label) => texts.find((t) => t.text === label);
  return { texts, rects, find };
}

test('both modes are always drawn, so the choice is visible', () => {
  for (const mode of MODE_ORDER) {
    const { find } = render(mode);
    for (const key of MODE_ORDER) {
      assert.ok(find(MODES[key].label), `${MODES[key].label} missing when ${mode} selected`);
    }
  }
});

test('the selected mode is drawn in its own colour, the other is dimmed', () => {
  for (const selected of MODE_ORDER) {
    const { find } = render(selected);
    const other = MODE_ORDER.find((k) => k !== selected);

    assert.equal(find(MODES[selected].label).fill, MODES[selected].color);
    assert.notEqual(find(MODES[other].label).fill, MODES[other].color);
  }
});

test('a highlight box is stroked in the selected mode colour', () => {
  for (const selected of MODE_ORDER) {
    const { rects } = render(selected);
    const boxes = rects.filter((r) => r.type === 'stroke');
    assert.equal(boxes.length, 1, 'exactly one mode should be boxed');
    assert.equal(boxes[0].stroke, MODES[selected].color);
  }
});

test('the description shown belongs to the selected mode', () => {
  for (const selected of MODE_ORDER) {
    const { find } = render(selected);
    const other = MODE_ORDER.find((k) => k !== selected);

    assert.ok(find(MODES[selected].desc), 'selected description missing');
    assert.equal(find(MODES[other].desc), undefined, 'other mode description leaked');
  }
});

test('labels are laid out left to right in MODE_ORDER, centred on the canvas', () => {
  const { find, texts } = render('normal');
  const xs = MODE_ORDER.map((k) => find(MODES[k].label).x);

  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] > xs[i - 1], 'labels should advance rightwards');
  }
  // The row straddles the canvas centre.
  assert.ok(xs[0] < 512 && xs[xs.length - 1] > 512, 'row should be centred');

  // Arrows sit outside the labels on both sides.
  const left = texts.find((t) => t.text === '◀');
  const right = texts.find((t) => t.text === '▶');
  assert.ok(left.x < xs[0], 'left arrow should precede the first label');
  assert.ok(right.x > xs[xs.length - 1], 'right arrow should follow the last label');
});

test('the A/D key hint is present', () => {
  const { texts } = render('normal');
  assert.ok(texts.some((t) => t.text.includes('A') && t.text.includes('D')));
});
