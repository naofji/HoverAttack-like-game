import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';

// node:test には window も AudioContext も無い。ゲームロジックのテスト中に
// 敵が射撃するなどして音が鳴ろうとすると、以前はここで例外になっていた
// （実際に attacker-return.test.js が不定期に落ちる原因だった）。
test('音の出せない環境でも play 系が例外を投げない', () => {
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(audioManager))
    .filter((n) => n.startsWith('play') || n.startsWith('stop')
      || n.startsWith('start') || n.startsWith('set'));
  assert.ok(methods.length > 10, `対象メソッドが少なすぎる: ${methods.length}`);

  for (const name of methods) {
    assert.doesNotThrow(() => audioManager[name](), `${name}() が例外を投げた`);
  }
});

test('音の出せない環境では初期化されない', () => {
  audioManager.init();
  assert.equal(audioManager.ctx, null, 'AudioContext が作られてしまっている');
});

test('新しい効果音が揃っている', () => {
  for (const name of [
    'playDock',            // ドッキング
    'startCarrierEngine',  // 母艦のエンジン（ドッキング中のループ）
    'stopCarrierEngine',
    'playLanding',         // 着地
    'playPlayerDestroyed', // 自機の破壊
    'playPickup',          // アイテム取得
    'playReloadComplete',  // マシンガンのリロード完了
  ]) {
    assert.equal(typeof audioManager[name], 'function', `${name} が無い`);
  }
});
