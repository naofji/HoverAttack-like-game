# リロード・全画面・Auto Aim の設定拡張 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MG オートリロードを「オフ／武器切り替え時／常時」の3段階＋残弾しきい値に分け、`F` キーをミサイル切れ時のリロードボタンにし、全画面の自動復帰と Auto Aim 解除しきい値を設定できるようにする。

**Architecture:** 設定の値の型を `utils/settings.js` の `KINDS` 表（1設定＝1行の記述子オブジェクト）で持ち、`coerce()` / `stepSetting()` が `kind` で分岐する。リロードの発動条件は `utils/mgReload.js` の純関数 1つに集約し、`Player` は状態を渡すだけにする。全画面の自動復帰は `main.js` の `_restoreFullscreen()` 1メソッドに集約する。

**Tech Stack:** バニラ ES modules ＋ canvas。ビルド工程なし、依存パッケージなし。テストは `node --test`（DOM も AudioContext も無い）。

設計: [docs/superpowers/specs/2026-08-13-reload-fullscreen-autoaim-settings-design.md](../specs/2026-08-13-reload-fullscreen-autoaim-settings-design.md)

## Global Constraints

- **`git add -A` / `git add .` は使わない。** `src/js/main.js` にはユーザーがデバッグ用に立てている `debugStartMission: 6` が意図的に未コミットで置かれている（本番値は 0）。`main.js` を含むコミットは `git add -p` か、自分のハンクだけのパッチを `git apply --cached` する。
- **コメントは日本語で「なぜそうしたか」を書く。** 何をしているかはコードが語る。既存ファイルの密度に合わせる。数値を決めたら根拠を残す。
- **マジックナンバーを実装側に直書きしない。** 調整用の数値は `src/js/utils/Constants.js` へ。
- **既定値はすべて「今の挙動」。** 設定を触らない人には何も変わらないこと。
- **`AudioManager` の新しいメソッドは引数なしで呼んでも例外を投げないこと**（`tests/audio-manager.test.js` が総当たりで呼ぶ）。このプランでは新しい音を作らないので該当なし。
- **ソース文字列を grep するテストは書かない。** 呼び出しが存在しても到達不能なら通ってしまう。
- 各タスクの終わりに `npm test` が**全件 green** であること。タスクの途中で挙動が退行しないよう境界を切ってある。
- 現在のテスト数は **925**。タスクごとに増える。

---

### Task 1: 設定の型を3種類に増やし、4項目を入れ替える

`choice`（3択）と `int`（整数）を足し、`mgAutoReload`（真偽値）を `mgAutoReloadMode` に置き換え、`mgReloadThreshold` / `autoAimRelease` / `autoFullscreen` を足す。設定画面に出て A/D で動き、保存・移行できるところまで。**ゲームの挙動への配線は Task 2 以降**（ただし `Player` の1行だけはこのタスクで新キーに繋ぎ替えて、オートリロード OFF が効かなくなる期間を作らない）。

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/utils/settings.js`
- Modify: `src/js/ui/settingsItems.js`
- Modify: `src/js/ui/ScreenRenderer.js`（`drawSettings()` の値の描画）
- Modify: `src/js/entities/Player.js:163`（1行だけ）
- Modify: `src/js/main.js:27, 1005`（定数の改名に追随）
- Modify: `src/style.css`（コメント内の定数名）
- Test: `tests/settings.test.js`, `tests/settings-screen.test.js`

**Interfaces:**
- Produces: `MG_AUTO_RELOAD_MODES = ['off', 'onSwitch', 'always']`（`utils/settings.js`）
- Produces: `settingValueText(item, settings) → string | null`（`ui/settingsItems.js`）
- Produces: 定数 `MG_RELOAD_THRESHOLD_DEFAULT|_MIN|_MAX`、`AUTO_AIM_CANCEL_THRESHOLD_DEFAULT`、`AUTO_AIM_RELEASE_MIN|_MAX`
- Produces: `DEFAULT_SETTINGS` に `mgAutoReloadMode` / `mgReloadThreshold` / `autoAimRelease` / `autoFullscreen`。`mgAutoReload` は消える

- [ ] **Step 1: 定数を足す／改名する**

`src/js/utils/Constants.js`。`PLAYER_MG_RELOAD_THRESHOLD = 0.5` は Task 2 で消すので**まだ残す**。
`PLAYER_MG_BURST_SIZE` の並びのすぐ後（`PLAYER_MG_SPREAD` の下）に足す:

```js
// オートリロードが発動する残弾（発）。既定 8 は従来の PLAYER_MG_RELOAD_THRESHOLD 0.5
// ×弾倉 16 発と同じ値で、設定を触らない人の挙動を変えないため。
// 両端を落として 1〜15 にしてあるのは、0 が「空になるまで装填しない」＝モード OFF と
// 完全に重複し、16 が「満タンでも常に装填」で意味を持たないため。
export const MG_RELOAD_THRESHOLD_DEFAULT = 8;
export const MG_RELOAD_THRESHOLD_MIN = 1;
export const MG_RELOAD_THRESHOLD_MAX = 15;
```

`AUTO_AIM_CANCEL_THRESHOLD`（503行付近）を改名し、範囲を添える。**上の「表示倍率で体感が変わる」コメントはそのまま残す** — スケール補正を入れずに設定で吸収する、という判断の記録なので:

```js
export const AUTO_AIM_CANCEL_THRESHOLD_DEFAULT = 4;
// 設定で動かせる幅。1 は「わずかでも動かせば外れる」、20 は「振り回さないと外れない」。
// 上限を 20 で止めているのは、これ以上は事実上「外れない」と変わらないため。
export const AUTO_AIM_RELEASE_MIN = 1;
export const AUTO_AIM_RELEASE_MAX = 20;
```

追随して直す箇所（機械的な置換のみ、挙動は変えない）:
- `src/js/main.js:27` の import
- `src/js/main.js:1005` の比較
- `src/style.css:33` のコメント内の定数名

- [ ] **Step 2: 失敗するテストを書く**

`tests/settings.test.js` を書き換える。**既存の `mgAutoReload` を使っている 4 箇所**（35, 40, 65-70, 140-145 行付近）を新しいキーに差し替え、新規テストを足す。

まず import に定数を足す:

```js
import {
  SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
  VOLUME_STEP_COARSE, VOLUME_STEP_FINE,
  MG_RELOAD_THRESHOLD_DEFAULT, MG_RELOAD_THRESHOLD_MIN, MG_RELOAD_THRESHOLD_MAX,
  AUTO_AIM_CANCEL_THRESHOLD_DEFAULT, AUTO_AIM_RELEASE_MIN, AUTO_AIM_RELEASE_MAX,
} from '../src/js/utils/Constants.js';
```

既存テスト「既定値は『今の挙動』に一致する」の最終行を差し替える:

```js
  assert.equal(DEFAULT_SETTINGS.mgAutoReloadMode, 'always', '今は自動装填する');
  assert.equal(DEFAULT_SETTINGS.mgReloadThreshold, MG_RELOAD_THRESHOLD_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoAimRelease, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoFullscreen, true, '今は開始時に全画面へ入る');
```

「保存して読み直すと同じ値」の `saved` を差し替える:

```js
  const saved = { ...DEFAULT_SETTINGS, masterVolume: 0.5, mgAutoReloadMode: 'onSwitch', mgReloadThreshold: 3 };
