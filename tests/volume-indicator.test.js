import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx, extractSets, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, VOLUME_HUD_FRAMES, VOLUME_HUD_FADE_FRAMES,
} from '../src/js/utils/Constants.js';
import { UI } from '../src/js/ui/theme.js';

function draw(volume, framesLeft) {
  const ctx = makeFakeCtx();
  new ScreenRenderer({}).drawVolumeIndicator(ctx, volume, framesLeft);
  return ctx.calls;
}

/** fillText の内容だけを取り出す。 */
function texts(calls) {
  return calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

/** 目盛り（高さ8の細い矩形）を、色つきで左から順に取り出す。 */
function segments(calls) {
  return extractFillRectsWithColor(calls)
    .filter((r) => r.h === 8)
    .sort((a, b) => a.x - b.x);
}

/** fillText を、その時点の fillStyle 込みで取り出す。 */
function textsWithColor(calls) {
  let color = '';
  const out = [];
  for (const c of calls) {
    if (c.name === 'set:fillStyle') color = c.args[0];
    else if (c.name === 'fillText') out.push({ text: c.args[0], color });
  }
  return out;
}

test('表示時間が尽きていれば何も描かない', () => {
  assert.equal(draw(0.5, 0).length, 0);
  assert.equal(draw(0.5, -1).length, 0);
});

test('音量をパーセントで示す', () => {
  assert.ok(texts(draw(0.7, VOLUME_HUD_FRAMES)).includes('70%'));
  assert.ok(texts(draw(1.0, VOLUME_HUD_FRAMES)).includes('100%'));
});

test('消音は「0%」ではなく MUTE と出す', () => {
  const t = texts(draw(0, VOLUME_HUD_FRAMES));
  assert.ok(t.includes('MUTE'), `MUTE が出ていない: ${t.join(',')}`);
  assert.ok(!t.includes('0%'));
});

test('何の音量かが分かる', () => {
  assert.ok(texts(draw(0.5, VOLUME_HUD_FRAMES)).includes('BGM'));
});

test('目盛りは10個で、点灯数が音量に対応する', () => {
  // 「+」「-」1回ぶんが1目盛り、という対応が崩れると意味が無くなる
  for (const [volume, expected] of [[0, 0], [0.3, 3], [0.5, 5], [1, 10]]) {
    const segs = segments(draw(volume, VOLUME_HUD_FRAMES));
    assert.equal(segs.length, 10, `目盛りが10個でない: ${segs.length}`);
    const lit = segs.filter((r) => r.color !== UI.faint).length;
    assert.equal(lit, expected, `音量 ${volume} で点灯 ${lit} 個`);
  }
});

test('点灯は左から詰まる（飛び飛びにならない）', () => {
  const segs = segments(draw(0.4, VOLUME_HUD_FRAMES));
  const lit = segs.map((r) => r.color !== UI.faint);
  assert.deepEqual(lit, [true, true, true, true, false, false, false, false, false, false]);
});

test('消音のときだけ色が警告色に変わる', () => {
  assert.ok(textsWithColor(draw(0, VOLUME_HUD_FRAMES)).some((t) => t.color === UI.warn),
    '消音が目立たない');
  assert.ok(!textsWithColor(draw(0.5, VOLUME_HUD_FRAMES)).some((t) => t.color === UI.warn),
    '通常時に警告色が出ている');
});

test('最後だけ薄れて消える（急に消えると点滅に見える）', () => {
  const alphaAt = (f) => extractSets(draw(0.5, f), 'globalAlpha')[0];
  assert.equal(alphaAt(VOLUME_HUD_FRAMES), 1, '出た瞬間から薄い');
  assert.equal(alphaAt(VOLUME_HUD_FADE_FRAMES), 1, 'フェード開始が早すぎる');
  const half = alphaAt(Math.round(VOLUME_HUD_FADE_FRAMES / 2));
  assert.ok(half > 0 && half < 1, `フェードしていない: ${half}`);
  assert.ok(alphaAt(1) < half, '最後まで薄れない');
});

test('画面の右下に収まる（HUD は上部にあるので重ならない）', () => {
  const rects = draw(0.5, VOLUME_HUD_FRAMES).filter((c) => c.name === 'fillRect');
  assert.ok(rects.length > 0);
  for (const r of rects) {
    const [x, y, w, h] = r.args;
    assert.ok(x >= CANVAS_WIDTH / 2, `左半分にはみ出した: x=${x}`);
    assert.ok(y >= CANVAS_HEIGHT / 2, `上半分にはみ出した: y=${y}`);
    assert.ok(x + w <= CANVAS_WIDTH, `右へはみ出した: ${x + w}`);
    assert.ok(y + h <= CANVAS_HEIGHT, `下へはみ出した: ${y + h}`);
  }
});
