import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, MG_AUTO_RELOAD_MODES, loadSettings, saveSettings, effectiveVolumes, stepSetting,
} from '../src/js/utils/settings.js';
import {
  SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
  VOLUME_STEP_COARSE, VOLUME_STEP_FINE,
  MG_RELOAD_THRESHOLD_DEFAULT, MG_RELOAD_THRESHOLD_MIN, MG_RELOAD_THRESHOLD_MAX,
  AUTO_AIM_CANCEL_THRESHOLD_DEFAULT, AUTO_AIM_RELEASE_MIN, AUTO_AIM_RELEASE_MAX,
  AUTO_AIM_HOLD_TENTHS_DEFAULT, AUTO_AIM_HOLD_TENTHS_MIN, AUTO_AIM_HOLD_TENTHS_MAX,
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
  assert.equal(DEFAULT_SETTINGS.mgAutoReloadMode, 'always', '今は自動装填する');
  assert.equal(DEFAULT_SETTINGS.mgReloadThreshold, MG_RELOAD_THRESHOLD_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoAimRelease, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoFullscreen, true, '今は開始時に全画面へ入る');
  assert.equal(DEFAULT_SETTINGS.autoAimHoldTenths, AUTO_AIM_HOLD_TENTHS_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoAimResumeOnPickup, true, '拾ったら再開するのが既定');
});

test('保存して読み直すと同じ値', () => {
  const s = fakeStorage();
  const saved = { ...DEFAULT_SETTINGS, masterVolume: 0.5, mgAutoReloadMode: 'onSwitch', mgReloadThreshold: 3 };
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
  const raw = JSON.stringify({
    masterVolume: 99, bgmVolume: -5, seVolume: 'loud',
    autoFullscreen: 'yes', mgAutoReloadMode: 'sometimes', mgReloadThreshold: 'lots',
  });
  const got = loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw }));
  assert.equal(got.masterVolume, 1, '上限に丸める');
  assert.equal(got.bgmVolume, 0, '下限に丸める');
  assert.equal(got.seVolume, DEFAULT_SETTINGS.seVolume, '数値でないものは既定値');
  assert.equal(got.autoFullscreen, DEFAULT_SETTINGS.autoFullscreen, '真偽値でないものは既定値');
  assert.equal(got.mgAutoReloadMode, DEFAULT_SETTINGS.mgAutoReloadMode, '知らない選択肢は既定値');
  assert.equal(got.mgReloadThreshold, DEFAULT_SETTINGS.mgReloadThreshold, '整数でないものは既定値');
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
  const off = { ...DEFAULT_SETTINGS, autoFullscreen: false };
  assert.equal(stepSetting(off, 'autoFullscreen', +1).autoFullscreen, true);
  assert.equal(stepSetting(off, 'autoFullscreen', -1).autoFullscreen, false, '既に OFF なら OFF のまま');
  const on = { ...DEFAULT_SETTINGS, autoFullscreen: true };
  assert.equal(stepSetting(on, 'autoFullscreen', -1).autoFullscreen, false);
  assert.equal(stepSetting(on, 'autoFullscreen', +1).autoFullscreen, true, '既に ON なら ON のまま');
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

// --- choice（3択） ---

test('coerce: choice は選択肢に無い値を既定値へ落とす', () => {
  for (const mode of MG_AUTO_RELOAD_MODES) {
    const raw = JSON.stringify({ mgAutoReloadMode: mode });
    assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).mgAutoReloadMode, mode);
  }
  const bad = JSON.stringify({ mgAutoReloadMode: true });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: bad })).mgAutoReloadMode,
    DEFAULT_SETTINGS.mgAutoReloadMode);
});

