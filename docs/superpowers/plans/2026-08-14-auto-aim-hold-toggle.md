# Auto Aim の一時解除（Shift 長押し）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Shift` の長押しで Auto Aim を解除／再開できるようにし、解除中もドック中も残り時間は減るようにする。長押しの時間と「拾ったら再開するか」を設定にする。

**Architecture:** タップと長押しの見分けは `utils/holdKey.js` の純関数に閉じ、`main.js` は状態を持って結果を受けるだけにする。解除状態は `Player#autoAimPaused` の1つで表し、**「解除状態は Auto Aim を持っている間だけ存在する」**という不変条件（`autoAimPaused` が真なら必ず `autoAimTimer > 0`）を `_updateAutoAim()` が維持する。描画側はその不変条件に寄りかかってフラグ1つだけを見る。

**Tech Stack:** バニラ ES modules ＋ canvas。ビルド工程なし、依存パッケージなし。テストは `node --test`（DOM も AudioContext も無い）。

設計: [docs/superpowers/specs/2026-08-14-auto-aim-hold-toggle-design.md](../specs/2026-08-14-auto-aim-hold-toggle-design.md)

## Global Constraints

- **不変条件: `autoAimPaused` が真なら必ず `autoAimTimer > 0`。** 残り時間が 0 になった時点で解除状態を消す。「解除中」は Auto Aim を持っている間だけ存在する状態で、通常状態に戻ったのに残っていると、次に拾ったときの挙動が「いつ切ったか」で決まってしまう。
- **`autoAimTimer` の減算は `_simulationTick()` の内側に置く。** 設定画面を開いている間にタイマーが止まるのは、`gameState === 'settings'` の間 `_updatePlaying()` ごと呼ばれないため。新しい判定を足して止めているのではない。`update()` 直下など外へ出すとポーズ中も減り始める。**これは要件であり、回帰テストで縛る。**
- **`Shift` の処理はプレイ中だけ。** `this.player` は `'settings'`・`'mission_clear'`・`'ranking_entry'` でも `alive` かつ未ドックのまま残るので、自機の状態を見るだけでは「プレイ中限定」にならない（`F` キーで同じ判断をした）。
- **長押しの計測は実時間（ミリ秒）。** 既存のグレネード長押し（`Input.rightHoldFrames`）はフレーム数だが、設定画面に「秒」で出す以上ずらせない。**グレネード側は触らない。**
- **既定値は「今までに一番近い」側**。設定を触らない人の体験を壊さない。
- **コメントは日本語で「なぜそうしたか」を書く。** 何をしているかはコードが語る。既存ファイルの密度に合わせる。
- **マジックナンバーを実装側に直書きしない。** 調整用の数値は `src/js/utils/Constants.js` へ。
- **`git add -A` / `git add .` は使わない。** `src/js/main.js` にはユーザーがデバッグ用に立てている `debugStartMission: 6` が意図的に未コミットで置かれている（本番値は 0）。対話的 git はこの環境で使えないので、`main.js` を含むコミットの直前に: ①`debugStartMission: 0` に書き換える ②ファイルを明示して `git add` ③`debugStartMission: 6` に戻す ④`git diff --cached src/js/main.js` に当該行が無いことを確認してコミット。
- **ソース文字列を grep するテストは書かない。** 呼び出しが存在しても到達不能なら通ってしまう。
- 各タスクの終わりに `npm test` が**全件 green** であること。
- 現在のテスト数は **983**（baseline `c5889d9`）。
- コミットメッセージの末尾は `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。

---

### Task 1: `utils/holdKey.js`（純ロジック）

タップと長押しを1つのキーで見分ける状態機械。ゲームにも DOM にも依存しないので、ここだけ単独で試せる。

**Files:**
- Create: `src/js/utils/holdKey.js`
- Test: `tests/hold-key.test.js`

**Interfaces:**
- Produces: `initialHoldState() → {heldMs: 0, fired: false}`
- Produces: `stepHoldKey(state, down, deltaMs, thresholdMs) → {state, tap, hold}`

- [ ] **Step 1: 失敗するテストを書く**

`tests/hold-key.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialHoldState, stepHoldKey } from '../src/js/utils/holdKey.js';

const TH = 300; // しきい値 300ms

/** down/deltaMs の並びを流して、最後の結果と履歴を返す。 */
function run(frames, thresholdMs = TH) {
  let state = initialHoldState();
  const taps = [];
  const holds = [];
  for (const [down, deltaMs] of frames) {
    const r = stepHoldKey(state, down, deltaMs, thresholdMs);
    state = r.state;
    taps.push(r.tap);
    holds.push(r.hold);
  }
  return { state, taps, holds };
}

test('押していないだけでは何も起きない', () => {
  const { taps, holds } = run([[false, 16], [false, 16]]);
  assert.deepEqual(taps, [false, false]);
  assert.deepEqual(holds, [false, false]);
});

test('しきい値未満で離すとタップ', () => {
  const { taps, holds } = run([[true, 16], [true, 16], [false, 16]]);
  assert.deepEqual(taps, [false, false, true], '離したフレームでタップになっていない');
  assert.deepEqual(holds, [false, false, false]);
});

// 押しっぱなしで毎フレーム発火すると、0.3秒ごとに解除と再開を往復してしまう。
test('しきい値を跨いだ1フレームだけ長押しが立つ', () => {
  const { holds } = run([[true, 100], [true, 100], [true, 100], [true, 100], [true, 100]]);
  assert.deepEqual(holds, [false, false, true, false, false], `holds=${holds}`);
});

