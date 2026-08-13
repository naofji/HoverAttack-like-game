import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

// 設定画面ができたことで、プレイ中の Escape は直接タイトルへ戻るのではなく
// 設定画面を開く（そこから QUIT MISSION → 確認 で初めてタイトルへ戻る）。
// ポーズ中に途中終了ボタンを押し間違えて進行を失う事故を防ぐための変更。
// タイトルへ戻る経路自体は tests/settings-pause.test.js の
// 「QUIT MISSION → YES で確認するとタイトルへ戻り、効果音を落とす」で
// 端から端まで通しでカバーされている。
test('Escape key opens the settings screen when playing', () => {
  const game = Object.create(Game);
  game.gameState = 'playing';
  game.stateTimer = 100;
  game.settings = { masterVolume: 1, bgmVolume: 1, seVolume: 1 };
  game.input = {
    isKeyPressed: (code) => code === 'Escape',
    getMouseWorld: () => ({ x: 0, y: 0 }),
    crosshairLocked: false
  };

  game.update(16);

  assert.equal(game.gameState, 'settings');
  assert.equal(game.settingsReturnTo, 'playing');
});
