import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume, volumePercent, loadBgmVolume,
} from '../src/js/utils/bgmVolume.js';
import {
  BGM_VOLUME_DEFAULT, BGM_VOLUME_STORAGE_KEY,
} from '../src/js/utils/Constants.js';

/** localStorage の代役。 */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

// --- 丸め ---------------------------------------------------------------------
// 以前は -/+ キー用の stepVolume をここで試していた（2026-11-04 に消した。上げ下げは
// settings.test.js の stepSetting が見ている）。丸めの約束だけはここに残す

test('浮動小数の誤差を残さない', () => {
  // 0.1 を足し引きすると 0.30000000000000004 になりうる。段の値が汚れると
  // 表示が「30%」でなく「30.000000000000004%」になる。
  assert.equal(clampVolume(0.1 + 0.2), 0.3);
  assert.equal(volumePercent(0.3), 30);
});

test('0〜1 の外と壊れた値を丸める', () => {
  assert.equal(volumePercent(0), 0);
  assert.equal(clampVolume(Infinity), BGM_VOLUME_DEFAULT);
  assert.equal(clampVolume(-5), 0);
  assert.equal(clampVolume(5), 1);
});

// --- 旧キーの読み込み ---------------------------------------------------------------

test('旧キーに残っている音量を引き継ぐ', () => {
  assert.equal(loadBgmVolume(fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: '0.4' })), 0.4);
});

test('消音も引き継ぐ（0 を「未設定」と混同しない）', () => {
  assert.equal(loadBgmVolume(fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: '0' })), 0, '消音が既定値に戻された');
});

test('保存が無ければ既定値', () => {
  assert.equal(loadBgmVolume(fakeStorage()), BGM_VOLUME_DEFAULT);
});

test('保存値が壊れていても落ちない', () => {
  for (const bad of ['', 'abc', 'NaN', '99']) {
    const v = loadBgmVolume(fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: bad }));
    assert.ok(v >= 0 && v <= 1, `${bad} → ${v}`);
  }
});

test('localStorage が使えなくてもゲームは続く', () => {
  // プライベートブラウジングでは getItem / setItem が例外を投げることがある
  const broken = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.equal(loadBgmVolume(broken), BGM_VOLUME_DEFAULT);
  assert.equal(loadBgmVolume(null), BGM_VOLUME_DEFAULT);
});
