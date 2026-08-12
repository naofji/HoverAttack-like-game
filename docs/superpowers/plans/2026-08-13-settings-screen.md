# 設定画面とポーズ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プレイ中（`Escape` / `P`）とタイトル（`P`）から開ける設定画面を作り、音量・操作の好み・途中終了をそこに集約する。開いている間はゲーム時間が止まる。

**Architecture:** 設定の値と計算は `src/js/utils/settings.js` の純関数に閉じ込め（DOM もオーディオも要らないので `node --test` で直接テストできる）、項目の一覧は `src/js/ui/settingsItems.js` の表に置く。描画は `ScreenRenderer.drawSettings()`、状態遷移は `main.js` の `gameState = 'settings'`。ポーズは「`_updatePlaying()` を呼ばない」だけで成立する（タイマーもアキュムレータもその中で進むため）。

**Tech Stack:** バニラ ES modules、canvas 2D。ビルド工程なし、依存パッケージなし。テストは `node --test`（`npm test`）。

設計書: `docs/superpowers/specs/2026-08-13-settings-screen-design.md`

## Global Constraints

- 調整用の数値はすべて `src/js/utils/Constants.js` に置く。実装側にマジックナンバーを直書きしない
- コメントは日本語で「なぜそうしたか」を書く。既存ファイルの密度に合わせる
- **`git add -A` / `git add .` は絶対に使わない。変更したファイルを明示して add する。**
  `src/js/main.js` にはユーザーのデバッグ用の未コミット変更（`debugStartMission: 6`、本番値は 0）が
  **意図的に置いてある**。`main.js` をコミットするときは `git add -p` か、自分のハンクだけの
  パッチを `git apply --cached` すること。過去に2回巻き込んで手戻りになっている
- テストでソース文字列を grep しない。実際に関数・描画メソッドを呼び、記録された呼び出しを見る
- **乱数に依存する不等式のテストを書かない**（過去に4%の確率で落ちるテストを作った）
- `npm test` が全件通ること（着手前の基準は **862 テスト**）
- ローカルサーバーは立てない。実機での見た目・音の確認はユーザーが行う
- **`'settings'` を `DEMO_SCREEN_DRAWERS` に入れてはいけない。**
  `tests/demo-screens.test.js` の「描画の表に、デモループに乗らない余計な画面が入っていない」が
  `DEMO_SCREEN_DRAWERS` の全キーが `DEMO_CYCLE_STATES` にあることを要求している。
  設定画面はデモループの一員ではないので、`draw()` の中で別に分岐する

---

### Task 1: `utils/settings.js`（純ロジック）

設定の既定値・読み書き・刻み・実効音量を、DOM もオーディオも触らない純関数として作る。
配線は後続タスク。

**Files:**
- Create: `src/js/utils/settings.js`
- Modify: `src/js/utils/Constants.js`（定数の追加・改名）
- Modify: `src/js/utils/bgmVolume.js`（`stepVolume` が刻みを引数で受けるようにする）
- Test: `tests/settings.test.js`

**Interfaces:**
- Consumes: `clampVolume` / `volumePercent` from `src/js/utils/bgmVolume.js`
- Produces:
  - `DEFAULT_SETTINGS` — `{masterVolume, bgmVolume, seVolume, autoSwitchMissile, mgAutoReload}`
  - `loadSettings(storage?) -> settings`
  - `saveSettings(settings, storage?) -> void`
  - `effectiveVolumes(settings) -> {bgm, se}`
  - `stepSetting(settings, key, direction, step?) -> settings`（新しいオブジェクトを返す。元は変えない）
  - `SETTINGS_STORAGE_KEY`
  - Constants: `VOLUME_STEP_COARSE`(0.1) / `VOLUME_STEP_FINE`(0.05)

- [ ] **Step 1: 定数を足す／改名する**

`src/js/utils/Constants.js` の `BGM_VOLUME_STEP`（620行目付近）を置き換える。

置き換え前:
```js
export const BGM_VOLUME_STEP = 0.1;
```

置き換え後:
```js
// 音量の刻み。役割で2段に分ける。
// 粗いほう（-/+ キー用）が 10% なのは、Input.isCharPressed() が押した瞬間しか拾わず
// 押しっぱなしで連射しないため。5% にすると最大から最小まで20回押すことになる。
// 細かいほう（設定画面用）は数字を見ながら合わせるので 5%。
export const VOLUME_STEP_COARSE = 0.1;
export const VOLUME_STEP_FINE = 0.05;
```

同じファイルの `BGM_VOLUME_STORAGE_KEY` の下に足す:
```js
// 設定はまとめて1キーに入れる。項目を足すたびにキーが増えるのを避けるため。
export const SETTINGS_STORAGE_KEY = 'hoverattack.settings';
```

`BGM_VOLUME_STEP` の参照元は `src/js/utils/bgmVolume.js` の `stepVolume()` だけ（Step 2 で直す）。

- [ ] **Step 2: `stepVolume()` が刻みを受け取るようにする**

`src/js/utils/bgmVolume.js` を編集する。import から `BGM_VOLUME_STEP` を外し、`VOLUME_STEP_COARSE` を入れる。

置き換え前:
```js
export function stepVolume(current, direction) {
    return clampVolume(clampVolume(current) + Math.sign(direction) * BGM_VOLUME_STEP);
}
```

置き換え後:
```js
/**
 * 1段上げ下げした音量を返す。
 * @param {number} current 現在の音量（0〜1）
 * @param {number} direction +1 で上げ、-1 で下げ
 * @param {number} [step] 1段の幅。既定は -/+ キー用の粗いほう
 */
export function stepVolume(current, direction, step = VOLUME_STEP_COARSE) {
    return clampVolume(clampVolume(current) + Math.sign(direction) * step);
}
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/settings.test.js` を新規作成する。

```js
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
```

- [ ] **Step 4: テストが失敗することを確認する**

Run: `npm test -- tests/settings.test.js`
Expected: FAIL（`Cannot find module .../settings.js`）

- [ ] **Step 5: `src/js/utils/settings.js` を実装する**