```

「範囲外・型違いの値は既定値に落とす」を差し替える:

```js
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
```

「stepSetting: ON/OFF は向きで決まる」を `autoFullscreen` で書き直す:

```js
// A で OFF、D で ON。反転にすると、連打したときにどちらになるか画面を見ないと分からない。
test('stepSetting: ON/OFF は向きで決まる（反転ではない）', () => {
  const off = { ...DEFAULT_SETTINGS, autoFullscreen: false };
  assert.equal(stepSetting(off, 'autoFullscreen', +1).autoFullscreen, true);
  assert.equal(stepSetting(off, 'autoFullscreen', -1).autoFullscreen, false, '既に OFF なら OFF のまま');
  const on = { ...DEFAULT_SETTINGS, autoFullscreen: true };
  assert.equal(stepSetting(on, 'autoFullscreen', -1).autoFullscreen, false);
  assert.equal(stepSetting(on, 'autoFullscreen', +1).autoFullscreen, true, '既に ON なら ON のまま');
});
```

そしてファイル末尾に新規テストを足す:

```js
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
```

import 行に `MG_AUTO_RELOAD_MODES` を足す:

```js
import {
  DEFAULT_SETTINGS, MG_AUTO_RELOAD_MODES, loadSettings, saveSettings, effectiveVolumes, stepSetting,
} from '../src/js/utils/settings.js';
```

- [ ] **Step 3: 設定画面のテストを書く**

`tests/settings-screen.test.js` の「ON/OFF が文字で出る」を差し替え、新しい型のテストを足す。

```js
test('ON/OFF が文字で出る', () => {
  const on = draw({ settings: { ...DEFAULT_SETTINGS, autoFullscreen: true } });
  const off = draw({ settings: { ...DEFAULT_SETTINGS, autoFullscreen: false } });
  assert.ok(on.texts.includes('ON'));
  assert.ok(off.texts.includes('OFF'));
});

test('3択は選択肢のラベルが出る', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'mgAutoReloadMode');
  for (const mode of ['off', 'onSwitch', 'always']) {
    const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, mgAutoReloadMode: mode } });
    assert.ok(texts.includes(item.labels[mode]), `${mode} のラベルが描かれていない`);
  }
});

test('整数は単位付きで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, mgReloadThreshold: 5 } });
  assert.ok(texts.includes('5 ROUNDS'), `5 ROUNDS が無い: ${texts.join(' / ')}`);
});

test('単位の無い整数は数字だけで出る', () => {
  const { texts } = draw({ settings: { ...DEFAULT_SETTINGS, autoAimRelease: 12 } });
  assert.ok(texts.includes('12'), `12 が無い: ${texts.join(' / ')}`);
});

