# Hover Attack Web

バニラ ES modules ＋ canvas の 2D アクションゲーム。ビルド工程なし、依存パッケージなし。
`index.html` が `src/js/main.js` を `<script type="module">` で読むだけで動く。

```bash
npm test                              # node --test。全テスト。1秒弱で終わる
npm test -- tests/xxx.test.js         # 1ファイルだけ
```

**実機での見た目・音の確認は必ずユーザーが行う。** ローカルサーバーはユーザーが IDE 側で常時立てているので、こちらでは起動しない。引き渡すときは確認ポイントと調整用の定数の対応表を示し、**ハードリロード（Cmd+Shift+R）が要ることだけ伝える**（`index.html` が `main.js?v=1.0` とクエリでキャッシュを効かせているため、忘れると「効いていない」と誤解される）。

---

## 追加する前に、まず既存の共通機構を見ること

この設計の要点は「機体ごと・武器ごとの違いは**表の1行**に出て、手順は1本しかない」という形にまとめてあることにある。新しい要素を足すとき、**まずその表に行を足せないか**を確かめる。手書きのコードを増やすのは、表では表現できないと確かめてから。

| 足したいもの | 行き先 | 手順を書いているところ |
|---|---|---|
| 効果音（単発） | `src/js/audio/weaponSounds.js` の `WEAPON_SOUNDS` に1行 | `renderWeaponSound()` |
| 効果音（鳴り続けるループ） | `AudioManager` に `_loopSound(key, {build, tune})` で | 同ファイル |
| 機体の破壊演出 | `src/js/entities/destruction.js` の `DESTRUCTION_PROFILES` に1行 | `playDestruction()` |
| 破壊時の破片パーツ | `src/js/entities/debris/` に `xxxParts.js` ＋ `DEBRIS_SPECS` に1行 | `buildDebris()` |
| 敵アタッカーの型 | `Constants.js` の `ENEMY_ATTACKER_TYPES` に1行 ＋ 脚を変えるなら `entities/attacker/legs.js` の `LEG_STYLES` | `EnemyAttacker.js` の `update()` |
| 画面（新しい1画面） | `src/js/ui/screens/` に1ファイル ＋ `ScreenRenderer.js` 末尾の `Object.assign` に1語。更新側は `src/js/ui/flows/` | `ScreenRenderer.js` の Mixins 節 |
| 画面の色・文字サイズ | `src/js/ui/theme.js` の `UI` | `ui/screens/` の各ファイル |
| 画面のパネル寸法・表の列 | `src/js/ui/screens/layout.js` | 同ファイルのコメント |
| 調整用の数値 | `src/js/utils/Constants.js` | — |

`Constants.js` はゲームバランスと演出の数値の唯一の置き場。マジックナンバーを実装側に直書きしない（描画専用のパラメータだけは例外的に各ファイルのモジュールスコープに置いている。例: `EnemyAttacker.js` の `LEG_STYLES`）。

### 音を足すとき

音は**すべて Web Audio の手続き合成**。オーディオファイル（wav/mp3）は1つも持っていないし、足さない（BGM の mp3 だけは別扱い）。

- `WEAPON_SOUNDS` の部品は `hiss` / `tone` / `puffs` / `clicks` / `voice` の5つ。発射音だけでなく、リロードの「ガチャリ」も装填クリックも「レディ」の声もこの表にある。
- **`src/js/audio/weaponSounds.js` の `renderWeaponSound()` と `tests/helpers/weapon-render.js` の `renderWeaponProfile()` は同じ音を出す対。** 前者は WebAudio、後者は node で測定するためのオフライン再現。**片方だけ変えない。** 時間設計など両方が要るロジックは純粋関数に切り出して共有する（例: `voiceBreakpoints()`）。
- **音作りを変えたら A特性で音量を実測する。** `tests/helpers/dsp.js` の `transientLevel` / `aWeightedRms` を使い、既存の音との相対 dB をテストで縛る。これは実際に無音バグを出したことがあるためのルール（敵ホバー音を狭帯域バンドパスに替えて、帯域で捨てられるエネルギーを補正し忘れ、聞こえない音になった）。
- 試聴用の書き出し: `node tools/render-weapon-sounds.mjs`（表の全項目）、`node tools/render-repair-hum.mjs`（ループ音）。出力は `audio-preview/`（git 管理外）。