```js
// ============================================
// settings - ユーザー設定の既定値・読み書き・刻み
// ============================================
//
// 音を鳴らす処理からも描画からも切り離してある。値の解釈と localStorage の
// 扱いは DOM もオーディオも要らないので、ここだけを単体で試せるようにするため
// （既存の utils/bgmVolume.js と同じ立ち位置）。
//
// 保存は1キーに JSON でまとめる。項目を足すたびに localStorage のキーが
// 増えていくのを避けるため。

import {
    SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
    BGM_VOLUME_DEFAULT, VOLUME_STEP_FINE,
} from './Constants.js';
import { clampVolume } from './bgmVolume.js';

/**
 * 既定値は**すべて「今の挙動」**に合わせてある。設定を触らない人にとって
 * この変更が何も変えないようにするため。
 * - masterVolume / seVolume 1.0 … 今は音量を絞る手段が無い
 * - autoSwitchMissile false  … 今はドッキングで持ち替えない
 * - mgAutoReload true        … 今は残弾50%以下＋引き金を離すと自動装填する
 */
export const DEFAULT_SETTINGS = Object.freeze({
    masterVolume: 1.0,
    bgmVolume: BGM_VOLUME_DEFAULT,
    seVolume: 1.0,
    autoSwitchMissile: false,
    mgAutoReload: true,
});

/** 値の型。読み込みのときの検証と、A/D の扱いの両方がこれを見る。 */
const KINDS = {
    masterVolume: 'volume',
    bgmVolume: 'volume',
    seVolume: 'volume',
    autoSwitchMissile: 'flag',
    mgAutoReload: 'flag',
};

/** 掛け算の丸め。0.3*0.3 が 0.09000000000000001 になるのを避ける。 */
function round3(v) {
    return Math.round(v * 1000) / 1000;
}

/** 1項目ぶんの検証。壊れていれば既定値を返す（例外は投げない）。 */
function coerce(key, value) {
    const kind = KINDS[key];
    if (kind === 'volume') {
        return Number.isFinite(value) ? clampVolume(value) : DEFAULT_SETTINGS[key];
    }
    if (kind === 'flag') {
        return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
    }
    return DEFAULT_SETTINGS[key];
}

/**
 * 保存した設定を読む。壊れた値・未知のキー・localStorage が使えない環境では
 * 黙って既定値に落とす（プライベートブラウジングでは getItem が例外を投げる）。
 * @param {Storage} [storage]
 */
export function loadSettings(storage = globalThis.localStorage) {
    const out = { ...DEFAULT_SETTINGS };
    let raw = null;
    try {
        raw = storage && storage.getItem(SETTINGS_STORAGE_KEY);
    } catch (e) { /* プライベートブラウジング */ }

    if (raw == null) {
        // 新しいキーがまだ無いときだけ、-/+ で保存していた旧キーを引き継ぐ。
        // 引き継がないと、この変更を入れた瞬間に音量が既定へ戻ってしまう。
        try {
            const old = storage && storage.getItem(BGM_VOLUME_STORAGE_KEY);
            if (old != null) {
                const v = Number.parseFloat(old);
                if (Number.isFinite(v)) out.bgmVolume = clampVolume(v);
            }
        } catch (e) { /* 同上 */ }
        return out;
    }

    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return out;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.hasOwn(parsed, key)) out[key] = coerce(key, parsed[key]);
    }
    return out;
}

/**
 * 設定を保存する。保存できなくてもゲームは続くので黙って諦める。
 * **旧キー（BGM_VOLUME_STORAGE_KEY）は消さない。** この変更を戻したときに
 * 以前の音量が残るようにするため。
 */
export function saveSettings(settings, storage = globalThis.localStorage) {
    try {
        if (!storage) return;
        const out = {};
        for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = coerce(key, settings[key]);
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(out));
    } catch (e) { /* 容量超過・プライベートブラウジング */ }
}

/**
 * マスターを掛けた実効音量。
 *
 * BGM と効果音は別々の経路で出ている（効果音は seFade→seMaster→コンプレッサ、
 * BGM は BGMManager が自前の音量を持つ）ので、両方の上に1つノードを差し込む
 * 配線変更はせず、適用時に掛ける。音の配線に手を入れないので、実測で詰めてきた
 * 既存の音量バランスに影響しない。
 * @returns {{bgm: number, se: number}}
 */
export function effectiveVolumes(settings) {
    const m = clampVolume(settings.masterVolume);
    return {
        bgm: round3(m * clampVolume(settings.bgmVolume)),
        se: round3(m * clampVolume(settings.seVolume)),
    };
}

/**
 * 1項目を1段動かした設定を返す（元は書き換えない）。
 *
 * ON/OFF は「反転」ではなく**向きで決める**（A で OFF、D で ON）。反転にすると
 * 連打したときにどちらになるか画面を見ないと分からない。
 * @param {object} settings
 * @param {string} key
 * @param {number} direction +1 / -1
 * @param {number} [step] 音量の刻み。既定は設定画面用の細かいほう
 */
export function stepSetting(settings, key, direction, step = VOLUME_STEP_FINE) {
    const kind = KINDS[key];
    if (!kind) return settings;
    if (kind === 'volume') {
        const next = clampVolume(clampVolume(settings[key]) + Math.sign(direction) * step);
        return { ...settings, [key]: next };
    }
    return { ...settings, [key]: direction > 0 };
}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- tests/settings.test.js`
Expected: PASS（全 19 テスト）

- [ ] **Step 7: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`BGM_VOLUME_STEP` を改名したので、参照が残っていれば落ちる（残っていたら直す）

- [ ] **Step 8: コミット**

