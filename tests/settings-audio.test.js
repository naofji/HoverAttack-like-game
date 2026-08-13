import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

test('applySettings は引数なしでも例外を投げない（AudioContext が無い環境）', () => {
  assert.doesNotThrow(() => audioManager.applySettings());
  assert.doesNotThrow(() => audioManager.applySettings(DEFAULT_SETTINGS));
});

// applySettings() は _applyBgmVolume()（保存しない版）を使う。setBgmVolume()
// （保存する版）を呼ぶと実効値が旧キー hoverAttack.bgmVolume に書き込まれてしまう
// ため、ここを取り違えていないかを確かめる。
test('applySettings が BGM 音量に実効値（マスター×BGM）を渡す', () => {
  const calls = [];
  const orig = audioManager._applyBgmVolume;
  audioManager._applyBgmVolume = (v) => { calls.push(v); };
  try {
    audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.8 });
  } finally {
    audioManager._applyBgmVolume = orig;
  }
  assert.deepEqual(calls, [0.4], 'マスターを掛けた値で呼んでいない');
});

// マスター 1.0 のときに何も目減りしないことを確かめる。ここがずれると
// 「設定を触っていないのに音が小さくなった」になる。
test('マスター 1.0 なら BGM 音量はそのまま', () => {
  const calls = [];
  const orig = audioManager._applyBgmVolume;
  audioManager._applyBgmVolume = (v) => { calls.push(v); };
  try {
    audioManager.applySettings({ ...DEFAULT_SETTINGS, bgmVolume: 0.8 });
  } finally {
    audioManager._applyBgmVolume = orig;
  }
  assert.deepEqual(calls, [0.8]);
});

// applySettings() は setBgmVolume()（保存する版）を呼んではいけない。
// 呼ぶと実効値が旧キーに書き込まれてしまう（(1) の回帰防止）。
test('applySettings は setBgmVolume（保存する版）を呼ばない', () => {
  const calls = [];
  const orig = audioManager.setBgmVolume;
  audioManager.setBgmVolume = (v) => { calls.push(v); return v; };
  try {
    audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.8 });
  } finally {
    audioManager.setBgmVolume = orig;
  }
  assert.deepEqual(calls, [], '保存する版が呼ばれている＝旧キーが実効値で上書きされる');
});

test('効果音のユーザー音量を覚えておく（AudioContext が無くても）', () => {
  audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.5, seVolume: 0.6 });
  assert.equal(audioManager.seUserVolume, 0.3);
});
