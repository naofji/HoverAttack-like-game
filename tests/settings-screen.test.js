import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { SETTINGS_ITEMS, visibleSettingsItems, settingValueText } from '../src/js/ui/settingsItems.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { UI } from '../src/js/ui/theme.js';

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

// autoSwitchMissile（既定 OFF）の 'OFF' が拾えてしまうと、autoFullscreen の
// 値を見ずに通ってしまう。行を byKey で名指しして、その値だけを見る
test('ON/OFF が文字で出る', () => {
  const byKey = (k) => SETTINGS_ITEMS.find((i) => i.key === k);
  const item = byKey('autoFullscreen');
  const on = draw({ settings: { ...DEFAULT_SETTINGS, autoFullscreen: true } });
  const off = draw({ settings: { ...DEFAULT_SETTINGS, autoFullscreen: false } });
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoFullscreen: true }), 'ON');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoFullscreen: false }), 'OFF');
  assert.ok(on.texts.includes('ON'));
  assert.ok(off.texts.includes('OFF'));
});

test('3択は選択肢のラベルが出る', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'mgAutoReloadMode');
  for (const mode of ['off', 'onSwitch', 'always']) {
    const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReloadMode: mode } });
    assert.ok(texts.includes(item.labels[mode]), `${mode} のラベルが描かれていない`);
  }
});

test('整数は単位付きで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, mgReloadThreshold: 5 } });
  assert.ok(texts.includes('5 ROUNDS'), `5 ROUNDS が無い: ${texts.join(' / ')}`);
});

test('単位の無い整数は数字だけで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, autoAimRelease: 12 } });
  assert.ok(texts.includes('12'), `12 が無い: ${texts.join(' / ')}`);
});

// 効いていない項目は淡色にする。行を消すと下の項目の位置が動いてカーソルが飛ぶので、
// 消さずに色だけで伝える。
test('MG AUTO-RELOAD が OFF だとしきい値の行が淡色になる', () => {
  const styles = (s) => draw({ settings: s, index: 0 }).ctx.calls
    .filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  const off = styles({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' });
  const on = styles({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always' });
  assert.notDeepEqual(off, on, 'OFF でも描き方が変わっていない');
  assert.ok(off.includes(UI.faint), `淡色 ${UI.faint} が使われていない`);
  assert.equal(on.includes(UI.faint), false, 'ALWAYS なのに淡色が出ている');
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

test('settingValueText: 型ごとの文字列', () => {
  const byKey = (k) => SETTINGS_ITEMS.find((i) => i.key === k);
  const s = { ...DEFAULT_SETTINGS, masterVolume: 0.45, autoFullscreen: false,
    mgAutoReloadMode: 'onSwitch', mgReloadThreshold: 5, autoAimRelease: 12 };
  assert.equal(settingValueText(byKey('masterVolume'), s), '45%');
  assert.equal(settingValueText(byKey('autoFullscreen'), s), 'OFF');
  assert.equal(settingValueText(byKey('mgAutoReloadMode'), s), 'ON WEAPON SWITCH');
  assert.equal(settingValueText(byKey('mgReloadThreshold'), s), '5 ROUNDS');
  assert.equal(settingValueText(byKey('autoAimRelease'), s), '12');
  // fullscreen 行は廃止済み。action 型の値なしはいまや quit だけが持つので、
  // action 型自体のカバレッジはこちらに付け替える
  assert.equal(settingValueText(byKey('quit'), s), null, 'action は値を持たない');
});

// int の表示を行ごとに整えられること。1/10 秒で持っている値を「0.3 SEC」と出す。
test('長押しの時間は秒で表示される', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'autoAimHoldTenths');
  assert.ok(item, '表に autoAimHoldTenths が無い');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimHoldTenths: 3 }), '0.3 SEC');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimHoldTenths: 20 }), '2.0 SEC');
});

test('format を持たない int は今までどおり数字だけ', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'autoAimRelease');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimRelease: 12 }), '12');
});

test('新しい2項目が設定画面に描かれる', () => {
  const { texts } = draw({ fromPlaying: true });
  assert.ok(texts.includes('AUTO-AIM HOLD TO TOGGLE'), '長押しの時間の行が無い');
  assert.ok(texts.includes('RESUME AUTO-AIM ON PICKUP'), '拾ったら再開の行が無い');
  assert.ok(texts.includes('0.3 SEC'), `既定の 0.3 SEC が出ていない: ${texts.join(' / ')}`);
});