```bash
git add src/js/utils/settings.js src/js/utils/Constants.js src/js/utils/bgmVolume.js tests/settings.test.js
git commit -m "feat: ユーザー設定の純ロジックを追加する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: AudioManager に設定を適用する

効果音のユーザー音量の段を1つ足し、設定オブジェクトを渡すと BGM と効果音の両方に
実効音量が反映されるようにする。

**Files:**
- Modify: `src/js/audio/AudioManager.js`
- Test: `tests/settings-audio.test.js`

**Interfaces:**
- Consumes: `effectiveVolumes(settings)` from Task 1
- Produces: `audioManager.applySettings(settings) -> void`、`audioManager.seUserGain`（ゲインノード）

**設計上の要点**: 既存の `seFade`（ゲームオーバーで効果音バスごと引く段）とは**別の段**を足す。
同じ段を使うと、ゲームオーバーのフェードとユーザー設定が互いを上書きする。
接続順は `seFade → seUserGain → seMaster`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-audio.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

test('applySettings は引数なしでも例外を投げない（AudioContext が無い環境）', () => {
  assert.doesNotThrow(() => audioManager.applySettings());
  assert.doesNotThrow(() => audioManager.applySettings(DEFAULT_SETTINGS));
});

test('applySettings が BGM 音量に実効値（マスター×BGM）を渡す', () => {
  const calls = [];
  const orig = audioManager.setBgmVolume;
  audioManager.setBgmVolume = (v) => { calls.push(v); return v; };
  try {
    audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.8 });
  } finally {
    audioManager.setBgmVolume = orig;
  }
  assert.deepEqual(calls, [0.4], 'マスターを掛けた値で呼んでいない');
});

// マスター 1.0 のときに何も目減りしないことを確かめる。ここがずれると
// 「設定を触っていないのに音が小さくなった」になる。
test('マスター 1.0 なら BGM 音量はそのまま', () => {
  const calls = [];
  const orig = audioManager.setBgmVolume;
  audioManager.setBgmVolume = (v) => { calls.push(v); return v; };
  try {
    audioManager.applySettings({ ...DEFAULT_SETTINGS, bgmVolume: 0.8 });
  } finally {
    audioManager.setBgmVolume = orig;
  }
  assert.deepEqual(calls, [0.8]);
});

test('効果音のユーザー音量を覚えておく（AudioContext が無くても）', () => {
  audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.5, seVolume: 0.6 });
  assert.equal(audioManager.seUserVolume, 0.3);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/settings-audio.test.js`
Expected: FAIL（`applySettings is not a function`）

- [ ] **Step 3: `AudioManager` に実装する**

冒頭の import に足す:
```js
import { effectiveVolumes } from '../utils/settings.js';
```

コンストラクタのフィールド（`this.seFade = null;` の近く、33行目付近）に足す:
```js
this.seUserGain = null;   // ユーザー設定の効果音音量（seFade とは別の段）
this.seUserVolume = 1.0;  // AudioContext がまだ無い段階でも覚えておく
```

`seFade` を作っている箇所（250行目付近）を書き換える。

置き換え前:
```js
        this.seFade = this.ctx.createGain();
        this.seFade.gain.value = 1;
        this.seFade.connect(this.seMaster);
```

置き換え後:
```js
        this.seFade = this.ctx.createGain();
        this.seFade.gain.value = 1;
        // ユーザー設定の音量は seFade とは別の段にする。同じ段を使うと、
        // ゲームオーバーのフェードとユーザー設定が互いを上書きしてしまう
        this.seUserGain = this.ctx.createGain();
        this.seUserGain.gain.value = this.seUserVolume;
        this.seFade.connect(this.seUserGain);
        this.seUserGain.connect(this.seMaster);
```

`setBgmVolume()` の下に足す:
```js
    /**
     * ユーザー設定を音に反映する。値が変わるたびに呼んでよい。
     *
     * BGM と効果音は別々の経路なので、マスターを掛けた実効値をそれぞれに配る
     * （utils/settings.js の effectiveVolumes がその計算を持つ）。
     * @param {object} [settings]
     */
    applySettings(settings) {
        if (!settings) return;
        const { bgm, se } = effectiveVolumes(settings);
        this.setBgmVolume(bgm);
        this.seUserVolume = se;
        // AudioContext がまだ無い（音を鳴らす前）段階でも値は覚えておき、
        // init() でノードを作るときに反映する
        if (this.seUserGain) this.seUserGain.gain.value = se;
    }
```

**注意**: `setBgmVolume()` は中で `saveBgmVolume()` を呼んで旧キーへ書き戻す。
それは残してよい（旧キーは「この変更を戻したときの保険」なので、実効値が入るのは
むしろ都合がよい）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/settings-audio.test.js`
Expected: PASS（全 4 テスト）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: PASS。特に `tests/audio-manager.test.js`（全メソッドを引数なしで総当たりに呼ぶ）が通ること

- [ ] **Step 6: コミット**

```bash
git add src/js/audio/AudioManager.js tests/settings-audio.test.js
git commit -m "feat: 設定の音量を AudioManager に適用できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 遊びに関わる2つの設定を効かせる

「ドッキング時にミサイルへ持ち替え」と「MG オートリロード」を実際の挙動に繋ぐ。

**Files:**
- Modify: `src/js/utils/mgReload.js`
- Modify: `src/js/entities/Player.js`
- Modify: `src/js/main.js`（`_handleDocking()` の1箇所）
- Test: `tests/settings-gameplay.test.js`、既存 `tests/mgReload*.test.js` の更新

**Interfaces:**
- Consumes: `game.settings`（Task 5 で `main.js` が持たせる。このタスクでは
  「`this.game.settings` が無ければ既定値で動く」形にしておく）
- Produces: `shouldStartMGReload(burstLeft, burstSize, fireHeld, autoReload)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-gameplay.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_BURST_SIZE } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;
const HALF = Math.floor(SIZE / 2);

test('オートリロード ON: 残弾が半分以下で引き金を離すと装填する（現行の挙動）', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false, true), true);
});

test('オートリロード ON: 撃ち切ったら引き金を握っていても装填する', () => {
  assert.equal(shouldStartMGReload(0, SIZE, true, true), true);
});

test('オートリロード ON: 残弾が十分なら装填しない', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, true), false);
});

// OFF は「弾が尽きたときだけ」。手動リロードのキーは作らない（R はミニマップで埋まっている）。
test('オートリロード OFF: 残弾が半分以下で引き金を離しても装填しない', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false, false), false);
});

test('オートリロード OFF: 残弾が 1 でも装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, false), false);
});

test('オートリロード OFF: 撃ち切ったら装填する（撃てなくなっては困る）', () => {
  assert.equal(shouldStartMGReload(0, SIZE, false, false), true);
  assert.equal(shouldStartMGReload(0, SIZE, true, false), true);
});

test('第4引数を省略すると ON 扱い（既存の呼び出しが壊れない）', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false), true);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/settings-gameplay.test.js`
Expected: FAIL（オートリロード OFF の3件。第4引数が無視されるため）

- [ ] **Step 3: `mgReload.js` を書き換える**

置き換え前:
```js
export function shouldStartMGReload(burstLeft, burstSize, fireHeld) {
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false;
    return burstLeft === 0 || !fireHeld;
}
```

