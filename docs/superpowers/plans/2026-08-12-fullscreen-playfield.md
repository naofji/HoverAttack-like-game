# プレイフィールドの全画面表示 実装計画

> **注意（2026-08-12 実装完了後に追記）**: この計画は着手前のスナップショットで、**出荷した実装とは4点ずれている**（`pointer.js` の潰れた rect の扱い、`toggleFullscreen` の引数、`M` キーの `ranking_entry` 除外、`Input.js` の `blur` / `resize` / `fullscreenchange`）。出荷内容は `docs/superpowers/specs/2026-08-12-fullscreen-playfield-design.md` が正。以下は履歴として残している。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** canvas を 4:3 維持でウィンドウいっぱいに拡大し、カーソルがフィールド外に出ても照準と射撃が効き続けるようにする。

**Architecture:** canvas の内部解像度（1024×768）は据え置き、CSS の `min()` で表示サイズだけを拡大する（ゲームバランスに影響する `CANVAS_WIDTH` 参照を一切変えないため）。マウスのリスナを canvas から `window` へ移し、client 座標 → canvas 座標の変換（拡大率の割り戻し＋範囲クランプ）を純関数 `pointer.js` に切り出してテストする。`M` キーで Fullscreen API をトグルする。

**Tech Stack:** バニラ ES modules、canvas 2D、ビルド工程なし。テストは `node --test`（DOM なし・AudioContext なし）。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-08-12-fullscreen-playfield-design.md`
- **canvas の内部解像度 1024×768（`CANVAS_WIDTH` / `CANVAS_HEIGHT`）は変更しない。** 索敵距離・音のパン幅・UI レイアウトがこれを基準にしており、変えるとゲームバランスが変わる。
- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する。`src/js/main.js` にはユーザーがデバッグ用に置いた未コミットの `debugStartMission: 6` があり、一括ステージすると巻き込む。**このタスクで `src/js/main.js` を add するときは `git add -p` で自分のハンクだけを選ぶこと。**
- コメントは日本語で、「なぜそうしたか」を書く。何をしているかはコードが語る。
- 数値を決めたら根拠（計算式や実測値）をコメントに残す。
- 全テストは `npm test` で走り 1 秒弱で終わる。単体は `npm test -- tests/xxx.test.js`。
- 実機での見た目の確認はユーザーが行う。ローカルサーバーは立てない。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/js/utils/pointer.js`（新規） | client 座標 → canvas 座標の変換1つだけ。DOM に触らない純関数 |
| `tests/pointer.test.js`（新規） | 上記の等倍・拡大・縮小・クランプ・0除算 |
| `src/js/utils/fullscreen.js`（新規） | Fullscreen API のトグル1つだけ。API 不在でも黙る |
| `tests/fullscreen.test.js`（新規） | 偽 document を差し込んで入る／出る／落ちない |
| `src/js/utils/Input.js`（変更） | リスナを window に移し、座標計算を `pointer.js` に委譲 |
| `src/style.css`（変更） | 4:3 維持の拡大、枠の削除、カーソル非表示の body 化 |
| `src/js/main.js`（変更） | `M` キーで `toggleFullscreen()` を呼ぶ1行 |

タスク順は依存順（`pointer` → `Input` → `fullscreen` → `main.js` → CSS）。CSS を最後にするのは、入力側が直る前に拡大すると倍率ズレで照準が大きく狂って挙動が分かりにくくなるため。

---

### Task 1: 座標変換の純関数 `pointer.js`

