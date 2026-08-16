import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

/** _restoreFullscreen() の呼び出しを記録する game。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.restored = 0;
  g._restoreFullscreen = () => { g.restored++; };
  g.settings = { ...DEFAULT_SETTINGS };
  g.gameState = 'title';
  g.missionsCompleted = 0;
  g.stateTimer = 0;
  g.score = 0;
  g.stageResults = [];
  g.playerNameInput = '';
  return Object.assign(g, overrides);
}

// --- 設定そのものの効き ---

/**
 * 実装は module から直接 import した enterFullscreen() を呼ぶので、差し込める
 * 継ぎ目が無い。globalThis.document を偽物に差し替えて requestFullscreen を観測し、
 * 必ず元へ戻す（node には document が無いので delete で消える）。
 */
function withFakeDocument(fn) {
  const calls = [];
  globalThis.document = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: () => { calls.push('request'); return Promise.resolve(); },
    },
  };
  try { fn(calls); } finally { delete globalThis.document; }
}

test('設定 ON なら enterFullscreen を呼ぶ', () => {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS, autoFullscreen: true };
  withFakeDocument((calls) => {
    g._restoreFullscreen();
    assert.deepEqual(calls, ['request'], 'requestFullscreen が呼ばれていない');
  });
});

test('設定 OFF なら enterFullscreen を呼ばない', () => {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS, autoFullscreen: false };
  withFakeDocument((calls) => {
    g._restoreFullscreen();
    assert.deepEqual(calls, [], 'OFF なのに全画面へ入ろうとしている');
  });
});

test('設定が無くても落ちない', () => {
  const g = Object.create(Game);
  g.settings = undefined;
  assert.doesNotThrow(() => g._restoreFullscreen());
});

// --- 呼ぶ場所 ---

test('タイトルのメニューを決定したときに呼ぶ', () => {
  const g = makeGame({
    titleMenuItems: () => ['start'],
    selectedTitleItem: () => 'start',
    stateManager: { restart() {} },
  });
  g._activateTitleMenu();
  assert.equal(g.gameState, 'playing', 'そもそも始まっていない');
  assert.equal(g.restored, 1);
});

test('ミッションクリアから次面へ進むときに呼ぶ', () => {
  const g = makeGame({
    gameState: 'mission_clear',
    _updateTimeBonusSlot: () => false,
    stateManager: { nextMission() {} },
    input: {
      isKeyPressed: (c) => c === 'Enter',
      isLeftClickPressed: () => false,
      isRightClickPressed: () => false,
      getTypedChars: () => [],
    },
  });
  g._updateMissionClear();
  assert.equal(g.gameState, 'playing', 'そもそも次面へ進んでいない');
  assert.equal(g.restored, 1);
});

test('ミッションクリアで入力が無ければ呼ばない', () => {
  const g = makeGame({
    gameState: 'mission_clear',
    _updateTimeBonusSlot: () => false,
    stateManager: { nextMission() {} },
    input: {
      isKeyPressed: () => false,
      isLeftClickPressed: () => false,
      isRightClickPressed: () => false,
      getTypedChars: () => [],
    },
  });
  g._updateMissionClear();
  assert.equal(g.restored, 0);
});

test('設定画面を閉じるときに呼ぶ', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  g._closeSettings();
  assert.equal(g.gameState, 'playing');
  assert.equal(g.restored, 1);
});

// 時間で進む遷移は transient activation が切れているので requestFullscreen が
// ブラウザに拒否される。呼んでも無駄なので入れない、という判断の回帰防止。
test('ゲームオーバーからの自動遷移では呼ばない', () => {
  const g = makeGame({
    gameState: 'gameover',
    stateTimer: 5000,
    _tryGoToRanking() { this.gameState = 'title'; },
  });
  g._updateGameOver(16);
  assert.equal(g.restored, 0, '入力を伴わない遷移で全画面へ入ろうとしている');
});

test('全クリアからの自動遷移でも呼ばない', () => {
  const g = makeGame({
    gameState: 'gameclear',
    stateTimer: 8000,
    _updateTimeBonusSlot: () => false,
    _tryGoToRanking() { this.gameState = 'title'; },
  });
  g._updateGameClear(16);
  assert.equal(g.restored, 0);
});

test('ランキングの名前を Enter で確定したときに呼ぶ', () => {
  const g = makeGame({
    gameState: 'ranking_entry',
    playerNameInput: 'AAA',
    score: 100,
    totalTime: 0,
    missionsCompleted: 0,
    stageResults: [],
    // 高得点でない経路を通す。addScore も _submitOnline も走らないので、
    // ランキングの偽物を用意せずに確定だけを確かめられる
    highScoreManager: { isHighScore: () => false },
    input: { getTypedChars: () => ['Enter'] },
  });
  g._updateRankingEntry();
  assert.equal(g.gameState, 'local_ranking_display', 'そもそも確定していない');
  assert.equal(g.restored, 1);
});

test('ランキングで名前を打っているだけでは呼ばない', () => {
  const g = makeGame({
    gameState: 'ranking_entry',
    playerNameInput: '',
    input: { getTypedChars: () => ['a'] },
  });
  g._updateRankingEntry();
  assert.equal(g.gameState, 'ranking_entry');
  assert.equal(g.restored, 0);
});