// 効いていない項目は淡色にする。行を消すと下の項目の位置が動いてカーソルが飛ぶので、
// 消さずに色だけで伝える。
test('MG AUTO-RELOAD が OFF だとしきい値の行が淡色になる', () => {
  const styles = (s) => draw({ settings: s, index: 0 }).ctx.calls
    .filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  const off = styles({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' });
  const on = styles({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always' });
  assert.notDeepEqual(off, on, 'OFF でも描き方が変わっていない');
  assert.ok(off.includes(UI.faint), `淡色 ${UI.faint} が使われていない`);
  assert.equal(on.includes(UI.faint), false, 'ALWAYS なのに淡色が出ている');
});
```

`UI` の import を足す:

```js
import { UI } from '../src/js/ui/theme.js';
```

**`settingValueText()` の単体テスト**も同じファイルの末尾に足す（ctx を作らずに値の文字列だけ確かめられる）:

```js
import { settingValueText } from '../src/js/ui/settingsItems.js';

test('settingValueText: 型ごとの文字列', () => {
  const byKey = (k) => SETTINGS_ITEMS.find((i) => i.key === k);
  const s = { ...DEFAULT_SETTINGS, masterVolume: 0.45, autoFullscreen: false,
    mgAutoReloadMode: 'onSwitch', mgReloadThreshold: 5, autoAimRelease: 12 };
  assert.equal(settingValueText(byKey('masterVolume'), s), '45%');
  assert.equal(settingValueText(byKey('autoFullscreen'), s), 'OFF');
  assert.equal(settingValueText(byKey('mgAutoReloadMode'), s), 'ON WEAPON SWITCH');
  assert.equal(settingValueText(byKey('mgReloadThreshold'), s), '5 ROUNDS');
  assert.equal(settingValueText(byKey('autoAimRelease'), s), '12');
  assert.equal(settingValueText(byKey('fullscreen'), s), null, 'action は値を持たない');
});
```

- [ ] **Step 4: テストが失敗することを確認する**

Run: `npm test -- tests/settings.test.js tests/settings-screen.test.js`
Expected: FAIL。`MG_AUTO_RELOAD_MODES` / `settingValueText` が未定義、`DEFAULT_SETTINGS.mgAutoReloadMode` が undefined。

- [ ] **Step 5: `utils/settings.js` を書き換える**

import に定数を足す:

```js
import {
    SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
    BGM_VOLUME_DEFAULT, VOLUME_STEP_FINE,
    MG_RELOAD_THRESHOLD_DEFAULT, MG_RELOAD_THRESHOLD_MIN, MG_RELOAD_THRESHOLD_MAX,
    AUTO_AIM_CANCEL_THRESHOLD_DEFAULT, AUTO_AIM_RELEASE_MIN, AUTO_AIM_RELEASE_MAX,
} from './Constants.js';
```

`DEFAULT_SETTINGS` とその上のコメントを差し替える:

```js
/**
 * 既定値は**すべて「今の挙動」**に合わせてある。設定を触らない人にとって
 * この変更が何も変わらないようにするため。
 * - masterVolume / seVolume 1.0 … 今は音量を絞る手段が無い
 * - autoSwitchMissile false  … 今はドッキングで持ち替えない
 * - mgAutoReloadMode always  … 今は残弾がしきい値以下＋引き金を離すと自動装填する
 * - mgReloadThreshold 8      … 従来の「弾倉 16 発の 50%」と同じ
 * - autoAimRelease 4         … 従来の AUTO_AIM_CANCEL_THRESHOLD と同じ
 * - autoFullscreen true      … 今もゲーム開始時に全画面へ入る
 */
export const DEFAULT_SETTINGS = Object.freeze({
    masterVolume: 1.0,
    bgmVolume: BGM_VOLUME_DEFAULT,
    seVolume: 1.0,
    autoSwitchMissile: false,
    mgAutoReloadMode: 'always',
    mgReloadThreshold: MG_RELOAD_THRESHOLD_DEFAULT,
    autoAimRelease: AUTO_AIM_CANCEL_THRESHOLD_DEFAULT,
    autoFullscreen: true,
});

/**
 * オートリロードの発動条件。
 * - off      … 弾が尽きたときだけ装填する
 * - onSwitch … F でミサイルからマシンガンに持ち替えたときだけ装填する
 * - always   … 残弾がしきい値以下で引き金を離すと装填する（従来の ON）
 *
 * 並びは「装填が少ない順」。A/D で左右に動かしたとき、右へ行くほど手厚くなる。
 */
export const MG_AUTO_RELOAD_MODES = Object.freeze(['off', 'onSwitch', 'always']);
```

`KINDS` を記述子オブジェクトの表にする:

```js
/**
 * 値の型。読み込みの検証と A/D の扱いの両方がこれを見る。
 * `choice` は選択肢の並びを、`int` は上下限を持つので、文字列ではなく
 * 記述子オブジェクトにしてある（設定を足すのは行を1つ足すだけで済む）。
 */
const KINDS = {
    masterVolume:      { kind: 'volume' },
    bgmVolume:         { kind: 'volume' },
    seVolume:          { kind: 'volume' },
    autoSwitchMissile: { kind: 'flag' },
    autoFullscreen:    { kind: 'flag' },
    mgAutoReloadMode:  { kind: 'choice', values: MG_AUTO_RELOAD_MODES },
    mgReloadThreshold: { kind: 'int', min: MG_RELOAD_THRESHOLD_MIN, max: MG_RELOAD_THRESHOLD_MAX },
    autoAimRelease:    { kind: 'int', min: AUTO_AIM_RELEASE_MIN, max: AUTO_AIM_RELEASE_MAX },
};
```

`coerce()` を差し替える:

```js
/** 1項目ぶんの検証。壊れていれば既定値を返す（例外は投げない）。 */
function coerce(key, value) {
    const spec = KINDS[key];
    if (!spec) return DEFAULT_SETTINGS[key];
    switch (spec.kind) {
        case 'volume':
            return Number.isFinite(value) ? clampVolume(value) : DEFAULT_SETTINGS[key];
        case 'flag':
            return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
        case 'choice':
            return spec.values.includes(value) ? value : DEFAULT_SETTINGS[key];
        case 'int':
            // 範囲外はクランプせず既定値に落とす。保存値が範囲外になるのは
            // 「範囲の定義を変えた」か「壊れた」かのどちらかで、近い値を推測するより
            // 既定へ戻すほうが安全。音量は連続量なのでクランプが自然、という違い
            if (!Number.isInteger(value)) return DEFAULT_SETTINGS[key];
            return (value < spec.min || value > spec.max) ? DEFAULT_SETTINGS[key] : value;
        default:
            return DEFAULT_SETTINGS[key];
    }
}
```

`loadSettings()` のキー走査ループの直後（`return out;` の前）に移行を足す:

```js
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.hasOwn(parsed, key)) out[key] = coerce(key, parsed[key]);
    }

    // 旧 mgAutoReload（真偽値）からの移行。既に設定を触った人の選択を捨てないため。
    // 消す処理は要らない — saveSettings は DEFAULT_SETTINGS のキーだけ書き出すので、
    // 次に保存した時点で自然に消える
    if (!Object.hasOwn(parsed, 'mgAutoReloadMode') && typeof parsed.mgAutoReload === 'boolean') {
        out.mgAutoReloadMode = parsed.mgAutoReload ? 'always' : 'off';
    }
    return out;
```

`stepSetting()` を差し替える:

```js
/**
 * 1項目を1段動かした設定を返す（元は書き換えない）。
 *
 * ON/OFF も3択も「反転」ではなく**向きで決める**（A で左、D で右）。反転や循環に
 * すると、連打したときにどこへ着くか画面を見ないと分からない。
 * @param {object} settings
 * @param {string} key
 * @param {number} direction +1 / -1
 * @param {number} [step] 音量の刻み。既定は設定画面用の細かいほう。volume 以外では使わない
 */
export function stepSetting(settings, key, direction, step = VOLUME_STEP_FINE) {
    const spec = KINDS[key];
    if (!spec) return settings;
    const dir = Math.sign(direction);
    switch (spec.kind) {
        case 'volume': {
            const next = clampVolume(clampVolume(settings[key]) + dir * step);
            return { ...settings, [key]: next };
        }
        case 'flag':
            return { ...settings, [key]: dir > 0 };
        case 'choice': {
            // 起点に coerce を通すのは、壊れた値から始めても動けるようにするため
            const cur = spec.values.indexOf(coerce(key, settings[key]));
            const next = Math.min(spec.values.length - 1, Math.max(0, cur + dir));
            return { ...settings, [key]: spec.values[next] };
        }
        case 'int': {
            const cur = coerce(key, settings[key]);
            return { ...settings, [key]: Math.min(spec.max, Math.max(spec.min, cur + dir)) };
        }
        default:
            return settings;
    }
}
```

- [ ] **Step 6: `ui/settingsItems.js` を書き換える**

ファイル全体:

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
//   choice … 決まった選択肢。A/D で左右に動く（labels に表示名）
//   int    … 整数。A/D で 1 ずつ動く（suffix に単位）
//   action … 値を持たない。Enter で run(game) を呼ぶ
//
// onlyWhenPlaying: プレイ中に開いたときだけ出す（タイトルには「途中終了」が要らない）
// dimWhen: 真を返すとその行を淡色で描く（効いていないことを色で伝える）

import { toggleFullscreen } from '../utils/fullscreen.js';
import { volumePercent } from '../utils/bgmVolume.js';

export const SETTINGS_ITEMS = [
    { key: 'masterVolume', label: 'MASTER VOLUME', type: 'volume' },
    { key: 'bgmVolume', label: 'BGM VOLUME', type: 'volume' },
    { key: 'seVolume', label: 'SE VOLUME', type: 'volume' },
    { key: 'autoSwitchMissile', label: 'AUTO-SWITCH TO MISSILE ON DOCK', type: 'toggle' },
    {
        key: 'mgAutoReloadMode', label: 'MG AUTO-RELOAD', type: 'choice',
        labels: { off: 'OFF', onSwitch: 'ON WEAPON SWITCH', always: 'ALWAYS' },
    },
    {
        key: 'mgReloadThreshold', label: 'RELOAD AT AMMO', type: 'int', suffix: ' ROUNDS',
        // OFF のときは効かないが**行は消さない**。消すと下の項目の位置が動いて
        // カーソルが飛ぶので、色だけで伝える
        dimWhen: (s) => s.mgAutoReloadMode === 'off',
    },
    { key: 'autoAimRelease', label: 'AUTO-AIM RELEASE', type: 'int' },
    // その場で切り替える action と、節目で戻すかどうかの toggle は役割が違うので
    // 2行に分ける。並びは隣同士に置く
    { key: 'fullscreen', label: 'FULLSCREEN', type: 'action', run: () => toggleFullscreen() },
    { key: 'autoFullscreen', label: 'AUTO FULLSCREEN', type: 'toggle' },
    { key: 'quit', label: 'QUIT MISSION', type: 'action', onlyWhenPlaying: true, confirm: true },
];

/**
 * その場面で出す項目だけを返す。
 * @param {boolean} fromPlaying プレイ中から開いたか
 */
export function visibleSettingsItems(fromPlaying) {
    return SETTINGS_ITEMS.filter((item) => fromPlaying || !item.onlyWhenPlaying);
}

/**
 * 1項目の値を画面に出す文字列にする。描画から切り離しておくと、ctx を作らずに
 * 文字列だけを試せる。
 * @returns {string|null} action は値を持たないので null
 */
export function settingValueText(item, settings) {
    const v = settings[item.key];
    switch (item.type) {
        // すぐ上の音量 HUD が `${pct}%` と描いているのに、こちらだけ数字だけだと
        // 同じ画面内で不揃いに見えるため合わせる
        case 'volume': return `${volumePercent(v)}%`;
        case 'toggle': return v ? 'ON' : 'OFF';
        case 'choice': return item.labels[v] ?? String(v);
        case 'int': return `${v}${item.suffix ?? ''}`;
        default: return null;
    }
}
```

- [ ] **Step 7: `drawSettings()` の値の描画を差し替える**

`src/js/ui/ScreenRenderer.js`。import に `settingValueText` を足す:

```js
import { visibleSettingsItems, settingValueText } from './settingsItems.js';
```

`items.forEach` の中身（351〜369行付近）を差し替える:

```js
            const dimmed = typeof item.dimWhen === 'function' && item.dimWhen(settings);

            ctx.textAlign = 'left';
            // カーソルは矢印だけ独立した fillText として立てる（モード選択の ◀/▶ と
            // 同じ作り。ラベル文字列に接頭辞を混ぜると「表の項目が全部描かれるか」の
            // 完全一致テストと噛み合わない上、キー操作カーソルの土台としても
            // 位置の手掛かりが色だけでは弱い）。色と太字はそのまま選択の手掛かりに残す。
            //
            // 選択色は淡色より優先する。効いていない行でもカーソルは見えないと動かせない
            ctx.fillStyle = selected ? UI.ok : (dimmed ? UI.faint : UI.dim);
            ctx.font = font('body', selected);
            if (selected) ctx.fillText('▶', cx - 312, y);
            ctx.fillText(item.label, cx - 290, y);

            const value = settingValueText(item, settings);
            if (value === null) return;
            ctx.textAlign = 'right';
            ctx.fillStyle = dimmed ? UI.faint : (selected ? UI.ink : UI.dim);
            ctx.fillText(value, cx + 290, y);
```

- [ ] **Step 8: `Player` の1行を新しいキーに繋ぎ替える**

`src/js/entities/Player.js:163`。**このタスクで一緒に直す**のは、`mgAutoReload` が消えると
`?? true` に落ちて「OFF が効かない」期間ができてしまうため。`onSwitch` は Task 2 まで
`always` と同じ振る舞いになる（装填が手厚いほうへ倒しておく）。

```js
        // 設定がまだ無い経路（テストの最小インスタンスなど）では現行どおり自動装填する。
        // onSwitch はまだ「切り替えたか」を知らないので always と同じ扱い（Task 2 で分ける）
        const autoReload = (this.game?.settings?.mgAutoReloadMode ?? 'always') !== 'off';
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `npm test -- tests/settings.test.js tests/settings-screen.test.js`
Expected: PASS

- [ ] **Step 10: 全テストを走らせる**

Run: `npm test`
Expected: PASS。925 より増えている（新規テスト 14 件前後）。
`tests/settings-pause.test.js` の「A/D で値が変わり、保存される」は `settingsIndex: 0`＝
`MASTER VOLUME` なので影響を受けない。「QUIT MISSION → YES」は `findIndex` で位置を
取っているので行が増えても通る。

- [ ] **Step 11: コミット**

`main.js` はユーザーの未コミット差分（`debugStartMission: 6`）を含むので `git add -p` で
自分のハンク（27行目の import と 1005行目の比較）だけを選ぶ。

```bash
git add src/js/utils/Constants.js src/js/utils/settings.js src/js/ui/settingsItems.js \
        src/js/ui/ScreenRenderer.js src/js/entities/Player.js src/style.css \
        tests/settings.test.js tests/settings-screen.test.js
git add -p src/js/main.js
git commit -m "feat: 設定の値に3択と整数の型を足し、4項目を入れ替える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: リロードの発動条件を6規則にする

`shouldStartMGReload()` にモード・しきい値・切り替えフラグ・手動要求を渡せるようにし、
`Player` が状態を渡す。**`F` キーの二役は Task 3**。

**Files:**
- Modify: `src/js/utils/mgReload.js`
- Modify: `src/js/utils/Constants.js`（`PLAYER_MG_RELOAD_THRESHOLD` を消す）
- Modify: `src/js/entities/Player.js`（`_updateMGReload` / `switchWeapon` / `_resetMGState` / コンストラクタ）
- Test: `tests/mg-reload.test.js`, `tests/settings-gameplay.test.js`

**Interfaces:**
- Consumes: `MG_RELOAD_THRESHOLD_DEFAULT`（Task 1）、`DEFAULT_SETTINGS.mgAutoReloadMode` / `.mgReloadThreshold`（Task 1）
- Produces: `shouldStartMGReload(burstLeft, burstSize, fireHeld, opts) → boolean`
  - `opts = { mode?: 'off'|'onSwitch'|'always', threshold?: number, switchedToMG?: boolean, manual?: boolean }`
- Produces: `Player#mgSwitchedToMG: boolean`（`F` の missile→mg で立ち、`_updateMGReload` が消す）
- Produces: `Player#mgManualReload: boolean`（Task 3 が立て、`_updateMGReload` が消す）

- [ ] **Step 1: 失敗するテストを書く**

`tests/mg-reload.test.js` を全面的に書き直す。旧 `PLAYER_MG_RELOAD_THRESHOLD` の import と
「threshold constant is 50%」のテストは消す。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_BURST_SIZE, MG_RELOAD_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;          // 16
const TH = MG_RELOAD_THRESHOLD_DEFAULT;     // 8

// --- 規則1: 弾切れは常に装填する（撃てないまま詰まないため） ---

test('弾切れ: どのモードでも、引き金を握っていても装填する', () => {
  for (const mode of ['off', 'onSwitch', 'always']) {
    assert.equal(shouldStartMGReload(0, SIZE, true, { mode }), true, mode);
    assert.equal(shouldStartMGReload(0, SIZE, false, { mode }), true, mode);
  }
});

// --- 規則2: 手動はしきい値もモードも無視する ---

test('手動: モード off でも、しきい値より多く残っていても装填する', () => {
  assert.equal(shouldStartMGReload(SIZE - 1, SIZE, false, { mode: 'off', manual: true }), true);
  assert.equal(shouldStartMGReload(SIZE - 1, SIZE, true, { mode: 'off', manual: true }), true,
    '引き金を握っていても手動は通す');
});

test('手動: 満タンでは装填しない（待ち時間だけ損する）', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, { mode: 'off', manual: true }), false);
});

