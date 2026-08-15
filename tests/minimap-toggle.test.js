import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

/**
 * キーを押した/押していないを差し替えられる入力のふり。
 *
 * settings-pause.test.js の fakeInput は isKeyDown を常に false 固定にしているが、
 * ここでは移動キーの「押しっぱなし」（isKeyDown）を再現する必要があるため、
 * pressed（isKeyPressed 用）と down（isKeyDown 用）を別々に持たせる。
 */
function fakeInput({ pressed = [], down = [] } = {}) {
  const pressedSet = new Set(pressed);
  const downSet = new Set(down);
  return {
    isKeyPressed: (code) => pressedSet.has(code),
    isKeyDown: (code) => downSet.has(code),
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
}

/** update() を playing 状態で呼べる最小の game。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.missionTimer = 0;
  g.totalTime = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.input = fakeInput();
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.showMiniMap = false;
  g.miniMapAlpha = 0;
  return Object.assign(g, overrides);
}

// ミニマップはテストプレイヤーの要望どおり「R で開閉」のみで切り替わる。
// 移動キーで自動的に閉じる旧仕様は、地形を見ながら動くとすぐ消えて不便だったため撤去した。
// _updateMiniMap() を直接呼ぶと未到達コードでも通ってしまうので、実際の入口である
// update() 経由（_updatePlaying → _updateMiniMap）で確かめる。

test('R を押すとミニマップが開く', () => {
  const g = makeGame({ input: fakeInput({ pressed: ['KeyR'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, true);
});

test('ミニマップを開いた状態で移動キー（A）を押しっぱなしでも開いたまま', () => {
  const g = makeGame({ showMiniMap: true, input: fakeInput({ down: ['KeyA'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, true);
});

test('ミニマップを開いた状態で移動キー（D）を押しっぱなしでも開いたまま', () => {
  const g = makeGame({ showMiniMap: true, input: fakeInput({ down: ['KeyD'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, true);
});

test('ミニマップを開いた状態で移動キー（W）を押しっぱなしでも開いたまま', () => {
  const g = makeGame({ showMiniMap: true, input: fakeInput({ down: ['KeyW'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, true);
});

test('開いた状態で R をもう一度押すと閉じる', () => {
  const g = makeGame({ showMiniMap: true, input: fakeInput({ pressed: ['KeyR'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, false);
});
