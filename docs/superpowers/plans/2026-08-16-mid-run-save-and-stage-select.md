# 途中セーブと面セレクト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面クリア時に10000点を払って進捗を1スロット保存し、ゲームオーバー後に何度でもそこから再開できるようにする。あわせて今週到達済みの面を選んで単独で遊べる面セレクトを追加する。

**Architecture:** 永続化の純ロジックを `src/js/utils/saveData.js`（`storage` を引数で受ける純関数群）に、`Game` との橋渡しを `src/js/systems/SaveManager.js` に置く。ステージは `stageSeed(weekSeed, missionsCompleted)` から決定的に再生成できるので、保存するのは数値と `stageResults` の配列だけ。画面遷移とキー処理は `main.js`、描画は `ScreenRenderer.js`。トライ数はローカルとオンライン両方の週スコアランキングで同点時のタイブレークに使う。

**Tech Stack:** バニラ ES modules ＋ canvas。ビルド工程なし・依存パッケージなし。テストは `node --test`（DOM も AudioContext も無い）。オンラインは Google Apps Script（`gas/Code.gs`）。

**Spec:** `docs/superpowers/specs/2026-08-16-mid-run-save-and-stage-select-design.md`

## Global Constraints

- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して `git add` する。`src/js/main.js` にはユーザーがデバッグ用に立てている `debugStartMission: 6` が意図的に未コミットで置かれていることがある（本番値は 0）。`main.js` の自分のハンクだけをコミットしたいときは `git add -p` を使う。
- **コメントは日本語で「なぜそうしたか」を書く。** 何をしているかはコードが語る。数値を決めたら根拠を残す。
- **調整用の数値は `src/js/utils/Constants.js` に置く。** 実装側にマジックナンバーを直書きしない。
- **ソース文字列を grep するテストは書かない。** 呼び出し回数と状態で見る（このリポジトリで2回、到達不能なコードをテストが通してしまった実績がある）。
- **`AudioManager` に新しい `play*` / `start*` / `stop*` を足す場合、引数なしで呼んでも例外を投げないこと**（本計画では音は足さないので該当しない見込み）。
- テストは `npm test` で全件、`npm test -- tests/xxx.test.js` で1ファイル。
- **実機での見た目・音の確認はユーザーが行う。** ローカルサーバーは立てない。引き渡すときはハードリロード（Cmd+Shift+R）が要ることを伝える。
- `gas/Code.gs` を変更したら、**スプレッドシートの列追加（手作業）と `clasp push` → `clasp create-deployment -i <デプロイID>` が必要**。手順は `docs/superpowers/specs/2026-07-15-gas-setup.md` の 3b 節。`-i` を忘れると新しい URL が発行される。

## 仕様への追記（設計時に決めきれていなかった点）

- **面セレクトのランではコンティニューを出さない。** セーブは通しラン専用。面セレクト中にゲームオーバーしても `CONTINUE?` は表示せず、従来どおりランキング判定へ進む（Task 6 と Task 8）。
- **通常スタート（任意キー）ではセーブを消さない。** 新しいランを1面から始めるだけ。次にセーブが成立するまで元のセーブが残る。

## テストの組み立て方（全タスク共通）

`src/js/main.js` は `export const Game = { ... }` で **named export 済み**。既存テスト（`tests/weekId-online-wiring.test.js`）が確立している組み立てに従う。**メソッドを1つずつ借りる書き方はしない** — 借り忘れが起きるうえ、実装が別メソッドを呼ぶようになった瞬間に嘘になる。

```js
import { Game } from '../src/js/main.js';

function makeGame(overrides = {}) {
    const g = Object.create(Game);   // プロトタイプ経由で全メソッドが生える
    g.week = { weekId: '2026-W33', seed: 1 };
    return Object.assign(g, overrides);
}
```

偽 ctx は `tests/helpers/fake-ctx.js` の `makeFakeCtx()`。呼び出しは `ctx.calls` に `{ name, args }` で積まれ、プロパティ代入は `{ name: 'set:fillStyle', args: [値] }` として記録される。

## ファイル構成

| ファイル | 責任 |
|---|---|
| `src/js/utils/saveData.js` （新規） | 保存データの読み書きと検証。`storage` を引数で受ける純ロジックのみ。`Game` を知らない |
| `src/js/systems/SaveManager.js` （新規） | `Game` との橋渡し。コスト減算、`Game` への流し込み、`reached` の更新 |
| `src/js/utils/Constants.js` | `SAVE_COST` / `CONTINUE_COUNTDOWN_MS` / `GAMEOVER_WAIT_MS` |
| `src/js/main.js` | 面クリアの `S`、ゲームオーバーの `C`、タイトルの `C`/`S`、`stage_select` 状態、ランキング分岐 |
| `src/js/ui/ScreenRenderer.js` | 面クリア／ゲームオーバー／タイトルヒントの追加行、`drawStageSelect`、ランキング表の `TRY` 列 |
| `src/js/systems/HighScoreManager.js` | `tries` を持つエントリとタイブレーク |
| `gas/Code.gs` | `Scores` シートの `tries` 列、`validateEntry`、`topNForWeek` のタイブレーク |

---

### Task 1: 保存データの純ロジック（`utils/saveData.js`）

**Files:**
- Create: `src/js/utils/saveData.js`
- Modify: `src/js/utils/Constants.js`
- Test: `tests/save-data.test.js`

**Interfaces:**
- Consumes: なし（このタスクが最初）
- Produces:
  - `PROGRESS_STORAGE_KEY: string` = `'hoverattack_progress'`
  - `loadProgress(weekId: string, storage?: Storage) => { save: Save|null, reached: number }`
  - `writeProgress(weekId: string, progress: { save: Save|null, reached: number }, storage?: Storage) => void`
  - `canSave(score: number) => boolean`
  - `makeSave({ mode, missionsCompleted, score, totalTime, stageResults }) => Save` — `score` から `SAVE_COST` を引いた値を持ち、`tries` は 1
  - `bumpTries(save: Save) => Save` — `tries` を +1 した新しいオブジェクト
  - `Save` = `{ mode: string, missionsCompleted: number, score: number, totalTime: number, stageResults: object[], tries: number }`
- Constants に追加: `SAVE_COST = 10000`

- [ ] **Step 1: Constants に定数を足す**

`src/js/utils/Constants.js` の末尾近く（既存の分類に合う場所）に追加する。

```js
// --- 途中セーブ ---
// セーブ1回のコスト。HighScoreManager の MIN_SCORE も偶然 10000 だが、
// あちらは「ランキングに載る下限」で別物。連動させないため定数を分けている。
export const SAVE_COST = 10000;
// ゲームオーバーで CONTINUE? を出しておく時間。従来の自動遷移は 4 秒
// (GAMEOVER_WAIT_MS)。選択肢を読んで decide する時間として倍以上を取った。
export const CONTINUE_COUNTDOWN_MS = 9000;
// セーブが無いときの従来どおりの待ち時間（main.js に直書きされていた 4000）。
export const GAMEOVER_WAIT_MS = 4000;
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/save-data.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROGRESS_STORAGE_KEY, loadProgress, writeProgress, canSave, makeSave, bumpTries,
} from '../src/js/utils/saveData.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';

/** localStorage の代わり。getItem が投げる場合も作れる。 */
function fakeStorage(initial = {}, { throwOnGet = false, throwOnSet = false } = {}) {
    const data = { ...initial };
    return {
        data,
        getItem(k) { if (throwOnGet) throw new Error('private browsing'); return k in data ? data[k] : null; },
        setItem(k, v) { if (throwOnSet) throw new Error('quota'); data[k] = String(v); },
    };
}

const SAMPLE = {
    mode: 'newtype',
    missionsCompleted: 3,
    score: 24500,
    totalTime: 182400,
    stageResults: [{ stage: 1, score: 1200, timeMs: 60000 }],
    tries: 1,
};

test('保存が無ければ既定値を返す', () => {
    const got = loadProgress('2026-W33', fakeStorage());
    assert.deepEqual(got, { save: null, reached: 0 });
});

test('同じ週の保存はそのまま読める', () => {
    const storage = fakeStorage();
    writeProgress('2026-W33', { save: SAMPLE, reached: 4 }, storage);
    const got = loadProgress('2026-W33', storage);
    assert.deepEqual(got.save, SAMPLE);
    assert.equal(got.reached, 4);
});

test('週が変われば save も reached も捨てる', () => {
    const storage = fakeStorage();
    writeProgress('2026-W33', { save: SAMPLE, reached: 4 }, storage);
    assert.deepEqual(loadProgress('2026-W34', storage), { save: null, reached: 0 });
});

test('壊れた JSON でも投げずに既定値', () => {
    const storage = fakeStorage({ [PROGRESS_STORAGE_KEY]: '{not json' });
    assert.deepEqual(loadProgress('2026-W33', storage), { save: null, reached: 0 });
});

test('save の形が壊れていれば save だけ捨て、reached は生かす', () => {
    const storage = fakeStorage({
        [PROGRESS_STORAGE_KEY]: JSON.stringify({
            weekId: '2026-W33', save: { mode: 'newtype' }, reached: 5,
        }),
    });
    const got = loadProgress('2026-W33', storage);
    assert.equal(got.save, null);
    assert.equal(got.reached, 5);
});

test('localStorage が使えなくても投げない', () => {
    assert.deepEqual(loadProgress('2026-W33', fakeStorage({}, { throwOnGet: true })), { save: null, reached: 0 });
    assert.doesNotThrow(() => writeProgress('2026-W33', { save: null, reached: 1 }, fakeStorage({}, { throwOnSet: true })));
    assert.doesNotThrow(() => loadProgress('2026-W33', null));
});

test('canSave はコストちょうどで通る', () => {
    assert.equal(canSave(SAVE_COST - 1), false);
    assert.equal(canSave(SAVE_COST), true);
    assert.equal(canSave(Number.NaN), false);
});

test('makeSave はコストを引いた後のスコアを持つ', () => {
    const save = makeSave({
        mode: 'normal', missionsCompleted: 2, score: 34500, totalTime: 1000, stageResults: [],
    });
    // 引く前の 34500 が残っていたら、セーブし直すたびに得をする穴になる
    assert.equal(save.score, 34500 - SAVE_COST);
    assert.equal(save.tries, 1);
});

test('bumpTries は元を壊さずに +1 する', () => {
    const a = makeSave({ mode: 'normal', missionsCompleted: 1, score: 20000, totalTime: 0, stageResults: [] });
    const b = bumpTries(a);
    assert.equal(a.tries, 1);
    assert.equal(b.tries, 2);
    assert.equal(bumpTries(b).tries, 3);
});

test('stageResults は配列の実体をコピーして持つ', () => {
    const results = [{ stage: 1, score: 1, timeMs: 1 }];
    const save = makeSave({ mode: 'normal', missionsCompleted: 1, score: 20000, totalTime: 0, stageResults: results });
    results.push({ stage: 2, score: 2, timeMs: 2 });
    assert.equal(save.stageResults.length, 1);
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `npm test -- tests/save-data.test.js`
Expected: FAIL（`Cannot find module .../saveData.js`）

- [ ] **Step 4: 実装する**

`src/js/utils/saveData.js` を新規作成する。

```js
// ============================================
// 途中セーブと面セレクトの進捗。localStorage の 1 キーに JSON でまとめる。
//
// 設定（utils/settings.js）と同居させていないのは**寿命が違う**ため。
// 設定は週をまたいで永続、こちらは週が変われば丸ごと捨てる。1キーに混ぜると
// 週のロールオーバーで設定まで飛ぶ。
//
// storage を引数で受け取るのは、node --test に localStorage が無いから。
// 呼び出し側は既定値（globalThis.localStorage）のまま使えばよい。
// ============================================