// --- 規則3: off は弾切れ以外で装填しない ---

test('off: 残弾 1 でも装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, { mode: 'off' }), false);
});

test('off: 切り替えても装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, { mode: 'off', switchedToMG: true }), false);
});

// --- 規則4: しきい値は onSwitch / always の両方に効く ---

test('しきい値より多く残っていれば、どちらのモードでも装填しない', () => {
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false, { mode: 'always' }), false);
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false, { mode: 'onSwitch', switchedToMG: true }), false,
    '弾倉がほぼ満タンなのに切り替えのたびにリロードを背負っている');
});

test('しきい値は設定で動く', () => {
  assert.equal(shouldStartMGReload(12, SIZE, false, { mode: 'always', threshold: 12 }), true,
    '境界（ちょうど threshold）で装填する');
  assert.equal(shouldStartMGReload(13, SIZE, false, { mode: 'always', threshold: 12 }), false);
  assert.equal(shouldStartMGReload(2, SIZE, false, { mode: 'always', threshold: 1 }), false,
    'しきい値を下げても効いていない');
});

// --- 規則5: onSwitch は切り替えたフレームだけ ---

test('onSwitch: 切り替えたフレームだけ装填する', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'onSwitch', switchedToMG: true }), true);
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'onSwitch', switchedToMG: false }), false);
});

test('onSwitch: 引き金を握っていても切り替えたなら装填する', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, true, { mode: 'onSwitch', switchedToMG: true }), true);
});

// --- 規則6: always は引き金を離すまで待つ（従来の ON） ---

test('always: しきい値以下で引き金を離すと装填する（従来の挙動）', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'always' }), true);
  assert.equal(shouldStartMGReload(3, SIZE, false, { mode: 'always' }), true);
});

test('always: 引き金を握っている間は撃たせる', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, true, { mode: 'always' }), false);
  assert.equal(shouldStartMGReload(1, SIZE, true, { mode: 'always' }), false);
});

test('always: 満タンでは装填しない', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, { mode: 'always' }), false);
});

// 既定値だけで呼んでも従来どおり動くこと（オプション省略の経路が生きている）
test('オプションを省略すると always ＋ 既定しきい値', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false), true);
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false), false);
  assert.equal(shouldStartMGReload(TH, SIZE, true), false);
});
```

同ファイル末尾の統合テスト（`magazine refills exactly when the reload timer reaches zero`）は
そのまま残す。`p.mgSwitchedToMG` / `p.mgManualReload` が undefined でも動くこと（＝falsy 扱い）
の確認も兼ねる。ただし `p.currentWeapon = 'mg'` の下に2行足して明示する:

```js
  p.mgSwitchedToMG = false;
  p.mgManualReload = false;
```

- [ ] **Step 2: `Player` の統合テストを書く**

`tests/settings-gameplay.test.js` の**冒頭7つのテスト**（`shouldStartMGReload` を第4引数の
真偽値で呼んでいるもの）を消し、代わりに `Player` の配線を見るテストを置く。
`_handleDocking` のテスト（`autoSwitchMissile` の3件）はそのまま残す。

ファイル先頭の import を差し替える:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { PLAYER_MG_BURST_SIZE, MG_RELOAD_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;

/** _updateMGReload / switchWeapon だけを呼べる最小の Player。 */
function makePlayer(settings, burstLeft = MG_RELOAD_THRESHOLD_DEFAULT) {
  const input = { mouse: { left: false }, isKeyDown: () => false };
  const p = Object.create(Player.prototype);
  p.game = { input, settings };
  p.currentWeapon = 'mg';
  p.missiles = 5;
  p.mgReloadTimer = 0;
  p.mgFireTimer = 0;
  p.mgBurstLeft = burstLeft;
  p.mgSwitchedToMG = false;
  p.mgManualReload = false;
  return { p, input };
}
```

