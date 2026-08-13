import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, effectiveVolumes, stepSetting,
} from '../src/js/utils/settings.js';
import {
  SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
  VOLUME_STEP_COARSE, VOLUME_STEP_FINE,
} from '../src/js/utils/Constants.js';

/** localStorage の代わり。key -> value の Map。 */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    dump: () => Object.fromEntries(m),
  };
}

/** getItem / setItem が必ず例外を投げる storage（プライベートブラウジング相当）。 */
const throwingStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

test('保存が無ければ既定値', () => {
  assert.deepEqual(loadSettings(fakeStorage()), DEFAULT_SETTINGS);
});

test('既定値は「今の挙動」に一致する（触らない人には何も変わらない）', () => {
  assert.equal(DEFAULT_SETTINGS.masterVolume, 1.0);
  assert.equal(DEFAULT_SETTINGS.seVolume, 1.0);
  assert.equal(DEFAULT_SETTINGS.autoSwitchMissile, false, '今はドッキングで持ち替えない');
  assert.equal(DEFAULT_SETTINGS.mgAutoReload, true, '今は自動装填する');
});

test('保存して読み直すと同じ値', () => {
  const s = fakeStorage();
  const saved = { ...DEFAULT_SETTINGS, masterVolume: 0.5, mgAutoReload: false };
  saveSettings(saved, s);
  assert.deepEqual(loadSettings(s), saved);
});

test('壊れた JSON は既定値', () => {
  assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: '{oops' })), DEFAULT_SETTINGS);
});

test('JSON だがオブジェクトでないものも既定値', () => {
  for (const raw of ['null', '42', '"x"', '[1,2]']) {
    assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })), DEFAULT_SETTINGS,
      `raw=${raw}`);
  }
});

test('未知のキーは捨て、欠けたキーは既定値で埋める', () => {
  const raw = JSON.stringify({ masterVolume: 0.5, somethingElse: 'x' });
  const got = loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw }));
  assert.equal(got.masterVolume, 0.5);
  assert.equal(got.seVolume, DEFAULT_SETTINGS.seVolume);
  assert.equal(Object.hasOwn(got, 'somethingElse'), false, '未知のキーが残っている');
});

test('範囲外・型違いの値は既定値に落とす', () => {
  const raw = JSON.stringify({ masterVolume: 99, bgmVolume: -5, seVolume: 'loud', mgAutoReload: 'yes' });
  const got = loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw }));
  assert.equal(got.masterVolume, 1, '上限に丸める');
  assert.equal(got.bgmVolume, 0, '下限に丸める');
  assert.equal(got.seVolume, DEFAULT_SETTINGS.seVolume, '数値でないものは既定値');
  assert.equal(got.mgAutoReload, DEFAULT_SETTINGS.mgAutoReload, '真偽値でないものは既定値');
});

test('localStorage が例外を投げても落ちない', () => {
  assert.deepEqual(loadSettings(throwingStorage), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS, throwingStorage));
});

test('storage が無くても落ちない', () => {
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS, null));
});

// 旧 -/+ で保存していた BGM 音量を引き継ぐ。引き継がないと、この変更を入れた瞬間に
// 音量が既定へ戻って「勝手に大きくなった」と受け取られる。
test('旧 hoverAttack.bgmVolume から BGM 音量を引き継ぐ', () => {
  const s = fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: '0.4' });
  assert.equal(loadSettings(s).bgmVolume, 0.4);
});

test('新しいキーがあれば旧キーは無視する', () => {
  const s = fakeStorage({
    [BGM_VOLUME_STORAGE_KEY]: '0.4',
    [SETTINGS_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, bgmVolume: 0.9 }),
  });
  assert.equal(loadSettings(s).bgmVolume, 0.9);
});

test('保存しても旧キーは消さない（この変更を戻しても音量が残る）', () => {
  const s = fakeStorage({ [BGM_VOLUME_STORAGE_KEY]: '0.4' });
  saveSettings({ ...DEFAULT_SETTINGS, bgmVolume: 0.9 }, s);
  assert.equal(s.dump()[BGM_VOLUME_STORAGE_KEY], '0.4');
});

test('effectiveVolumes: マスター 1.0 なら素通し（現行と同じ音量）', () => {
  const got = effectiveVolumes({ ...DEFAULT_SETTINGS, bgmVolume: 0.8, seVolume: 0.6 });
  assert.equal(got.bgm, 0.8);
  assert.equal(got.se, 0.6);
});

test('effectiveVolumes: マスター 0 で両方 0', () => {
  const got = effectiveVolumes({ ...DEFAULT_SETTINGS, masterVolume: 0, bgmVolume: 0.8, seVolume: 0.6 });
  assert.equal(got.bgm, 0);
  assert.equal(got.se, 0);
});

// 0.3 * 0.3 のような掛け算は 0.09000000000000001 になる。表示にも比較にも使うので丸める。
test('effectiveVolumes: 掛け算の丸めで長い小数が出ない', () => {
  const got = effectiveVolumes({ ...DEFAULT_SETTINGS, masterVolume: 0.3, bgmVolume: 0.3, seVolume: 0.7 });
  assert.equal(String(got.bgm).length <= 5, true, `bgm=${got.bgm}`);
  assert.equal(String(got.se).length <= 5, true, `se=${got.se}`);
});

test('stepSetting: 音量は 0〜1 で止まる（巻き戻らない）', () => {
  let s = { ...DEFAULT_SETTINGS, masterVolume: 1 };
  s = stepSetting(s, 'masterVolume', +1, VOLUME_STEP_FINE);
  assert.equal(s.masterVolume, 1, '上限を超えない');
  s = { ...DEFAULT_SETTINGS, masterVolume: 0 };
  s = stepSetting(s, 'masterVolume', -1, VOLUME_STEP_FINE);
  assert.equal(s.masterVolume, 0, '下限を割らない');
});

test('stepSetting: 刻みが効く', () => {
  const base = { ...DEFAULT_SETTINGS, masterVolume: 0.5 };
  assert.equal(stepSetting(base, 'masterVolume', +1, VOLUME_STEP_FINE).masterVolume, 0.55);
  assert.equal(stepSetting(base, 'masterVolume', +1, VOLUME_STEP_COARSE).masterVolume, 0.6);
});

// A で OFF、D で ON。反転にすると、連打したときにどちらになるか画面を見ないと分からない。
test('stepSetting: ON/OFF は向きで決まる（反転ではない）', () => {
  const off = { ...DEFAULT_SETTINGS, mgAutoReload: false };
  assert.equal(stepSetting(off, 'mgAutoReload', +1).mgAutoReload, true);
  assert.equal(stepSetting(off, 'mgAutoReload', -1).mgAutoReload, false, '既に OFF なら OFF のまま');
  const on = { ...DEFAULT_SETTINGS, mgAutoReload: true };
  assert.equal(stepSetting(on, 'mgAutoReload', -1).mgAutoReload, false);
  assert.equal(stepSetting(on, 'mgAutoReload', +1).mgAutoReload, true, '既に ON なら ON のまま');
});

test('stepSetting: 元のオブジェクトを書き換えない', () => {
  const base = { ...DEFAULT_SETTINGS, masterVolume: 0.5 };
  stepSetting(base, 'masterVolume', +1, VOLUME_STEP_FINE);
  assert.equal(base.masterVolume, 0.5);
});

test('stepSetting: 知らないキーは何も変えない', () => {
  const base = { ...DEFAULT_SETTINGS };
  assert.deepEqual(stepSetting(base, 'nope', +1), base);
});