import { SAVE_COST } from './Constants.js';

export const PROGRESS_STORAGE_KEY = 'hoverattack_progress';

const MAX_STAGE = 7;

/** 何も無いときの姿。読めない・壊れている・週が違う、はすべてこれに落ちる。 */
function emptyProgress() {
    return { save: null, reached: 0 };
}

/**
 * 読んだ save を検証する。1つでも欠けたら null。
 * 部分的に直して使わないのは、中途半端な進捗で再開すると
 * スコアやタイムの辻褄が合わなくなるため。
 */
function sanitizeSave(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const missionsCompleted = num(raw.missionsCompleted);
    const score = num(raw.score);
    const totalTime = num(raw.totalTime);
    const tries = num(raw.tries);
    if (typeof raw.mode !== 'string' || !raw.mode) return null;
    if (missionsCompleted === null || missionsCompleted < 1 || missionsCompleted >= MAX_STAGE) return null;
    if (score === null || score < 0) return null;
    if (totalTime === null || totalTime < 0) return null;
    if (tries === null || tries < 1) return null;
    if (!Array.isArray(raw.stageResults)) return null;
    return {
        mode: raw.mode,
        missionsCompleted: Math.floor(missionsCompleted),
        score: Math.floor(score),
        totalTime,
        stageResults: raw.stageResults.slice(),
        tries: Math.floor(tries),
    };
}

/**
 * 今週の進捗を読む。週IDが違えば丸ごと捨てる（面の中身が週で変わるので、
 * 続きも解放も意味を失う）。壊れた値・localStorage が使えない環境では既定値。
 * @param {string} weekId 今週のID
 * @param {Storage} [storage]
 */
export function loadProgress(weekId, storage = globalThis.localStorage) {
    let raw = null;
    try {
        raw = storage && storage.getItem(PROGRESS_STORAGE_KEY);
    } catch (e) { /* プライベートブラウジングでは getItem が投げる */ }
    if (raw == null) return emptyProgress();

    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return emptyProgress();
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyProgress();
    if (parsed.weekId !== weekId) return emptyProgress();

    const reached = Number(parsed.reached);
    return {
        save: sanitizeSave(parsed.save),
        reached: Number.isFinite(reached) ? Math.min(MAX_STAGE, Math.max(0, Math.floor(reached))) : 0,
    };
}

/** 進捗を書く。保存できなくてもゲームは続くので黙って諦める。 */
export function writeProgress(weekId, progress, storage = globalThis.localStorage) {
    try {
        if (!storage) return;
        storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
            weekId,
            save: progress && progress.save ? progress.save : null,
            reached: progress && Number.isFinite(progress.reached) ? progress.reached : 0,
        }));
    } catch (e) { /* 容量超過・プライベートブラウジング */ }
}

/** そのスコアでセーブ代を払えるか。ちょうど SAVE_COST なら払える（残 0）。 */
export function canSave(score) {
    return Number.isFinite(score) && score >= SAVE_COST;
}

/**
 * セーブを作る。**コストを引いた後のスコアを持たせる。**
 * 引く前の値を保存すると、再開してセーブし直すたびに得をする穴になる。
 */
export function makeSave({ mode, missionsCompleted, score, totalTime, stageResults }) {
    return {
        mode,
        missionsCompleted,
        score: score - SAVE_COST,
        totalTime,
        stageResults: Array.isArray(stageResults) ? stageResults.slice() : [],
        tries: 1,
    };
}