置き換え後:
```js
/**
 * Decide whether an MG reload should start this frame.
 * Reload only when the magazine is at or below the threshold, and only
 * once the player empties it or releases the trigger.
 *
 * autoReload=false は設定でオートリロードを切った状態。手動リロードのキーは
 * 作らない（R はミニマップで埋まっている）ので、**弾が尽きたときだけ装填する**。
 * 残弾を撃ち切りたい人向けで、撃てないまま詰むことはない。
 *
 * @param {boolean} [autoReload=true] 省略時は現行どおりの自動装填
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld, autoReload = true) {
    if (burstLeft === 0) return true;
    if (!autoReload) return false;
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false;
    return !fireHeld;
}
```

- [ ] **Step 4: `Player.js` から設定を渡す**

`_updateMGReload()`（159行目付近）を書き換える。

置き換え前:
```js
        if (shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld)) {
```

置き換え後:
```js
        // 設定がまだ無い経路（テストの最小インスタンスなど）では現行どおり自動装填する
        const autoReload = this.game?.settings?.mgAutoReload ?? true;
        if (shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld, autoReload)) {
```

- [ ] **Step 5: ドッキング時の持ち替えを `main.js` に足す**

`_handleDocking()` の「Dock」ブロック（`player.resupply();` の直後、1063行目付近）に足す。

```js
            // 設定が ON のときだけミサイルへ持ち替える。既定は OFF＝現行どおり
            // 持ち替えない（リスポーン時に missile へ戻すのは respawn() の仕事で、
            // こちらはプレイ中のドッキング）
            if (this.settings?.autoSwitchMissile) player.currentWeapon = 'missile';
```

**注意**: `main.js` をコミットするときは Global Constraints のとおり、
`debugStartMission` のハンクを巻き込まないこと。

- [ ] **Step 6: ドッキングの挙動のテストを足す**

`tests/settings-gameplay.test.js` の末尾に足す。

```js
import { Game } from '../src/js/main.js';

/** _handleDocking() だけを呼べる最小の game。 */
function makeDockScene(settings) {
  const player = {
    alive: true, docked: false, currentWeapon: 'mg', repairKits: 0,
    x: 0, y: 0, width: 16, height: 24, vx: 3, vy: -2,
    resupply() { this.resupplied = true; },
  };
  const carrier = {
    alive: true, x: 100, y: 200, width: 64, height: 24, hp: 10, maxHp: 10, lives: 3,
    canDock: () => true,
  };
  const game = Object.create(Game);
  game.player = player;
  game.carrier = carrier;
  game.settings = settings;
  game.map = { isSolidAtPixel: () => false };
  game.input = {
    isKeyPressed: (code) => code === 'KeyS',   // S を押した1フレーム
  };
  return { game, player };
}

test('autoSwitchMissile ON: ドッキングでミサイルに持ち替える', () => {
  const { game, player } = makeDockScene({ autoSwitchMissile: true });
  game._handleDocking();
  assert.equal(player.docked, true, 'そもそもドッキングしていない');
  assert.equal(player.currentWeapon, 'missile');
});

test('autoSwitchMissile OFF: 持っている武器のまま（現行の挙動）', () => {
  const { game, player } = makeDockScene({ autoSwitchMissile: false });
  game._handleDocking();
  assert.equal(player.docked, true);
  assert.equal(player.currentWeapon, 'mg');
});

test('設定が無くても落ちない（現行の挙動のまま）', () => {
  const { game, player } = makeDockScene(undefined);
  assert.doesNotThrow(() => game._handleDocking());
  assert.equal(player.currentWeapon, 'mg');
});
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `npm test -- tests/settings-gameplay.test.js`
Expected: PASS（全 10 テスト）

- [ ] **Step 8: 全テストを走らせる**

Run: `npm test`
Expected: PASS。**既存の MG リロードのテストが落ちたら、第4引数の既定値で現行の挙動が
保たれているかを確かめてから直す**（挙動を変えてはいけない）

- [ ] **Step 9: コミット**

`main.js` は自分のハンクだけを add すること。

```bash
git add src/js/utils/mgReload.js src/js/entities/Player.js tests/settings-gameplay.test.js
git add -p src/js/main.js    # debugStartMission のハンクは選ばない
git commit -m "feat: ドッキング時の持ち替えと MG オートリロードを設定で切り替える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 設定項目の表と描画

**Files:**
- Create: `src/js/ui/settingsItems.js`
- Modify: `src/js/ui/ScreenRenderer.js`
- Test: `tests/settings-screen.test.js`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS` / `volumePercent`
- Produces:
  - `SETTINGS_ITEMS` — 配列
  - `visibleSettingsItems(fromPlaying) -> items[]`
  - `ScreenRenderer.drawSettings(ctx, {settings, index, fromPlaying, confirmingQuit})`

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-screen.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { SETTINGS_ITEMS, visibleSettingsItems } from '../src/js/ui/settingsItems.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

function draw(state = {}) {
  const ctx = makeFakeCtx();
  const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
  renderer.drawSettings(ctx, {
    settings: DEFAULT_SETTINGS, index: 0, fromPlaying: true, confirmingQuit: false, ...state,
  });
  return { ctx, texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]) };
}

// 表に載っている項目が全部出ること。表に足したのに描き忘れる事故を防ぐ。
test('プレイ中から開くと全項目が描かれる', () => {
  const { texts } = draw({ fromPlaying: true });
  for (const item of visibleSettingsItems(true)) {
    assert.ok(texts.includes(item.label), `${item.label} が描かれていない`);
  }
});

test('タイトルから開くと「途中終了」が出ない', () => {
  const { texts } = draw({ fromPlaying: false });
  const quit = SETTINGS_ITEMS.find((i) => i.key === 'quit');
  assert.ok(quit, '表に quit が無い');
  assert.equal(texts.includes(quit.label), false, 'タイトルなのに途中終了が出ている');
});

test('タイトルから開いても他の項目は全部出る', () => {
  const { texts } = draw({ fromPlaying: false });
  for (const item of visibleSettingsItems(false)) {
    assert.ok(texts.includes(item.label), `${item.label} が描かれていない`);
  }
});

test('音量はパーセントで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, masterVolume: 0.45 } });
  assert.ok(texts.some((t) => String(t).includes('45')), '45 が見当たらない');
});

test('ON/OFF が文字で出る', () => {
  const on = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReload: true } });
  const off = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReload: false } });
  assert.ok(on.texts.includes('ON'));
  assert.ok(off.texts.includes('OFF'));
});

// 選択位置が分からないと操作できない。色でも位置でもいいので、必ず差が出ること。
test('選択中の項目は他と描き方が変わる', () => {
  const a = draw({ index: 0 });
  const b = draw({ index: 1 });
  assert.notDeepEqual(
    a.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    b.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    '選択位置を変えても描画が同じ',
  );
});

test('途中終了の確認中は YES / NO が出る', () => {
  const { texts } = draw({ confirmingQuit: true });
  assert.ok(texts.includes('YES'));
  assert.ok(texts.includes('NO'));
});

test('画面からはみ出さない', () => {
  const { ctx } = draw();
  const ys = ctx.calls
    .filter((c) => c.name === 'fillText' || c.name === 'fillRect')
    .map((c) => (c.name === 'fillText' ? c.args[2] : c.args[1] + c.args[3]));
  assert.ok(Math.max(...ys) <= 768, `画面下端を超えている: ${Math.max(...ys)}`);
});

test('index が範囲外でも落ちない', () => {
  assert.doesNotThrow(() => draw({ index: -5 }));
  assert.doesNotThrow(() => draw({ index: 999 }));
});

// 表の key と保存される設定がずれると、項目を足したのに保存されない事故になる。
test('表の設定キーはすべて DEFAULT_SETTINGS に存在する', () => {
  for (const item of SETTINGS_ITEMS) {
    if (item.type === 'action') continue;
    assert.ok(Object.hasOwn(DEFAULT_SETTINGS, item.key), `${item.key} が DEFAULT_SETTINGS に無い`);
  }
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/settings-screen.test.js`
Expected: FAIL（`Cannot find module .../settingsItems.js`）

