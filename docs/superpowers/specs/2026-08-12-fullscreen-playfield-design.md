# プレイフィールドの全画面表示 設計

2026-08-12（実装完了・実機確認済み。この文書は**出荷した実装に合わせて更新済み**）

実装: 8コミット `c4045d0..7c6bd81`（main）、テスト 811 → 824。
実装計画は `docs/superpowers/plans/2026-08-12-fullscreen-playfield.md`。ただし計画は着手前のスナップショットで、レビューで見つかった3点の実害と1件の計画自身の誤りを反映していない。**出荷した内容はこの設計書が正。**

## 解決したい問題

プレイ中、マウスカーソルがフィールドの外に出ると急に弾が撃てなくなる。原因は2つ重なっている。

1. **canvas が実寸で画面中央に置かれている。** `main.js` が canvas を 1024×768 に設定し、`style.css` は拡大していない。大きなディスプレイでは周囲に広い余白ができ、カーソルが簡単に外へ出る。
2. **マウスのリスナが canvas 自身に付いている。** `Input.js` の `mousemove` / `mousedown` / `mouseup` はすべて `this.canvas` に登録されているため、canvas の外ではイベントが一切届かない。加えて canvas 内で押して外で離すと `mouseup` を取り逃がし、`mouse.left` が `true` のまま残る（押しっぱなし判定になる）。

## 方針

**内部解像度は 1024×768 のまま据え置き、CSS で 4:3 を維持して拡大する。**

`CANVAS_WIDTH` は索敵距離（`ENEMY_TANK_SIGHT_RANGE` ほか多数）、音のパン幅（`AUDIO_PAN_RANGE`）、UI レイアウトの基準として広く参照されている。canvas の内部解像度をウィンドウ実寸に合わせる案は視界が広がってこれら全部の意味が変わり、特にワイド画面で横方向の敵を先に発見できて有利になる。表示倍率だけを変えればこれらは一切動かない。

**ただし「バランスが完全に不変」ではない。** `AUTO_AIM_CANCEL_THRESHOLD`（4）は `input.mouse.x/y` の差分と比べられていて、その差分の単位が screen px から canvas px に変わった。1920 幅に拡大（倍率 1.875）なら、Auto Aim のスナップを振り切るのに必要な実際のマウス移動が 4 → 7.5px/frame 相当になる。小さいウィンドウでは逆に軽くなる。**値は据え置き、`Constants.js` のコメントを実態に合わせるだけにした** — 手触りの調整はユーザーが実機で見てから決める。

非 4:3 の画面では上下または左右に黒帯が出るが、座標をクランプするので黒帯上にカーソルがあっても射撃は通る。

全画面は **`M` キーでの Fullscreen API トグル**で入る。`M` は他のどのキー処理でも使われておらず、`PREVENT_DEFAULT_KEYS` には既に入っている（使用中: `W` `S` `A` `D` `F` `R` `Space` 矢印 `Enter` `Escape` 両 `Shift`）。

Escape については、当初「ミッション離脱と全画面解除が同時に起きる」と想定していたが、Chrome / Firefox は全画面解除に Escape を使ったとき `keydown` 自体を握って渡してこない。**想定では「1回目の Escape は全画面解除のみ、2回目でミッション離脱」に分かれる**（未確認。実機で確かめること）。いずれにせよブラウザ側の仕様でこちらから制御できないため許容する。

## 変更内容

### 1. `src/style.css` — 4:3 維持の拡大

```css
#game-container { border: none; box-shadow: none; }   /* 全画面では枠が邪魔 */
canvas { width: min(100vw, 133.334vh); height: min(75vw, 100vh); }
body { cursor: none; }                                 /* 黒帯上に矢印を出さない */
```

`133.334vh` は `100vh × 4/3`、`75vw` は `100vw × 3/4`。幅と高さの両方に `min()` を掛けることで、横長の画面では高さが、縦長の画面では幅が制約になり、どちらでも 4:3 が保たれる。両式の切り替わり点が `vw/vh = 4/3` で共通なので、幅と高さが食い違う制約を選ぶことは起きない。

`image-rendering: pixelated` は**いったん残したまま出した。** 1024px を非整数倍（例 1.4倍）に拡大するとドットの大きさが不均一になってザラつく可能性があるが、実機での見た目はユーザーが確認する。気になれば `pixelated` を外す（1行）。

副作用として `#game-container` は `position: relative` だけの空箱になった。絶対配置の子は無く、`fullscreen.js` も `documentElement` を対象にするので害はない。将来の掃除候補。

### 2. `src/js/utils/pointer.js`（新規） — 座標変換の純関数

```js
canvasPointer(rect, canvasW, canvasH, clientX, clientY) -> { x, y }
```