/** 再挑戦のたびに呼ぶ。元を書き換えないのは、保存に失敗しても状態が壊れないように。 */
export function bumpTries(save) {
    return { ...save, tries: save.tries + 1 };
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- tests/save-data.test.js`
Expected: PASS（10 tests）

- [ ] **Step 6: 全件を回す**

Run: `npm test`
Expected: 既存のテストがすべて通ったまま件数が 10 増える

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/saveData.js tests/save-data.test.js
git add -p src/js/utils/Constants.js
git commit -m "feat: 途中セーブの保存データを読み書きする純ロジックを足す"
```

---

### Task 2: `SaveManager`（`Game` との橋渡し）

**Files:**
- Create: `src/js/systems/SaveManager.js`
- Test: `tests/save-manager.test.js`

**Interfaces:**
- Consumes: Task 1 の `loadProgress` / `writeProgress` / `canSave` / `makeSave` / `bumpTries`
- Produces:
  - `class SaveManager`
    - `constructor(game, storage = globalThis.localStorage)` — 生成時に `loadProgress(game.week.weekId, storage)` を呼ぶ
    - `get save(): Save|null`
    - `get reached(): number`
    - `canSaveNow(): boolean` — `canSave(game.score)`
    - `saveHere(): boolean` — 払えなければ `false` で何もしない。払えれば `game.score -= SAVE_COST` して保存し `true`
    - `applyContinue(): boolean` — `tries` を +1 して保存し直し、`game` に値を流し込む。セーブが無ければ `false`
    - `recordReached(stage: number): void` — `reached` を更新（増えるときだけ書く）
- `game` に期待するもの: `week.weekId` / `mode` / `score` / `totalTime` / `missionsCompleted` / `stageResults` / `runTries` / `gameSpeed`

- [ ] **Step 1: 失敗するテストを書く**

`tests/save-manager.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

/** SaveManager が触る分だけの Game。 */
function fakeGame(over = {}) {
    return {
        week: { weekId: '2026-W33' },
        mode: 'newtype',
        gameSpeed: 1.0,
        score: 34500,
        totalTime: 182400,
        missionsCompleted: 3,
        stageResults: [{ stage: 1, score: 1200, timeMs: 60000 }],
        runTries: 1,
        ...over,
    };
}

test('払えるときはコストを引いて保存する', () => {
    const game = fakeGame();
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.saveHere(), true);
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(sm.save.score, 34500 - SAVE_COST);
    assert.equal(sm.save.missionsCompleted, 3);
    assert.equal(sm.save.mode, 'newtype');
    assert.equal(sm.save.tries, 1);
});

test('払えないときは何も起きない', () => {
    const game = fakeGame({ score: SAVE_COST - 1 });
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.canSaveNow(), false);
    assert.equal(sm.saveHere(), false);
    assert.equal(game.score, SAVE_COST - 1);
    assert.equal(sm.save, null);
});

test('保存した内容は別のインスタンスから読める', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();
    const fresh = new SaveManager(fakeGame({ score: 0 }), storage);
    assert.equal(fresh.save.missionsCompleted, 3);
});

test('週が変われば読み込みで消える', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();
    const nextWeek = new SaveManager(fakeGame({ week: { weekId: '2026-W34' } }), storage);
    assert.equal(nextWeek.save, null);
    assert.equal(nextWeek.reached, 0);
});

test('applyContinue はトライ数を増やして game に流し込む', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();

    const game = fakeGame({ score: 999, totalTime: 0, missionsCompleted: 0, stageResults: [], mode: 'normal' });
    const sm = new SaveManager(game, storage);
    assert.equal(sm.applyContinue(), true);
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(game.missionsCompleted, 3);
    assert.equal(game.totalTime, 182400);
    assert.equal(game.stageResults.length, 1);
    assert.equal(game.mode, 'newtype');      // モードは保存値に固定される
    assert.equal(game.gameSpeed, 1.0);
    assert.equal(game.runTries, 2);
    assert.equal(sm.save.tries, 2);
});

test('applyContinue はセーブが無ければ false で何も触らない', () => {
    const game = fakeGame({ score: 111 });
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.applyContinue(), false);
    assert.equal(game.score, 111);
});

test('トライ数は保存し直すと 1 に戻る', () => {
    const storage = fakeStorage();
    const game = fakeGame();
    const sm = new SaveManager(game, storage);
    sm.saveHere();
    sm.applyContinue();
    assert.equal(sm.save.tries, 2);
    game.score = 50000;
    game.missionsCompleted = 4;
    sm.saveHere();
    assert.equal(sm.save.tries, 1);
    assert.equal(sm.save.missionsCompleted, 4);
});

test('recordReached は増えるときだけ書く', () => {
    const storage = fakeStorage();
    const sm = new SaveManager(fakeGame(), storage);
    sm.recordReached(3);
    assert.equal(sm.reached, 3);
    sm.recordReached(2);
    assert.equal(sm.reached, 3);
    sm.recordReached(5);
    assert.equal(sm.reached, 5);
    assert.equal(new SaveManager(fakeGame(), storage).reached, 5);
});

test('storage が無くても投げない', () => {
    const sm = new SaveManager(fakeGame(), null);
    assert.doesNotThrow(() => sm.saveHere());
    assert.doesNotThrow(() => sm.recordReached(2));
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/save-manager.test.js`
Expected: FAIL（`Cannot find module .../SaveManager.js`）

- [ ] **Step 3: 実装する**

`src/js/systems/SaveManager.js` を新規作成する。

```js
// ============================================
// 途中セーブと面セレクトの解放。Game と saveData.js の間をつなぐ。
//
// 永続化の理屈は utils/saveData.js（純ロジック）に置いてあり、ここは
// 「いつ払うか」「Game のどこへ流し込むか」だけを持つ。GameStateManager に
// 足さなかったのは、あちらの 120 行の見通しの良さが値打ちで、永続化と
// 週判定とスコア減算を混ぜると失うため。
// ============================================

import { MODES } from '../utils/modes.js';
import { SAVE_COST } from '../utils/Constants.js';
import { loadProgress, writeProgress, canSave, makeSave, bumpTries } from '../utils/saveData.js';

export class SaveManager {
    constructor(game, storage = globalThis.localStorage) {
        this.game = game;
        this.storage = storage;
        this.weekId = game.week.weekId;
        this.progress = loadProgress(this.weekId, storage);
    }

    get save() { return this.progress.save; }

    get reached() { return this.progress.reached; }

    /** 今のスコアでセーブ代を払えるか。 */
    canSaveNow() { return canSave(this.game.score); }

    _write() { writeProgress(this.weekId, this.progress, this.storage); }

    /**
     * 今のランをセーブする。**払えなければ何もしない**（呼び出し側で
     * 弾く前提だが、ここでも守る。二重に守っておかないと、表示と
     * 判定がずれたときに黙って負のスコアが生まれる）。
     * @returns {boolean} セーブできたか
     */
    saveHere() {
        if (!this.canSaveNow()) return false;
        const game = this.game;
        this.progress.save = makeSave({
            mode: game.mode,
            missionsCompleted: game.missionsCompleted,
            score: game.score,
            totalTime: game.totalTime,
            stageResults: game.stageResults,
        });
        game.score -= SAVE_COST;
        game.runTries = 1;   // このセーブ地点への挑戦は、これが1回目
        this._write();
        return true;
    }

    /**
     * セーブ地点から再開する。**トライ数を先に増やして保存してから**
     * game へ流し込む（保存前に落ちても回数が残るように）。
     * 面の再生成は呼び出し側（stateManager.resetLevel(false)）の仕事。
     * @returns {boolean} 再開できたか
     */
    applyContinue() {
        const save = this.progress.save;
        if (!save) return false;

        this.progress.save = bumpTries(save);
        this._write();

        const game = this.game;
        const next = this.progress.save;
        game.mode = next.mode;
        game.gameSpeed = MODES[next.mode].gameSpeed;
        game.missionsCompleted = next.missionsCompleted;
        game.score = next.score;
        game.totalTime = next.totalTime;
        game.stageResults = next.stageResults.slice();
        game.runTries = next.tries;
        return true;
    }

    /** 今週の到達最大面を記録する。面セレクトの解放はこれで決まる。 */
    recordReached(stage) {
        if (!Number.isFinite(stage) || stage <= this.progress.reached) return;
        this.progress.reached = stage;
        this._write();
    }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/save-manager.test.js`
Expected: PASS（9 tests）

- [ ] **Step 5: コミット**

```bash
git add src/js/systems/SaveManager.js tests/save-manager.test.js
git commit -m "feat: SaveManager で Game と保存データをつなぐ"
```

---

### Task 3: `Game` に組み込む（生成・`runTries`・到達記録）

**Files:**
- Modify: `src/js/main.js`（`init()` 付近の 227-245 行、`_recordStageReached()` 668-688 行）
- Test: `tests/save-wiring.test.js`

**Interfaces:**
- Consumes: Task 2 の `SaveManager`
- Produces:
  - `game.saveManager: SaveManager`
  - `game.runTries: number` — 今のランがセーブから何回目か。通常スタートは 1
  - `game.stageSelectRun: boolean` — 面セレクトから始めたランか
  - `game._recordStageReached()` が `saveManager.recordReached(stage)` も呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`tests/save-wiring.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function makeGame(overrides = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 0;
    g.totalTime = 0;
    g.missionsCompleted = 2;
    g.stageResults = [];
    g.runTries = 1;
    Object.assign(g, overrides);
    g.saveManager = new SaveManager(g, overrides.storage || fakeStorage());
    return g;
}

test('_recordStageReached は saveManager にも記録する', () => {
    const g = makeGame();
    // missionsCompleted 2 = いま遊んでいるのは3面
    g._recordStageReached();
    assert.equal(g.saveManager.reached, 3);
});

test('7面を超えて記録されない', () => {
    const g = makeGame({ missionsCompleted: 9 });
    g._recordStageReached();
    assert.equal(g.saveManager.reached, 7);
});
```

`_recordStageReached()` は本体で `localStorage` を直に触るが、node には `globalThis.localStorage` が無い。既存実装は `try/catch` で握りつぶすので落ちない（そこは変えない）。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/save-wiring.test.js`
Expected: FAIL（`game.saveManager.reached` が 0 のまま、または `Game` が undefined）

- [ ] **Step 3: `init()` で SaveManager を作る**

`src/js/main.js` の `this.stageRankingManager = new StageRankingManager(this.week.weekId);`（242行付近）の直後に足す。

```js
        // 途中セーブと面セレクトの解放。週IDで無効化されるので、
        // highScoreManager と同じくここ（週が確定した直後）で作る。
        this.saveManager = new SaveManager(this);
```

`Game` オブジェクトの初期フィールド（177行 `gameState:` の近く）に足す。

```js
    runTries: 1,          // 今のランがセーブ地点から何回目か。通常スタートは 1
    stageSelectRun: false, // 面セレクトから始めたランか（週スコアに出さない）
```

import を足す。

```js
import { SaveManager } from './systems/SaveManager.js';
```

- [ ] **Step 4: `_recordStageReached()` に足す**

既存の本体（`localStorage` を直に触っている部分）はそのまま残し、末尾に1行足す。

```js
    /** Record that the player has reached the current stage (call at stage start). */
    _recordStageReached() {
        const stage = Math.min(7, this.missionsCompleted + 1);
        try {
            const prev = Number(localStorage.getItem('hoverattack_max_stage_reached') || 0);
            if (stage > prev) localStorage.setItem('hoverattack_max_stage_reached', String(stage));
        } catch (e) {
            /* ignore storage failures */
        }
        // 面セレクトの解放は**週ごと**に消える。上の旧キーは週非依存のままにする
        // ——あちらは面別ランキング表示画面の出現ゲート(_availableDemoStates)に
        // 使われていて、週別にすると週明けにその画面が出なくなる。
        if (this.saveManager) this.saveManager.recordReached(stage);
    },
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- tests/save-wiring.test.js`
Expected: PASS（2 tests）

- [ ] **Step 6: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 7: コミット**

`main.js` にはユーザーの未コミット変更が同居しうるので、必ずハンク単位で add する。

```bash
git add tests/save-wiring.test.js
git add -p src/js/main.js
git commit -m "feat: Game に SaveManager をつなぎ、今週の到達面を記録する"
```

---

### Task 4: 面クリアで `S` を押すとセーブする

**Files:**
- Modify: `src/js/main.js`（`_updateMissionClear()` 800-808 行）
- Modify: `src/js/ui/ScreenRenderer.js`（`drawMissionClear()` 491-518 行）
- Test: `tests/save-mission-clear.test.js`

**Interfaces:**
- Consumes: Task 3 の `game.saveManager`
- Produces: `_updateMissionClear()` が `KeyS` を先に見る。`ScreenRenderer.drawMissionClear` が `[S] SAVE & NEXT` 行を出す

- [ ] **Step 1: 失敗するテストを書く**

`tests/save-mission-clear.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

/** 押されたキーだけ true を返す入力。 */
function fakeInput(pressed = [], typed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,
        getTypedChars: () => typed,
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 34500;
    g.totalTime = 1000;
    g.missionsCompleted = 3;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.slotRunning = false;
    g.gameState = 'mission_clear';
    g.nextMissionCalls = 0;
    g.input = fakeInput();
    g.stateManager = { nextMission() { g.nextMissionCalls++; } };
    g._restoreFullscreen = () => {};
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

test('S でセーブしてから次の面へ進む', () => {
    const game = makeGame({ input: fakeInput(['KeyS']) });
    game._updateMissionClear();
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(game.saveManager.save.missionsCompleted, 3);
    assert.equal(game.nextMissionCalls, 1);
    assert.equal(game.gameState, 'playing');
});

test('スコアが足りなければ S は無反応（次の面へも進まない）', async () => {
    const game = makeGame({ score: SAVE_COST - 1, input: fakeInput(['KeyS']) });
    game._updateMissionClear();
    assert.equal(game.score, SAVE_COST - 1);
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 0);
    assert.equal(game.gameState, 'mission_clear');
});

test('W では従来どおりセーブせずに進む', async () => {
    const game = makeGame({ input: fakeInput(['KeyW']) });
    game._updateMissionClear();
    assert.equal(game.score, 34500);
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 1);
});

test('S の入力が「任意のキー」として二重に効かない', async () => {
    // getTypedChars に 's' が乗っていても、進むのは1回だけ
    const game = makeGame({ input: fakeInput(['KeyS'], ['s']) });
    game._updateMissionClear();
    assert.equal(game.nextMissionCalls, 1);
    assert.equal(game.score, 34500 - SAVE_COST);
});