- [ ] **Step 3: `src/js/ui/settingsItems.js` を作る**

```js
// ============================================
// settingsItems - 設定画面の項目の表
// ============================================
//
// 項目の違いは**この表の1行**に出る。描画も入力処理も type で分岐するので、
// 項目を足すのは行を1つ足すだけで済む（CLAUDE.md の共通機構の方針）。
//
// type:
//   volume … 0〜1 の値。A/D で増減し、パーセントで表示する
//   toggle … 真偽値。A で OFF、D で ON
//   action … 値を持たない。Enter で run(game) を呼ぶ
//
// onlyWhenPlaying: プレイ中に開いたときだけ出す（タイトルには「途中終了」が要らない）

import { toggleFullscreen } from '../utils/fullscreen.js';

export const SETTINGS_ITEMS = [
    { key: 'masterVolume', label: 'MASTER VOLUME', type: 'volume' },
    { key: 'bgmVolume', label: 'BGM VOLUME', type: 'volume' },
    { key: 'seVolume', label: 'SE VOLUME', type: 'volume' },
    { key: 'autoSwitchMissile', label: 'AUTO-SWITCH TO MISSILE ON DOCK', type: 'toggle' },
    { key: 'mgAutoReload', label: 'MG AUTO-RELOAD', type: 'toggle' },
    { key: 'fullscreen', label: 'FULLSCREEN', type: 'action', run: () => toggleFullscreen() },
    { key: 'quit', label: 'QUIT MISSION', type: 'action', onlyWhenPlaying: true, confirm: true },
];

/**
 * その場面で出す項目だけを返す。
 * @param {boolean} fromPlaying プレイ中から開いたか
 */
export function visibleSettingsItems(fromPlaying) {
    return SETTINGS_ITEMS.filter((item) => fromPlaying || !item.onlyWhenPlaying);
}
```

- [ ] **Step 4: `ScreenRenderer.drawSettings()` を実装する**

`src/js/ui/ScreenRenderer.js` の import に足す:
```js
import { visibleSettingsItems } from './settingsItems.js';
import { volumePercent } from '../utils/bgmVolume.js';
```

`drawHowToPlay()` の下に足す（既存の `drawPanel` / `font` / `UI` / `drawScanlines` を使う）:

```js
    /**
     * 設定画面。プレイ中（ポーズ）とタイトルの両方から同じものを出す。
     *
     * 背後は消さずにパネルを重ねる。プレイ中なら止まった戦場の上に、
     * タイトルならタイトル画面の上に出て、どこから開いたかが分かる。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{settings: object, index: number, fromPlaying: boolean, confirmingQuit: boolean}} state
     */
    drawSettings(ctx, state) {
        const { settings, index, fromPlaying, confirmingQuit } = state;
        const W = this.game.canvas.width;
        const H = this.game.canvas.height;
        const cx = Math.floor(W / 2);
        const items = visibleSettingsItems(fromPlaying);

        // 背後を暗く沈める（消さない）。設定を見ている間も戦況が見えるように
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, H);

        const rowH = 44;
        const panelH = ScreenRenderer.panelHeight(rowH * items.length + rowH);
        const panelY = Math.floor((H - panelH) / 2);
        drawPanel(ctx, cx - 320, panelY, 640, panelH, 'SETTINGS', UI.accent);

        const rowsTop = panelY + ScreenRenderer.PANEL_HEAD + ScreenRenderer.PANEL_PAD;
        ctx.textBaseline = 'middle';
        items.forEach((item, i) => {
            const y = rowsTop + i * rowH + Math.round(rowH / 2);
            const selected = i === index;

            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? UI.ok : UI.dim;
            ctx.font = font('body', selected);
            ctx.fillText(selected ? `> ${item.label}` : `  ${item.label}`, cx - 290, y);

            if (item.type === 'action') return;
            ctx.textAlign = 'right';
            ctx.fillStyle = selected ? UI.ink : UI.dim;
            const value = item.type === 'volume'
                ? `${volumePercent(settings[item.key])}`
                : (settings[item.key] ? 'ON' : 'OFF');
            ctx.fillText(value, cx + 290, y);
        });

        // 操作の案内。最下段に1行
        ctx.textAlign = 'center';
        ctx.fillStyle = UI.dim;
        ctx.font = font('small');
        const hint = confirmingQuit
            ? 'A / D : SELECT      ENTER : CONFIRM'
            : 'W / S : MOVE      A / D : CHANGE      ENTER : RUN      P : CLOSE';
        ctx.fillText(hint, cx, rowsTop + items.length * rowH + Math.round(rowH / 2));

        if (confirmingQuit) this._drawQuitConfirm(ctx, cx, H);

        ctx.textBaseline = 'alphabetic';
        drawScanlines(ctx, W, H);
    }

    /** 途中終了の確認。押し間違いで進行を捨てないよう1段挟む。 */
    _drawQuitConfirm(ctx, cx, H) {
        const boxW = 420;
        const boxH = 140;
        const y = Math.floor((H - boxH) / 2);
        drawPanel(ctx, cx - boxW / 2, y, boxW, boxH, 'CONFIRM', UI.warn);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UI.ink;
        ctx.font = font('body');
        ctx.fillText('QUIT THIS MISSION?', cx, y + 74);
        ctx.fillStyle = UI.warn;
        ctx.fillText('YES', cx - 70, y + 110);
        ctx.fillStyle = UI.dim;
        ctx.fillText('NO', cx + 70, y + 110);
    }
```

