import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { SETTINGS_ITEMS, visibleSettingsItems } from '../src/js/ui/settingsItems.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

function draw(state = {}) {
  const ctx = makeFakeCtx();
  const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
  renderer.drawSettings(ctx, {
    settings: DEFAULT_SETTINGS, index: 0, fromPlaying: true, confirmingQuit: false, ...state,
  });
  return { ctx, texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]) };
}

// 表に載っている項目が全部出ること。表に足したのに描き忘れる事故を防ぐ。
test('プレイ中から開くと全項目が描かれる', () => {
  const { texts } = draw({ fromPlaying: true });
  for (const item of visibleSettingsItems(true)) {
    assert.ok(texts.includes(item.label), `${item.label} が描かれていない`);
  }
});

test('タイトルから開くと「途中終了」が出ない', () => {
  const { texts } = draw({ fromPlaying: false });
  const quit = SETTINGS_ITEMS.find((i) => i.key === 'quit');
  assert.ok(quit, '表に quit が無い');
  assert.equal(texts.includes(quit.label), false, 'タイトルなのに途中終了が出ている');
});

test('タイトルから開いても他の項目は全部出る', () => {
  const { texts } = draw({ fromPlaying: false });
  for (const item of visibleSettingsItems(false)) {
    assert.ok(texts.includes(item.label), `${item.label} が描かれていない`);
  }
});

test('音量はパーセントで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, masterVolume: 0.45 } });
  assert.ok(texts.some((t) => String(t).includes('45')), '45 が見当たらない');
});

test('ON/OFF が文字で出る', () => {
  const on = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReload: true } });
  const off = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReload: false } });
  assert.ok(on.texts.includes('ON'));
  assert.ok(off.texts.includes('OFF'));
});

// 選択位置が分からないと操作できない。色でも位置でもいいので、必ず差が出ること。
test('選択中の項目は他と描き方が変わる', () => {
  const a = draw({ index: 0 });
  const b = draw({ index: 1 });
  assert.notDeepEqual(
    a.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    b.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    '選択位置を変えても描画が同じ',
  );
});

test('途中終了の確認中は YES / NO が出る', () => {
  const { texts } = draw({ confirmingQuit: true });
  assert.ok(texts.includes('YES'));
  assert.ok(texts.includes('NO'));
});

// カーソルが動いても画面が変わらないと A/D の反応が見えない。
test('YES/NO の選択状態で描き方が変わる', () => {
  const yes = draw({ confirmingQuit: true, quitChoiceYes: true });
  const no = draw({ confirmingQuit: true, quitChoiceYes: false });
  assert.notDeepEqual(
    yes.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    no.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    'YES/NO を切り替えても描画が同じ',
  );
});

test('画面からはみ出さない', () => {
  const { ctx } = draw();
  const ys = ctx.calls
    .filter((c) => c.name === 'fillText' || c.name === 'fillRect')
    .map((c) => (c.name === 'fillText' ? c.args[2] : c.args[1] + c.args[3]));
  assert.ok(Math.max(...ys) <= 768, `画面下端を超えている: ${Math.max(...ys)}`);
});

test('index が範囲外でも落ちない', () => {
  assert.doesNotThrow(() => draw({ index: -5 }));
  assert.doesNotThrow(() => draw({ index: 999 }));
});

// 表の key と保存される設定がずれると、項目を足したのに保存されない事故になる。
test('表の設定キーはすべて DEFAULT_SETTINGS に存在する', () => {
  for (const item of SETTINGS_ITEMS) {
    if (item.type === 'action') continue;
    assert.ok(Object.hasOwn(DEFAULT_SETTINGS, item.key), `${item.key} が DEFAULT_SETTINGS に無い`);
  }
});