test('長押しが出たあとに離してもタップにはならない', () => {
  const { taps, holds } = run([[true, 400], [false, 16]]);
  assert.deepEqual(holds, [true, false]);
  assert.deepEqual(taps, [false, false], '長押しの後にタップも発火している');
});

test('離すと状態が初期化され、次の押下はしきい値を最初から要求する', () => {
  const { state } = run([[true, 400], [false, 16]]);
  assert.deepEqual(state, initialHoldState());
  // 初期化された状態から、しきい値未満の押下では長押しにならない
  const r = stepHoldKey(state, true, 100, TH);
  assert.equal(r.hold, false);
});

test('しきい値ちょうどで長押しになる', () => {
  const { holds } = run([[true, TH]]);
  assert.deepEqual(holds, [true], '境界で発火していない');
});

test('しきい値の変更が効く', () => {
  assert.equal(run([[true, 150]], 100).holds[0], true, '短いしきい値で発火していない');
  assert.equal(run([[true, 150]], 2000).holds[0], false, '長いしきい値で発火してしまう');
});

test('元の状態を書き換えない', () => {
  const before = initialHoldState();
  stepHoldKey(before, true, 100, TH);
  assert.deepEqual(before, initialHoldState());
});

// タブを切り替えて戻ったときなど、deltaMs が跳ねる経路がある。
test('deltaMs が 0 でも巨大でも壊れない', () => {
  assert.doesNotThrow(() => stepHoldKey(initialHoldState(), true, 0, TH));
  const r = stepHoldKey(initialHoldState(), true, 100000, TH);
  assert.equal(r.hold, true);
});