**注意**: `UI.ok` / `UI.dim` / `UI.ink` / `UI.warn` と `font()` / `drawPanel()` /
`drawScanlines()` は `ui/theme.js` から既に import 済み。追加の import は上の2行だけ。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/settings-screen.test.js`
Expected: PASS（全 10 テスト）

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/js/ui/settingsItems.js src/js/ui/ScreenRenderer.js tests/settings-screen.test.js
git commit -m "feat: 設定画面の項目の表と描画を追加する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `main.js` の配線（状態・ポーズ・キー）

**Files:**
- Modify: `src/js/main.js`
- Test: `tests/settings-pause.test.js`

**Interfaces:**
- Consumes: Task 1〜4 のすべて
- Produces: `Game.settings`、`Game.gameState === 'settings'`、`Game._updateSettings()`、
  `Game._openSettings(from)`、`Game._closeSettings()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-pause.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEMO_SCREEN_DRAWERS } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

/** キーを押した/押していないを差し替えられる入力のふり。 */
function fakeInput(pressed = []) {
  const set = new Set(pressed);
  return {
    isKeyPressed: (code) => set.has(code),
    isKeyDown: () => false,
    isCharPressed: (...chars) => chars.some((c) => set.has(c)),
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
}

/** update() を呼べる最小の game。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.settingsIndex = 0;
  g.settingsReturnTo = null;
  g.confirmingQuit = false;
  g.missionTimer = 0;
  g.totalTime = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.input = fakeInput();
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  return Object.assign(g, overrides);
}

test('プレイ中に P を押すと設定画面に入る', () => {
  const g = makeGame({ input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'settings');
  assert.equal(g.settingsReturnTo, 'playing');
});

test('設定画面で P を押すと元の状態に戻る', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'playing');
});

test('タイトルで P を押すと設定画面に入り、戻り先はタイトル', () => {
  const g = makeGame({ gameState: 'title', input: fakeInput(['KeyP']) });
  g.update(16);
  assert.equal(g.gameState, 'settings');
  assert.equal(g.settingsReturnTo, 'title');
});

// ここが要。ポーズ中に時間が進むとタイムボーナスが減る。
test('ポーズ中は時間が進まない（実時間10秒ぶん回しても）', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  for (let i = 0; i < 200; i++) g.update(50);   // 50ms × 200 = 10秒
  assert.equal(g.missionTimer, 0);
  assert.equal(g.totalTime, 0);
  assert.equal(g.simAccumulator, 0);
});

test('ポーズ中は敵が動かない', () => {
  const enemy = { x: 100, y: 50, alive: true, update() { this.x += 1; } };
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', enemies: [enemy] });
  for (let i = 0; i < 100; i++) g.update(50);
  assert.equal(enemy.x, 100);
});

test('W/S で選択が動き、端で止まる', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: 0 });
  g.input = fakeInput(['KeyW']);
  g.update(16);
  assert.equal(g.settingsIndex, 0, '先頭より上へ行っている');
  g.input = fakeInput(['KeyS']);
  g.update(16);
  assert.equal(g.settingsIndex, 1);
});

test('A/D で値が変わり、保存される', () => {
  const saved = [];
  const g = makeGame({
    gameState: 'settings', settingsReturnTo: 'playing', settingsIndex: 0,
    settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5 },
    _saveSettings() { saved.push(this.settings.masterVolume); },
  });
  g.input = fakeInput(['KeyD']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.55);
  assert.deepEqual(saved, [0.55], '保存が呼ばれていない');
});

// -/+ の付け替え。BGM ではなくマスターが動くこと。
test('-/+ は全体音量を動かす（BGM 音量ではない）', () => {
  const g = makeGame({ settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5, bgmVolume: 0.5 } });
  g._saveSettings = () => {};
  g.input = fakeInput(['-']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.4, '粗い刻み(10%)で下がっていない');
  assert.equal(g.settings.bgmVolume, 0.5, 'BGM 音量が動いてしまっている');
});

test('-/+ は名前入力中は効かない（現行の扱いの回帰防止）', () => {
  const g = makeGame({ gameState: 'ranking_entry', settings: { ...DEFAULT_SETTINGS, masterVolume: 0.5 } });
  g._saveSettings = () => {};
  g.input = fakeInput(['-']);
  g.update(16);
  assert.equal(g.settings.masterVolume, 0.5);
});

// 自機が止まっているのに噴射音が鳴り続けるのは不自然なので、開いた時点で止める。
// BGM と単発の効果音は止めない（バスごと引く fadeOutSe ではなく stopLoopingSe）。
test('設定画面を開くとループする効果音だけ止める', () => {
  const calls = [];
  const orig = { stopLoopingSe: audioManager.stopLoopingSe, fadeOutSe: audioManager.fadeOutSe };
  audioManager.stopLoopingSe = () => { calls.push('stopLoopingSe'); };
  audioManager.fadeOutSe = () => { calls.push('fadeOutSe'); };
  try {
    const g = makeGame({ input: fakeInput(['KeyP']) });
    g.update(16);
  } finally {
    Object.assign(audioManager, orig);
  }
  assert.deepEqual(calls, ['stopLoopingSe'], 'BGM ごと引いてしまっている可能性');
});

// 設定画面はデモループの一員ではない。表に入れると
// tests/demo-screens.test.js の「余計な画面が入っていない」が落ちる。
test('settings は DEMO_SCREEN_DRAWERS に入っていない', () => {
  assert.equal(Object.hasOwn(DEMO_SCREEN_DRAWERS, 'settings'), false);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/settings-pause.test.js`
Expected: FAIL（`P` の処理も `'settings'` 状態も無い）

- [ ] **Step 3: `main.js` に状態とフィールドを足す**

import に足す:
```js
import { loadSettings, saveSettings, stepSetting } from './utils/settings.js';
import { visibleSettingsItems } from './ui/settingsItems.js';
import { VOLUME_STEP_COARSE, VOLUME_STEP_FINE } from './utils/Constants.js';
```

`gameState` の宣言（168行目付近）のコメントに `'settings'` を足し、その近くにフィールドを足す:
```js
    settings: null,          // init() で loadSettings() が入れる
    settingsIndex: 0,        // 設定画面で選択中の行
    settingsReturnTo: null,  // 設定画面を閉じたときに戻る状態
    confirmingQuit: false,   // 途中終了の確認中か
    quitChoiceYes: false,    // 確認中のカーソル。既定は NO（押し間違いで進行を捨てない）
```

`init()` の中（`this.canvas = ...` の直後）に足す:
```js
        // 設定は音より先に読む。AudioContext がまだ無くても applySettings() は
        // 値を覚えておき、音を作るときに反映される
        this.settings = loadSettings();
        audioManager.applySettings(this.settings);
```

- [ ] **Step 4: `update()` のキー処理を書き換える**

置き換え前（250行目付近）:
```js
        // Press Escape to return to the title screen from playing or other sub-states
        if (this.input.isKeyPressed('Escape') && this.gameState !== 'title') {
            this._enterDemoState('title');
            return;
        }
```

置き換え後:
```js
        // Escape / P で設定画面を開閉する。
        //
        // 全画面中の Escape はブラウザが全画面解除に使い、そのときの keydown は
        // ページへ渡ってこないと見られる（下の M キーのコメント参照）。つまり
        // 全画面では「1回目で全画面解除、2回目でメニュー」になりうるので、
        // 全画面を保ったまま開ける P を主の操作として案内する。
        const wantsMenu = this.input.isKeyPressed('Escape') || this.input.isKeyPressed('KeyP');
        if (wantsMenu) {
            if (this.gameState === 'settings') {
                this._closeSettings();
                return;
            }
            if (this.gameState === 'playing' || this.gameState === 'title') {
                this._openSettings(this.gameState);
                return;
            }
            // それ以外の画面（ランキング等）は従来どおり Escape でタイトルへ
            if (this.input.isKeyPressed('Escape')) {
                this._enterDemoState('title');
                return;
            }
        }
```

- [ ] **Step 5: 開閉と更新のメソッドを足す**

`_enterDemoState()` の下に足す。

```js
    /**
     * 設定画面を開く。プレイ中に開いた場合はここでゲーム時間が止まる
     * （_updatePlaying() を呼ばなくなるだけ。タイマーもアキュムレータも
     * その中で進むので、止めるための特別な処理は要らない）。
     * @param {string} from 戻り先の状態名
     */
    _openSettings(from) {
        this.settingsReturnTo = from;
        this.gameState = 'settings';
        this.settingsIndex = 0;
        this.confirmingQuit = false;
        // 自機が止まっているのに噴射音が鳴り続けるのは不自然なので、
        // ループする音だけ止める。BGM と単発の効果音はそのまま
        audioManager.stopLoopingSe();
    },

    /** 設定画面を閉じて元の状態へ戻る。 */
    _closeSettings() {
        this.gameState = this.settingsReturnTo || 'title';
        this.settingsReturnTo = null;
        this.confirmingQuit = false;
    },

    /** 設定を保存し、音へ反映する。値を変えるたびに呼ぶ。 */
    _saveSettings() {
        saveSettings(this.settings);
        audioManager.applySettings(this.settings);
    },

    _updateSettings() {
        const items = visibleSettingsItems(this.settingsReturnTo === 'playing');

        if (this.confirmingQuit) {
            // 確認中は A/D で YES/NO を選び、Enter で決める。既定は NO
            if (this.input.isKeyPressed('KeyA')) this.quitChoiceYes = true;
            if (this.input.isKeyPressed('KeyD')) this.quitChoiceYes = false;
            if (this.input.isKeyPressed('Enter')) {
                if (this.quitChoiceYes) {
                    this.confirmingQuit = false;
                    this.settingsReturnTo = null;
                    this._enterDemoState('title');
                } else {
                    this.confirmingQuit = false;
                }
            }
            return;
        }

        if (this.input.isKeyPressed('KeyW')) {
            this.settingsIndex = Math.max(0, this.settingsIndex - 1);
        }
        if (this.input.isKeyPressed('KeyS')) {
            this.settingsIndex = Math.min(items.length - 1, this.settingsIndex + 1);
        }

        // item は W/S を処理した**後**に取る。先に取ると、同じフレームで
        // 行を移動しつつ A/D を押したときに移動前の項目を動かしてしまう
        const item = items[this.settingsIndex];
        if (!item) return;

        if (item.type === 'action') {
            if (this.input.isKeyPressed('Enter')) {
                if (item.confirm) {
                    this.confirmingQuit = true;
                    this.quitChoiceYes = false;   // 既定は NO。押し間違いで捨てない
                } else if (item.run) {
                    item.run(this);
                }
            }
            return;
        }

        let direction = 0;
        if (this.input.isKeyPressed('KeyD')) direction = +1;
        else if (this.input.isKeyPressed('KeyA')) direction = -1;
        if (direction !== 0) {
            this.settings = stepSetting(this.settings, item.key, direction, VOLUME_STEP_FINE);
            this._saveSettings();
        }
    },
```

- [ ] **Step 6: 状態機械と描画に繋ぐ**

`_updateGameState()` の `switch` に足す（`case 'playing'` の直前）:
```js
            case 'settings': return this._updateSettings();
```

`draw()` の `_drawWorld` の前に足す。**`DEMO_SCREEN_DRAWERS` には入れないこと**
（デモループの一員ではないため。`tests/demo-screens.test.js` が落ちる）:

置き換え前:
```js
        this._drawWorld(ctx);
        this.hud.draw(ctx);
```

置き換え後:
```js
        // 設定画面は背後を残して重ねる。プレイ中なら止まった戦場の上、
        // タイトルなら（上の表で描かれた）タイトル画面の上に出る
        if (this.gameState === 'settings' && this.settingsReturnTo !== 'playing') {
            this.screenRenderer.drawTitleScreen(ctx);
            this.screenRenderer.drawSettings(ctx, this._settingsViewState());
            return;
        }

        this._drawWorld(ctx);
        this.hud.draw(ctx);
```

`draw()` の `this._drawOverlays(ctx);` の直後に足す:
```js
        if (this.gameState === 'settings') {
            this.screenRenderer.drawSettings(ctx, this._settingsViewState());
        }
```

`_settingsViewState()` を `_updateSettings()` の下に足す:
```js
    /** 設定画面の描画に渡す状態をまとめる。 */
    _settingsViewState() {
        return {
            settings: this.settings,
            index: this.settingsIndex,
            fromPlaying: this.settingsReturnTo === 'playing',
            confirmingQuit: this.confirmingQuit,
        };
    },
```

- [ ] **Step 7: `-`/`+` を全体音量へ付け替える**

`_updateVolumeControl()`（294行目付近）の本体を書き換える。

置き換え前:
```js
        this.bgmVolume = audioManager.adjustBgmVolume(direction);
```

置き換え後:
```js
        // 付け替え前は BGM 音量を直接動かしていた。設定画面ができた今は
        // 「全体音量」を動かす。プレイ中にポーズを挟まず片手で下げられる
        // ほうが速いので、-/+ は残してある。刻みは粗いほう（10%）
        this.settings = stepSetting(this.settings, 'masterVolume', direction, VOLUME_STEP_COARSE);
        this._saveSettings();
```

`loop()` の音量表示（1677行目付近）を書き換える。

置き換え前:
```js
        this.screenRenderer.drawVolumeIndicator(
            this.ctx, audioManager.bgmVolume, this.volumeHudTimer,
        );
```

置き換え後:
```js
        // -/+ が動かすのは全体音量なので、HUD もそれを映す
        this.screenRenderer.drawVolumeIndicator(
            this.ctx, this.settings ? this.settings.masterVolume : 1, this.volumeHudTimer,
        );
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm test -- tests/settings-pause.test.js`
Expected: PASS（全 11 テスト）

- [ ] **Step 9: 全テストを走らせる**

Run: `npm test`
Expected: PASS。特に `tests/demo-screens.test.js` が通ること

- [ ] **Step 10: コミット**

`main.js` は自分のハンクだけを add すること（`debugStartMission` を巻き込まない）。

```bash
git add tests/settings-pause.test.js
git add -p src/js/main.js
git commit -m "feat: 設定画面をポーズとして開閉できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: HOW TO PLAY の更新と引き渡し

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`（CONTROLS の表）
- Modify: `tests/demo-screens.test.js`
- Modify: `docs/superpowers/specs/2026-08-13-settings-screen-design.md`

- [ ] **Step 1: CONTROLS に `P` を足す**

`drawHowToPlay()` の `controls` 配列に足す（`M` の行の下）。

```js
                { key: 'P', action: 'SETTINGS / PAUSE' },
```

**`-`/`+` は操作一覧に元から載っていない**ので、そこは変更不要。

- [ ] **Step 2: 一覧のテストに `P` を足す**

`tests/demo-screens.test.js` の「HOW TO PLAY の CONTROLS に主要キーが載っている」の
キー配列に `'P'` を足し、`'SETTINGS / PAUSE'` が描かれることも見る。

```js
    for (const key of ['A / D', 'W', 'SHIFT', 'L-CLICK', 'R-CLICK', 'F', 'S', 'R', 'M', 'P']) {
      assert.ok(texts.includes(key), `CONTROLS に ${key} のキーキャップが無い`);
    }
    assert.ok(texts.includes('TOGGLE FULLSCREEN'), 'M キーの説明が無い');
    assert.ok(texts.includes('SETTINGS / PAUSE'), 'P キーの説明が無い');
```

- [ ] **Step 3: テストを走らせる**

Run: `npm test`
Expected: PASS。行が1つ増えてもパネルが画面に収まっていること（既存のテストが見ている）

- [ ] **Step 4: 設計書を実装に合わせる**

実装中に決めた細部を設計書へ反映する:
- 確認ダイアログの既定は NO（押し間違いで進行を捨てないため）
- `ScreenRenderer.drawSettings(ctx, state)` の `state` の中身
- `DEMO_SCREEN_DRAWERS` に `'settings'` を入れてはいけない理由
- **設計書の「呼び出し側の変更」の `ui/HUD.js` の行を直す。** 音量インジケータは
  `HUD.js` ではなく `main.js` の `loop()` が `screenRenderer.drawVolumeIndicator()` を
  呼んで描いている（`draw()` が画面ごとに早期 return するので、その外側で重ねている）。
  設計書の記述が実装とずれているので、実際の場所に書き換える

- [ ] **Step 5: コミット**

```bash
git add src/js/ui/ScreenRenderer.js tests/demo-screens.test.js docs/superpowers/specs/2026-08-13-settings-screen-design.md
git commit -m "docs: HOW TO PLAY に P キーを載せ、設計書を実装に合わせる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: ユーザーに引き渡す**

以下を伝える。

- **ハードリロード（Cmd+Shift+R）が必要**
- 確認ポイント:

| 見るところ | 調整先 |
|---|---|
| `P` でポーズが開く／全画面のまま開けるか | — |
| `Escape` は全画面を1回挟む挙動か（実機で初確認） | — |
| ポーズ中に BGM が続き、ホバー音が止まるか | — |
| **ポーズしてもミッションタイムが増えていないか** | — |
| `-`/`+` で全体音量が動き、HUD に出るか | — |
| 設定画面の刻み（5%）／`-`/`+` の刻み（10%） | `VOLUME_STEP_FINE` / `VOLUME_STEP_COARSE` |
| 全体音量 100・SE 100 が今までと同じ大きさか | — |
| 項目の並び順・文言 | `src/js/ui/settingsItems.js` の表 |
| 「ドッキング時に持ち替え」「MG オートリロード」が効くか | — |

- フェーズB（軽量描画モード、キーコンフィグ一覧）は別 spec で後日
- ②の途中セーブ機能もまだ手つかず
