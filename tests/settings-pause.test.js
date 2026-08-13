import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEMO_SCREEN_DRAWERS } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

/** キーを押した/押していないを差し替えられる入力のふり。 */
function fakeInput(pressed = []) {
  const set = new Set(pressed);
  return {
    isKeyPressed: (code) => set.has(code),
    isKeyDown: () => false,
    isCharPressed: (...chars) => chars.some((c) => set.has(c)),
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
}

/** update() を呼べる最小の game。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.settingsIndex = 0;
  g.settingsReturnTo = null;
  g.confirmingQuit = false;
  g.missionTimer = 0;
  g.totalTime = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.input = fakeInput();
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  return Object.assign(g, overrides);
}

test('プレイ中に P を押すと設定画面に入る', () => {
  const g = makeGame({ input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'settings');
  assert.equal(g.settingsReturnTo, 'playing');
});

test('設定画面で P を押すと元の状態に戻る', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'playing');
});

test('タイトルで P を押すと設定画面に入り、戻り先はタイトル', () => {
  const g = makeGame({ gameState: 'title', input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'settings');
  assert.equal(g.settingsReturnTo, 'title');
});

// ここが要。ポーズ中に時間が進むとタイムボーナスが減る。
test('ポーズ中は時間が進まない（実時間10秒ぶん回しても）', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  for (let i = 0; i < 200; i++) g.update(50);   // 50ms × 200 = 10秒
  assert.equal(g.missionTimer, 0);
  assert.equal(g.totalTime, 0);
  assert.equal(g.simAccumulator, 0);
});

test('ポーズ中は敵が動かない', () => {
  const enemy = { x: 100, y: 50, alive: true, update() { this.x += 1; } };
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', enemies: [enemy] });
  for (let i = 0; i < 100; i++) g.update(50);
  assert.equal(enemy.x, 100);
});

test('W/S で選択が動き、端で止まる', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: 0 });
  g.input = fakeInput(['KeyW']);
  g.update(16);
  assert.equal(g.settingsIndex, 0, '先頭より上へ行っている');
  g.input = fakeInput(['KeyS']);
  g.update(16);
  assert.equal(g.settingsIndex, 1);
});

test('A/D で値が変わり、保存される', () => {
  const saved = [];
  const g = makeGame({
    gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: 0,
    settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5 },
    _saveSettings() { saved.push(this.settings.masterVolume); },
  });
  g.input = fakeInput(['KeyD']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.55);
  assert.deepEqual(saved, [0.55], '保存が呼ばれていない');
});

// -/+ の付け替え。BGM ではなくマスターが動くこと。
test('-/+ は全体音量を動かす（BGM 音量ではない）', () => {
  const g = makeGame({ settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.5 } });
  g._saveSettings = () => {};
  g.input = fakeInput(['-']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.4, '粗い刻み(10%)で下がっていない');
  assert.equal(g.settings.bgmVolume, 0.5, 'BGM 音量が動いてしまっている');
});

test('-/+ は名前入力中は効かない（現行の扱いの回帰防止）', () => {
  const g = makeGame({ gameState: 'ranking_entry', settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5 } });
  g._saveSettings = () => {};
  g.input = fakeInput(['-']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.5);
});

// 自機が止まっているのに噴射音が鳴り続けるのは不自然なので、開いた時点で止める。
// BGM と単発の効果音は止めない（バスごと引く fadeOutSe ではなく stopLoopingSe）。
test('設定画面を開くとループする効果音だけ止める', () => {
  const calls = [];
  const orig = { stopLoopingSe: audioManager.stopLoopingSe, fadeOutSe: audioManager.fadeOutSe };
  audioManager.stopLoopingSe = () => { calls.push('stopLoopingSe'); };
  audioManager.fadeOutSe = () => { calls.push('fadeOutSe'); };
  try {
    const g = makeGame({ input: fakeInput(['KeyP']) });
    g.update(16);
  } finally {
    Object.assign(audioManager, orig);
  }
  assert.deepEqual(calls, ['stopLoopingSe'], 'BGM ごと引いてしまっている可能性');
});

// 設定画面はデモループの一員ではない。表に入れると
// tests/demo-screens.test.js の「余計な画面が入っていない」が落ちる。
test('settings は DEMO_SCREEN_DRAWERS に入っていない', () => {
  assert.equal(Object.hasOwn(DEMO_SCREEN_DRAWERS, 'settings'), false);
});