test('タイムボーナス加算中は何も受け付けない', async () => {
    const game = makeGame({
        slotRunning: true, currentTimeBonus: 0, targetTimeBonus: 500,
        input: fakeInput(['KeyS']),
    });
    game._updateMissionClear();
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 0);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/save-mission-clear.test.js`
Expected: FAIL（`S` がセーブせずただ次の面へ進む）

- [ ] **Step 3: `_updateMissionClear()` を書き換える**

```js
    _updateMissionClear() {
        if (this._updateTimeBonusSlot(false)) return;

        // S だけ先に見る。下の「任意のキーで次へ」に混ぜると、getTypedChars に
        // 's' が乗るぶんセーブと前進が二重に走る。
        // 払えないときは**無反応**にする（連打で 10000 点を失う事故を防ぐため、
        // 確認ダイアログではなく専用キーにしてある）。
        if (this.input.isKeyPressed('KeyS')) {
            if (!this.saveManager.canSaveNow()) return;
            this.saveManager.saveHere();
            this._advanceToNextMission();
            return;
        }

        if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed() || this.input.getTypedChars().length > 0) {
            this._advanceToNextMission();
        }
    },

    /** 面クリア画面から次の面へ。セーブの有無で変わらない部分をまとめた。 */
    _advanceToNextMission() {
        this._restoreFullscreen();
        this.gameState = 'playing';
        this.stateManager.nextMission();
        audioManager.startBGM(this.missionsCompleted);
    },
```

`makeGame` は `Object.create(Game)` なので `_advanceToNextMission` も自動で生える（テスト側の追加は不要）。`audioManager.startBGM` はテストでは `available` の環境判定で黙るので、そのまま呼んでよい。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/save-mission-clear.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: 面クリア画面に行を足す**

`src/js/ui/ScreenRenderer.js` の `drawMissionClear()` の「PRESS ANY KEY TO CONTINUE」を出している `else` 節を書き換える。

```js
        } else {
            ctx.save();
            ctx.fillStyle = UI.ink;
            glow(ctx, UI.info, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText('[W] NEXT STAGE', canvas.width / 2, canvas.height / 2 + 60);
            ctx.restore();

            this._drawSaveOption(ctx, canvas.width / 2, canvas.height / 2 + 88);
        }
```

同じクラスに追加する。

```js
    /**
     * 面クリア画面のセーブ行。**払えないときも行は出す** — 黙って消すと
     * 「セーブという機能がある」ことすら伝わらないため、理由を添えて暗くする。
     */
    _drawSaveOption(ctx, cx, y) {
        const canSave = this.game.saveManager && this.game.saveManager.canSaveNow();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);
        if (canSave) {
            ctx.fillStyle = UI.gold;
            glow(ctx, UI.gold, 'mid');
            ctx.fillText(`[S] SAVE & NEXT   -${SAVE_COST} PTS`, cx, y);
        } else {
            ctx.fillStyle = UI.dim;
            ctx.fillText(`[S] SAVE & NEXT   SCORE TOO LOW`, cx, y);
        }
        ctx.restore();
        ctx.textAlign = 'left';
    }
```

import を足す（`UI.dim` が theme に無ければ `lerpColor(UI.ink, '#000000', 0.6)` を使う。まず `grep -n "dim" src/js/ui/theme.js` で確認する）。

```js
import { SAVE_COST } from '../utils/Constants.js';
```

- [ ] **Step 6: 描画のテストを足す**

`tests/save-mission-clear.test.js` に追記する。`tests/helpers/fake-ctx.js` を使う。

```js
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

test('面クリア画面はセーブ行を出し、払えないときは理由を出す', async () => {
    const canvas = { width: 960, height: 720 };
    for (const [score, expected] of [[34500, `-${SAVE_COST} PTS`], [10, 'SCORE TOO LOW']]) {
        const game = makeGame({ score });
        game.canvas = canvas;
        game.missionTimer = 1000;
        game.targetTimeBonus = 0;
        game.currentTimeBonus = 0;
        game.stageTop5Time = false;
        game.stageTop5Score = false;
        const ctx = makeFakeCtx();
        new ScreenRenderer(game).drawMissionClear(ctx);
        const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
        assert.ok(texts.some((t) => t.includes('[W] NEXT STAGE')));
        assert.ok(texts.some((t) => t.includes(expected)), `${score}: ${texts.join(' | ')}`);
    }
});
```

`ScreenRenderer` のコンストラクタが `game` 以外を要求しないことは既存の描画テストで確かめられている。`game.canvas` は `{ width, height }` だけあればよい。

- [ ] **Step 7: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add tests/save-mission-clear.test.js src/js/ui/ScreenRenderer.js
git add -p src/js/main.js
git commit -m "feat: 面クリアで S を押すと 10000 点でセーブできるようにする"
```

---

### Task 5: ゲームオーバーで `CONTINUE?` を出す

**Files:**
- Modify: `src/js/main.js`（`_updateGameOver()` 789-792 行）
- Modify: `src/js/ui/ScreenRenderer.js`（`drawGameOver()` 538-556 行）
- Test: `tests/save-continue.test.js`

**Interfaces:**
- Consumes: Task 3 の `game.saveManager` / `game.stageSelectRun`、Task 1 の `CONTINUE_COUNTDOWN_MS` / `GAMEOVER_WAIT_MS`
- Produces:
  - `game.canContinueHere(): boolean` — セーブがあり、面セレクトのランでないこと
  - `game.continueFromSave(): void` — `applyContinue()` → `resetLevel(false)` → `playing`
  - `game.continueSecondsLeft(): number` — 残り秒（切り上げ）。描画が使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/save-continue.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { CONTINUE_COUNTDOWN_MS, GAMEOVER_WAIT_MS } from '../src/js/utils/Constants.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fakeInput(pressed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,   // _anyKeyOrClick が見る
        getTypedChars: () => [],
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 34500;
    g.totalTime = 1000;
    g.missionsCompleted = 3;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.gameState = 'gameover';
    g.stateTimer = 0;
    g.rankingCalls = 0;
    g.resetCalls = 0;
    g.input = fakeInput();
    g.stateManager = { resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; } };
    g._restoreFullscreen = () => {};
    g._tryGoToRanking = () => { g.rankingCalls++; };
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

/** セーブ済みの storage を作る。 */
function storageWithSave() {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.saveHere();
    return storage;
}

test('セーブが無ければ従来どおり 4 秒でランキングへ', async () => {
    const game = makeGame();
    assert.equal(game.canContinueHere(), false);
    game._updateGameOver(GAMEOVER_WAIT_MS - 1);
    assert.equal(game.rankingCalls, 0);
    game._updateGameOver(2);
    assert.equal(game.rankingCalls, 1);
});

test('セーブがあれば C で再開し、ランキングへ行かない', async () => {
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['KeyC']) });
    assert.equal(game.canContinueHere(), true);
    game._updateGameOver(16);
    assert.equal(game.rankingCalls, 0);
    assert.equal(game.gameState, 'playing');
    assert.equal(game.resetCalls, 1);
    assert.equal(game.lastResetScore, false);   // スコアを消さない
    assert.equal(game.runTries, 2);
    assert.equal(game.saveManager.save.tries, 2);
});

test('放置すればカウントダウン満了でランキングへ', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game._updateGameOver(GAMEOVER_WAIT_MS + 100);
    assert.equal(game.rankingCalls, 0, '4秒では出ていかない');
    game._updateGameOver(CONTINUE_COUNTDOWN_MS);
    assert.equal(game.rankingCalls, 1);
});

test('面セレクトのランではコンティニューを出さない', async () => {
    const game = makeGame({
        storage: storageWithSave(), stageSelectRun: true, input: fakeInput(['KeyC']),
    });
    assert.equal(game.canContinueHere(), false);
    game._updateGameOver(GAMEOVER_WAIT_MS + 1);
    assert.equal(game.rankingCalls, 1);
    assert.equal(game.gameState, 'gameover');
});