test('state を渡さなくても初期状態として扱う', () => {
  const r = stepHoldKey(undefined, true, 16, TH);
  assert.equal(r.hold, false);
  assert.equal(r.state.heldMs, 16);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/hold-key.test.js`
Expected: FAIL。モジュールが存在しない。

- [ ] **Step 3: `src/js/utils/holdKey.js` を実装する**

```js
// ============================================
// holdKey - 1つのキーでタップと長押しを見分ける
// ============================================
//
// 長押しは押した瞬間から始まるので、「押した瞬間にタップの動作をする」作りとは
// 同居できない — 長押しのたびにタップの動作も道連れになる。タップを**離した
// ときに**確定させることでこれを解く。代償はタップの確定が数フレーム遅れること。
//
// ゲームも DOM も要らない純ロジックなので utils に置いてある（mgReload.js と
// 同じ立ち位置）。状態は呼び出し側が持ち、ここは新しい状態を返すだけにして、
// 同じ仕組みを他のキーにも使えるようにしてある。

/** 押していない状態。呼び出し側の初期値。 */
export function initialHoldState() {
    return { heldMs: 0, fired: false };
}

/**
 * 1フレーム進める。
 *
 * @param {{heldMs: number, fired: boolean}} [state] 前フレームの状態
 * @param {boolean} down 今このフレームに押されているか
 * @param {number} deltaMs 実経過ミリ秒
 * @param {number} thresholdMs これ以上押し続けたら長押し
 * @returns {{state: object, tap: boolean, hold: boolean}}
 *   tap  … 離した瞬間で、長押しに達していなかった
 *   hold … しきい値を跨いだそのフレーム（押しっぱなしでも1回だけ）
 */
export function stepHoldKey(state, down, deltaMs, thresholdMs) {
    const prev = state ?? initialHoldState();

    if (!down) {
        // 離した。長押しが発火済みならタップにはしない（長押しのつもりだったので）
        return { state: initialHoldState(), tap: prev.heldMs > 0 && !prev.fired, hold: false };
    }

    // タブを切り替えて戻ると deltaMs が跳ねる。負の値だけ弾いておけば十分で、
    // 上限を設けると「長押ししたのに反応しない」ほうの事故になる
    const heldMs = prev.heldMs + Math.max(0, deltaMs);
    // 発火は跨いだ1フレームだけ。毎フレーム発火させると、しきい値ごとに
    // 解除と再開を往復してしまう
    const hold = !prev.fired && heldMs >= thresholdMs;
    return { state: { heldMs, fired: prev.fired || hold }, tap: false, hold };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/hold-key.test.js`
Expected: PASS

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: PASS。983 + 10 前後。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/holdKey.js tests/hold-key.test.js
git commit -m "feat: タップと長押しを見分ける純ロジックを追加する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 設定を2つ足し、`int` に表示の整形を持たせる

設定画面に出て A/D（←/→）で動き、保存・読み込みできるところまで。**ゲームへの配線は Task 3 以降。**

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/utils/settings.js`
- Modify: `src/js/ui/settingsItems.js`
- Test: `tests/settings.test.js`, `tests/settings-screen.test.js`

**Interfaces:**
- Produces: 定数 `AUTO_AIM_HOLD_TENTHS_DEFAULT` (3) / `_MIN` (1) / `_MAX` (20)
- Produces: `DEFAULT_SETTINGS.autoAimHoldTenths` (3)、`DEFAULT_SETTINGS.autoAimResumeOnPickup` (true)
- Produces: `SETTINGS_ITEMS` の行に任意の `format(v) → string`。`settingValueText()` が `int` のときだけ使う

- [ ] **Step 1: 定数を足す**

`src/js/utils/Constants.js` の `AUTO_AIM_RELEASE_MAX` の下に:

```js
// Auto Aim の解除／再開を切り替える Shift 長押しの時間（1/10 秒単位で持つ）。
// 設定の int 型は整数しか刻めないので 1/10 秒で保存し、表示だけ「0.3 SEC」に直す。
// 既定 3（0.3秒）は、タップと取り違えない最短で、かつ待たされる感じもしない長さ。
// 下限 0.1 秒はタップと区別できる最小、上限 2.0 秒は「押し間違い防止」を超えて
// 操作として重くなる手前で止めた。
export const AUTO_AIM_HOLD_TENTHS_DEFAULT = 3;
export const AUTO_AIM_HOLD_TENTHS_MIN = 1;
export const AUTO_AIM_HOLD_TENTHS_MAX = 20;
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/settings.test.js` の import に定数を足す:

```js
  AUTO_AIM_HOLD_TENTHS_DEFAULT, AUTO_AIM_HOLD_TENTHS_MIN, AUTO_AIM_HOLD_TENTHS_MAX,
```

「既定値は『今の挙動』に一致する」テストの末尾に足す:

```js
  assert.equal(DEFAULT_SETTINGS.autoAimHoldTenths, AUTO_AIM_HOLD_TENTHS_DEFAULT);
  assert.equal(DEFAULT_SETTINGS.autoAimResumeOnPickup, true, '拾ったら再開するのが既定');
```

ファイル末尾に足す:

```js
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
```

`tests/settings-screen.test.js` の末尾に足す:

```js
// int の表示を行ごとに整えられること。1/10 秒で持っている値を「0.3 SEC」と出す。
test('長押しの時間は秒で表示される', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'autoAimHoldTenths');
  assert.ok(item, '表に autoAimHoldTenths が無い');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimHoldTenths: 3 }), '0.3 SEC');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimHoldTenths: 20 }), '2.0 SEC');
});

test('format を持たない int は今までどおり数字だけ', () => {
  const item = SETTINGS_ITEMS.find((i) => i.key === 'autoAimRelease');
  assert.equal(settingValueText(item, { ...DEFAULT_SETTINGS, autoAimRelease: 12 }), '12');
});

test('新しい2項目が設定画面に描かれる', () => {
  const { texts } = draw({ fromPlaying: true });
  assert.ok(texts.includes('AUTO-AIM HOLD TO TOGGLE'), '長押しの時間の行が無い');
  assert.ok(texts.includes('RESUME AUTO-AIM ON PICKUP'), '拾ったら再開の行が無い');
  assert.ok(texts.includes('0.3 SEC'), `既定の 0.3 SEC が出ていない: ${texts.join(' / ')}`);
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/settings.test.js tests/settings-screen.test.js`
Expected: FAIL。`DEFAULT_SETTINGS.autoAimHoldTenths` が undefined、表に行が無い。

- [ ] **Step 4: `utils/settings.js` に2つ足す**

import に定数を足す:

```js
    AUTO_AIM_HOLD_TENTHS_DEFAULT, AUTO_AIM_HOLD_TENTHS_MIN, AUTO_AIM_HOLD_TENTHS_MAX,
```

`DEFAULT_SETTINGS` に足す（`autoAimRelease` の下）:

```js
    autoAimHoldTenths: AUTO_AIM_HOLD_TENTHS_DEFAULT,
    autoAimResumeOnPickup: true,
```

`DEFAULT_SETTINGS` の上のコメントに2行足す:

```js
 * - autoAimHoldTenths 3      … 0.3 秒。長押しは新機能なので「取り違えない最短」を既定に
 * - autoAimResumeOnPickup true … 拾って何も起きないと壊れて見えるため
```

`KINDS` に足す:

```js
    autoAimResumeOnPickup: { kind: 'flag' },
    autoAimHoldTenths: { kind: 'int', min: AUTO_AIM_HOLD_TENTHS_MIN, max: AUTO_AIM_HOLD_TENTHS_MAX },
```

- [ ] **Step 5: `ui/settingsItems.js` に2行足し、`format` を通す**

`autoAimRelease` の行の下に:

```js
    {
        key: 'autoAimHoldTenths', label: 'AUTO-AIM HOLD TO TOGGLE', type: 'int',
        // int は整数しか刻めないので 1/10 秒で持ち、表示だけ秒に直す。
        // 「3」と出しても何の単位か読めないため
        format: (v) => `${(v / 10).toFixed(1)} SEC`,
    },
    { key: 'autoAimResumeOnPickup', label: 'RESUME AUTO-AIM ON PICKUP', type: 'toggle' },
```

ファイル冒頭の type の説明に1行足す:

```
//   int    … 整数。A/D で 1 ずつ動く（suffix に単位、format があれば表示を任せる）
```

`settingValueText()` の `int` の行を差し替える:

```js
        case 'int': return item.format ? item.format(v) : `${v}${item.suffix ?? ''}`;
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- tests/settings.test.js tests/settings-screen.test.js`
Expected: PASS

- [ ] **Step 7: 全テストを走らせる**

Run: `npm test`
Expected: PASS。設定画面の行が2つ増えるが、`tests/settings-pause.test.js` は `findIndex` と index 0 で位置を取っているので通る。落ちた場合は行数に依存したテストを探すこと。

- [ ] **Step 8: コミット**

```bash
git add src/js/utils/Constants.js src/js/utils/settings.js src/js/ui/settingsItems.js \
        tests/settings.test.js tests/settings-screen.test.js
git commit -m "feat: Auto Aim の長押し時間と拾ったときの再開を設定に足す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 解除状態と残り時間の減り方

`Player#autoAimPaused` を足し、`_updateAutoAim()` の減算をガードより前へ移す。**`Shift` の配線は Task 4。** このタスクではフラグを直接立てるテストで検証する。

**Files:**
- Modify: `src/js/entities/Player.js`（フィールド追加、`respawn()`）
- Modify: `src/js/main.js`（`_updateAutoAim()`）
- Modify: `src/js/entities/AutoAimUnit.js`（`onPickup`）
- Test: `tests/auto-aim-pause.test.js`（新規）

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS.autoAimResumeOnPickup`（Task 2）
- Produces: `Player#autoAimPaused: boolean`。真なら必ず `autoAimTimer > 0`

- [ ] **Step 1: 失敗するテストを書く**

`tests/auto-aim-pause.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { Player } from '../src/js/entities/Player.js';
import { AutoAimUnit } from '../src/js/entities/AutoAimUnit.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { AimLeadTracker } from '../src/js/utils/aimLead.js';
import { AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE } from '../src/js/utils/Constants.js';

/** _updateAutoAim() だけを呼べる最小の game。 */
function makeScene(playerOverrides = {}, enemy = null) {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS };
  g.player = {
    alive: true, docked: false, autoAimPaused: false,
    autoAimTimer: 100, autoAimMaxTimer: 3600,
    currentWeapon: 'mg', x: 0, y: 0, width: 16, height: 24,
    ...playerOverrides,
  };
  g.enemies = enemy ? [enemy] : [];
  g.carrier = null;
  g.smokeScreens = [];
  g.camera = { x: 0, y: 0 };
  g.autoAimTarget = null;
  g.autoAimLeadPoint = null;
  g.autoAimLockedEnemy = enemy ?? null;
  g.aimLead = new AimLeadTracker(AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE);
  g.input = { mouse: { x: 0, y: 0 } };
  g._prevMouseX = 0;
  g._prevMouseY = 0;
  return g;
}

function fakeEnemy() {
  return { alive: true, x: 40, y: 40, width: 20, height: 20, vx: 0, vy: 0 };
}

// --- 残り時間の減り方 ---

test('通常は残り時間が減る（現行どおり）', () => {
  const g = makeScene();
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99);
});

// 回帰: 現行はドック中に減らない。母艦に籠って温存する立ち回りを作らないため変える。
test('ドック中も残り時間が減る', () => {
  const g = makeScene({ docked: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99, 'ドック中に止まっている');
});

test('ドック中はスナップしない', () => {
  const g = makeScene({ docked: true }, fakeEnemy());
  g._updateAutoAim();
  assert.equal(g.autoAimTarget, null, 'ドック中なのに敵に吸い付いている');
});

test('解除中も残り時間が減り、スナップはしない', () => {
  const g = makeScene({ autoAimPaused: true }, fakeEnemy());
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99, '解除中に止まっている');
  assert.equal(g.autoAimTarget, null, '解除中なのに敵に吸い付いている');
});

test('死亡中は減らない（現行どおり）', () => {
  const g = makeScene({ alive: false });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 100);
});

// 要件の要。設定画面でタイマーが止まるのは、_updatePlaying() ごと呼ばれず
// _simulationTick() が回らないから。減算を update() 直下など外へ出すと
// ポーズ中も減り始めるので、それを検出する。
test('設定画面を開いている間は update() を何度呼んでも残り時間が減らない', () => {
  const g = Object.create(Game);
  g.gameState = 'settings';
  g.settingsReturnTo = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.player = { alive: true, docked: false, autoAimTimer: 100, autoAimPaused: false };
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.totalTime = 0;
  g.missionTimer = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.input = {
    isKeyDown: () => false,
    isKeyPressed: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
  g._updateSettings = () => {};   // 設定画面の中身はこのテストの関心ではない

  for (let i = 0; i < 10; i++) g.update(16);
  assert.equal(g.player.autoAimTimer, 100, 'ポーズ中に残り時間が減っている');
});

// --- 不変条件: 解除状態は Auto Aim を持っている間だけ存在する ---

test('残り時間が 0 になった時点で解除状態が消える', () => {
  const g = makeScene({ autoAimTimer: 1, autoAimPaused: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 0);
  assert.equal(g.player.autoAimPaused, false, '通常状態に戻ったのに解除が残っている');
});

test('残り時間が残っている間は解除状態が保たれる', () => {
  const g = makeScene({ autoAimTimer: 2, autoAimPaused: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimPaused, true, '早すぎる時点で解除が消えている');
});

// --- Player ---

test('respawn で解除状態が消える', () => {
  const p = Object.create(Player.prototype);
  p.autoAimPaused = true;
  p.game = { input: {} };
  p.respawn(0, 0);
  assert.equal(p.autoAimPaused, false);
  assert.equal(p.autoAimTimer, 0);
});

// --- 拾ったときの扱い ---

/** onPickup だけを呼べる最小の player。 */
function pickupPlayer(settings, paused) {
  return {
    autoAimTimer: 100, autoAimMaxTimer: 3600, autoAimPaused: paused,
    game: { settings },
  };
}

test('RESUME ON: 拾うと解除が解ける', () => {
  const p = pickupPlayer({ ...DEFAULT_SETTINGS, autoAimResumeOnPickup: true }, true);
  Object.create(AutoAimUnit.prototype).onPickup(p);
  assert.equal(p.autoAimPaused, false);
  assert.ok(p.autoAimTimer > 100, '残り時間が延びていない');
});

test('RESUME OFF: ゲージが残っているうちに拾っても解除のまま', () => {
  const p = pickupPlayer({ ...DEFAULT_SETTINGS, autoAimResumeOnPickup: false }, true);
  Object.create(AutoAimUnit.prototype).onPickup(p);
  assert.equal(p.autoAimPaused, true, 'この設定の目的が果たされていない');
});

test('設定が無くても落ちず、既定どおり解除が解ける', () => {
  const p = pickupPlayer(undefined, true);
  assert.doesNotThrow(() => Object.create(AutoAimUnit.prototype).onPickup(p));
  assert.equal(p.autoAimPaused, false);
});

// 通し: OFF でも、ゲージが尽きて通常状態に戻ったあとに拾えば ON で始まる。
// 「解除状態は Auto Aim を持っている間だけ存在する」が守られていれば自然にこうなる。
test('RESUME OFF: ゲージが尽きたあとに拾えば ON で始まる', () => {
  const settings = { ...DEFAULT_SETTINGS, autoAimResumeOnPickup: false };
  const g = makeScene({ autoAimTimer: 1, autoAimPaused: true });
  g.settings = settings;
  g._updateAutoAim();                       // ここでゲージが尽きる
  assert.equal(g.player.autoAimPaused, false, '尽きた時点で解除が消えていない');

  g.player.game = { settings };
  Object.create(AutoAimUnit.prototype).onPickup(g.player);
  assert.equal(g.player.autoAimPaused, false, '拾い直したのに解除のまま');
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/auto-aim-pause.test.js`
Expected: FAIL。「ドック中も残り時間が減る」「解除中も…」「残り時間が 0 になった時点で…」「RESUME …」が落ちる。

- [ ] **Step 3: `Player` にフィールドを足す**

コンストラクタの `this.autoAimTimer = 0;` の直後（72行付近）:

```js
        // Shift 長押しで立てる一時解除。**真なら必ず autoAimTimer > 0** という
        // 不変条件を _updateAutoAim() が守る（「解除中」は Auto Aim を持っている
        // 間だけ存在する状態で、通常状態に戻ったのに残っていると、次に拾った
        // ときの挙動が「いつ切ったか」で決まってしまう）
        this.autoAimPaused = false;
```

`respawn()` の `this.autoAimTimer = 0;` の直後:

```js
        this.autoAimPaused = false;
```

- [ ] **Step 4: `_updateAutoAim()` の減算を前へ出す**

`src/js/main.js`。現行の

```js
        if (!player || !player.alive || player.docked || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        player.autoAimTimer--;
```

を次に差し替える:

```js
        if (!player || !player.alive || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // 残り時間は「実際に効いているか」と無関係に減る。ドック中も Shift で
        // 解除している間も減らすのは、Auto Aim を温存して使い回す立ち回りを
        // 作らないため（解除は節約手段ではなく「今は手動で狙いたい」ための操作）。
        //
        // **この減算が _simulationTick() の内側にあることが要件。** 設定画面を
        // 開いている間にタイマーが止まるのは、gameState === 'settings' の間
        // _updatePlaying() ごと呼ばれず、ここに到達しないため。update() 直下など
        // 外へ出すとポーズ中も減り始める
        player.autoAimTimer--;

        // 尽きた時点で解除状態も消す。通常状態に戻ったのに「解除中」が残ると、
        // 次に拾ったときの挙動が「いつ切ったか」で決まってしまう
        if (player.autoAimTimer <= 0) {
            player.autoAimPaused = false;
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // ドック中と解除中は吸い付かない（タイマーは上で減らし済み）
        if (player.docked || player.autoAimPaused) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }
```

- [ ] **Step 5: `AutoAimUnit#onPickup` に再開を足す**

```js
    onPickup(player) {
        // 重ね取りで延長できるが、上限は超えない
        player.autoAimTimer = Math.min(player.autoAimTimer + AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION);
        player.autoAimMaxTimer = AUTO_AIM_MAX_DURATION;
        // 既定では拾った時点で解除を解く。拾って何も起きないと壊れて見えるため。
        // OFF を選んだ人は「自分で切ったなら切れたまま」を望んでいる
        if (player.game?.settings?.autoAimResumeOnPickup ?? true) {
            player.autoAimPaused = false;
        }
    }
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- tests/auto-aim-pause.test.js`
Expected: PASS

- [ ] **Step 7: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`tests/auto-aim-release.test.js` と `tests/lead-marker.test.js` は既定値のままなので通る。ドック中のタイマーに触れる既存テストがあれば、**期待値を新しい仕様に直す**（挙動変更が意図されている）。

- [ ] **Step 8: コミット**

`main.js` を含むので、`debugStartMission` を 0 に戻してから add、6 に戻してからコミットする。

```bash
git add src/js/entities/Player.js src/js/entities/AutoAimUnit.js tests/auto-aim-pause.test.js
# main.js は上記の手順で
git commit -m "feat: Auto Aim の残り時間をドック中・解除中も減らす

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `Shift` のタップと長押しを配線する

**Files:**
- Modify: `src/js/main.js`（`update()` の Shift ブロックを削除、`_updateShiftKey()` を足す、`_updatePlaying()` から呼ぶ、`_openSettings()` でリセット、フィールド追加）
- Test: `tests/shift-hold.test.js`（新規）

**Interfaces:**
- Consumes: `stepHoldKey` / `initialHoldState`（Task 1）、`Player#autoAimPaused`（Task 3）、`DEFAULT_SETTINGS.autoAimHoldTenths`（Task 2）
- Produces: `Game#shiftHold`（`holdKey` の状態）、`Game#_updateShiftKey(deltaTime)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/shift-hold.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { initialHoldState } from '../src/js/utils/holdKey.js';

/**
 * 押しているキーを途中で差し替えられる入力のふり。
 *
 * **オブジェクトごと作り直さないこと。** `crosshairLocked` はこの入力が持つ状態なので、
 * 離すたびに新しい `fakeInput()` を代入すると、初期値 false に戻って
 * 「ロックが切り替わっていない」ことを確かめたつもりの assert が素通りする。
 * `setDown()` で押しているキーだけを差し替える。
 */
function fakeInput(down = []) {
  let set = new Set(down);
  return {
    setDown(codes) { set = new Set(codes); },
    isKeyDown: (code) => set.has(code),
    isKeyPressed: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    lockedWorldX: 0, lockedWorldY: 0,
    mouse: { x: 100, y: 50, left: false },
    getMouseWorld: () => ({ x: 100, y: 50 }),
    endFrame() {},
  };
}

/** _updatePlaying() を通せる最小の game。重い協調相手は差し替える。 */
function makeGame(overrides = {}) {
  const g = Object.create(Game);
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.shiftHold = initialHoldState();
  g.player = { alive: true, docked: false, autoAimTimer: 100, autoAimPaused: false };
  g.input = fakeInput();
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.totalTime = 0;
  g.missionTimer = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.settingsIndex = 0;
  g.settingsReturnTo = null;
  g.confirmingQuit = false;
  Object.assign(g, overrides);
  // _updatePlaying() の重い協調相手だけ潰す。Shift の処理はその手前にある
  g._updateMiniMap = () => {};
  g._handleDocking = () => {};
  g._handleShooting = () => {};
  g._simulationTick = () => {};
  return g;
}

const TAP_MS = 60;    // 既定しきい値 300ms 未満
const HOLD_MS = 400;  // 既定しきい値 300ms 以上

test('短く押して離すとクロスヘアロックが切り替わる', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(TAP_MS);
  assert.equal(g.input.crosshairLocked, false, '押している間に確定してしまっている');

  g.input.setDown([]);                   // 離した
  g._updatePlaying(16);
  assert.equal(g.input.crosshairLocked, true, '離してもロックが切り替わらない');
});

test('長押しで Auto Aim の解除が切り替わり、ロックは動かない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true, '長押しで解除できていない');
  assert.equal(g.input.crosshairLocked, false, '長押しでロックが道連れになっている');
});

test('長押しのあと離してもタップにならない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  g.input.setDown([]);
  g._updatePlaying(16);
  assert.equal(g.input.crosshairLocked, false, '長押しの後にロックまで切り替わっている');
});

test('もう一度長押しすると解除が戻る（再開できる）', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true);
  g.input.setDown([]);
  g._updatePlaying(16);
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, '再開できない');
});

// 押しっぱなしで往復すると、指を離すまでどちらに落ち着くか分からない。
test('押しっぱなしでも解除は1回しか切り替わらない', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  g._updatePlaying(HOLD_MS);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true, '往復してしまっている');
});

test('ShiftRight でも同じように効く', () => {
  const g = makeGame();
  g.input.setDown(['ShiftRight']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, true);
});

// 持っていない間に反転できると、次に拾ったときの状態が「いつ長押ししたか」で決まる。
test('Auto Aim を持っていなければ長押しは何も起こさない', () => {
  const g = makeGame({ player: { alive: true, docked: false, autoAimTimer: 0, autoAimPaused: false } });
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false);
});

test('しきい値の設定が効く', () => {
  const g = makeGame({ settings: { ...DEFAULT_SETTINGS, autoAimHoldTenths: 20 } }); // 2.0 秒
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, '2.0 秒設定なのに 0.4 秒で発火している');
  g._updatePlaying(2000);
  assert.equal(g.player.autoAimPaused, true, '2.0 秒を超えても発火しない');
});

// F キーと同じ線引き。player は 'settings' でも alive のまま残るので、
// 自機の状態を見るだけでは「プレイ中限定」にならない。
test('ポーズ中（設定画面）に Shift を押しても何も起きない', () => {
  const g = makeGame({ gameState: 'settings', settingsReturnTo: 'playing' });
  g._updateSettings = () => {};
  g.input.setDown(['ShiftLeft']);
  g.update(HOLD_MS);
  assert.equal(g.player.autoAimPaused, false, 'ポーズ中に Auto Aim が切り替わっている');
  g.input.setDown([]);
  g.update(16);
  assert.equal(g.input.crosshairLocked, false, 'ポーズ中の Shift でロックが切り替わっている');
});

// Shift を押したまま設定画面を開いて閉じると、たまった時間で即発火してしまう。
test('設定画面を開くと長押しの計測が初期化される', () => {
  const g = makeGame();
  g.input.setDown(['ShiftLeft']);
  g._updatePlaying(200);                 // しきい値 300ms 未満まで貯める
  assert.ok(g.shiftHold.heldMs > 0, 'そもそも貯まっていない');
  g._openSettings('playing');
  assert.deepEqual(g.shiftHold, initialHoldState(), '計測が残っている');
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/shift-hold.test.js`
Expected: FAIL。`_updateShiftKey` が無く、`_updatePlaying()` は Shift を見ていない。

- [ ] **Step 3: `main.js` の import とフィールドを足す**

import に足す:

```js
import { stepHoldKey, initialHoldState } from './utils/holdKey.js';
import { AUTO_AIM_HOLD_TENTHS_DEFAULT } from './utils/Constants.js';   // 既存の Constants の import 行に追記する
```

`Game` のフィールド（`crosshair: null,` の近く）に:

```js
    // Shift のタップ／長押しを見分けるための計測。utils/holdKey.js が進める
    shiftHold: initialHoldState(),
```

- [ ] **Step 4: `update()` から Shift ブロックを削除する**

`// Lock-on toggle works in all states` のコメントごと、次のブロックを丸ごと消す:

```js
        if (this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight')) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }
```

- [ ] **Step 5: `_updateShiftKey()` を足す**

`_updatePlaying()` の直前に置く:

```js
    /**
     * `Shift` のタップと長押しを振り分ける。
     *
     * タップ（しきい値未満で離す）＝クロスヘアロック、長押し＝Auto Aim の解除／再開。
     * 押した瞬間にロックを切り替える作りだと、長押しのたびにロックが道連れになるので、
     * **タップは離したときに確定させる**（判定は utils/holdKey.js）。
     *
     * プレイ中だけに閉じてあるのは `F` キーと同じ理由 — `this.player` は
     * `'settings'`（ポーズ中）や `'mission_clear'` でも alive かつ未ドックのまま残るので、
     * 自機の状態を見るだけでは「プレイ中限定」にならない。撃てるのはプレイ中だけなので、
     * プレイ外でロックしても使い道がない。
     */
    _updateShiftKey(deltaTime) {
        const down = this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');
        // 設定は 1/10 秒で持っているのでミリ秒に直す
        const tenths = this.settings?.autoAimHoldTenths ?? AUTO_AIM_HOLD_TENTHS_DEFAULT;
        const { state, tap, hold } = stepHoldKey(this.shiftHold, down, deltaTime, tenths * 100);
        this.shiftHold = state;

        if (tap) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
            }
        }

        // 長押しが効くのは Auto Aim を持っているときだけ。持っていない間に反転できると、
        // 次に拾ったときの状態が「いつ長押ししたか」で決まってしまう
        if (hold && this.player && this.player.autoAimTimer > 0) {
            this.player.autoAimPaused = !this.player.autoAimPaused;
        }
    },
```

- [ ] **Step 6: `_updatePlaying()` から呼ぶ**

`this._updateMiniMap();` の直前に足す（`F` キーの処理と同じ並び）:

```js
        this._updateShiftKey(deltaTime);
```

- [ ] **Step 7: `_openSettings()` でリセットする**

`audioManager.stopLoopingSe();` の直前に足す:

```js
        // Shift を押したまま開いて閉じると、たまった時間で即座に長押しが発火する
        this.shiftHold = initialHoldState();
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm test -- tests/shift-hold.test.js`
Expected: PASS

- [ ] **Step 9: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`Shift` の扱いが変わるので、既存テストで `ShiftLeft`/`ShiftRight` を `isKeyPressed` で送っているものがあれば**新しい仕様（離したときに確定）に直す**。

- [ ] **Step 10: コミット**

`main.js` を含むので `debugStartMission` の手順を踏む。

```bash
git add tests/shift-hold.test.js
# main.js は上記の手順で
git commit -m "feat: Shift のタップと長押しを分け、長押しで Auto Aim を解除する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 解除中の見せ方と HOW TO PLAY

**Files:**
- Modify: `src/js/ui/Crosshair.js`
- Modify: `src/js/ui/ScreenRenderer.js:280`
- Test: `tests/crosshair-auto-off.test.js`（新規）、`tests/demo-screens.test.js`

**Interfaces:**
- Consumes: `Player#autoAimPaused`（Task 3）

- [ ] **Step 1: 失敗するテストを書く**

`tests/crosshair-auto-off.test.js` を新規作成。scene の形は `tests/lead-marker.test.js` に倣う:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crosshair } from '../src/js/ui/Crosshair.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { COLOR_CROSSHAIR } from '../src/js/utils/Constants.js';

/** Crosshair が触る最小限の game。カメラ原点は 0 にしてワールド＝スクリーンにする。 */
function draw({ autoAimTimer = 100, autoAimPaused = false, target = null } = {}) {
  const ctx = makeFakeCtx();
  new Crosshair({
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    player: { autoAimTimer, autoAimPaused },
    autoAimTarget: target,
    autoAimLeadPoint: null,
    input: {
      crosshairLocked: false,
      lockedWorldX: 0, lockedWorldY: 0,
      mouse: { x: 400, y: 300 },
    },
  }).draw(ctx);
  return {
    ctx,
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
    strokes: ctx.calls.filter((c) => c.name === 'set:strokeStyle').map((c) => c.args[0]),
  };
}

test('Auto Aim 中は AUTO が出て、赤い照準になる（現行どおり）', () => {
  const { texts, strokes } = draw();
  assert.ok(texts.includes('AUTO'), 'AUTO が出ていない');
  assert.equal(texts.includes('AUTO OFF'), false, '解除していないのに AUTO OFF が出ている');
  assert.ok(strokes.includes('#FF3300'), '赤くなっていない');
});

test('解除中は AUTO OFF が出て、AUTO は出ない', () => {
  const { texts } = draw({ autoAimPaused: true });
  assert.ok(texts.includes('AUTO OFF'), 'AUTO OFF が出ていない');
  assert.equal(texts.includes('AUTO'), false, '解除中なのに AUTO も出ている');
});

// 解除したのに赤いままだと、切れたのか壊れたのか分からない。
test('解除中の照準は通常色に戻る', () => {
  const { strokes } = draw({ autoAimPaused: true });
  assert.equal(strokes.includes('#FF3300'), false, '解除中なのに赤いまま');
  assert.ok(strokes.includes(COLOR_CROSSHAIR), '通常色になっていない');
});

// 不変条件（解除中なら必ず残り時間 > 0）が崩れても、表示だけは破綻させない。
test('Auto Aim を持っていなければ何のラベルも出ない', () => {
  const { texts } = draw({ autoAimTimer: 0 });
  assert.equal(texts.includes('AUTO'), false);
  assert.equal(texts.includes('AUTO OFF'), false);
});

// 真上・真横だと照準の線と重なって読みにくく、狙っている相手も隠す。
test('AUTO OFF はクロスヘアの右下に出る', () => {
  const { ctx } = draw({ autoAimPaused: true });
  const label = ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === 'AUTO OFF');
  assert.ok(label, 'AUTO OFF が描かれていない');
  assert.ok(label.args[1] > 400, `右側に出ていない: x=${label.args[1]}`);
  assert.ok(label.args[2] > 300, `下側に出ていない: y=${label.args[2]}`);
});
```

`tests/demo-screens.test.js` の CONTROLS のテストに1行足す:

```js
    assert.ok(texts.includes('LOCK-ON AIM (TAP) / AUTO-AIM ON-OFF (HOLD)'),
      'SHIFT の説明が更新されていない');
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/crosshair-auto-off.test.js tests/demo-screens.test.js`
Expected: FAIL。`AUTO OFF` が描かれず、解除中も赤い。

- [ ] **Step 3: `Crosshair.js` を直す**

import に `UI` を足す:

```js
import { UI } from './theme.js';
```

`autoAimActive` の行（20行付近）を差し替える:

```js
        // 解除中は「効いていない」ので、赤い照準にも AUTO ラベルにもしない
        const autoAimPaused = !!(player && player.autoAimPaused && player.autoAimTimer > 0);
        const autoAimActive = !!(player && player.autoAimTimer > 0) && !autoAimPaused;
```

`AUTO ラベル` のブロックを差し替える:

```js
        // AUTO ラベル（オートエイム有効中のみ）／解除中は AUTO OFF
        if (autoAimActive) {
            ctx.save();
            ctx.font = 'bold 8px "Space Mono", monospace';
            ctx.fillStyle = '#FF3300';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('AUTO', mx + size + 2, my - size + 2);
            ctx.restore();
        } else if (autoAimPaused) {
            // 右下に置くのは、真上・真横だと照準の線と重なって読みにくく、
            // 狙っている相手も隠すため。警告ではなく状態表示なので赤や点滅は使わない
            ctx.save();
            ctx.font = 'bold 8px "Space Mono", monospace';
            ctx.fillStyle = UI.dim;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('AUTO OFF', mx + size + 2, my + size - 2);
            ctx.restore();
        }
```

- [ ] **Step 4: HOW TO PLAY の `SHIFT` を直す**

`src/js/ui/ScreenRenderer.js:280`:

```js
                { key: 'SHIFT', action: 'LOCK-ON AIM (TAP) / AUTO-AIM ON-OFF (HOLD)' },
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/crosshair-auto-off.test.js tests/demo-screens.test.js`
Expected: PASS。CONTROLS の行が長くなるので「パネルが画面に収まっている」テストも通ること。落ちたら文言を `LOCK-ON (TAP) / AUTO-AIM (HOLD)` まで詰める。

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/js/ui/Crosshair.js src/js/ui/ScreenRenderer.js \
        tests/crosshair-auto-off.test.js tests/demo-screens.test.js
git commit -m "feat: Auto Aim 解除中はクロスヘアを通常色にして AUTO OFF を出す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 設計書の追随と引き渡し

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-auto-aim-hold-toggle-design.md`
- Modify: `docs/superpowers/specs/2026-08-13-settings-screen-design.md`（操作表の `SHIFT`／設定項目の一覧に触れている箇所があれば）

- [ ] **Step 1: 設計書を実装に合わせる**

実装中に決めた細部を反映する。少なくとも:
- `stepHoldKey()` / `initialHoldState()` の実際の名前と戻り値の形
- `Game#shiftHold` というフィールド名と、`_openSettings()` でリセットしていること
- `settingValueText()` が `int` のときだけ `item.format` を使うこと（他の型は従来どおり）
- `Crosshair` が `AUTO` と `AUTO OFF` を排他で出すこと（解除中は `AUTO` を出さない）

実装中に設計と食い違ったことがあれば、**設計書のほうを実装に合わせる**（変更履歴は作らない）。

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-08-14-auto-aim-hold-toggle-design.md
git commit -m "docs: Auto Aim 一時解除の設計書を実装に合わせる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: ユーザーに引き渡す**

以下を伝える。

- **ハードリロード（Cmd+Shift+R）が必要**
- **設定を触らない限り、変わるのは「Shift の効き方」と「ドック中もタイマーが減ること」だけ**
- 確認ポイント:

| 見るところ | 調整先 |
|---|---|
| `Shift` を短く押して離すとクロスヘアロックが効くか（**離したときに効く**ようになった） | — |
| `Shift` 長押しで `AUTO OFF` が出て、照準が通常色に戻るか | — |
| 長押し中に解除と再開を往復しないか（1回だけ切り替わる） | — |
| `AUTO OFF` の位置と大きさ（クロスヘア右下） | `Crosshair.js` の `AUTO OFF` のブロック |
| 解除中もゲージが減り続けるか | — |
| **母艦にドッキング中もゲージが減るか**（挙動変更） | — |
| **設定画面を開いている間はゲージが止まるか** | — |
| `AUTO-AIM HOLD TO TOGGLE` の既定 0.3 秒が短すぎ／長すぎないか | `AUTO_AIM_HOLD_TENTHS_DEFAULT`、範囲は `_MIN` / `_MAX` |
| `RESUME AUTO-AIM ON PICKUP` を OFF にして、ゲージが残っているうちに拾うと解除のままか | — |
| 同 OFF で、ゲージが尽きたあとに拾うと ON で始まるか | — |
| ミスして復活したとき解除が残っていないか | — |