- `(clientX - rect.left) * canvasW / rect.width` で **CSS 拡大率を吸収**する。CSS で拡大するのでこの補正は必須。`clientX` と `getBoundingClientRect()` はどちらも CSS px なので、ブラウザのズームとデバイスピクセル比はここで自然に打ち消される。
- 結果を `0 … canvasW - 1` / `0 … canvasH - 1` に**クランプ**する。カーソルが黒帯やブラウザ UI 上にあっても照準が画面の端に張り付き、射撃が通るようになる。
- `rect.width <= 0 || rect.height <= 0` のとき（非表示時など）は `{ x: 0, y: 0 }` を返す。当初は「倍率を1として扱う」と書いていたが、それだと `clientX` がそのまま座標として通ってしまい意味を成さない。潰れた rect では位置は決められないので原点に落とす。
- 丸めない。分数の座標がそのまま `mouse.x/y` に入る（照準の滑らかさのため）。`mouse.x/y` の消費側（`_handleShooting`・`Crosshair`・偏差射撃）はどれも連続値として扱っていて整数を前提にしていない。

DOM のないテスト環境（`node --test`）で直接検証できるよう、`Input` から切り離して純関数にする。

### 3. `src/js/utils/Input.js` — リスナを window へ

- `mousemove` / `mousedown` / `mouseup` / `contextmenu` の登録先を `this.canvas` → `window` に変える。canvas 外で離した `mouseup` を取り逃がして左ボタンが押しっぱなしになるバグも同時に消える。
- 座標変換を `_applyClientPos(clientX, clientY, unlockOnChange)` に集約し、最後の生 `clientX` / `clientY` を `_lastClientX` / `_lastClientY` に覚える（初期値 `null`）。
- `contextmenu` を `window` に移すことで、黒帯上での右クリックでもコンテキストメニューが出なくなる。代わりに右クリックメニューの抑止がページ全体に効く（Inspect が使えない）。

さらに、レビューで見つかった2つの穴を塞いだ。**どちらも「リスナを window に移すだけでは足りない」という話で、この機能の要になっている。**

- **`window` の `blur` で左右ボタンを強制的に離す。** `window` の `mouseup` は、ボタンを離した瞬間がブラウザの外（タスクバー、他アプリ、OS、Alt-Tab 中）だと発火しない。撃ちながら Alt-Tab して向こうで離して戻ってくると `mouse.left` が `true` のまま固まり、撃ちっぱなしになる上 `isLeftClickPressed()` が二度と立たなくなる（グレネード投擲とクリックで進む画面が全部死ぬ）。**今回直そうとしたバグそのものが残っていた。**
- **`window` の `resize` と `document` の `fullscreenchange` で座標を再変換する。** `getBoundingClientRect()` は `mousemove` ごとに読み直しているが、マウスを動かさずに rect が変わる経路（`M` で全画面）では `mouse.x/y` が古い倍率のまま残る。1280×720 でカーソルが client(400,300) にあると `mouse.x = 256`、全画面 1920×1080 では同じカーソルが 114 になるべきところ、動かすまで約142px ずれたままクリックが飛ぶ。まだ一度も `mousemove` が来ていない間は座標が未知なので何もしない（`null` ガード）。
- **その再変換ではロック解除の副作用を走らせない**（`unlockOnChange` を `false` で呼ぶ）。`crosshairLocked` の解除は元から「座標が変わったら解除」で実装されているが、rect が変わればほぼ確実に再計算結果は前回値と食い違う。`true` のままにすると **`M` を押しただけで戦闘中のロックオンが無言で外れる**（実際に一度この回帰を入れた）。ロックは Shift でプレイヤーが明示的に掛けた状態で、画面サイズが変わるのは「マウスを動かした」ことではない。`mousemove` からの呼び出しだけ `true`。

### 4. `src/js/utils/fullscreen.js`（新規） — トグル

```js
toggleFullscreen(element, doc) -> void
```

両引数とも省略可。省略時は `doc` が実物の `document`、`element` が `doc.documentElement`。`doc` を引数で受けるのは、`node --test` に `document` が無いので偽物を差し込めるようにするため（当初案の `toggleFullscreen(element = document.documentElement)` ではテストから経路を触れない）。

- `document.fullscreenElement` を見て、無ければ `element.requestFullscreen()`、あれば `document.exitFullscreen()`。
- `document` が無い環境、`requestFullscreen` が無い環境では何もせず戻る（テストで落ちない）。
- `requestFullscreen()` / `exitFullscreen()` が返す Promise の reject を飲む（ユーザー操作なしの呼び出しは拒否されるが、それでコンソールに未処理エラーを出す必要はない）。

対象は `document.documentElement`。`#game-container` を全画面にすると `100vh` の基準が変わって CSS が素直に効かなくなる。

### 5. `src/js/main.js` — キー1行