**Files:**
- Create: `src/js/utils/pointer.js`
- Test: `tests/pointer.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `canvasPointer(rect, canvasW, canvasH, clientX, clientY) -> { x: number, y: number }`
  - `rect`: `{ left: number, top: number, width: number, height: number }`（`getBoundingClientRect()` 相当。DOMRect でも plain object でも動く）
  - 戻り値は `0 … canvasW - 1` / `0 … canvasH - 1` にクランプ済み。小数を含む（照準の滑らかさのため丸めない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/pointer.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasPointer } from '../src/js/utils/pointer.js';

const RECT_1X = { left: 0, top: 0, width: 1024, height: 768 };

test('等倍なら client 座標から rect のオフセットを引いた値になる', () => {
    const p = canvasPointer({ left: 100, top: 50, width: 1024, height: 768 }, 1024, 768, 300, 250);
    assert.deepEqual(p, { x: 200, y: 200 });
});

test('拡大表示では倍率を割り戻す', () => {
    // 1024 の canvas を 1440px 幅で表示 => 倍率 1.40625。720px は canvas 上の 512px
    const p = canvasPointer({ left: 0, top: 0, width: 1440, height: 1080 }, 1024, 768, 720, 540);
    assert.equal(p.x, 512);
    assert.equal(p.y, 384);
});

test('縮小表示でも倍率を割り戻す', () => {
    // 1024 の canvas を 512px 幅で表示 => 2倍に引き伸ばす
    const p = canvasPointer({ left: 0, top: 0, width: 512, height: 384 }, 1024, 768, 128, 96);
    assert.equal(p.x, 256);
    assert.equal(p.y, 192);
});

test('左上より外は 0 にクランプされる', () => {
    const p = canvasPointer(RECT_1X, 1024, 768, -50, -999);
    assert.deepEqual(p, { x: 0, y: 0 });
});

test('右下より外は canvas の端にクランプされる', () => {
    const p = canvasPointer(RECT_1X, 1024, 768, 5000, 5000);
    assert.deepEqual(p, { x: 1023, y: 767 });
});

test('rect の幅や高さが 0 でも NaN にならない', () => {
    const p = canvasPointer({ left: 0, top: 0, width: 0, height: 0 }, 1024, 768, 300, 300);
    assert.deepEqual(p, { x: 0, y: 0 });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npm test -- tests/pointer.test.js`
Expected: FAIL（`Cannot find module .../src/js/utils/pointer.js` でモジュール解決に失敗する）

- [ ] **Step 3: 実装を書く**

`src/js/utils/pointer.js` を新規作成:

```js
// ============================================
// マウス座標の変換
// ============================================

/** 値を lo〜hi に収める */
function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * ブラウザの client 座標を canvas の内部座標に直す。
 *
 * canvas は内部解像度 1024x768 のまま CSS で拡大表示しているので、
 * rect の実寸で割り戻さないと照準が倍率のぶんズレる。
 *
 * さらに canvas の範囲へクランプしている。リスナを window に付けたため
 * 黒帯やブラウザ UI の上でも座標が来るが、そこで照準を画面外へ飛ばすと
 * 敵に当たらなくなる。端に張り付かせるほうが操作として素直。
 *
 * @param {{left:number,top:number,width:number,height:number}} rect getBoundingClientRect() 相当
 * @param {number} canvasW canvas.width
 * @param {number} canvasH canvas.height
 * @param {number} clientX MouseEvent.clientX
 * @param {number} clientY MouseEvent.clientY
 * @returns {{x:number,y:number}} canvas 内部座標（0..canvasW-1 / 0..canvasH-1）
 */
export function canvasPointer(rect, canvasW, canvasH, clientX, clientY) {
    // 非表示中などで rect が潰れていると 0 除算で NaN になり、
    // 以降ずっと照準が壊れたままになる。倍率 1 として扱って逃がす。
    const scaleX = rect.width > 0 ? canvasW / rect.width : 1;
    const scaleY = rect.height > 0 ? canvasH / rect.height : 1;

    return {
        x: clamp((clientX - rect.left) * scaleX, 0, canvasW - 1),
        y: clamp((clientY - rect.top) * scaleY, 0, canvasH - 1)
    };
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npm test -- tests/pointer.test.js`
Expected: PASS（6 件）

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/pointer.js tests/pointer.test.js
git commit -m "feat: client 座標を canvas 座標へ直す canvasPointer を追加"
```

---

### Task 2: `Input` のリスナを window へ移す

**Files:**
- Modify: `src/js/utils/Input.js`（import 追加、`_setupListeners()` の 58-87 行）

**Interfaces:**
- Consumes: `canvasPointer(rect, canvasW, canvasH, clientX, clientY)`（Task 1）
- Produces: 公開 API は変わらない（`input.mouse.{x,y,left,right}` のまま）。`main.js` 側の変更は不要

**なぜ window に移すのか:** 現状 `mousemove` / `mousedown` / `mouseup` は `this.canvas` に登録されている。canvas の外ではイベントが届かないので撃てず、さらに canvas 内で押して外で離すと `mouseup` を取り逃がして `mouse.left` が `true` のまま残る（押しっぱなし判定）。`window` に移すとこの両方が消える。

- [ ] **Step 1: `canvasPointer` を import する**

`src/js/utils/Input.js` の先頭、`PREVENT_DEFAULT_KEYS` の定義より上に足す:

```js
import { canvasPointer } from './pointer.js';
```

- [ ] **Step 2: マウスのリスナ4つを書き換える**

`src/js/utils/Input.js` の 58-87 行（`this.canvas.addEventListener('mousemove', ...)` から `contextmenu` のブロックまで）を、まるごと次に置き換える:

```js
        // リスナを canvas ではなく window に付けている。canvas に付けていた頃は
        // カーソルが canvas の外に出た瞬間にイベントが止まって撃てなくなり、
        // さらに canvas 内で押して外で離すと mouseup を取り逃がして
        // mouse.left が true のまま残っていた（押しっぱなし判定になる）。
        window.addEventListener('mousemove', (e) => {
            const { x, y } = canvasPointer(
                this.canvas.getBoundingClientRect(),
                this.canvas.width, this.canvas.height,
                e.clientX, e.clientY
            );

            if (this.mouse.x !== x || this.mouse.y !== y) {
                this.mouse.x = x;
                this.mouse.y = y;

                if (this.crosshairLocked) {
                    this.crosshairLocked = false;
                    console.log('Crosshair Unlocked (Mouse Moved)');
                }
            }
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.left = true;
            if (e.button === 2) this.mouse.right = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.left = false;
            if (e.button === 2) this.mouse.right = false;
        });

        // Prevent context menu for right-click grenade
        // 黒帯の上で右クリックしてもメニューが出ないよう、これも window に付ける
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
```

座標がクランプ後の値で比較されるため、端に張り付いている間はロックオンが解除されない。これは意図した挙動（照準が動いていないのだから解除しないほうが素直）。

- [ ] **Step 3: 既存の全テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（811 件。`Input` は DOM を要求するのでテスト対象外だが、import 経路が増えるので全体を回す）

- [ ] **Step 4: コミット**

```bash
git add src/js/utils/Input.js
git commit -m "fix: マウスのリスナを window に移し、canvas 外でも撃てるようにする"
```

---

### Task 3: 全画面トグル `fullscreen.js`

**Files:**
- Create: `src/js/utils/fullscreen.js`
- Test: `tests/fullscreen.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `toggleFullscreen(element, doc) -> void`
  - `element` 省略時は `document.documentElement`、`doc` 省略時は `document`
  - `doc` を引数で受けるのは、`node --test` に `document` が無いため偽物を差し込めるようにするため