test('残り秒は 9 から 0 へ減り、負にならない', async () => {
    const game = makeGame({ storage: storageWithSave() });
    assert.equal(game.continueSecondsLeft(), CONTINUE_COUNTDOWN_MS / 1000);
    game.stateTimer = CONTINUE_COUNTDOWN_MS / 2;
    assert.equal(game.continueSecondsLeft(), Math.ceil(CONTINUE_COUNTDOWN_MS / 2000));
    game.stateTimer = CONTINUE_COUNTDOWN_MS + 5000;
    assert.equal(game.continueSecondsLeft(), 0);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/save-continue.test.js`
Expected: FAIL（`canContinueHere is not a function`）

- [ ] **Step 3: `main.js` を書き換える**

`_updateGameOver` を置き換え、3つのメソッドを足す。

```js
    _updateGameOver(deltaTime) {
        this.stateTimer += deltaTime;

        if (this.canContinueHere()) {
            if (this.input.isKeyPressed('KeyC')) {
                this.continueFromSave();
                return;
            }
            // カウントダウンを待ってから従来の流れへ。放置すればランキング登録に
            // 進むので、見逃しても手順が止まらない（既存の自動遷移の性格を保つ）
            if (this.stateTimer > CONTINUE_COUNTDOWN_MS) this._tryGoToRanking();
            return;
        }

        if (this.stateTimer > GAMEOVER_WAIT_MS) this._tryGoToRanking();
    },

    /**
     * ここでコンティニューを出せるか。
     * **面セレクトのランでは出さない** — セーブは通しラン専用で、単発の
     * タイムアタックから通しランの続きへ飛べてしまうのは筋が通らない。
     */
    canContinueHere() {
        return !this.stageSelectRun && !!(this.saveManager && this.saveManager.save);
    },

    /** CONTINUE? の残り秒。描画用（0 未満にはしない）。 */
    continueSecondsLeft() {
        return Math.max(0, Math.ceil((CONTINUE_COUNTDOWN_MS - this.stateTimer) / 1000));
    },

    /** セーブ地点から再開する。トライ数の加算と保存は SaveManager の仕事。 */
    continueFromSave() {
        if (!this.saveManager.applyContinue()) return;
        this._restoreFullscreen();
        this.gameState = 'playing';
        // resetScore = false。applyContinue が入れたスコアと累計時間を消さない
        this.stateManager.resetLevel(false);
        audioManager.startBGM(this.missionsCompleted);
    },
```

import に定数を足す。

```js
import { CONTINUE_COUNTDOWN_MS, GAMEOVER_WAIT_MS, SAVE_COST } from './utils/Constants.js';
```

（`Constants.js` からの import は既に1行あるので、そこへ足す。）

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/save-continue.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: ゲームオーバー画面の描画を足す**

`drawGameOver()` の `PLEASE WAIT...` を出している部分を置き換える。

```js
        if (this.game.canContinueHere && this.game.canContinueHere()) {
            const save = this.game.saveManager.save;
            ctx.save();
            ctx.fillStyle = UI.gold;
            glow(ctx, UI.gold, 'mid');
            ctx.font = font('sub', true);
            ctx.fillText(
                `CONTINUE FROM STAGE ${save.missionsCompleted + 1}?   [C] YES`,
                canvas.width / 2, canvas.height / 2 + 60
            );
            ctx.restore();

            ctx.fillStyle = UI.ink;
            ctx.font = font('head', true);
            ctx.fillText(String(this.game.continueSecondsLeft()), canvas.width / 2, canvas.height / 2 + 96);

            ctx.fillStyle = '#888888';
            ctx.font = font('small');
            ctx.fillText(`TRY ${save.tries}`, canvas.width / 2, canvas.height / 2 + 122);
        } else {
            ctx.fillStyle = '#888888';
            ctx.font = font('small');
            ctx.fillText('PLEASE WAIT...', canvas.width / 2, canvas.height / 2 + 60);
        }
        ctx.textAlign = 'left';
```

- [ ] **Step 6: 描画のテストを足す**

`tests/save-continue.test.js` に追記する。

```js
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

test('ゲームオーバー画面はどの面から再開するかと残り秒を出す', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game.canvas = { width: 960, height: 720 };
    game.stateTimer = 0;
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawGameOver(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.some((t) => t.includes('CONTINUE FROM STAGE 4?')), texts.join(' | '));
    assert.ok(texts.includes('9'));
    assert.ok(texts.some((t) => t.includes('TRY 1')));
});

test('セーブが無いゲームオーバー画面は従来のまま', async () => {
    const game = makeGame();
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawGameOver(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.includes('PLEASE WAIT...'));
    assert.ok(!texts.some((t) => t.includes('CONTINUE')));
});
```

- [ ] **Step 7: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add tests/save-continue.test.js src/js/ui/ScreenRenderer.js
git add -p src/js/main.js
git commit -m "feat: ゲームオーバーでセーブ地点から再開できるようにする"
```

---

### Task 6: タイトルの `C`（コンティニュー）

**Files:**
- Modify: `src/js/main.js`（`_updateTitle()` 606-625 行、`_startGameIfRequested()` 594-604 行）
- Modify: `src/js/ui/ScreenRenderer.js`（`drawTitleScreen()` / `_drawStartHint` の下）
- Test: `tests/save-title-entry.test.js`

**Interfaces:**
- Consumes: Task 5 の `canContinueHere()` / `continueFromSave()`
- Produces: `_startGameIfRequested()` が新しいランとして `runTries = 1` / `stageSelectRun = false` を立てる。タイトルで `KeyC` を先に見る

- [ ] **Step 1: 失敗するテストを書く**

`tests/save-title-entry.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fakeInput(pressed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,   // _anyKeyOrClick が見る
        getTypedChars: () => [],
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 34500;
    g.totalTime = 1000;
    g.missionsCompleted = 3;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.gameState = 'title';
    g.stateTimer = 0;
    g.resetCalls = 0;
    g.restartCalls = 0;
    g.input = fakeInput();
    g.stateManager = {
        resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; },
        restart() { g.restartCalls++; },
    };
    g._restoreFullscreen = () => {};
    g._handleDemoJump = () => false;
    g._enterDemoState = () => {};
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

function storageWithSave() {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.saveHere();
    return storage;
}

test('タイトルで C を押すとセーブ地点から再開する', async () => {
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['KeyC']) });
    game._updateTitle(16);
    assert.equal(game.gameState, 'playing');
    assert.equal(game.resetCalls, 1);
    assert.equal(game.restartCalls, 0, '1面からのやり直しにならない');
    assert.equal(game.runTries, 2, 'タイトル経由でもトライ数は増える');
});

test('セーブが無ければ C はキーとして無視され、何も始まらない', () => {
    // C は _anyKeyOrClick() の対象外。セーブが無ければ横取りもされないので
    // タイトルに留まる（誤って C を押しても勝手にゲームが始まらない）
    const game = makeGame({ input: fakeInput(['KeyC']) });
    game._updateTitle(16);
    assert.equal(game.restartCalls, 0);
    assert.equal(game.gameState, 'title');
});

test('通常スタートしてもセーブは消えない', () => {
    // _anyKeyOrClick() が見るのは Enter とマウスクリックだけ（任意キーではない）
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['Enter']) });
    game._updateTitle(16);
    assert.equal(game.restartCalls, 1);
    assert.equal(game.saveManager.save.missionsCompleted, 3, 'セーブは残る');
    assert.equal(game.runTries, 1, '新しいランなのでトライ数は 1');
    assert.equal(game.stageSelectRun, false);
});
```

`_anyKeyOrClick()`（`main.js:1664`）は `Enter` / 左クリック / 右クリックの3つだけを見る。上の `fakeInput` はその3つすべてに答える。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/save-title-entry.test.js`
Expected: FAIL

- [ ] **Step 3: `_updateTitle` に `C` を足す**

`A`/`D`（モード切替）の直後、`_handleDemoJump()` より前に入れる。デモの他画面には入れない — 入口はタイトルだけに集める。

```js
        // セーブがあるときだけ C を見る。_anyKeyOrClick() は Enter と
        // クリックしか見ないので、セーブが無ければ C は何もしないキーのまま
        if (this.canContinueHere() && this.input.isKeyPressed('KeyC')) {
            this._restoreFullscreen();
            this.continueFromSave();
            return;
        }
```

- [ ] **Step 4: `_startGameIfRequested()` に新しいランの初期化を足す**

```js
    _startGameIfRequested() {
        if (!this._anyKeyOrClick()) return false;
        this._restoreFullscreen();
        // 新しい通しラン。**セーブは消さない** — 誤って任意キーを押しても
        // 続きを失わないように、次にセーブが成立するまで残す
        this.runTries = 1;
        this.stageSelectRun = false;
        this.stateManager.restart();
        this.gameState = 'playing';
        audioManager.startBGM(this.missionsCompleted);
        return true;
    },
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- tests/save-title-entry.test.js`
Expected: PASS（3 tests）

- [ ] **Step 6: タイトルにヒント行を足す**

`ScreenRenderer` に足し、`drawTitleScreen` の `this._drawModeSelector(ctx, canvas);` の直後で呼ぶ。

```js
    /**
     * タイトル下部の追加ヒント。**行が出ている＝使える**を保つため、
     * 使えないものは行ごと出さない。どの面から再開するのかとモードを必ず
     * 書く — タイトルで A/D を触った後、再開時にモードが保存値へ固定される
     * ことと食い違って見えるため。
     */
    _drawSaveHints(ctx, canvas) {
        const sm = this.game.saveManager;
        const lines = [];
        if (sm && sm.save) {
            const s = sm.save;
            const modeLabel = MODES[s.mode] ? MODES[s.mode].label : s.mode;
            lines.push(`[C] CONTINUE - STAGE ${s.missionsCompleted + 1} / ${modeLabel}  (TRY ${s.tries})`);
        }
        if (sm && sm.reached >= 1) lines.push('[S] STAGE SELECT');
        if (lines.length === 0) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('small', true);
        ctx.fillStyle = UI.gold;
        glow(ctx, UI.gold, 'mid');
        lines.forEach((t, i) => ctx.fillText(t, canvas.width / 2, canvas.height - 28 + i * 16));
        ctx.restore();
        ctx.textAlign = 'left';
    }
```

import を足す（`MODES` が未 import なら）。

```js
import { MODES } from '../utils/modes.js';
```

**モードセレクタが `canvas.height - 74` に描かれているので、2行が重ならないか確認すること。** 重なるなら `canvas.height - 28` の基準を下げるのではなく、モードセレクタの `rowY` を上げるより先に**実機で見てもらう**（[[manual-verification-by-user]]）。

- [ ] **Step 7: 描画のテストを足す**

```js
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

test('タイトルのヒントは再開する面とモードを出す', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game)._drawSaveHints(ctx, game.canvas);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.some((t) => t.includes('STAGE 4') && t.includes('NORMAL') && t.includes('TRY 1')), texts.join(' | '));
});

