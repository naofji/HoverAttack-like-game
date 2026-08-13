import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { initialHoldState } from '../src/js/utils/holdKey.js';

/**
 * 押しているキーを途中で差し替えられる入力のふり。
 *
 * **オブジェクトごと作り直さないこと。** `crosshairLocked` はこの入力が持つ状態なので、
 * 離すたびに新しい `fakeInput()` を代入すると、初期値 false に戻って
 * 「ロックが切り替わっていない」ことを確かめたつもりの assert が素通りする。
 * `setDown()` で押しているキーだけを差し替える。
 */
function fakeInput(down = []) {
  let set = new Set(down);
  return {
    setDown(codes) { set = new Set(codes); },
    isKeyDown: (code) => set.has(code),
    isKeyPressed: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    lockedWorldX: 0, lockedWorldY: 0,
    mouse: { x: 100, y: 50, left: false },
    getMouseWorld: () => ({ x: 100, y: 50 }),
    endFrame() {},
  };
}

/** _updatePlaying() を通せる最小の game。重い協調相手は差し替える。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.shiftHold = initialHoldState();
  g.player = { alive: true, docked: false, autoAimTimer: 100, autoAimPaused: false };
  g.input = fakeInput();
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.totalTime = 0;
  g.missionTimer = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.settingsIndex = 0;
  g.settingsReturnTo = null;
  g.confirmingQuit = false;
  Object.assign(g, overrides);
  // _updatePlaying() の重い協調相手だけ潰す。Shift の処理はその手前にある
  g._updateMiniMap = () => {};
  g._handleDocking = () => {};
  g._handleShooting = () => {};
  g._simulationTick = () => {};
  return g;
}

const TAP_MS = 60;    // 既定しきい値 300ms 未満
const HOLD_MS = 400;  // 既定しきい値 300ms 以上

test('短く押して離すとクロスヘアロックが切り替わる', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(TAP_MS);
  assert.equal(g.input.crosshairLocked, false, '押している間に確定してしまっている');

  g.input.setDown([]);                   // 離した
  g._updatePlaying(16);
  assert.equal(g.input.crosshairLocked, true, '離してもロックが切り替わらない');
});

test('長押しで Auto Aim の解除が切り替わり、ロックは動かない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true, '長押しで解除できていない');
  assert.equal(g.input.crosshairLocked, false, '長押しでロックが道連れになっている');
});

test('長押しのあと離してもタップにならない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  g.input.setDown([]);
  g._updatePlaying(16);
  assert.equal(g.input.crosshairLocked, false, '長押しの後にロックまで切り替わっている');
});

test('もう一度長押しすると解除が戻る（再開できる）', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true);
  g.input.setDown([]);
  g._updatePlaying(16);
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, '再開できない');
});

// 押しっぱなしで往復すると、指を離すまでどちらに落ち着くか分からない。
test('押しっぱなしでも解除は1回しか切り替わらない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  g._updatePlaying(HOLD_MS);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true, '往復してしまっている');
});

test('ShiftRight でも同じように効く', () => {
  const g = makeGame();
  g.input.setDown(['ShiftRight']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true);
});

// 持っていない間に反転できると、次に拾ったときの状態が「いつ長押ししたか」で決まる。
test('Auto Aim を持っていなければ長押しは何も起こさない', () => {
  const g = makeGame({ player: { alive: true, docked: false, autoAimTimer: 0, autoAimPaused: false } });
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false);
});

test('しきい値の設定が効く', () => {
  const g = makeGame({ settings: { ...DEFAULT_SETTINGS, autoAimHoldTenths: 20 } }); // 2.0 秒
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, '2.0 秒設定なのに 0.4 秒で発火している');
  g._updatePlaying(2000);
  assert.equal(g.player.autoAimPaused, true, '2.0 秒を超えても発火しない');
});

// F キーと同じ線引き。player は 'settings' でも alive のまま残るので、
// 自機の状態を見るだけでは「プレイ中限定」にならない。
test('ポーズ中（設定画面）に Shift を押しても何も起きない', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  g._updateSettings = () => {};
  g.input.setDown(['ShiftLeft']);
  g.update(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, 'ポーズ中に Auto Aim が切り替わっている');
  g.input.setDown([]);
  g.update(16);
  assert.equal(g.input.crosshairLocked, false, 'ポーズ中の Shift でロックが切り替わっている');
});

// リセットは _openSettings() 個別ではなく update() の「プレイ中でなければ常に初期化」という
// 共通のシームで行っている（フラッグ奪取やゲームオーバーなど他の退出経路も同じシームで拾うため）。
// _openSettings() 自体は同フレーム内で return するので、シームが効くのは次フレームになる。
test('設定画面を開くと、次のフレームで長押しの計測が初期化される', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(200);                 // しきい値 300ms 未満まで貯める
  assert.ok(g.shiftHold.heldMs > 0, 'そもそも貯まっていない');
  g._openSettings('playing');
  g._updateSettings = () => {};          // update() の settings 分岐を通すためのスタブ
  g.update(16);                          // gameState が 'playing' でなくなった次のフレーム
  assert.deepEqual(g.shiftHold, initialHoldState(), '計測が残っている');
});

// _openSettings() だけをリセット箇所にすると、フラッグ奪取やゲームオーバーなど
// 他の退出経路が素通りしてしまう。ミッションクリアをまたいで Shift を押しっぱなしにした場合、
// 次のミッションの1フレーム目に前のミッションの押しかけ分がタップとして漏れて
// クロスヘアロックが勝手に切り替わる、という実プレイで起きうる事故を防げているか確かめる。
test('ミッションクリアをまたぐと長押しの計測が初期化され、次のミッションでタップが漏れない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(200);                 // しきい値 300ms 未満まで貯める（保持中のまま画面が変わる）
  assert.ok(g.shiftHold.heldMs > 0, 'そもそも貯まっていない');

  g.gameState = 'mission_clear';
  g.update(16);                          // update() の共通シームがここで効くはず
  assert.deepEqual(g.shiftHold, initialHoldState(), 'ミッションクリア中も計測が残っている');

  g.input.setDown([]);                   // ミッションクリア画面の間に離した
  g.gameState = 'playing';
  g._updatePlaying(16);
  assert.equal(g.input.crosshairLocked, false, '前のミッションの押しかけがタップとして漏れている');
});