// ON/OFF と同じ「向きで決める」規則。循環させると連打でどこに着くか画面を見ないと分からない。
test('stepSetting: choice は向きで動き、端で止まる（循環しない）', () => {
  let s = { ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' };
  s = stepSetting(s, 'mgAutoReloadMode', +1);
  assert.equal(s.mgAutoReloadMode, 'onSwitch');
  s = stepSetting(s, 'mgAutoReloadMode', +1);
  assert.equal(s.mgAutoReloadMode, 'always');
  s = stepSetting(s, 'mgAutoReloadMode', +1);
  assert.equal(s.mgAutoReloadMode, 'always', '右端で循環している');
  s = stepSetting(s, 'mgAutoReloadMode', -1);
  assert.equal(s.mgAutoReloadMode, 'onSwitch');
  s = stepSetting(s, 'mgAutoReloadMode', -1);
  assert.equal(s.mgAutoReloadMode, 'off');
  s = stepSetting(s, 'mgAutoReloadMode', -1);
  assert.equal(s.mgAutoReloadMode, 'off', '左端で循環している');
});

test('stepSetting: 壊れた choice からでも動く（既定値を起点にする）', () => {
  const s = stepSetting({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'nonsense' }, 'mgAutoReloadMode', -1);
  assert.equal(s.mgAutoReloadMode, 'onSwitch', '既定 always の1つ左になっていない');
});

// --- int（整数） ---

test('stepSetting: int は 1 ずつ動き、上下限で止まる', () => {
  let s = { ...DEFAULT_SETTINGS, mgReloadThreshold: MG_RELOAD_THRESHOLD_MAX };
  s = stepSetting(s, 'mgReloadThreshold', +1);
  assert.equal(s.mgReloadThreshold, MG_RELOAD_THRESHOLD_MAX, '上限を超えている');
  s = stepSetting(s, 'mgReloadThreshold', -1);
  assert.equal(s.mgReloadThreshold, MG_RELOAD_THRESHOLD_MAX - 1);

  let t = { ...DEFAULT_SETTINGS, autoAimRelease: AUTO_AIM_RELEASE_MIN };
  t = stepSetting(t, 'autoAimRelease', -1);
  assert.equal(t.autoAimRelease, AUTO_AIM_RELEASE_MIN, '下限を割っている');
  t = stepSetting(t, 'autoAimRelease', +1);
  assert.equal(t.autoAimRelease, AUTO_AIM_RELEASE_MIN + 1);
});

test('stepSetting: int は音量の刻みを受け取っても 1 ずつ動く', () => {
  const s = stepSetting({ ...DEFAULT_SETTINGS, mgReloadThreshold: 8 },
    'mgReloadThreshold', +1, VOLUME_STEP_COARSE);
  assert.equal(s.mgReloadThreshold, 9);
});

// 保存値が範囲外になるのは「範囲の定義を変えた」か「壊れた」かのどちらか。
// 近い値を推測するより既定へ戻すほうが安全（音量は連続量なのでクランプが自然、という違い）。
test('coerce: int の範囲外はクランプではなく既定値に落とす', () => {
  const over = JSON.stringify({ mgReloadThreshold: MG_RELOAD_THRESHOLD_MAX + 1 });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: over })).mgReloadThreshold,
    MG_RELOAD_THRESHOLD_DEFAULT, 'クランプしてしまっている');
  const under = JSON.stringify({ autoAimRelease: 0 });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: under })).autoAimRelease,
    AUTO_AIM_CANCEL_THRESHOLD_DEFAULT);
});

test('coerce: int は小数を受け付けない', () => {
  const raw = JSON.stringify({ mgReloadThreshold: 8.5 });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).mgReloadThreshold,
    MG_RELOAD_THRESHOLD_DEFAULT);
});

// --- 旧 mgAutoReload からの移行。既に設定を触った人の選択を捨てない ---

test('旧 mgAutoReload: true を always に読み替える', () => {
  const raw = JSON.stringify({ masterVolume: 0.5, mgAutoReload: true });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).mgAutoReloadMode, 'always');
});

test('旧 mgAutoReload: false を off に読み替える', () => {
  const raw = JSON.stringify({ masterVolume: 0.5, mgAutoReload: false });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).mgAutoReloadMode, 'off');
});

test('新しいキーがあれば旧 mgAutoReload は無視する', () => {
  const raw = JSON.stringify({ mgAutoReload: false, mgAutoReloadMode: 'onSwitch' });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).mgAutoReloadMode, 'onSwitch');
});

test('旧 mgAutoReload は保存し直すと消える', () => {
  const s = fakeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ mgAutoReload: false }) });
  const loaded = loadSettings(s);
  saveSettings(loaded, s);
  const written = JSON.parse(s.dump()[SETTINGS_STORAGE_KEY]);
  assert.equal(Object.hasOwn(written, 'mgAutoReload'), false, '旧キーが残っている');
  assert.equal(written.mgAutoReloadMode, 'off');
});

// --- Auto Aim 長押しトグルの2設定 ---

test('stepSetting: 長押しの時間は 1〜20 で止まる', () => {
  let s = { ...DEFAULT_SETTINGS, autoAimHoldTenths: AUTO_AIM_HOLD_TENTHS_MAX };
  s = stepSetting(s, 'autoAimHoldTenths', +1);
  assert.equal(s.autoAimHoldTenths, AUTO_AIM_HOLD_TENTHS_MAX, '上限を超えている');
  s = { ...DEFAULT_SETTINGS, autoAimHoldTenths: AUTO_AIM_HOLD_TENTHS_MIN };
  s = stepSetting(s, 'autoAimHoldTenths', -1);
  assert.equal(s.autoAimHoldTenths, AUTO_AIM_HOLD_TENTHS_MIN, '下限を割っている');
});

test('coerce: 長押しの時間の範囲外は既定値に落とす', () => {
  const raw = JSON.stringify({ autoAimHoldTenths: AUTO_AIM_HOLD_TENTHS_MAX + 1 });
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: raw })).autoAimHoldTenths,
    AUTO_AIM_HOLD_TENTHS_DEFAULT);
});

test('stepSetting: 拾ったら再開は向きで決まる', () => {
  const off = { ...DEFAULT_SETTINGS, autoAimResumeOnPickup: false };
  assert.equal(stepSetting(off, 'autoAimResumeOnPickup', +1).autoAimResumeOnPickup, true);
  assert.equal(stepSetting(off, 'autoAimResumeOnPickup', -1).autoAimResumeOnPickup, false);
});
