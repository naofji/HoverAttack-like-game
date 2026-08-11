import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('resetLevel は smokeScreens を空にする（前ステージの煙が残らない）', async () => {
  const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
  const { SmokeScreen } = await import('../src/js/entities/SmokeScreen.js');

  // resetLevel はマップ再生成まで行くので、そこまで進まないよう
  // 配列クリアの直後で止める番兵を仕込む
  const game = {
    smokeScreens: [new SmokeScreen(0, 0)],
    deathHold: { clear() {} },
    get rng() { throw new Error('STOP'); },
    set rng(_v) { throw new Error('STOP'); },
  };
  const mgr = new GameStateManager(game);
  assert.throws(() => mgr.resetLevel(false), /STOP/);
  assert.deepEqual(game.smokeScreens, [], 'smokeScreens がクリアされていない');
});