- [ ] **Step 1: 失敗するテストを書く**

`tests/fullscreen.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleFullscreen } from '../src/js/utils/fullscreen.js';

/** requestFullscreen を記録する偽 element */
function fakeElement(result = Promise.resolve()) {
    const calls = [];
    return { calls, requestFullscreen: () => { calls.push('request'); return result; } };
}

/** exitFullscreen を記録する偽 document */
function fakeDoc(fullscreenElement, result = Promise.resolve()) {
    const calls = [];
    return { calls, fullscreenElement, exitFullscreen: () => { calls.push('exit'); return result; } };
}

test('全画面でなければ requestFullscreen を呼ぶ', () => {
    const el = fakeElement();
    const doc = fakeDoc(null);
    toggleFullscreen(el, doc);
    assert.deepEqual(el.calls, ['request']);
    assert.deepEqual(doc.calls, []);
});

test('全画面中なら exitFullscreen を呼ぶ', () => {
    const el = fakeElement();
    const doc = fakeDoc(el);
    toggleFullscreen(el, doc);
    assert.deepEqual(doc.calls, ['exit']);
    assert.deepEqual(el.calls, []);
});

test('requestFullscreen を持たない element でも例外を投げない', () => {
    assert.doesNotThrow(() => toggleFullscreen({}, fakeDoc(null)));
});

test('exitFullscreen を持たない document でも例外を投げない', () => {
    const el = fakeElement();
    assert.doesNotThrow(() => toggleFullscreen(el, { fullscreenElement: el }));
});

test('document 相当が無くても例外を投げない', () => {
    assert.doesNotThrow(() => toggleFullscreen(undefined, undefined));
});

test('reject する Promise を返しても未処理拒否にならない', async () => {
    const el = fakeElement(Promise.reject(new Error('denied')));
    toggleFullscreen(el, fakeDoc(null));
    // catch が付いていなければ、この await の間に unhandledRejection でプロセスが落ちる
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(el.calls, ['request']);
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npm test -- tests/fullscreen.test.js`
Expected: FAIL（`Cannot find module .../src/js/utils/fullscreen.js`）