test('セーブも到達も無ければヒントを出さない', async () => {
    const game = makeGame();
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game)._drawSaveHints(ctx, game.canvas);
    assert.equal(ctx.calls.filter((c) => c.name === 'fillText').length, 0);
});
```

- [ ] **Step 8: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 9: コミット**

```bash
git add tests/save-title-entry.test.js src/js/ui/ScreenRenderer.js
git add -p src/js/main.js
git commit -m "feat: タイトルから C でセーブ地点に戻れるようにする"
```

---

### Task 7: 面セレクト画面

**Files:**
- Modify: `src/js/main.js`（`gameState` のコメント 177 行、`_update()` の分岐 358-370 行、`draw()` 1490-1512 行、`_updateTitle()`）
- Modify: `src/js/ui/ScreenRenderer.js`
- Test: `tests/stage-select.test.js`

**Interfaces:**
- Consumes: Task 3 の `game.saveManager` / `game.stageSelectRun`
- Produces:
  - `gameState: 'stage_select'`
  - `game.stageSelectIndex: number` — 1..`reached`
  - `game._updateStageSelect(): void`
  - `game._startStageSelectRun(stage: number): void`
  - `ScreenRenderer.drawStageSelect(ctx): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/stage-select.test.js` を新規作成する。`makeGame` は Task 6 のものに `_updateStageSelect` / `_startStageSelectRun` を足した形で書く（**「Task 6 と同じ」で済ませず、このファイルに丸ごと書く**）。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fakeInput(pressed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,   // _anyKeyOrClick が見る
        getTypedChars: () => [],
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 0;
    g.totalTime = 0;
    g.missionsCompleted = 0;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.gameState = 'stage_select';
    g.stateTimer = 0;
    g.stageSelectIndex = 1;
    g.resetCalls = 0;
    g.restartCalls = 0;
    g.demoState = null;
    g.input = fakeInput();
    g.stateManager = {
        resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; },
        restart() { g.restartCalls++; },
    };
    g._restoreFullscreen = () => {};
    g._enterDemoState = (s) => { g.demoState = s; g.gameState = s; };
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

/** reached を n にした storage。 */
function storageReached(n) {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.recordReached(n);
    return storage;
}

test('A / D で選択が動き、1..reached で止まる', async () => {
    const storage = storageReached(3);
    let game = makeGame({ storage, stageSelectIndex: 1, input: fakeInput(['KeyA']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 1, '1 より下がらない');

    game = makeGame({ storage, stageSelectIndex: 1, input: fakeInput(['KeyD']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 2);

    game = makeGame({ storage, stageSelectIndex: 3, input: fakeInput(['KeyD']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 3, 'reached を超えない');
});

test('W でその面から始まる', async () => {
    const game = makeGame({
        storage: storageReached(5), stageSelectIndex: 4, input: fakeInput(['KeyW']),
    });
    game._updateStageSelect();
    assert.equal(game.gameState, 'playing');
    assert.equal(game.missionsCompleted, 3, '4面 = missionsCompleted 3');
    assert.equal(game.stageSelectRun, true);
    assert.equal(game.score, 0);
    assert.equal(game.totalTime, 0);
    assert.equal(game.stageResults.length, 0);
    assert.equal(game.resetCalls, 1);
    assert.equal(game.lastResetScore, false, 'resetLevel(true) だと missionsCompleted が 0 に戻ってしまう');
});

test('Escape でタイトルへ戻る', async () => {
    const game = makeGame({ storage: storageReached(3), input: fakeInput(['Escape']) });
    game._updateStageSelect();
    assert.equal(game.demoState, 'title');
});

test('面セレクトのランはトライ数 1', async () => {
    const game = makeGame({
        storage: storageReached(2), stageSelectIndex: 2, input: fakeInput(['KeyW']),
    });
    game._updateStageSelect();
    assert.equal(game.runTries, 1);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/stage-select.test.js`
Expected: FAIL（`_updateStageSelect is not a function`）

- [ ] **Step 3: `main.js` に状態を足す**

177行の `gameState:` のコメントに `| 'stage_select'` を足し、初期フィールドに追加する。

```js
    stageSelectIndex: 1,  // 面セレクトで選んでいる面（1..saveManager.reached）
```

`_update()` の分岐に足す。

```js
            case 'stage_select': return this._updateStageSelect();
```

メソッドを足す（`_updateTitle` の近く）。

```js
    /**
     * 面セレクト。**タイムアタック用**なので、選んだ面だけを単独で遊ぶ。
     * キーはタイトル（A/D で選ぶ）と面クリア画面（W で進む）に揃えてある
     * ——新しい決定キーを増やさないため。
     */
    _updateStageSelect() {
        const max = this.saveManager.reached;
        if (this.input.isKeyPressed('Escape')) {
            this._enterDemoState('title');
            return;
        }
        if (this.input.isKeyPressed('KeyA')) {
            this.stageSelectIndex = Math.max(1, this.stageSelectIndex - 1);
            return;
        }
        if (this.input.isKeyPressed('KeyD')) {
            this.stageSelectIndex = Math.min(max, this.stageSelectIndex + 1);
            return;
        }
        if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed()) {
            this._startStageSelectRun(this.stageSelectIndex);
        }
    },

    /**
     * 面セレクトから始める。スコアもタイムも 0 から。
     * resetLevel(true) を使わないのは、あちらが missionsCompleted を
     * debugStartMission へ戻してしまい、選んだ面が無視されるため。
     */
    _startStageSelectRun(stage) {
        this._restoreFullscreen();
        this.stageSelectRun = true;
        this.runTries = 1;
        this.missionsCompleted = stage - 1;
        this.score = 0;
        this.totalTime = 0;
        this.stageResults = [];
        this.gameState = 'playing';
        this.stateManager.resetLevel(false);
        audioManager.startBGM(this.missionsCompleted);
    },
```

`_updateTitle` に `S` の入口を足す（Task 6 で足した `C` の直後）。

```js
        if (this.saveManager.reached >= 1 && this.input.isKeyPressed('KeyS')) {
            this.stageSelectIndex = 1;
            this.gameState = 'stage_select';
            this.stateTimer = 0;
            return;
        }
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/stage-select.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: 描画を足す**

`ScreenRenderer` に追加する。

```js
    /**
     * 面セレクト。**デモの巡回には入れない**ので、位置ドットは出さない。
     * 「記録は面別ランキングにのみ残る」を明記するのは、週スコアランキングに
     * 出ないことを遊ぶ前に知らせるため。
     */
    drawStageSelect(ctx) {
        const canvas = this.game.canvas;
        const max = this.game.saveManager.reached;
        const picked = this.game.stageSelectIndex;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        ctx.fillStyle = UI.ok;
        glow(ctx, UI.ok, 'hard');
        ctx.fillText('STAGE SELECT', canvas.width / 2, 90);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('small');
        ctx.fillStyle = UI.info;
        ctx.fillText('TIME ATTACK — RECORDED IN STAGE RANKINGS ONLY', canvas.width / 2, 124);
        ctx.restore();

        // 面の並び。選んでいるものだけ色と枠を与え、他は落とす
        const GAP = 74;
        const left = canvas.width / 2 - ((max - 1) * GAP) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let n = 1; n <= max; n++) {
            const x = left + (n - 1) * GAP;
            const y = canvas.height / 2;
            const on = n === picked;
            // STAGE_PALETTES は { fill, border } の2色。面別ランキング画面と
            // 同じ配色を使うことで「何面の色か」が両画面で一致する
            const tint = STAGE_PALETTES[n - 1].fill;
            ctx.font = font('head', true);
            ctx.fillStyle = on ? tint : UI.dim;
            if (on) glow(ctx, tint, 'mid');
            ctx.fillText(String(n), x, y);
            if (on) {
                ctx.strokeStyle = tint;
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 22, y - 22, 44, 44);
            }
        }
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font('sub', true);
        ctx.fillStyle = UI.ink;
        ctx.fillText('[A] [D] SELECT    [W] START    [ESC] BACK', canvas.width / 2, canvas.height - 70);
        ctx.restore();

        drawScanlines(ctx, canvas.width, canvas.height);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
```

`STAGE_PALETTES`（`Constants.js:675`）は `{ fill, border }` の7要素。`import { STAGE_PALETTES } from '../utils/Constants.js';` が `ScreenRenderer.js` に既にあるか確認し、無ければ足す。

`draw()` に分岐を足す。**`DEMO_SCREEN_DRAWERS` の表には入れない** — あの表を通ると位置ドットが描かれ、デモ巡回の一部に見えてしまう。

```js
        if (this.gameState === 'stage_select') {
            this.screenRenderer.drawStageSelect(ctx);
            return;
        }
```

（`const drawDemoScreen = ...` の直前に置く。）

- [ ] **Step 6: 描画のテストを足す**

```js
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