そして規則の配線テスト:

```js
test('always: しきい値以下で引き金を離すと装填が始まる（従来の挙動）', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always' });
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0);
});

test('off: しきい値以下でも装填が始まらない', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' });
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0);
});

test('しきい値の設定が効く', () => {
  const s = { ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always', mgReloadThreshold: 2 };
  const { p, input } = makePlayer(s, 3);
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0, 'しきい値 2 なのに残弾 3 で装填している');

  const { p: q, input: qi } = makePlayer(s, 2);
  q._updateMGReload(qi);
  assert.ok(q.mgReloadTimer > 0, 'しきい値ちょうどで装填していない');
});

// フラグは立てっぱなしにしない。gameSpeed 0.8 では 1 フレームに 0 ティックのことがあるので、
// 「立てる」のは入力処理、「消す」のは読んだ側（ティック）という分担にしてある。
test('onSwitch: F で mg に持ち替えたときだけ装填し、フラグは1回で消える', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0, '切り替えていないのに装填している');

  p.currentWeapon = 'missile';
  p.switchWeapon();
  assert.equal(p.currentWeapon, 'mg');
  assert.equal(p.mgSwitchedToMG, true, '切り替えフラグが立っていない');

  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0, '切り替えたのに装填していない');
  assert.equal(p.mgSwitchedToMG, false, 'フラグが消えていない');
});

test('onSwitch: mg から missile への切り替えではフラグが立たない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p.currentWeapon = 'mg';
  p.switchWeapon();
  assert.equal(p.currentWeapon, 'missile');
  assert.equal(p.mgSwitchedToMG, false);
});

test('設定が無くても落ちない（現行どおり自動装填する）', () => {
  const { p, input } = makePlayer(undefined);
  assert.doesNotThrow(() => p._updateMGReload(input));
  assert.ok(p.mgReloadTimer > 0);
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/mg-reload.test.js tests/settings-gameplay.test.js`
Expected: FAIL。`MG_RELOAD_THRESHOLD_DEFAULT` を使うテストは通るが、オプション
オブジェクトの引数は真偽値として扱われ、`mgSwitchedToMG` も立たない。

- [ ] **Step 4: `utils/mgReload.js` を書き換える**

ファイル全体:

```js
// ============================================
// Machine-gun reload decision (single source)
// ============================================

import { MG_RELOAD_THRESHOLD_DEFAULT } from './Constants.js';

/**
 * このフレームに MG の装填を始めるか。
 *
 * 上から順に見る。並びそのものが仕様なので、入れ替えると意味が変わる:
 *
 *  1. 弾切れ  … 常に装填する。撃てないまま詰まないため
 *  2. 手動    … しきい値もモードも無視する。プレイヤーが決めたことなので。
 *                **規則4より前**に置くのが要点で、後ろに置くと「オフ」を選んだ人が
 *                自分のタイミングで装填できなくなる
 *  3. off     … 弾切れ以外では装填しない
 *  4. しきい値 … onSwitch / always の**両方**に効く。弾倉がほぼ満タンなのに
 *                切り替えのたびに 60 フレームのリロードを背負う無駄を避ける
 *  5. onSwitch … F で持ち替えたフレームだけ。fireHeld は見ない（切り替えた直後に
 *                その武器の引き金を握っている状況が実質ないので、判定を増やしても
 *                振る舞いが変わらない）
 *  6. always  … 引き金を離すまで待つ（従来の ON）
 *
 * @param {number} burstLeft 残弾
 * @param {number} burstSize 弾倉
 * @param {boolean} fireHeld 引き金を握っているか
 * @param {object} [opts]
 * @param {'off'|'onSwitch'|'always'} [opts.mode]
 * @param {number} [opts.threshold] これ以下で装填する残弾
 * @param {boolean} [opts.switchedToMG] このフレームに F で mg へ持ち替えたか
 * @param {boolean} [opts.manual] F による手動装填の要求
 */
export function shouldStartMGReload(burstLeft, burstSize, fireHeld, opts = {}) {
    const {
        mode = 'always',
        threshold = MG_RELOAD_THRESHOLD_DEFAULT,
        switchedToMG = false,
        manual = false,
    } = opts;

    if (burstLeft === 0) return true;
    if (manual) return burstLeft < burstSize;
    if (mode === 'off') return false;
    if (burstLeft > threshold) return false;
    if (mode === 'onSwitch') return switchedToMG;
    return !fireHeld;
}

/**
 * `F` を押したときに何をするか。
 *
 * ミサイルが尽きると武器を切り替えられなくなり、F が意味を失う。そのときだけ
 * リロードに割り当てると、キーを増やさずに手動装填の手段が持てる。
 * 「武器切り替え時に装填する」モードとも矛盾しない（切り替えられないときだけ
 * 意味が変わる、という規則が一つあるだけで済む）。
 *
 * @param {number} missiles 残ミサイル数（小数を取りうるので floor する）
 * @returns {'switch'|'reload'}
 */
export function weaponKeyAction(missiles) {
    return Math.floor(missiles) <= 0 ? 'reload' : 'switch';
}
```

`src/js/utils/Constants.js` から `PLAYER_MG_RELOAD_THRESHOLD` の行を消す
（`MG_RELOAD_THRESHOLD_DEFAULT` が置き換えた。参照元は `mgReload.js` と
`tests/mg-reload.test.js` だけで、どちらもこのタスクで直る）。

- [ ] **Step 5: `Player` を書き換える**

コンストラクタの `this.mgReloadTimer = 0;`（96行付近）の直後に足す:

```js
        // 「立てる」のは入力処理、「消す」のは読んだ側（シミュレーションティック）。
        // gameSpeed 0.8 では 1 フレームに 0 ティックのことがあるので、立てた
        // フレームで消すとティックに届かないことがある
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;
```

`_updateMGReload()` を差し替える:

```js
    /** Start an MG reload when the settings and magazine state allow it. */
    _updateMGReload(input) {
        // フラグはこのメソッドが読んだ時点で必ず消す。武器が違う・装填中で
        // 早期 return する経路でも消さないと、次に mg へ戻った瞬間に古い
        // 「切り替えた」が効いてしまう
        const switchedToMG = this.mgSwitchedToMG;
        const manual = this.mgManualReload;
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;

        if (this.currentWeapon !== 'mg' || this.mgReloadTimer > 0) return;
        const fireHeld = input.mouse.left || input.isKeyDown('Space');
        // 設定がまだ無い経路（テストの最小インスタンスなど）では現行どおり自動装填する
        const settings = this.game?.settings;
        const started = shouldStartMGReload(this.mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld, {
            mode: settings?.mgAutoReloadMode ?? 'always',
            threshold: settings?.mgReloadThreshold ?? MG_RELOAD_THRESHOLD_DEFAULT,
            switchedToMG,
            manual,
        });
        if (started) this.mgReloadTimer = PLAYER_MG_RELOAD_TIME;
    }
```

import を直す（`PLAYER_MG_RELOAD_THRESHOLD` は Constants からもう消えている）:

```js
import { shouldStartMGReload, weaponKeyAction } from '../utils/mgReload.js';
```

`Constants.js` からの import 行に `MG_RELOAD_THRESHOLD_DEFAULT` を足し、
`PLAYER_MG_RELOAD_THRESHOLD` を消す。

`switchWeapon()` を差し替える:

