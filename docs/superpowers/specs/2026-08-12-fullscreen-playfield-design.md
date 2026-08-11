# プレイフィールドの全画面表示 設計

2026-08-12

## 解決したい問題

プレイ中、マウスカーソルがフィールドの外に出ると急に弾が撃てなくなる。原因は2つ重なっている。

1. **canvas が実寸で画面中央に置かれている。** `main.js` が canvas を 1024×768 に設定し、`style.css` は拡大していない。大きなディスプレイでは周囲に広い余白ができ、カーソルが簡単に外へ出る。
2. **マウスのリスナが canvas 自身に付いている。** `Input.js` の `mousemove` / `mousedown` / `mouseup` はすべて `this.canvas` に登録されているため、canvas の外ではイベントが一切届かない。加えて canvas 内で押して外で離すと `mouseup` を取り逃がし、`mouse.left` が `true` のまま残る（押しっぱなし判定になる）。

## 方針

**内部解像度は 1024×768 のまま据え置き、CSS で 4:3 を維持して拡大する。**

`CANVAS_WIDTH` は索敵距離（`ENEMY_TANK_SIGHT_RANGE` ほか多数）、音のパン幅（`AUDIO_PAN_RANGE`）、UI レイアウトの基準として広く参照されている。canvas の内部解像度をウィンドウ実寸に合わせる案は視界が広がってこれら全部の意味が変わり、特にワイド画面で横方向の敵を先に発見できて有利になる。表示倍率だけを変えればゲームバランスは完全に不変になる。

非 4:3 の画面では上下または左右に黒帯が出るが、座標をクランプするので黒帯上にカーソルがあっても射撃は通る。

全画面は **`M` キーでの Fullscreen API トグル**で入る。`M` は現在まったく未使用で、`PREVENT_DEFAULT_KEYS` には既に入っている（使用中: `W` `S` `A` `D` `F` `R` `Space` 矢印 `Enter` `Escape` 両 `Shift`）。

既知の制約: ブラウザの全画面は Escape で強制解除される仕様なので、ミッション離脱の Escape を押すと全画面も同時に抜ける。仕様上どうにもならないため許容する。

## 変更内容

### 1. `src/style.css` — 4:3 維持の拡大

```css
#game-container { border: none; box-shadow: none; }   /* 全画面では枠が邪魔 */
canvas { width: min(100vw, 133.334vh); height: min(75vw, 100vh); }
body { cursor: none; }                                 /* 黒帯上に矢印を出さない */
```

`133.334vh` は `100vh × 4/3`、`75vw` は `100vw × 3/4`。幅と高さの両方に `min()` を掛けることで、横長の画面では高さが、縦長の画面では幅が制約になり、どちらでも 4:3 が保たれる。

`image-rendering: pixelated` は**いったん残したまま出す。** 1024px を非整数倍（例 1.4倍）に拡大するとドットの大きさが不均一になってザラつく可能性があるが、実機での見た目はユーザーが確認する。気になれば `pixelated` を外す（1行）。

### 2. `src/js/utils/pointer.js`（新規） — 座標変換の純関数

```js
canvasPointer(rect, canvasW, canvasH, clientX, clientY) -> { x, y }
```

- `(clientX - rect.left) * canvasW / rect.width` で **CSS 拡大率を吸収**する。CSS で拡大するのでこの補正は必須。
- 結果を `0 … canvasW - 1` / `0 … canvasH - 1` に**クランプ**する。カーソルが黒帯やブラウザ UI 上にあっても照準が画面の端に張り付き、射撃が通るようになる。
- `rect.width` が 0 のとき（非表示時など）は 0 除算を避けて `{ x: 0, y: 0 }` を返す。

DOM のないテスト環境（`node --test`）で直接検証できるよう、`Input` から切り離して純関数にする。

### 3. `src/js/utils/Input.js` — リスナを window へ

- `mousemove` / `mousedown` / `mouseup` / `contextmenu` の登録先を `this.canvas` → `window` に変える。canvas 外で離した `mouseup` を取り逃がして左ボタンが押しっぱなしになる現在のバグも同時に消える。
- `mousemove` の座標計算を `canvasPointer()` の呼び出しに置き換える。`crosshairLocked` を解除する「座標が変わったか」の判定はクランプ後の値で行う（端に張り付いている間は動いたと見なさない、が自然）。
- `contextmenu` を `window` に移すことで、黒帯上での右クリックでもコンテキストメニューが出なくなる。

### 4. `src/js/utils/fullscreen.js`（新規） — トグル

```js
toggleFullscreen(element = document.documentElement) -> void
```

- `document.fullscreenElement` を見て、無ければ `element.requestFullscreen()`、あれば `document.exitFullscreen()`。
- `document` が無い環境、`requestFullscreen` が無い環境では何もせず戻る（テストで落ちない）。
- `requestFullscreen()` / `exitFullscreen()` が返す Promise の reject を飲む（ユーザー操作なしの呼び出しは拒否されるが、それでコンソールに未処理エラーを出す必要はない）。

対象は `document.documentElement`。`#game-container` を全画面にすると `100vh` の基準が変わって CSS が素直に効かなくなる。

### 5. `src/js/main.js` — キー1行

`update()` 内、`ShiftLeft` のロックオン処理の隣（`_updateGameState()` 呼び出しの直前、現状 270 行目付近）に足す。どの画面でも効くグローバルキーの置き場がすでにそこにある。

```js
if (this.input.isKeyPressed('KeyM')) toggleFullscreen();
```

## テスト

- `tests/pointer.test.js`
  - 等倍（`rect.width === canvasW`）で `clientX - rect.left` がそのまま返る
  - 拡大時（例 `rect.width = 1440`, `canvasW = 1024`）に倍率が正しく割り戻される
  - 縮小時も同様
  - 範囲外（左上より外、右下より外）が `0` / `canvasW - 1` にクランプされる
  - `rect.width = 0` で NaN にならない
- `tests/fullscreen.test.js`（偽 `document` を差し込んで必ず戻す）
  - `fullscreenElement` が null なら `requestFullscreen` が呼ばれる
  - `fullscreenElement` があれば `exitFullscreen` が呼ばれる
  - `requestFullscreen` を持たない element でも例外を投げない
  - reject する Promise を返しても未処理拒否にならない

`Input` 自体は DOM を要求するため既存どおりテスト対象外。座標ロジックはすべて `pointer.js` 側にあるので、実質の抜けはない。

## ユーザー確認ポイント

ハードリロード（Cmd+Shift+R）が必要。`index.html` が `main.js?v=1.0` でキャッシュを効かせているため。

| 見るところ | 調整する定数・箇所 |
|---|---|
| 拡大した絵のザラつき | `src/style.css` の `image-rendering`（`pixelated` → `auto`） |
| 黒帯の色 | `src/style.css` の `body { background-color }`（現在 `#111`） |
| 全画面のキー | `main.js` の `isKeyPressed('KeyM')` |
| カーソルが端に張り付く挙動 | `src/js/utils/pointer.js` のクランプ範囲 |