test('面セレクト画面は到達した数だけ番号を描く', async () => {
    const game = makeGame({ storage: storageReached(4), stageSelectIndex: 2 });
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawStageSelect(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    for (const n of ['1', '2', '3', '4']) assert.ok(texts.includes(n), `${n} が無い: ${texts.join(' | ')}`);
    assert.ok(!texts.includes('5'), '未到達の面は出さない');
    assert.ok(texts.some((t) => t.includes('STAGE RANKINGS ONLY')));
    // 選択中の1つだけ枠が付く
    assert.equal(ctx.calls.filter((c) => c.name === 'strokeRect').length, 1);
});
```

- [ ] **Step 7: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add tests/stage-select.test.js src/js/ui/ScreenRenderer.js
git add -p src/js/main.js
git commit -m "feat: 到達済みの面を選んで遊べる面セレクトを足す"
```

---

### Task 8: 面セレクトのランを週スコアランキングから外す

**Files:**
- Modify: `src/js/main.js`（`_tryGoToRanking()` 1638-1650 行、`_updateRankingEntry()` 740-780 行）
- Test: `tests/stage-select-ranking.test.js`

**Interfaces:**
- Consumes: Task 7 の `game.stageSelectRun`
- Produces: `_tryGoToRanking()` と `_updateRankingEntry()` が `stageSelectRun` のとき週スコアを一切触らない

- [ ] **Step 1: 失敗するテストを書く**

`tests/stage-select-ranking.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.score = 999999;
    g.missionsCompleted = 3;
    g.totalTime = 1000;
    g.stageResults = [];
    g.stageSelectRun = false;
    g.runTries = 1;
    g.gameState = 'gameover';
    g.playerNameInput = '';
    g.highScoreCalls = 0;
    g.submitCalls = 0;
    g.highScoreManager = {
        isHighScore: () => true,
        addScore() { g.highScoreCalls++; return 0; },
    };
    g._enterDemoState = (s) => { g.gameState = s; };
    g._anyStageWouldRank = () => false;
    return Object.assign(g, over);
}

test('通しランは従来どおり週ハイスコアで名前入力へ行く', async () => {
    const game = makeGame();
    game._tryGoToRanking();
    assert.equal(game.gameState, 'ranking_entry');
});

test('面セレクトのランは週ハイスコアでは名前入力へ行かない', async () => {
    const game = makeGame({ stageSelectRun: true });
    game._tryGoToRanking();
    assert.equal(game.gameState, 'title');
});

test('面セレクトでも面別トップ5なら名前入力へ行く', async () => {
    const game = makeGame({ stageSelectRun: true, _anyStageWouldRank: () => true });
    game._tryGoToRanking();
    assert.equal(game.gameState, 'ranking_entry');
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/stage-select-ranking.test.js`
Expected: FAIL（2本目が `ranking_entry` になる）

- [ ] **Step 3: `_tryGoToRanking()` を書き換える**

```js
    _tryGoToRanking() {
        // Eligible to name if the overall run is a high score OR any cleared stage
        // would make its per-stage top 5 (so partial runs can still leave a record).
        // **面セレクトのランは週スコアに出さない**ので、週ハイスコアの側は見ない。
        // 単独の1面だけを遊んだ記録が通しランと同じ表に並ぶのは筋が通らないため。
        const weeklyEligible = !this.stageSelectRun && this.highScoreManager.isHighScore(this.score);
        const eligible = weeklyEligible || this._anyStageWouldRank();
        ...
```

- [ ] **Step 4: `_updateRankingEntry()` の登録側も塞ぐ**

`if (this.highScoreManager.isHighScore(this.score)) {` を書き換える。

```js
                // 面セレクトのランは週スコアへ登録しない（送信もしない）。
                // 判定側(_tryGoToRanking)だけを塞ぐと、面別で名前入力に来たときに
                // ここが通ってしまう
                if (!this.stageSelectRun && this.highScoreManager.isHighScore(this.score)) {
```

- [ ] **Step 5: `_updateRankingEntry` のテストを足す**

`tests/stage-select-ranking.test.js` に追記する。`_updateRankingEntry` は名前確定後に `stageRankingManager.addStageResult()` と `onlineLeaderboard.submitStages()`（URL があるときだけ）も呼ぶので、その2つを与える。`getCountryCode()` はブラウザの API を見るが、取れなければ空文字を返すので node でも落ちない。

```js
test('面セレクトのランは週スコアに登録も送信もしない', () => {
    const game = makeGame({
        stageSelectRun: true,
        gameState: 'ranking_entry',
        playerNameInput: 'ABC',
        stageResults: [{ stage: 4, timeMs: 30000, score: 8000 }],
        stageRankingManager: { addStageResult: () => {} },
        onlineLeaderboard: null,   // URL 無し = submitStages も呼ばれない
        input: { getTypedChars: () => ['Enter'] },
        _restoreFullscreen: () => {},
    });
    game._submitOnline = async () => { game.submitCalls++; };
    game._updateRankingEntry();
    assert.equal(game.highScoreCalls, 0, '週ランキングに入れない');
    assert.equal(game.submitCalls, 0, 'オンラインにも送らない');
    assert.equal(game.gameState, 'local_ranking_display', '面別の保存は通る');
});
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npm test -- tests/stage-select-ranking.test.js`
Expected: PASS（4 tests）

- [ ] **Step 7: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add tests/stage-select-ranking.test.js
git add -p src/js/main.js
git commit -m "feat: 面セレクトの記録を週スコアランキングから外す"
```

---

### Task 9: トライ数をローカルの週ランキングへ

**Files:**
- Modify: `src/js/systems/HighScoreManager.js`（`addScore()` 74-92 行）
- Modify: `src/js/main.js`（`_updateRankingEntry()` の `addScore` 呼び出し）
- Modify: `src/js/ui/ScreenRenderer.js`（`RANKING_COLUMNS` 678-686 行、`_drawRankingList` の `values`）
- Test: `tests/HighScoreManager.test.js`（追記）、`tests/ranking-tries-column.test.js`（新規）

**Interfaces:**
- Consumes: Task 3 の `game.runTries`
- Produces:
  - `HighScoreManager.addScore(name, score, mission, clearTime, country, tries = 1)` — エントリに `tries` が入る
  - 並びは `score 降順 → tries 昇順`
  - `RANKING_COLUMNS` に `{ key: 'tries', label: 'TRY', x: 346, align: 'right', font: font('small', true) }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/HighScoreManager.test.js` の末尾に追記する。このファイルは `beforeEach(() => installStorage())` で `globalThis.localStorage` を差し替え、各テストが `await import(...)` してから `new HighScoreManager('2026-W10')` する形。その流儀に合わせる。

```js
test('同点ならトライ数が少ないほうが上', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  m.addScore('AAA', 50000, 5, null, '', 3);
  m.addScore('BBB', 50000, 5, null, '', 1);
  const top = m.getTop10();
  assert.equal(top[0].name, 'BBB');
  assert.equal(top[1].name, 'AAA');
});

test('tries を渡さない旧来の呼び方は 1 として扱う', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  m.addScore('AAA', 50000, 5);
  assert.equal(m.getTop10()[0].tries, 1);
});

test('スコアが違えばトライ数は順位を動かさない', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  m.addScore('AAA', 60000, 5, null, '', 9);
  m.addScore('BBB', 50000, 5, null, '', 1);
  assert.equal(m.getTop10()[0].name, 'AAA');
});

