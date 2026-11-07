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

// ---- Tab で置き場所を回す（自動で隅を選ぶ作りを撤去した代わり） ----
// R と同じく update() 経由で確かめる。

// 1つの偽ゲームで update() を続けて呼ぶと、アキュムレータが溜まって物理の tick
// （偽ゲームには世界が無い）まで進んで落ちるので、1回押すごとに作り直して隅を引き継ぐ
test('Tab を押すたびに 左上→右上→左下→右下→左上 と回る', () => {
  const seen = [];
  let corner = 'topLeft';
  for (let i = 0; i < 4; i++) {
    const g = makeGame({ showMiniMap: true, input: fakeInput({ pressed: ['Tab'] }) });
    g.settings.miniMapCorner = corner;
    g.update(16);
    assert.equal(g.showMiniMap, true, 'Tab で閉じてしまった');
    corner = g.settings.miniMapCorner;
    seen.push(corner);
  }
  assert.deepEqual(seen, ['topRight', 'bottomLeft', 'bottomRight', 'topLeft']);
});

test('閉じているときに Tab を押すと、次の隅で開く', () => {
  const g = makeGame({ input: fakeInput({ pressed: ['Tab'] }) });
  g.update(16);
  assert.equal(g.showMiniMap, true);
  assert.equal(g.settings.miniMapCorner, 'topRight');
});

test('Tab で選んだ隅は保存される（次に遊ぶときも同じ隅）', () => {
  const store = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  try {
    const g = makeGame({ input: fakeInput({ pressed: ['Tab'] }) });
    g.update(16);
    const saved = JSON.parse([...store.values()][0]);
    assert.equal(saved.miniMapCorner, 'topRight');
  } finally {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  }
});

test('Tab はクロスヘアのロックも表示／非表示も触らない（R・Shift と独立）', () => {
  const g = makeGame({ showMiniMap: true, input: fakeInput({ pressed: ['Tab'] }) });
  g.update(16);
  assert.equal(g.input.crosshairLocked, false);
  assert.equal(g.showMiniMap, true);
});