---

## 全体の構造

- `main.js` — `Game` オブジェクト。ループ、状態遷移、毎フレームの世界の更新、描画の呼び出し順。**約1200行。ここに書き足す前に、下の mixin か systems/ か utils/ に置けないか考えること。**
  - **`Game` はクラスではなくオブジェクトリテラルで、大きな機能群は別ファイルの同じ形のリテラルを `Object.assign(Game, ...)` で混ぜている**（`main.js` 末尾の Mixins 節）。`this` の意味は変わらないので、テストの `Game._updateSettings.call(fakeGame)` という呼び方がそのまま通る。**新しい mixin を足すときも「`game` を第一引数に取る関数」にはしないこと** — テスト28ファイルの呼び方を全部変えることになる。
  - 現在の mixin: `ui/flows/settingsFlow.js`（設定画面）、`ui/flows/attractFlow.js`（タイトル・デモループ・面セレクト）、`systems/OnlineFlow.js`（ランキングの取得/送信/名前入力）、`systems/CombatActions.js`（ドッキング・射撃・グレネード軌道）、`systems/SpawnEffects.js`（爆発・破片・煙幕の生成）
- `entities/` — 自機・敵・弾・アイテム。それぞれ `update()` と `draw(ctx)` を持つ
  - `entities/attacker/` — `EnemyAttacker` を層で分けたもの（`movement` / `combat` / `collision` / `draw` / `legs`）。`ScreenRenderer` と同じ `Object.assign(EnemyAttacker.prototype, ...)` 方式。**`EnemyAttacker.js` 本体に残っているのは `constructor` と `update()`（どの順で何を呼ぶかの唯一の記述）と破壊まわりだけ**なので、挙動を足すときはまず層のどれかに置けないか見る
- `systems/` — 衝突、スポーン、ゲーム状態、ランキング（ローカル／オンライン）
- `world/` — マップ生成と描画、カメラ、洞窟の遠景
- `ui/` — HUD、照準、各画面。**画面は「更新」と「描画」で置き場が分かれている** — `ui/flows/` が更新側（どのキーで何が起きるか）、`ui/screens/` が描画側
  - `ScreenRenderer.js` は約170行まで減っていて、**画面をまたぐ共通部品だけ**が残っている（`_drawStartHint` の点滅ヒント、`_metallicText` の見出し文字、`drawDemoCycleDots`、`drawVolumeIndicator`）。ここも `Object.assign(ScreenRenderer.prototype, ...)` で `ui/screens/` の各画面を混ぜる形（`Game` の mixin と同じ理由・同じ作り）。**画面を1つ足すときは `ui/screens/` にファイルを作って末尾の Object.assign に足す。`ScreenRenderer.js` 本体には書かない。**
  - パネルの寸法とランキング表の列座標は `ui/screens/layout.js`。**実機で見て決めた値なので、動かす前にあそこのコメントを読むこと**
- `utils/` — 純ロジック。**テストが書きやすいものは積極的にここへ切り出す**（`scoring` / `modes` / `timestep` / `aimLead` / `mgReload` / `geo` など、いずれも `node --test` で直接テストされている）
- `audio/` — 上記のとおり
- `gas/` — オンラインランキングの Google Apps Script。**変更したらユーザーが手動で再デプロイする必要がある**

### 時間の扱い（触る前に必ず読む）

物理は**フレーム単位**（`x += vx`）で deltaTime に依存しない。実時間との橋渡しは `utils/timestep.js` の固定タイムステップ・アキュムレータが独占していて、`main.js` が実経過ミリ秒に `gameSpeed` を掛けて渡す。

- モード: normal = 0.8x、newtype = 1.0x（`utils/modes.js`）
- **タイマーは実時間で進む**（モードで時計は遅くならない）。ドック補給のように「実時間で何秒」を守りたい処理は `1 / gameSpeed` でスケールする
- 描画は `utils/renderInterp.js` で補間する。描画フレームレートはゲーム速度に影響しない