test('保存して読み直してもトライ数が残る', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  new HighScoreManager('2026-W10').addScore('AAA', 50000, 5, null, '', 4);
  assert.equal(new HighScoreManager('2026-W10').getTop10()[0].tries, 4);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/HighScoreManager.test.js`
Expected: FAIL

- [ ] **Step 3: `HighScoreManager.addScore()` を書き換える**

```js
    /**
     * @param {number} [tries=1] セーブ地点から何回目の挑戦か。
     *   **同点のときだけ**順位に効く（少ないほうが上）。スコアそのものは
     *   減らさない——セーブの 10000 点コストで既に払っているので二重取りにしない。
     */
    addScore(name, score, mission, clearTime = null, country = '', tries = 1) {
        const entry = {
            name: (name || 'AAA').toUpperCase().substring(0, 10),
            score: score,
            mission: mission,
            clearTime: clearTime,
            country: country || '',
            tries: Number(tries) || 1,
        };
        this.scores.push(entry);
        this.scores.sort((a, b) => (b.score - a.score) || ((Number(a.tries) || 1) - (Number(b.tries) || 1)));
        ...
```

`_load()` で読んだ古いエントリには `tries` が無いので、`sort` 側の `|| 1` で吸収する（読み込み時に書き換えない — 保存を汚さないため）。

- [ ] **Step 4: `main.js` から `runTries` を渡す**

```js
                    this.localRankIndex = this.highScoreManager.addScore(
                        this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries
                    );
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- tests/HighScoreManager.test.js`
Expected: PASS

- [ ] **Step 6: ランキング表に `TRY` 列を足す**

列の座標は既存の `name` (x=226, left) と `flag` (x=354, left) の間に入れる。body 16px の等幅なら名前10文字で約96px（226→322）なので、`TRY` を x=346 の右揃え・`small` フォントにすると 3 文字で約23px（323→346）に収まる。

```js
    static RANKING_COLUMNS = [
        { key: 'rank', label: 'RANK', x: 31, align: 'right' },
        { key: 'score', label: 'SCORE', x: 130, align: 'right' },
        { key: 'name', label: 'NAME', x: 226, align: 'left' },
        // TRY は名前の右端ぎりぎりに小さく置く。列を増やして表を広げると
        // 他の列の座標を全部引き直すことになるため、隙間に収めた
        { key: 'tries', label: 'TRY', x: 346, align: 'right', small: true },
        { key: 'flag', label: 'REGION', x: 354, align: 'left' },
        { key: 'mission', label: 'MISSION', x: 552, align: 'right' },
        { key: 'time', label: 'TIME', x: 632, align: 'right' },
    ];
```

`_drawRankingList` の `values` に足す。**`tries` が 1 のときは空文字**にする（既存のループは `if (!text) continue;` で飛ばすので、それだけで出なくなる）。

```js
                tries: (Number(entry.tries) || 1) >= 2 ? `T${Number(entry.tries)}` : '',
```

`small: true` の列だけフォントを変える。行のループ内、`for (const c of cols)` の先頭で:

```js
            for (const c of cols) {
                const text = values[c.key];
                if (!text) continue;
                ctx.textAlign = c.align;
                // TRY だけ小さく描く。名前の隙間に置いているので、body だと溢れる
                ctx.font = c.small ? font('small', true) : font('body', true);
```

空き枠を描くループにも `if (!text) continue;` 相当が要る。空き枠は `c.key === 'rank' ? ... : '·····'` を描いているので、`tries` 列だけ飛ばす:

```js
                for (const c of cols) {
                    if (c.key === 'tries') continue;   // 空き枠に T の点線は出さない
                    ctx.textAlign = c.align;
                    ctx.fillText(c.key === 'rank' ? `${index + 1}.` : '·····', left + c.x, rowY);
                }
```

見出し行も `TRY` が出る（`label: 'TRY'`）。見出しは `font('small', true)` で描かれているので追加の分岐は要らない。

- [ ] **Step 7: 列のテストを書く**

`tests/ranking-tries-column.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

function render(scores) {
    const game = { canvas: { width: 960, height: 720 } };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawLocalRanking(ctx, scores, -1, '2026-W33');
    return ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

test('トライ 2 以上だけ T の印が出る', () => {
    const texts = render([
        { name: 'AAA', score: 50000, mission: 5, clearTime: null, country: '', tries: 1 },
        { name: 'BBB', score: 40000, mission: 4, clearTime: null, country: '', tries: 3 },
    ]);
    assert.ok(texts.includes('T3'));
    assert.ok(!texts.includes('T1'), 'トライ 1 は印を出さない');
});

test('tries が無い旧データでも印を出さない', () => {
    const texts = render([{ name: 'AAA', score: 50000, mission: 5, clearTime: null, country: '' }]);
    assert.ok(!texts.some((t) => /^T\d+$/.test(t)));
});

test('見出しに TRY が出る', () => {
    assert.ok(render([]).includes('TRY'));
});
```

- [ ] **Step 8: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 9: コミット**

```bash
git add src/js/systems/HighScoreManager.js src/js/ui/ScreenRenderer.js tests/HighScoreManager.test.js tests/ranking-tries-column.test.js
git add -p src/js/main.js
git commit -m "feat: 週ランキングにトライ数を持たせ、同点時のタイブレークにする"
```

---

### Task 10: トライ数をオンラインへ（GAS）

**Files:**
- Modify: `gas/Code.gs`（`validateEntry()` 67-75 行、`topNForWeek()` 77-86 行、`doPost()` の `var row = [...]` 223 行付近）
- Modify: `src/js/main.js`（`_submitOnline()` 728-738 行、呼び出し側）
- Test: `tests/gas-core.test.js`（追記）
- Modify: `docs/superpowers/specs/2026-07-15-gas-setup.md`（列追加の手順を追記）

**Interfaces:**
- Consumes: Task 9 の `entry.tries`
- Produces:
  - `Scores` シートの列は `[timestamp, weekId, name, score, mission, clearTime, country, tries]`（`tries` は index 7）
  - `validateEntry()` の返り値に `tries`
  - `topNForWeek()` が `tries` を返し、同点時に昇順で並べる

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-core.test.js` に追記する（既存の `ctx` の作り方に乗る）。

```js
test('validateEntry は tries を受け取り、無ければ 1 にする', () => {
  const withTries = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5, tries: 3 });
  assert.equal(withTries.ok, true);
  assert.equal(withTries.value.tries, 3);

  const without = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5 });
  assert.equal(without.value.tries, 1);
});

test('validateEntry は壊れた tries を 1 に落とす', () => {
  for (const bad of ['x', -5, 0, null, 1e9]) {
    const v = ctx.validateEntry({ name: 'AAA', score: 50000, mission: 5, tries: bad });
    assert.equal(v.ok, true);
    assert.ok(v.value.tries >= 1 && v.value.tries <= 999, String(bad));
  }
});

test('topNForWeek は同点でトライ数が少ないほうを上にする', () => {
  const rows = [
    [new Date(), '2026-W33', 'AAA', 50000, 5, '', 'JP', 3],
    [new Date(), '2026-W33', 'BBB', 50000, 5, '', 'JP', 1],
    [new Date(), '2026-W33', 'CCC', 60000, 6, '', 'JP', 9],
  ];
  const top = ctx.topNForWeek(rows, '2026-W33', 10);
  assert.deepEqual(top.map(function (e) { return e.name; }), ['CCC', 'BBB', 'AAA']);
  assert.equal(top[0].tries, 9);
});

test('topNForWeek は tries 列が無い旧行を 1 として扱う', () => {
  const rows = [
    [new Date(), '2026-W33', 'AAA', 50000, 5, '', 'JP', 2],
    [new Date(), '2026-W33', 'OLD', 50000, 5, '', 'JP'],   // 列が無い
  ];
  const top = ctx.topNForWeek(rows, '2026-W33', 10);
  assert.equal(top[0].name, 'OLD');
  assert.equal(top[0].tries, 1);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/gas-core.test.js`
Expected: FAIL

- [ ] **Step 3: `gas/Code.gs` を書き換える**

`validateEntry()`:

```js
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'bad-body' };
  var score = Number(entry.score);
  if (!isFinite(score) || Math.floor(score) !== score) return { ok: false, reason: 'bad-score' };
  if (score <= MIN_SCORE || score > SCORE_CAP) return { ok: false, reason: 'score-range' };
  var mission = Math.min(7, Math.max(1, Math.floor(Number(entry.mission) || 1)));
  var clearTime = (typeof entry.clearTime === 'string' && entry.clearTime) ? entry.clearTime : null;
  // トライ数は同点時のタイブレークにしか使わないので、壊れていても弾かず 1 に落とす。
  // ここで reject すると、送れないクライアントのスコアが丸ごと失われる
  var tries = Math.min(999, Math.max(1, Math.floor(Number(entry.tries) || 1)));
  return { ok: true, value: { name: sanitizeName(entry.name), score: score, mission: mission, clearTime: clearTime, country: sanitizeCountry(entry.country), tries: tries } };
}
```

`topNForWeek()`:

```js
function topNForWeek(rows, weekId, n) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) === weekId) {
      // tries 列(index 7)は後から足した。列が無い旧行は 1 とみなす
      out.push({ name: String(rows[i][2]), score: Number(rows[i][3]), mission: Number(rows[i][4]), clearTime: rows[i][5] || null, country: rows[i][6] || '', tries: Number(rows[i][7]) || 1 });
    }
  }
  // 同点はトライ数が少ないほうが上。スコア自体は減らさない
  out.sort(function (a, b) { return (b.score - a.score) || (a.tries - b.tries); });
  return out.slice(0, n);
}
```

`doPost()` の行の組み立て:

```js
    var row = [now, weekId, entry.name, entry.score, entry.mission, entry.clearTime || '', entry.country || '', entry.tries];
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/gas-core.test.js`
Expected: PASS

- [ ] **Step 5: クライアントから送る**

`main.js` の `_submitOnline` に引数を足す。

```js
    async _submitOnline(name, score, mission, clearTime, country, tries) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime, country, tries, weekId: this.week.weekId });
```

呼び出し側（`_updateRankingEntry`）:

```js
                    this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries);
```

- [ ] **Step 6: 送信内容のテストを足す**

`tests/weekId-online-wiring.test.js` に追記する。このファイルは `Object.create(Game)` の `makeGame()` と、`submit` の引数を `submitCalls` に積む `makeFakeLeaderboard()` を既に持っているので、それをそのまま使う。

```js
test('_submitOnline は tries をペイロードに含める', async () => {
    const g = makeGame();
    await g._submitOnline('AAA', 20000, 4, null, 'JP', 4);
    assert.equal(g.onlineLeaderboard.submitCalls[0].tries, 4);
});

test('_updateRankingEntry は runTries をそのまま送る', () => {
    const g = makeGame({
        input: { getTypedChars: () => ['Enter'] },
        playerNameInput: 'AAA',
        missionsCompleted: 7,
        totalTime: 12345,
        score: 999999,
        runTries: 3,
        stageSelectRun: false,
        stageResults: [{ stage: 1, timeMs: 1000, score: 500 }],
        highScoreManager: { isHighScore: () => true, addScore: () => 0 },
        stageRankingManager: { addStageResult: () => {} },
        _restoreFullscreen: () => {},
    });
    g._updateRankingEntry();
    assert.equal(g.onlineLeaderboard.submitCalls[0].tries, 3);
});
```

- [ ] **Step 7: 全件を回す**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 8: 手動作業の手順を書く**

`docs/superpowers/specs/2026-07-15-gas-setup.md` の 3b 節の末尾に追記する。

```markdown
### `tries` 列の追加（2026-08-16、途中セーブ）

`Scores` シートの H 列（7列目の右）にヘッダ `tries` を足す。既存の行は空のまま
でよい（`topNForWeek` が `Number(x) || 1` で 1 とみなす）。列を足してから:

    clasp push
    clasp create-deployment -i <デプロイID>

`-i` を忘れると新しい URL が発行され `LEADERBOARD_URL` の変更が要る。
反映は `clasp pull` して diff を取るまで信じないこと。
```

- [ ] **Step 9: コミット**

```bash
git add gas/Code.gs tests/gas-core.test.js docs/superpowers/specs/2026-07-15-gas-setup.md
git add -p src/js/main.js
git commit -m "feat: オンラインの週ランキングにトライ数を送る"
```

---

### Task 11: 通しで確かめて引き渡す

**Files:**
- Modify: なし（見つかった不備があればその場で直す）

- [ ] **Step 1: 全件を回す**

Run: `npm test`
Expected: 全件 PASS。開始時 1326 件 ＋ 今回追加分

- [ ] **Step 2: 作業ツリーに余計なものが混ざっていないか見る**

Run: `git status --short && git diff origin/main --stat`
Expected: `src/js/main.js` に `debugStartMission: 6` が紛れ込んでいないこと。紛れていたら本番値 0 に戻す

Run: `grep -n "debugStartMission" src/js/main.js`

- [ ] **Step 3: 定数の置き場を確かめる**

Run: `grep -rn "10000\|9000\|4000" src/js/main.js src/js/systems/SaveManager.js src/js/ui/ScreenRenderer.js`
Expected: セーブコストとカウントダウンの数値が直書きされておらず、`Constants.js` から import されていること

- [ ] **Step 4: ユーザーへ引き渡す**

以下を伝える。

- **ハードリロード（Cmd+Shift+R）が要る**（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため）
- 確認してほしいところと、対応する調整用の定数:

| 確認ポイント | 調整する定数 |
|---|---|
| セーブの重さ（10000点は高すぎ／安すぎか） | `Constants.SAVE_COST` |
| ゲームオーバーの CONTINUE? が出ている長さ | `Constants.CONTINUE_COUNTDOWN_MS`（9000） |
| 面クリア画面の3行が枠に収まるか | `ScreenRenderer._drawSaveOption` の y |
| タイトルのヒント2行がモードセレクタと重なっていないか | `ScreenRenderer._drawSaveHints` の y と `_drawModeSelector` の `rowY` |
| 面セレクトの並びと操作感 | `ScreenRenderer.drawStageSelect` の `GAP` |
| ランキング表の `TRY` 列が名前と衝突しないか（10文字の名前で確認） | `RANKING_COLUMNS` の `tries.x` |

- **オンラインのトライ数はまだ動かない。** `Scores` シートに `tries` 列を足して
  `clasp push` → `clasp create-deployment -i <デプロイID>` を済ませるまで、
  送っても列が無いので保存されない（ローカル側は動く）。手順は
  `docs/superpowers/specs/2026-07-15-gas-setup.md` の 3b 節。

- [ ] **Step 5: memory を更新する**

`hoverattack-next-phase-b.md` の⑶を「実装済み・実機確認待ち」に書き換え、
`hoverattack-phase-plan.md` の「現在地」に今回のコミット範囲とテスト件数、
GAS の手動作業が残っていることを追記する。