- [ ] **Step 3: 実装を書く**

`src/js/utils/fullscreen.js` を新規作成:

```js
// ============================================
// 全画面トグル
// ============================================

/**
 * Fullscreen API を入る／出るで切り替える。
 *
 * 対象を documentElement にしているのは、CSS が 100vw / 100vh を基準に
 * canvas を拡大しているため。#game-container を全画面にすると vh の
 * 基準が変わって拡大の計算が素直に効かない。
 *
 * doc を引数で受けているのは node --test に document が無いから。
 * 呼び出し側は省略していい。
 *
 * @param {Element} [element] 全画面にする要素
 * @param {Document} [doc] fullscreenElement / exitFullscreen を持つオブジェクト
 */
export function toggleFullscreen(element, doc) {
    const d = doc ?? (typeof document !== 'undefined' ? document : null);
    if (!d) return;

    const el = element ?? d.documentElement;

    // Promise の reject を飲む。ユーザー操作を伴わない呼び出しはブラウザに
    // 拒否されるが、そのたびにコンソールへ未処理エラーを出す必要はない。
    if (d.fullscreenElement) {
        if (typeof d.exitFullscreen === 'function') {
            Promise.resolve(d.exitFullscreen()).catch(() => { });
        }
        return;
    }

    if (el && typeof el.requestFullscreen === 'function') {
        Promise.resolve(el.requestFullscreen()).catch(() => { });
    }
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npm test -- tests/fullscreen.test.js`
Expected: PASS（6 件）

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/fullscreen.js tests/fullscreen.test.js
git commit -m "feat: 全画面を入る／出るで切り替える toggleFullscreen を追加"
```

---

### Task 4: `M` キーを `main.js` に配線する

**Files:**
- Modify: `src/js/main.js`（import 部の 32 行付近、`update()` 内の 268 行付近）

**Interfaces:**
- Consumes: `toggleFullscreen(element, doc)`（Task 3）
- Produces: なし

**⚠ コミット時の注意:** `src/js/main.js` にはユーザーがデバッグ用に置いた未コミットの `debugStartMission: 6` がある（本番値は 0）。**`git add src/js/main.js` はしない。`git add -p src/js/main.js` で自分の2ハンクだけを選ぶ。**

- [ ] **Step 1: import を足す**

`src/js/main.js` の `import { getCurrentWeek, stageSeed } from './utils/WeekSeed.js';` の直後に足す:

```js
import { toggleFullscreen } from './utils/fullscreen.js';
```

- [ ] **Step 2: `update()` にキー処理を足す**

`src/js/main.js` の `update()` 内、`ShiftLeft` / `ShiftRight` のロックオンブロックの直後（`this._updateGameState(deltaTime);` の直前）に足す:

```js
        // どの画面でも M で全画面を切り替える。
        // カーソルが canvas の外に出やすいのが元々の不満だったので、
        // 画面いっぱいに広げて外に出る余地を減らす狙い。
        // なお全画面はブラウザ仕様で Escape でも解除される（ミッション離脱と
        // 同時に抜けてしまうが、こちらから止める手段はない）。
        if (this.input.isKeyPressed('KeyM')) toggleFullscreen();
```

`KeyM` は `Input.js` の `PREVENT_DEFAULT_KEYS` に既に入っているので、そちらの変更は要らない。

- [ ] **Step 3: 全テストが通るのを確認**

Run: `npm test`
Expected: PASS（`main.js` は DOM 無しでも import できるようガードされている）

- [ ] **Step 4: 自分のハンクだけをコミット**

```bash
git add -p src/js/main.js
# import の追加と update() の追加、2ハンクだけ y。
# debugStartMission の行が出てきたら必ず n。
git diff --cached src/js/main.js   # debugStartMission が含まれていないことを目で確認
git commit -m "feat: M キーで全画面を切り替える"
```

`git diff --cached` に `debugStartMission` が現れたら `git restore --staged src/js/main.js` でやり直す。

---

### Task 5: CSS で 4:3 維持の拡大

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Consumes: なし（Task 1・2 の座標変換が入っていることが前提。倍率の割り戻しが無い状態で拡大すると照準が大きくズレる）
- Produces: なし

- [ ] **Step 1: `#game-container` と `canvas` と `body` を書き換える**

`src/style.css` の `#game-container` ブロックと `canvas` ブロックを次に置き換え、`body` に `cursor: none;` を足す:

