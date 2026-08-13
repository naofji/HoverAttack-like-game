import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEMO_SCREEN_DRAWERS } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { visibleSettingsItems } from '../src/js/ui/settingsItems.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY } from '../src/js/utils/Constants.js';

/** localStorage の代わり。key -> value の Map。 */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    dump: () => Object.fromEntries(m),
  };
}

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

// QUIT MISSION は「設定画面を経由してタイトルへ戻る」唯一の経路。
// 途中終了は取り返しがつかないので、確認ダイアログを挟んだ全体を通しで確かめる。
// escape-title.test.js / se-silence-on-exit.test.js の Escape のテストが
// 参照している「タイトルへ戻る経路」の実体はここ。
test('QUIT MISSION → YES で確認するとタイトルへ戻り、効果音を落とす', () => {
  const calls = [];
  const orig = audioManager.fadeOutSe;
  audioManager.fadeOutSe = () => calls.push('fadeOutSe');
  try {
    const quitIndex = visibleSettingsItems(true).findIndex((item) => item.key === 'quit');
    const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: quitIndex });

    g.input = fakeInput(['Enter']);
    g.update(16);   // QUIT MISSION の行で Enter → 確認に入る
    assert.equal(g.confirmingQuit, true, '確認に入っていない');
    assert.equal(g.quitChoiceYes, false, '既定は NO のはず');

    g.input = fakeInput(['KeyA']);
    g.update(16);   // A で YES を選ぶ（まだ決定していない）
    assert.equal(g.quitChoiceYes, true);
    assert.equal(g.gameState, 'settings', 'A だけではまだ決定しない');

    g.input = fakeInput(['Enter']);
    g.update(16);   // Enter で決定
    assert.equal(g.gameState, 'title', 'タイトルへ戻っていない');
    assert.equal(g.confirmingQuit, false);
    assert.ok(calls.includes('fadeOutSe'), '効果音が落ちていない');
  } finally {
    audioManager.fadeOutSe = orig;
  }
});

// 押し間違いで進行を捨てないための作り。既定の NO のまま Enter を押しても
// 何も失わず、設定画面に留まることを縛る。
test('QUIT MISSION → NO（既定）で確認を閉じるだけで、設定画面に留まる', () => {
  const quitIndex = visibleSettingsItems(true).findIndex((item) => item.key === 'quit');
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: quitIndex });

  g.input = fakeInput(['Enter']);
  g.update(16);   // QUIT MISSION の行で Enter → 確認に入る
  assert.equal(g.confirmingQuit, true);
  assert.equal(g.quitChoiceYes, false);

  g.input = fakeInput(['Enter']);
  g.update(16);   // 何も押し変えずに Enter → NO のまま決定
  assert.equal(g.confirmingQuit, false, '確認が閉じていない');
  assert.equal(g.gameState, 'settings', '設定画面に留まっていない');
  assert.equal(g.settingsReturnTo, 'playing', '戻り先を失っている');
});

// ここから (3): これまでの A/D テストはどれも _saveSettings を差し替えて
// 潰していたので、実際の中身（saveSettings() ＋ audioManager.applySettings()）が
// 一度も実行されていなかった。applySettings() の呼び出しを消しても
// 全テストが通ってしまう状態だったので、本物の _saveSettings() を通す。
//
// これは (1) の回帰テストも兼ねる。本物の経路（_saveSettings → applySettings →
// _applyBgmVolume）を通すので、旧キー hoverAttack.bgmVolume に実効値
// （マスター×BGM）が書き込まれていないことも一緒に確かめられる。
test('A/D で音量を変えると、本物の _saveSettings → applySettings を通して音に届く（(1)(3) の回帰）', () => {
  const storage = fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: '0.4' }); // 旧キーの既存値
  const origLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  // applySettings 自体はモックしない（本物を通す）。その内部が保存する版
  // setBgmVolume を呼んでいないことだけを見張る。呼んでいれば旧キーが
  // 実効値で上書きされる（(1) の不具合そのもの）。
  const savingCalls = [];
  const origSetBgmVolume = audioManager.setBgmVolume;
  audioManager.setBgmVolume = (v) => { savingCalls.push(v); return origSetBgmVolume.call(audioManager, v); };

  try {
    const masterIndex = visibleSettingsItems(true).findIndex((item) => item.key === 'masterVolume');
    const g = makeGame({
      gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: masterIndex,
      settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.8 },
    });
    g.input = fakeInput(['KeyD']);
    g.update(16);

    // (3): 実際に音へ反映されたことを確かめる。applySettings() の呼び出しを
    // 消すとここが唯一気づける場所（今までのテストは _saveSettings を丸ごと
    // 差し替えていたので、消えても 920/920 のまま通っていた）。
    // masterVolume 0.55 × bgmVolume 0.8 = 0.44 が実効値として届く
    assert.equal(audioManager.bgmVolume, 0.44, 'BGM の実効値が音に反映されていない');

    // localStorage の新しいキーに変更後の値が保存されていること
    const stored = JSON.parse(storage.dump()[SETTINGS_STORAGE_KEY]);
    assert.equal(stored.masterVolume, 0.55, '変更後の値で保存されていない');

    // (1) の回帰: 保存する版の setBgmVolume が呼ばれていない＝旧キーは無傷
    assert.deepEqual(savingCalls, [], '保存する版の setBgmVolume が呼ばれている（旧キーが上書きされる）');
    assert.equal(storage.dump()[BGM_VOLUME_STORAGE_KEY], '0.4',
      '旧キーが実効値で上書きされている（(1) の再発）');
  } finally {
    audioManager.setBgmVolume = origSetBgmVolume;
    globalThis.localStorage = origLocalStorage;
  }
});
