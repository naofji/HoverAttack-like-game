import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume, stepVolume, volumePercent, loadBgmVolume, saveBgmVolume,
} from '../src/js/utils/bgmVolume.js';
import {
  VOLUME_STEP_COARSE, BGM_VOLUME_DEFAULT, BGM_VOLUME_STORAGE_KEY,
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

// --- 上げ下げ ---------------------------------------------------------------

test('「+」で1段上がり「-」で1段下がる', () => {
  assert.equal(stepVolume(0.5, +1), 0.6);
  assert.equal(stepVolume(0.5, -1), 0.4);
});

test('0〜100% の外へは出ない', () => {
  assert.equal(stepVolume(1.0, +1), 1.0, '100%を超えた');
  assert.equal(stepVolume(0.0, -1), 0.0, '負の音量になった');
});

test('端から端まで10回で届く（刻みが細かすぎない）', () => {
  let v = 0;
  let presses = 0;
  while (v < 1 && presses < 100) { v = stepVolume(v, +1); presses++; }
  assert.equal(v, 1);
  assert.equal(presses, 10, `100%まで${presses}回かかる`);
  assert.equal(presses, Math.round(1 / VOLUME_STEP_COARSE));
});

test('上げ下げを繰り返しても誤差が溜まらない', () => {
  // 0.1 を足し引きすると浮動小数の誤差で 0.30000000000000004 になりうる。
  // 段の値が汚れると表示が「30%」でなく「30.000000000000004%」になる。
  let v = BGM_VOLUME_DEFAULT;
  for (let i = 0; i < 200; i++) v = stepVolume(v, i % 2 ? +1 : -1);
  for (let i = 0; i < 10; i++) v = stepVolume(v, -1);
  assert.equal(v, 0, `誤差が残った: ${v}`);
  assert.equal(volumePercent(0.3), 30);
});

test('0（消音）まで下げられる', () => {
  let v = 1;
  for (let i = 0; i < 10; i++) v = stepVolume(v, -1);
  assert.equal(v, 0);
  assert.equal(volumePercent(v), 0);
});

test('壊れた値は既定値に落とす', () => {
  assert.equal(clampVolume(NaN), BGM_VOLUME_DEFAULT);
  assert.equal(clampVolume(Infinity), BGM_VOLUME_DEFAULT);
  assert.equal(clampVolume(-5), 0);
  assert.equal(clampVolume(5), 1);
});

// --- 保存と復元 ---------------------------------------------------------------

test('設定した音量が次回に引き継がれる', () => {
  const s = fakeStorage();
  saveBgmVolume(0.4, s);
  assert.equal(loadBgmVolume(s), 0.4);
  assert.equal(s.data[BGM_VOLUME_STORAGE_KEY], '0.4');
});

test('消音も保存される（0 を「未設定」と混同しない）', () => {
  const s = fakeStorage();
  saveBgmVolume(0, s);
  assert.equal(loadBgmVolume(s), 0, '消音が既定値に戻された');
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
  assert.doesNotThrow(() => saveBgmVolume(0.5, broken));
  assert.equal(loadBgmVolume(null), BGM_VOLUME_DEFAULT);
  assert.doesNotThrow(() => saveBgmVolume(0.5, null));
});