```css
body {
    margin: 0;
    padding: 0;
    background-color: #111;
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-family: 'Space Mono', 'Courier New', Courier, monospace;
    overflow: hidden;
    /* 4:3 でない画面に出る黒帯の上でも矢印を見せない。
       canvas だけに cursor:none を掛けていた頃は帯の上で矢印が復活していた */
    cursor: none;
}

#game-container {
    position: relative;
    /* 画面いっぱいに広げるので、枠と外側の光は邪魔になるだけなので落とした */
}

canvas {
    display: block;
    background-color: #000;
    image-rendering: pixelated;
    cursor: none;

    /* 内部解像度 1024x768 は据え置きのまま、表示だけ 4:3 を保って最大化する。
       133.334vh = 100vh * 4/3、75vw = 100vw * 3/4。
       幅と高さの両方に min() を掛けると、横長の画面では高さが、
       縦長の画面では幅が制約になり、どちらでも比率が崩れない。
       内部解像度を変えなければ CANVAS_WIDTH に紐づく索敵距離・音のパン・
       UI レイアウトが無変更で済み、ゲームバランスが動かない。 */
    width: min(100vw, 133.334vh);
    height: min(75vw, 100vh);
}
```

- [ ] **Step 2: 全テストが通るのを確認**

Run: `npm test`
Expected: PASS（CSS はテスト対象外だが、ここまでの変更込みで緑であることを確認する）

- [ ] **Step 3: コミット**

```bash
git add src/style.css
git commit -m "feat: canvas を 4:3 維持でウィンドウいっぱいに拡大する"
```

---

### Task 6: ユーザーへの引き渡し

**Files:** なし（コードの変更はしない）

- [ ] **Step 1: 全テストを最終確認**

Run: `npm test`
Expected: PASS。件数を記録する（実装前は 811 件、Task 1 で +6、Task 3 で +6 なので 823 件になる見込み）

- [ ] **Step 2: main.js に自分の変更以外が混ざっていないか確認**

Run: `git status --short && git diff src/js/main.js`
Expected: `src/js/main.js` の未コミット差分が `debugStartMission: 6` の1行だけであること。それ以外が残っていたらコミット漏れ

- [ ] **Step 3: 確認ポイントを伝える**

ユーザーに次を伝える。**ハードリロード（Cmd+Shift+R）が必要**（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため、忘れると「効いていない」と誤解される）。

| 見るところ | 調整する箇所 |
|---|---|
| 拡大した絵のザラつき（非整数倍で不均一になる） | `src/style.css` の `image-rendering`（`pixelated` → `auto`） |
| 黒帯の色 | `src/style.css` の `body { background-color }`（現在 `#111`） |
| 全画面のキー | `src/js/main.js` の `isKeyPressed('KeyM')` |
| カーソルが画面の端に張り付く挙動 | `src/js/utils/pointer.js` の `clamp` 範囲 |

併せて既知の制約を伝える: ブラウザ仕様により **Escape で全画面が解除される**ため、ミッション離脱の Escape を押すと全画面も同時に抜ける。

---

## Self-Review

**1. Spec coverage**

| 設計書の項目 | 実装するタスク |
|---|---|
| 1. `style.css` 4:3 維持の拡大 | Task 5 |
| 2. `pointer.js` 座標変換の純関数 | Task 1 |
| 3. `Input.js` リスナを window へ | Task 2 |
| 4. `fullscreen.js` トグル | Task 3 |
| 5. `main.js` キー1行 | Task 4 |
| テスト `tests/pointer.test.js` | Task 1 Step 1 |
| テスト `tests/fullscreen.test.js` | Task 3 Step 1 |
| ユーザー確認ポイント | Task 6 |

抜けなし。

**2. Placeholder scan**

TBD / TODO / 「適切に」「同様に」なし。全ステップに実際のコードがある。

**3. Type consistency**

- `canvasPointer(rect, canvasW, canvasH, clientX, clientY)` — Task 1 の定義と Task 2 の呼び出しで引数の順序・数が一致。
- `toggleFullscreen(element, doc)` — Task 3 の定義は両方省略可、Task 4 は引数なしで呼ぶ。整合。
- 設計書では `toggleFullscreen(element = document.documentElement)` としていたが、テスト用に `doc` を第2引数で受ける形に変えた（DOM のないテスト環境で偽物を差し込むため）。呼び出し側の書き方は設計書どおり引数なしのまま。
