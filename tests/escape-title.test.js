import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

test('Escape key returns to title screen when playing', () => {
  const audioCalls = [];
  const fakeAudio = {
    playTitleBGM: () => audioCalls.push('playTitleBGM')
  };

  const game = Object.create(Game);
  game.gameState = 'playing';
  game.stateTimer = 100;
  game.input = {
    isKeyPressed: (code) => code === 'Escape',
    getMouseWorld: () => ({ x: 0, y: 0 }),
    crosshairLocked: false
  };

  // Mock audioManager by overriding global or calling _enterDemoState with custom handler
  game._enterDemoState = function(state) {
    this.gameState = state;
    this.stateTimer = 0;
    if (state === 'title') {
      fakeAudio.playTitleBGM();
    }
  };

  game.update(16);

  assert.equal(game.gameState, 'title');
  assert.equal(game.stateTimer, 0);
  assert.deepEqual(audioCalls, ['playTitleBGM']);
});