`update()` 内、`ShiftLeft` のロックオン処理の隣（`_updateGameState()` 呼び出しの直前、現状 279 行目）に足す。どの画面でも効くグローバルキーの置き場がすでにそこにある。

```js
if (this.gameState !== 'ranking_entry' && this.input.isKeyPressed('KeyM')) toggleFullscreen();
```

**`ranking_entry` だけは除外する。** 当初案は無条件だったが、名前入力画面は `getTypedChars()` で打鍵を文字として消費する。物理的な M の押下は「文字の M」と「`KeyM` のコード」の両方を独立に生むので、除外しないと「MAX」などと打つたびに入力中に全画面が切り替わる。同じファイルの `_updateVolumeControl()` が「`-`」で BGM 音量が下がるのを避けるため同じ除外をしている前例に倣った。他に打鍵を文字として溜める画面は無い（`_updateMissionClear()` は `length > 0` を「何か押された」の合図に使うだけ）。

### 6. `src/js/utils/Constants.js` — コメントのみ

`AUTO_AIM_CANCEL_THRESHOLD` の単位を screen px/frame → canvas px/frame に訂正し、表示倍率依存になったこと・値を意図的に据え置いたことを記録した。値は変えていない。

## テスト

`node --test` で 811 → 824。

- `tests/pointer.test.js`（6件）
  - 等倍（`rect.width === canvasW`）で `clientX - rect.left` がそのまま返る
  - 拡大時（`rect.width = 1440`, `canvasW = 1024`）に倍率が正しく割り戻される
  - 縮小時（`rect.width = 512`）も同様
  - 左上より外が `0` にクランプされる
  - 右下より外が `canvasW - 1` / `canvasH - 1` にクランプされる
  - `rect` の幅・高さが 0 で NaN にならない
- `tests/fullscreen.test.js`（7件。偽 `document` を差し込んで必ず戻す）
  - `fullscreenElement` が null なら `requestFullscreen` が呼ばれる
  - `fullscreenElement` があれば `exitFullscreen` が呼ばれる
  - `requestFullscreen` を持たない element でも例外を投げない
  - `exitFullscreen` を持たない document でも例外を投げない
  - `document` 相当が無くても例外を投げない
  - reject する Promise を返しても未処理拒否にならない
  - **`element` 省略時に `doc.documentElement` の `requestFullscreen` が呼ばれる** — これが `main.js` から実際に使われている唯一の形。他の6件はすべて element を明示していて、本番の経路だけ無検証だった

`Input` 自体は DOM を要求するためテスト対象外。座標ロジックは `pointer.js` 側にあるので実質の抜けはない。

## 出荷後に残した既知の点

いずれも実機確認では問題にならなかったが、記録として残す。

- **上側の黒帯にカーソルを置くと照準の描画と実際の狙いが 60px ずれる。** `pointer.js` は y を `0` までクランプするが、`Crosshair.js` は描画を `HUD_TOP_HEIGHT`(60) 以上にクランプする。5:4 や 16:10 のように黒帯が上下に出る画面で、カーソルを canvas の上に置くと照準は y=60 に描かれ、弾は y=0（上部 HUD の裏）を狙う。元からある不一致（canvas 内の上端60px でも同じ）だが、クランプによって「そこで安定して止まる状態」になった。直すなら `pointer.js` のクランプ下限を `HUD_TOP_HEIGHT` にする。16:9 は黒帯が左右なので出ない。
- **`Cmd+M` / `Ctrl+M` でも全画面が切り替わる。** `isKeyPressed('KeyM')` は修飾キーを見ない。macOS では最小化と同時に発火する。入力処理全体が修飾キーを見ていないので、それに合わせて放置した。
- **右クリックメニューの抑止がページ全体に効く。** 設計どおりだが、開発中に Inspect が使えなくなる。
- **`requestFullscreen()` を呼んでいるのは rAF ループの中で、keydown ハンドラの中ではない。** ブラウザの一時的ユーザー活性化は呼び出しスタックではなく時間ベース（約5秒）なので現状は通るが、将来ブラウザが厳しくすると黙って効かなくなる種類の作り。

## ユーザー確認ポイント

ハードリロード（Cmd+Shift+R）が必要。`index.html` が `main.js?v=1.0` でキャッシュを効かせているため。

| 見るところ | 調整する定数・箇所 |
|---|---|
| 拡大した絵のザラつき | `src/style.css` の `image-rendering`（`pixelated` → `auto`） |
| Auto Aim のスナップを振り切る重さ | `Constants.js` の `AUTO_AIM_CANCEL_THRESHOLD`（現在 4。表示倍率依存） |
| 黒帯の色 | `src/style.css` の `body { background-color }`（現在 `#111`） |
| 全画面のキー | `main.js:279` の `isKeyPressed('KeyM')` |
| カーソルが端に張り付く挙動 | `src/js/utils/pointer.js` のクランプ範囲 |