```js
    switchWeapon() {
        if (this.currentWeapon === 'missile') {
            this.currentWeapon = 'mg';
            // 「武器切り替え時」の装填はここが起点。_fireMissile() がミサイル切れで
            // 勝手に mg へ戻す経路では立てない — ゲーム側が戻したのは切り替えではない
            this.mgSwitchedToMG = true;
        } else {
            this.currentWeapon = 'missile';
        }
        audioManager.playSwitch();
    }
```

`_resetMGState()` にフラグを足す:

```js
    _resetMGState() {
        this.mgBurstLeft = PLAYER_MG_BURST_SIZE;
        this.mgFireTimer = 0;
        this.mgReloadTimer = 0;
        this.mgSwitchedToMG = false;
        this.mgManualReload = false;
    }
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- tests/mg-reload.test.js tests/settings-gameplay.test.js`
Expected: PASS

- [ ] **Step 7: 全テストを走らせる**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/js/utils/mgReload.js src/js/utils/Constants.js src/js/entities/Player.js \
        tests/mg-reload.test.js tests/settings-gameplay.test.js
git commit -m "feat: MG オートリロードの発動条件を3モードと残弾しきい値で決める

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `F` キーの二役

ミサイルが尽きているときだけ `F` を手動リロードにする。

**Files:**
- Modify: `src/js/entities/Player.js`（`pressWeaponKey()` を足す）
- Modify: `src/js/main.js:759-761`
- Modify: `src/js/ui/ScreenRenderer.js:283`（HOW TO PLAY の `F` の説明）
- Test: `tests/settings-gameplay.test.js`, `tests/demo-screens.test.js`

**Interfaces:**
- Consumes: `weaponKeyAction(missiles)`（Task 2）、`Player#mgManualReload`（Task 2）
- Produces: `Player#pressWeaponKey()` — `F` を押した1フレームに呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-gameplay.test.js` の末尾に足す。`makePlayer()` は Task 2 で作ったものを使う。
`audioManager.playSwitch` を差し替えて音の呼び出しも見る。

```js
import { audioManager } from '../src/js/audio/AudioManager.js';

/** playSwitch の呼び出しを記録し、必ず元に戻す。 */
function withSwitchSpy(fn) {
  const calls = [];
  const orig = audioManager.playSwitch;
  audioManager.playSwitch = () => calls.push('playSwitch');
  try { fn(calls); } finally { audioManager.playSwitch = orig; }
}

test('F: ミサイルが残っていれば武器を切り替える', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 3;
  p.currentWeapon = 'mg';
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.currentWeapon, 'missile');
    assert.equal(p.mgManualReload, false, '切り替えなのにリロードを要求している');
    assert.deepEqual(calls, ['playSwitch']);
  });
});

// ミサイルが尽きると切り替え先が無くなるので、そのときだけ F の意味が変わる。
test('F: ミサイルが尽きていればリロードを要求し、武器は切り替えない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 0;
  p.currentWeapon = 'mg';
  p.mgBurstLeft = 4;
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.currentWeapon, 'mg', '切り替わってしまっている');
    assert.equal(p.mgManualReload, true, 'リロードを要求していない');
    assert.deepEqual(calls, ['playSwitch'], '押した手応えの音が鳴っていない');
  });
});

test('F: ミサイルの端数（0.5 発）は尽きている扱い', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 0.5;
  p.currentWeapon = 'mg';
  p.mgBurstLeft = 4;
  withSwitchSpy(() => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, true);
  });
});

// 受け付けなかったことが分かるように無音にする。新しい音は作らない。
test('F: 満タンでは要求も音も出ない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS }, SIZE);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, false);
    assert.deepEqual(calls, [], '受け付けていないのに音が鳴っている');
  });
});

test('F: 装填中は要求も音も出ない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS }, 4);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  p.mgReloadTimer = 30;
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, false);
    assert.deepEqual(calls, []);
  });
});

// 手動はしきい値もモードも無視する。オフを選んだ人の唯一の装填手段なので。
test('F: モード off・しきい値より多い残弾でも装填が始まる', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' }, SIZE - 1);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  withSwitchSpy(() => { p.pressWeaponKey(); });
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0, '手動要求が装填に繋がっていない');
  assert.equal(p.mgManualReload, false, '要求フラグが消えていない');
});
```

`main.js` 側の配線テストも足す（`Game.update()` を通す）:

```js
import { Game } from '../src/js/main.js';