### 週次の決定性

同じ ISO 週なら全員が同じステージを遊ぶ（`utils/WeekSeed.js` ＋ `SeededRNG`）。**マップ生成の途中で `game.rng` を余分に消費すると敵の構成が変わって、この保証が壊れる。** 生成中に乱数が要るものは派生ストリームを作って渡すこと（`CaveBackdrop` がその例）。回帰テストあり（`tests/MapDeterminism.test.js`）。

---

## テストの流儀

- ランナーは `node --test`。DOM も AudioContext も無い。
- 音を鳴らそうとして落ちないよう、`AudioManager` は `available` で環境を見て黙る。**新しい `play*` / `start*` / `stop*` メソッドは、引数なしで呼んでも例外を投げないこと**（`tests/audio-manager.test.js` が全メソッドを総当たりで呼ぶ）。
- テスト用の共有ヘルパーは `tests/helpers/`:
  - `fake-ctx.js` — canvas 2D の呼び出しとプロパティ代入を記録する偽 ctx（描画の幾何を検証する）
  - `fake-audio-ctx.js` — 偽 AudioContext と、それを `audioManager` に差し込んで必ず戻す `withCtx()`
  - `dsp.js` — A特性の音量測定
  - `weapon-render.js` — `WEAPON_SOUNDS` のオフライン再現
  - `enemy-world.js` — 敵のテスト用のマップ
- 音の呼び出しを確かめるときは `audioManager` のメソッドを差し替えて記録する（`tests/audio-wiring.test.js` の `spyAudio` が原型）。
- **ソース文字列を grep するテストは避ける。** 呼び出しが存在しても到達不能なら通ってしまう。実際にそれで抜けたバグがある。

---

## 作業の約束ごと

- **`git add -A` / `git add .` は使わない。変更したファイルを明示して add する。** `src/js/main.js` にはユーザーがデバッグ用に立てている `debugStartMission: 6` が**意図的に未コミットのまま**置かれている（本番値は 0）。一括ステージで2回巻き込んで手戻りになった。同ファイルの1行だけをコミットしたいときは `git add -p` か、自分のハンクだけのパッチを `git apply --cached` する。
- **コメントは日本語で、「なぜそうしたか」を書く。** 何をしているかはコードが語る。既存ファイルはどれも、選んだ理由・試して駄目だった案・実測値を残している。この密度に合わせる。
- 数値を決めたら、その根拠（実測値や、どの値を経て確定したか）をコメントに残す。
- バランス調整は、根本の作り直しより**低リスクな数値調整を優先する**（ユーザーの好み）。根本原因が別にあるなら、直さずともコメントか memory に残しておく。
- 設計は `docs/superpowers/specs/`、実装計画は `docs/superpowers/plans/` に日付つきで置く。

## オンラインランキングの GAS（`gas/Code.gs`）

**`clasp` で更新できる。手でエディタに貼り直さない。** 手順・プロジェクトID・デプロイIDは
`docs/superpowers/specs/2026-07-15-gas-setup.md` の「3b」節にある。

踏んだ落とし穴が2つあるので、触る前に必ずその節を読むこと。

- スクリプト側のファイル名は既定の日本語名 **`コード.js`**。リポジトリの `Code.gs` を
  そのまま push すると別ファイルが増えて**同じ関数が二重定義**になる
- **`clasp push` だけでは本番に反映されない。** `/exec` はバージョン付きデプロイを
  配信しているので `clasp create-deployment -i <デプロイID>` で差し替える。`-i` を忘れると
  新しい URL が発行され `LEADERBOARD_URL` の変更が要る

**「再デプロイした」と言われても、`clasp pull` して diff を取るまで反映を信じないこと。**
実際に、貼り直す前にデプロイだけされていて2コミットぶん古いコードが本番で動いていた
（2026-08-16）。

（Phase 2 で残っていた `StageScores` シート作成と再デプロイは 2026-08-16 に完了済み。）