/** update() の F キー処理だけを通せる最小の game。 */
function makeFKeyScene(missiles) {
  const player = {
    alive: true, docked: false, currentWeapon: 'mg', missiles,
    pressed: 0,
    pressWeaponKey() { this.pressed++; },
    switchWeapon() { this.switched = true; },
  };
  const g = Object.create(Game);
  g.player = player;
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.missionTimer = 0;
  g.totalTime = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.input = {
    isKeyPressed: (code) => code === 'KeyF',
    isKeyDown: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
  return { g, player };
}

// main.js は分岐を持たず Player に委ねる。規則が2箇所に分かれないようにするため。
test('main.js: F は pressWeaponKey() に委ねる（switchWeapon を直接呼ばない）', () => {
  const { g, player } = makeFKeyScene(0);
  g._updatePlaying = () => {};
  g.update(16);
  assert.equal(player.pressed, 1, 'pressWeaponKey が呼ばれていない');
  assert.equal(player.switched, undefined, 'switchWeapon を直接呼んでいる');
});
```

`tests/demo-screens.test.js` の CONTROLS のテストに1行足す:

```js
    assert.ok(texts.includes('SWITCH WEAPON / RELOAD (MISSILE ↔ M-GUN)'), 'F キーの説明が更新されていない');
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/settings-gameplay.test.js tests/demo-screens.test.js`
Expected: FAIL。`p.pressWeaponKey is not a function`。

- [ ] **Step 3: `Player#pressWeaponKey()` を実装する**

`switchWeapon()` のすぐ上に足す:

```js
    /**
     * `F` を押した1フレームの処理。**規則は utils/mgReload.js の weaponKeyAction に
     * 置いてある** — main.js に分岐を書くと、切り替えとリロードの境目が2箇所に散る。
     *
     * 手動リロードを受け付けたときだけ playSwitch() を鳴らす。従来もミサイル 0 で F を
     * 押せば（意味のない切り替えでも）この音が鳴っていたので、押した手応えが変わらない。
     * 受け付けないとき（満タン・装填中）は無音にして、効かなかったことを耳で伝える。
     */
    pressWeaponKey() {
        if (weaponKeyAction(this.missiles) === 'switch') {
            this.switchWeapon();
            return;
        }
        if (this.mgReloadTimer > 0 || this.mgBurstLeft >= PLAYER_MG_BURST_SIZE) return;
        this.mgManualReload = true;
        audioManager.playSwitch();
    }
```

- [ ] **Step 4: `main.js` の F キーを繋ぎ替える**

759〜761行を差し替える:

```js
        if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
            this.player.pressWeaponKey();
        }
```

- [ ] **Step 5: HOW TO PLAY の `F` の説明を直す**

`src/js/ui/ScreenRenderer.js:283`:

```js
                { key: 'F', action: 'SWITCH WEAPON / RELOAD (MISSILE ↔ M-GUN)' },
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- tests/settings-gameplay.test.js tests/demo-screens.test.js`
Expected: PASS。CONTROLS の行が長くなるので、`demo-screens.test.js` の
「パネルが画面に収まっている」テストも合わせて通ること。落ちたら文言を
`SWITCH WEAPON / RELOAD` まで詰める。

- [ ] **Step 7: 全テストを走らせる**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: コミット**

`main.js` は `git add -p` で自分のハンクだけを選ぶ。

```bash
git add src/js/entities/Player.js src/js/ui/ScreenRenderer.js \
        tests/settings-gameplay.test.js tests/demo-screens.test.js
git add -p src/js/main.js
git commit -m "feat: ミサイルが尽きたら F を手動リロードにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Auto Aim 解除しきい値を設定から取る

**Files:**
- Modify: `src/js/main.js:1005`（比較の1行）
- Test: `tests/auto-aim-release.test.js`（新規）

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS.autoAimRelease`、`AUTO_AIM_CANCEL_THRESHOLD_DEFAULT`（Task 1）

- [ ] **Step 1: 失敗するテストを書く**

`tests/auto-aim-release.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { AUTO_AIM_CANCEL_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';

/**
 * _updateAutoAim() だけを呼べる最小の game。
 * 前フレームのマウス位置を (0,0) に置いてから move だけ動かす。
 */
function makeAimScene(settings, enemy) {
  const g = Object.create(Game);
  g.settings = settings;
  g.player = { alive: true, docked: false, autoAimTimer: 60, x: 0, y: 0, width: 16, height: 24 };
  g.enemies = enemy ? [enemy] : [];
  g.carrier = null;
  g.smokeScreens = [];
  g.camera = { x: 0, y: 0 };
  g.autoAimTarget = null;
  g.autoAimLeadPoint = null;
  g.autoAimLockedEnemy = enemy ?? null;
  g.input = { mouse: { x: 0, y: 0 } };
  g._prevMouseX = 0;
  g._prevMouseY = 0;
  return g;
}

function fakeEnemy() {
  return { alive: true, x: 40, y: 40, width: 20, height: 20, vx: 0, vy: 0 };
}

/** マウスを move だけ横に動かして 1 回更新し、ロックが残ったかを返す。 */
function movedBy(g, move) {
  g.input.mouse.x = move;
  g._updateAutoAim();
  return g.autoAimLockedEnemy !== null;
}

test('既定値では 4 を超える動きでロックが外れる（現行の挙動）', () => {
  const s = { ...DEFAULT_SETTINGS };
  assert.equal(s.autoAimRelease, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT);
  assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 5), false, '外れていない');
  assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 4), true, '境界ちょうどで外れてしまう');
});

test('しきい値を上げると同じ動きでは外れない', () => {
  const s = { ...DEFAULT_SETTINGS, autoAimRelease: 20 };
  assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 10), true, '設定が効いていない');
  assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 21), false, '上げても必ず外れるべき動きで外れない');
});

test('しきい値を下げるとわずかな動きで外れる', () => {
  const s = { ...DEFAULT_SETTINGS, autoAimRelease: 1 };
  assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 2), false, '設定が効いていない');
});

test('設定が無くても落ちず、既定のしきい値で動く', () => {
  assert.equal(movedBy(makeAimScene(undefined, fakeEnemy()), 5), false);
  assert.equal(movedBy(makeAimScene(undefined, fakeEnemy()), 3), true);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/auto-aim-release.test.js`
Expected: FAIL。「しきい値を上げると…」「下げると…」が落ちる（定数が固定なので）。

- [ ] **Step 3: `main.js` の比較を設定から取る**

1005行付近:

```js
        // マウスを動かしている間はスナップを抑制してロックも解除（タイマーは継続）。
        // しきい値を設定から取るのは、canvas の拡大率で物理的なマウスの体感が
        // 変わるため（Constants 側のコメント参照）。環境ごとの正解が1つに決まらない
        const releaseThreshold = this.settings?.autoAimRelease ?? AUTO_AIM_CANCEL_THRESHOLD_DEFAULT;
        if (dx + dy > releaseThreshold) {
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/auto-aim-release.test.js`
Expected: PASS

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`tests/smoke-autoaim.test.js` / `tests/lead-marker.test.js` も
既定値のままなので通る。

- [ ] **Step 6: コミット**

```bash
git add tests/auto-aim-release.test.js
git add -p src/js/main.js
git commit -m "feat: Auto Aim を解除するマウスの動きの量を設定できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 全画面の自動復帰

**Files:**
- Modify: `src/js/main.js`（`_restoreFullscreen()` を足し、4箇所から呼ぶ）
- Test: `tests/auto-fullscreen.test.js`（新規）

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS.autoFullscreen`（Task 1）、`enterFullscreen`（既存 import）
- Produces: `Game._restoreFullscreen()` — 差し替え可能なメソッドとして持つ（`enterFullscreen` は
  モジュールから直接 import しているので、テストはこのメソッドを差し替えて観測する）

- [ ] **Step 1: 失敗するテストを書く**

`tests/auto-fullscreen.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

/** _restoreFullscreen() の呼び出しを記録する game。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.restored = 0;
  g._restoreFullscreen = () => { g.restored++; };
  g.settings = { ...DEFAULT_SETTINGS };
  g.gameState = 'title';
  g.missionsCompleted = 0;
  g.stateTimer = 0;
  g.score = 0;
  g.stageResults = [];
  g.playerNameInput = '';
  return Object.assign(g, overrides);
}

// --- 設定そのものの効き ---

/**
 * 実装は module から直接 import した enterFullscreen() を呼ぶので、差し込める
 * 継ぎ目が無い。globalThis.document を偽物に差し替えて requestFullscreen を観測し、
 * 必ず元へ戻す（node には document が無いので delete で消える）。
 */
function withFakeDocument(fn) {
  const calls = [];
  globalThis.document = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: () => { calls.push('request'); return Promise.resolve(); },
    },
  };
  try { fn(calls); } finally { delete globalThis.document; }
}

test('設定 ON なら enterFullscreen を呼ぶ', () => {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS, autoFullscreen: true };
  withFakeDocument((calls) => {
    g._restoreFullscreen();
    assert.deepEqual(calls, ['request'], 'requestFullscreen が呼ばれていない');
  });
});

test('設定 OFF なら enterFullscreen を呼ばない', () => {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS, autoFullscreen: false };
  withFakeDocument((calls) => {
    g._restoreFullscreen();
    assert.deepEqual(calls, [], 'OFF なのに全画面へ入ろうとしている');
  });
});

test('設定が無くても落ちない', () => {
  const g = Object.create(Game);
  g.settings = undefined;
  assert.doesNotThrow(() => g._restoreFullscreen());
});

// --- 呼ぶ場所 ---

test('ゲーム開始で呼ぶ', () => {
  const g = makeGame({
    _anyKeyOrClick: () => true,
    stateManager: { restart() {} },
  });
  assert.equal(g._startGameIfRequested(), true);
  assert.equal(g.restored, 1);
});

test('ミッションクリアから次面へ進むときに呼ぶ', () => {
  const g = makeGame({
    gameState: 'mission_clear',
    _updateTimeBonusSlot: () => false,
    stateManager: { nextMission() {} },
    input: {
      isKeyPressed: (c) => c === 'KeyW',
      isLeftClickPressed: () => false,
      getTypedChars: () => [],
    },
  });
  g._updateMissionClear();
  assert.equal(g.gameState, 'playing', 'そもそも次面へ進んでいない');
  assert.equal(g.restored, 1);
});

test('ミッションクリアで入力が無ければ呼ばない', () => {
  const g = makeGame({
    gameState: 'mission_clear',
    _updateTimeBonusSlot: () => false,
    stateManager: { nextMission() {} },
    input: {
      isKeyPressed: () => false,
      isLeftClickPressed: () => false,
      getTypedChars: () => [],
    },
  });
  g._updateMissionClear();
  assert.equal(g.restored, 0);
});

test('設定画面を閉じるときに呼ぶ', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  g._closeSettings();
  assert.equal(g.gameState, 'playing');
  assert.equal(g.restored, 1);
});

// 時間で進む遷移は transient activation が切れているので requestFullscreen が
// ブラウザに拒否される。呼んでも無駄なので入れない、という判断の回帰防止。
test('ゲームオーバーからの自動遷移では呼ばない', () => {
  const g = makeGame({
    gameState: 'gameover',
    stateTimer: 5000,
    _tryGoToRanking() { this.gameState = 'title'; },
  });
  g._updateGameOver(16);
  assert.equal(g.restored, 0, '入力を伴わない遷移で全画面へ入ろうとしている');
});

test('全クリアからの自動遷移でも呼ばない', () => {
  const g = makeGame({
    gameState: 'gameclear',
    stateTimer: 8000,
    _updateTimeBonusSlot: () => false,
    _tryGoToRanking() { this.gameState = 'title'; },
  });
  g._updateGameClear(16);
  assert.equal(g.restored, 0);
});
```

ランキング確定の1件は別立てで書く。**`Enter` は `isKeyPressed` ではなく
`getTypedChars()` から来る**（`_updateRankingEntry()` は入力文字の列を回している）。
`highScoreManager.isHighScore()` を `false` にし、`stageResults` を空にしておくと、
`addScore` / `_submitOnline` / `stageRankingManager` / `onlineLeaderboard` の
どれにも入らずに確定まで通る。

```js
test('ランキングの名前を Enter で確定したときに呼ぶ', () => {
  const g = makeGame({
    gameState: 'ranking_entry',
    playerNameInput: 'AAA',
    score: 100,
    totalTime: 0,
    missionsCompleted: 0,
    stageResults: [],
    // 高得点でない経路を通す。addScore も _submitOnline も走らないので、
    // ランキングの偽物を用意せずに確定だけを確かめられる
    highScoreManager: { isHighScore: () => false },
    input: { getTypedChars: () => ['Enter'] },
  });
  g._updateRankingEntry();
  assert.equal(g.gameState, 'local_ranking_display', 'そもそも確定していない');
  assert.equal(g.restored, 1);
});

test('ランキングで名前を打っているだけでは呼ばない', () => {
  const g = makeGame({
    gameState: 'ranking_entry',
    playerNameInput: '',
    input: { getTypedChars: () => ['a'] },
  });
  g._updateRankingEntry();
  assert.equal(g.gameState, 'ranking_entry');
  assert.equal(g.restored, 0);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/auto-fullscreen.test.js`
Expected: FAIL。`g._restoreFullscreen is not a function`。

- [ ] **Step 3: `_restoreFullscreen()` を足す**

`src/js/main.js` の `_startGameIfRequested()` の直前に置く:

```js
    /**
     * 画面遷移の節目で全画面へ戻す。設定が OFF なら何もしない。
     *
     * **呼べる場所はブラウザの制約で決まる。** requestFullscreen はユーザー操作の
     * 直後（transient activation が生きている間）でないと拒否されるので、
     * キーやクリックを受けたその回の更新からしか呼べない。時間で進む遷移
     * （ゲームオーバー4秒・全クリア7秒の自動遷移）に入れていないのはそのため。
     * その場合は次に入力を伴う節目で戻る。
     *
     * 規則をこの1メソッドに集約しているのは、enterFullscreen() を main.js に
     * 散らすと「どこで戻るのか」が追えなくなるため。
     */
    _restoreFullscreen() {
        if (this.settings?.autoFullscreen) enterFullscreen();
    },
```

- [ ] **Step 4: 4つの節目から呼ぶ**

`_startGameIfRequested()` の既存の `enterFullscreen();` を置き換える（上のコメントに
移した内容は削り、設定で切れることだけ残す）:

```js
        // 開始と同時に全画面へ入る。M キーを押さなくても最大化してほしい、という
        // 実機の要望。_anyKeyOrClick() が真＝この更新の直前にキーかクリックがあった
        // 場合しか通らないので、transient activation が生きている
        this._restoreFullscreen();
```

`_updateMissionClear()`:

```js
    _updateMissionClear() {
        if (this._updateTimeBonusSlot(false)) return;
        if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed() || this.input.getTypedChars().length > 0) {
            this._restoreFullscreen();
            this.gameState = 'playing';
            this.stateManager.nextMission();
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```

`_updateRankingEntry()` の確定するところ（`this.gameState = 'local_ranking_display';` の直前）:

```js
                this._restoreFullscreen();
                this.gameState = 'local_ranking_display';
```

`_closeSettings()`:

```js
    /** 設定画面を閉じて元の状態へ戻る。 */
    _closeSettings() {
        this.gameState = this.settingsReturnTo || 'title';
        this.settingsReturnTo = null;
        this.confirmingQuit = false;
        // 設定画面で AUTO FULLSCREEN を ON にしてそのまま閉じれば即座に効く。
        // Escape で閉じた場合はブラウザが全画面を解除しているので、ここで戻る
        this._restoreFullscreen();
    },
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/auto-fullscreen.test.js`
Expected: PASS

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`tests/settings-pause.test.js` の「設定画面で P を押すと元の状態に戻る」は
`_restoreFullscreen()` が `document` の無い node で `enterFullscreen()` を呼んでも
何もしない（`fullscreen.js` が `typeof document !== 'undefined'` を見る）ので通る。

- [ ] **Step 7: コミット**

```bash
git add tests/auto-fullscreen.test.js
git add -p src/js/main.js
git commit -m "feat: 画面遷移の節目で全画面へ戻す設定を足す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 引き渡し

**Files:**
- Modify: `docs/superpowers/specs/2026-08-13-reload-fullscreen-autoaim-settings-design.md`（実装中に決めた細部の反映）

- [ ] **Step 1: 設計書を実装に合わせる**

実装中に変わった点があれば設計書に反映する。特に:
- `settingValueText()` を `settingsItems.js` に置いたこと（設計書には書いていない）
- 淡色に `UI.faint` を使ったこと（既存の「補助・非選択」の色をそのまま流用した）
- `_updateMGReload()` がフラグを**早期 return の前に**消すこと（武器が違うときに
  古い「切り替えた」が残らないようにするため）

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-08-13-reload-fullscreen-autoaim-settings-design.md
git commit -m "docs: 設定拡張の設計書を実装に合わせる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: ユーザーに引き渡す**

以下を伝える。

- **ハードリロード（Cmd+Shift+R）が必要**
- **設定を触らない限り、挙動は今までと完全に同じ**（`ALWAYS` / 8発 / 4 / 全画面 ON）
- 確認ポイント:

| 見るところ | 調整先 |
|---|---|
| 設定画面に9項目（プレイ中は10項目）が並び、A/D で全部動くか | `src/js/ui/settingsItems.js` の表 |
| `MG AUTO-RELOAD` を `OFF` にすると `RELOAD AT AMMO` が淡色になるか | `ui/theme.js` の `UI.faint` |
| `ON WEAPON SWITCH`: ミサイル→MG を `F` で持ち替えた瞬間だけ装填するか | — |
| `ON WEAPON SWITCH`: ミサイルを撃ち切って自動で MG に戻ったときは**装填しない**か | — |
| ミサイル 0 で `F` を押すとリロードが始まり、押した音がするか | — |
| 満タン／装填中に `F` を押すと**無音**か（効かないことが分かるか） | — |
| `RELOAD AT AMMO` の刻み（1発）と効き | `MG_RELOAD_THRESHOLD_MIN` / `_MAX` |
| `AUTO-AIM RELEASE` を上げるとロックが外れにくくなるか。**既定の 4 が自分の環境で妥当か** | `AUTO_AIM_RELEASE_MIN` / `_MAX`、既定は `AUTO_AIM_CANCEL_THRESHOLD_DEFAULT` |
| `AUTO FULLSCREEN` ON: 開始・次面・ランキング確定・設定を閉じたときに全画面へ戻るか | — |
| `AUTO FULLSCREEN` ON: `M` で窓にしたら、その画面の間は窓のままでいられるか | — |
| `AUTO FULLSCREEN` OFF: 開始しても全画面にならないか | — |
| 旧設定の移行: 以前 `MG AUTO-RELOAD` を OFF にしていた人が `OFF` のまま開くか | — |

- **ゲームオーバー／全クリアからランキングへの自動遷移では全画面に戻らない。**
  時間で進む遷移なのでブラウザが拒否する。仕様として意図的（次の入力を伴う節目で戻る）
- フェーズB（軽量描画モード、キーコンフィグ一覧）と途中セーブ機能は未着手のまま
